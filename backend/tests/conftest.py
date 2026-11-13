"""테스트 공통 준비.

- DB: TEST_DATABASE_URL의 PostgreSQL에 Alembic 마이그레이션을 적용해 쓴다.
- 외부 의존성(인증 검증기 등)은 가짜로 주입한다.
"""

import os
import uuid

import pytest
from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.auth import AuthenticatedUser, InvalidToken
from app.gemini import PlanRequest, SuggestedStop
from app.place_search import PlaceCandidate, PlaceSearchUnavailable
from app.receipt_reader import ReceiptDraft
from app.storage import StorageUnavailable
from app.config import BACKEND_DIR, Settings, normalize_database_url
from app.main import create_app


class FakeAuthVerifier:
    """토큰 문자열 → 사용자. 등록되지 않은 토큰은 잘못된 토큰이다."""

    def __init__(self) -> None:
        self._users: dict[str, AuthenticatedUser] = {}

    def add_user(
        self, *, email: str | None = None, display_name: str | None = None
    ) -> tuple[str, AuthenticatedUser]:
        user = AuthenticatedUser(
            id=uuid.uuid4(), email=email, display_name=display_name
        )
        token = f"token-{user.id}"
        self._users[token] = user
        return token, user

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            return self._users[token]
        except KeyError:
            raise InvalidToken()


class FakePlaceSearcher:
    """등록해 둔 장소 중 이름에 검색어가 들어간 것을 돌려준다. 받은 검색어를 기록한다."""

    def __init__(self) -> None:
        self.places: list[PlaceCandidate] = []
        self.queries: list[str] = []
        self.unavailable = False
        self.aliases: dict[str, tuple[str, ...]] = {}

    def add(
        self, source_place_id: str, name: str, *, lat: float = 33.5, lng: float = 126.5, address: str = "제주시",
        aliases: tuple[str, ...] = (),
    ) -> PlaceCandidate:
        """aliases: 카카오가 이 장소를 돌려주는 다른 검색어(예: 동문시장 → 동문재래시장)."""
        candidate = PlaceCandidate(source_place_id, name, address, None, lat, lng, "여행 > 관광명소")
        self.places.append(candidate)
        self.aliases[source_place_id] = aliases
        return candidate

    def search(self, query: str, *, near: tuple[float, float] | None = None) -> list[PlaceCandidate]:
        self.queries.append(query)
        if self.unavailable:
            raise PlaceSearchUnavailable("down")
        # "장소명 지역"처럼 여러 단어면 한 단어라도 이름에 들어간 장소를 돌려준다.
        words = query.split() or [query]
        return [
            p for p in self.places
            if query in p.name or any(w in p.name for w in words) or any(a in query for a in self.aliases[p.source_place_id])
        ]


class FakePlanSuggester:
    """미리 넣어 둔 응답(추천 목록 또는 예외)을 차례로 돌려준다. 받은 요청을 기록한다."""

    def __init__(self) -> None:
        self.responses: list[list[SuggestedStop] | Exception] = []
        self.requests: list[PlanRequest] = []

    def suggest(self, request: PlanRequest) -> list[SuggestedStop]:
        self.requests.append(request)
        response = self.responses.pop(0) if self.responses else []
        if isinstance(response, Exception):
            raise response
        return response


class FakeStorage:
    """메모리 안의 객체 저장소. 서명 URL은 키와 만료를 그대로 담은 가짜 주소다."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.unavailable = False

    def _check(self) -> None:
        if self.unavailable:
            raise StorageUnavailable("down")

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        self._check()
        self.files[key] = data

    def delete(self, keys: list[str]) -> None:
        self._check()
        for key in keys:
            self.files.pop(key, None)

    def signed_urls(self, keys: list[str], expires_in: int) -> dict[str, str]:
        self._check()
        return {key: f"https://storage.test/{key}?expires_in={expires_in}" for key in keys if key in self.files}


class FakeReceiptReader:
    """미리 넣어 둔 결과(초안 또는 예외)를 차례로 돌려준다. 받은 이미지를 기록한다."""

    def __init__(self) -> None:
        self.results: list[ReceiptDraft | Exception] = []
        self.images: list[bytes] = []
        self.currencies: list[str] = []

    def read(self, image: bytes, currency: str = "KRW") -> ReceiptDraft:
        self.images.append(image)
        self.currencies.append(currency)
        result = self.results.pop(0) if self.results else ReceiptDraft()
        if isinstance(result, Exception):
            raise result
        return result


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def database_url() -> str:
    load_dotenv(BACKEND_DIR / ".env")
    url = normalize_database_url(os.getenv("TEST_DATABASE_URL", ""))
    if not url:
        pytest.exit(
            "TEST_DATABASE_URL이 없습니다. backend/.env.example을 참고해 backend/.env를 만드세요.",
            returncode=2,
        )
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    return url


@pytest.fixture(scope="session")
def engine(database_url: str):
    engine = create_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(request: pytest.FixtureRequest):
    yield
    if "engine" not in request.fixturenames:
        return
    engine = request.getfixturevalue("engine")
    with engine.begin() as conn:
        tables = conn.scalars(
            text(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
            )
        ).all()
        if tables:
            conn.execute(text(f"TRUNCATE {', '.join(tables)} CASCADE"))


@pytest.fixture
def auth() -> FakeAuthVerifier:
    return FakeAuthVerifier()


@pytest.fixture
def places() -> FakePlaceSearcher:
    return FakePlaceSearcher()


@pytest.fixture
def overseas_places() -> FakePlaceSearcher:
    """해외 여행용(Google 자리) 가짜 검색기. 국내용 places와 따로 둔다."""
    return FakePlaceSearcher()


@pytest.fixture
def suggester() -> FakePlanSuggester:
    return FakePlanSuggester()


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def receipts() -> FakeReceiptReader:
    return FakeReceiptReader()


@pytest.fixture
def client(
    engine, database_url: str, auth: FakeAuthVerifier, places: FakePlaceSearcher, suggester: FakePlanSuggester,
    storage: FakeStorage, receipts: FakeReceiptReader, overseas_places: FakePlaceSearcher,
) -> TestClient:
    settings = Settings(
        database_url=database_url, supabase_url="", supabase_jwt_secret=""
    )
    app = create_app(
        settings=settings, auth_verifier=auth, place_searcher=places, overseas_place_searcher=overseas_places, plan_suggester=suggester, storage=storage, receipt_reader=receipts,
    )
    with TestClient(app) as client:
        yield client
