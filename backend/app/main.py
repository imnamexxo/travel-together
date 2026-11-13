from fastapi import FastAPI

from app.auth import AuthVerifier, SupabaseJwtVerifier
from app.config import Settings, load_settings
from app.db import make_sessionmaker
from app.errors import install_error_handlers
from app.gemini import GeminiPlanSuggester, PlanSuggester
from app.place_search import KakaoPlaceSearcher, PlaceSearcher
from app.receipt_reader import GeminiReceiptReader, ReceiptReader
from app.storage import ObjectStorage, SupabaseStorage
from app.routers import expense_places, expenses, health, map, me, members, photos, planner, receipts, settlement, suggestions, transfers, trips


def create_app(
    *,
    settings: Settings | None = None,
    auth_verifier: AuthVerifier | None = None,
    place_searcher: PlaceSearcher | None = None,
    plan_suggester: PlanSuggester | None = None,
    storage: ObjectStorage | None = None,
    receipt_reader: ReceiptReader | None = None,
) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Travel Together API", version="0.1.0")
    app.state.sessionmaker = (
        make_sessionmaker(settings.database_url) if settings.database_url else None
    )
    app.state.auth_verifier = auth_verifier or SupabaseJwtVerifier(
        settings.supabase_url, settings.supabase_jwt_secret
    )
    app.state.place_searcher = place_searcher or KakaoPlaceSearcher(settings.kakao_rest_api_key)
    app.state.plan_suggester = plan_suggester or GeminiPlanSuggester(settings.gemini_api_key, settings.gemini_model)
    app.state.storage = storage or SupabaseStorage(settings.supabase_url, settings.supabase_service_role_key, settings.storage_bucket)
    app.state.receipt_reader = receipt_reader or GeminiReceiptReader(settings.gemini_api_key, settings.gemini_model)
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(trips.router)
    app.include_router(members.router)
    app.include_router(expense_places.router)  # expenses보다 먼저(경로 충돌)
    app.include_router(expenses.router)
    app.include_router(settlement.router)
    app.include_router(transfers.router)
    app.include_router(planner.router)
    app.include_router(suggestions.router)
    app.include_router(photos.router)
    app.include_router(receipts.router)
    app.include_router(map.router)
    return app


app = create_app()
