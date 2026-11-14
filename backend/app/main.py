import logging

from fastapi import FastAPI

from app.auth import AuthVerifier, SupabaseJwtVerifier
from app.auth_admin import AuthAdmin, SupabaseAuthAdmin
from app.config import Settings, load_settings
from app.db import make_sessionmaker
from app.errors import install_error_handlers
from app.request_log import install_request_log
from app.gemini import GeminiPlanSuggester, PlanSuggester
from app.place_search import GooglePlaceSearcher, KakaoPlaceSearcher, PlaceSearcher
from app.receipt_reader import GeminiReceiptReader, ReceiptReader
from app.storage import ObjectStorage, SupabaseStorage
from app.routers import expense_places, expenses, health, links, map, me, members, photos, planner, receipts, settlement, suggestions, transfers, trips


# 서버 로그(Render Logs)에 app.* 의 INFO(예: Gemini 응답 시간)를 남긴다. httpx의 요청마다 찍히는 줄은 끈다.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)


def create_app(
    *,
    settings: Settings | None = None,
    auth_verifier: AuthVerifier | None = None,
    place_searcher: PlaceSearcher | None = None,
    overseas_place_searcher: PlaceSearcher | None = None,
    plan_suggester: PlanSuggester | None = None,
    storage: ObjectStorage | None = None,
    receipt_reader: ReceiptReader | None = None,
    auth_admin: AuthAdmin | None = None,
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
    app.state.overseas_place_searcher = overseas_place_searcher or GooglePlaceSearcher(settings.google_places_api_key)
    app.state.plan_suggester = plan_suggester or GeminiPlanSuggester(settings.gemini_api_key, settings.gemini_model)
    app.state.storage = storage or SupabaseStorage(settings.supabase_url, settings.supabase_service_role_key, settings.storage_bucket)
    app.state.receipt_reader = receipt_reader or GeminiReceiptReader(settings.gemini_api_key, settings.gemini_model)
    app.state.auth_admin = auth_admin or SupabaseAuthAdmin(settings.supabase_url, settings.supabase_service_role_key)
    install_error_handlers(app)
    install_request_log(app)
    app.include_router(health.router)
    app.include_router(links.router)
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
