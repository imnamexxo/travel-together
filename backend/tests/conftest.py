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
def client(engine, database_url: str, auth: FakeAuthVerifier) -> TestClient:
    settings = Settings(
        database_url=database_url, supabase_url="", supabase_jwt_secret=""
    )
    with TestClient(create_app(settings=settings, auth_verifier=auth)) as client:
        yield client
