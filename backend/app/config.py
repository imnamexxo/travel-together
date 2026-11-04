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
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET", ""),
    )
