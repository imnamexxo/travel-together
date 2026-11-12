from fastapi import FastAPI

from app.auth import AuthVerifier, SupabaseJwtVerifier
from app.config import Settings, load_settings
from app.db import make_sessionmaker
from app.errors import install_error_handlers
from app.routers import expenses, health, me, members, trips


def create_app(
    *, settings: Settings | None = None, auth_verifier: AuthVerifier | None = None
) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Travel Together API", version="0.1.0")
    app.state.sessionmaker = (
        make_sessionmaker(settings.database_url) if settings.database_url else None
    )
    app.state.auth_verifier = auth_verifier or SupabaseJwtVerifier(
        settings.supabase_url, settings.supabase_jwt_secret
    )
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(trips.router)
    app.include_router(members.router)
    app.include_router(expenses.router)
    return app


app = create_app()
