import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    database_url: str
    supabase_url: str
    supabase_jwt_secret: str
    # 외부 API 키. 서버만 가진다(앱에는 넣지 않는다). 없으면 그 기능을 부를 때 502가 된다.
    kakao_rest_api_key: str = ""
    google_places_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"
    supabase_service_role_key: str = ""
    storage_bucket: str = "trip-media"


def normalize_database_url(url: str) -> str:
    """Supabase·Render가 주는 postgres:// 주소를 SQLAlchemy psycopg 드라이버 주소로 바꾼다."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def load_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env")
    return Settings(
        database_url=normalize_database_url(os.getenv("DATABASE_URL", "")),
        # 대시보드에 붙여 넣다 끝에 줄바꿈이 들어가는 경우가 있어 앞뒤 공백을 지운다.
        supabase_url=os.getenv("SUPABASE_URL", "").strip(),
        supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET", ""),
        kakao_rest_api_key=os.getenv("KAKAO_REST_API_KEY", "").strip(),
        google_places_api_key=os.getenv("GOOGLE_PLACES_API_KEY", "").strip(),
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "").strip() or "gemini-flash-latest",
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        storage_bucket=os.getenv("SUPABASE_STORAGE_BUCKET", "").strip() or "trip-media",
    )
