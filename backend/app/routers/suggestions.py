import datetime as dt
import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorResponse
from app.gemini import PlanRequest, PlanSuggester, SuggestedStop, SuggestionFormatError, SuggestionUnavailable
from app.models import PlanItem, SuggestedItem, SuggestionRequest, Trip
from app.permissions import require_member
from app.place_search import PlaceCandidate, PlaceSearcher, PlaceSearchUnavailable
from app.places import get_place_searcher, place_from_candidate
from app.routers.planner import PlaceCandidateOut, PlanItemOut, check_in_period, plan_item_out, slot_into_day

router = APIRouter(prefix="/trips/{trip_id}/suggestions", tags=["suggestions"], responses=ERROR_RESPONSES)

DAILY_LIMIT = 10
KST = timezone(timedelta(hours=9))


class SuggestionAsk(BaseModel):
    destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    preferences: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""


class SuggestedItemOut(BaseModel):
    id: uuid.UUID
    date: dt.date
    order: int
    place_name: str
    region: str
    stay_minutes: int
    description: str
    # verified: 카카오에서 확인한 장소가 있다 / needs_check: "확인 필요", 장소가 비어 있다
    status: Literal["verified", "needs_check"]
    place: PlaceCandidateOut | None
    adopted: bool


class SuggestionOut(BaseModel):
    id: uuid.UUID
    destination: str
    preferences: str
    # 같은 입력의 저장된 결과를 돌려줬으면 true(Gemini를 다시 부르지 않음)
    reused: bool
    items: list[SuggestedItemOut]


class AdoptRequest(BaseModel):
    item_ids: list[uuid.UUID] = Field(min_length=1, max_length=60)


def get_plan_suggester(request: Request) -> PlanSuggester:
    return request.app.state.plan_suggester


def _input_hash(trip: Trip, body: SuggestionAsk) -> str:
    key = [body.destination.lower(), trip.start_date.isoformat(), trip.end_date.isoformat(), body.preferences.lower()]
    return hashlib.sha256(json.dumps(key, ensure_ascii=False).encode()).hexdigest()


def _compact(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def _in_order(short: str, long: str) -> bool:
    """short의 글자가 long 안에 순서대로 모두 들어 있는가(예: 동문시장 → 동문재래시장)."""
    rest = iter(long)
    return all(ch in rest for ch in short)


def names_match(suggested: str, found: str) -> bool:
    """이름이 충분히 일치하는가. 공백·대소문자를 무시하고, 짧은 쪽이 긴 쪽 길이의 절반 이상이면서
    짧은 쪽 글자가 긴 쪽에 순서대로 모두 들어 있으면(포함 관계 포함) 같은 곳으로 본다.
    "카페"처럼 짧고 흔한 이름이 아무 카페에나 맞지 않도록 길이 조건을 둔다."""
    a, b = _compact(suggested), _compact(found)
    short, long = sorted((a, b), key=len)
    return len(short) >= 2 and len(short) * 2 >= len(long) and _in_order(short, long)


def _verify(searcher: PlaceSearcher, stop: SuggestedStop) -> PlaceCandidate | None:
    """"장소명 + 지역"으로 카카오를 검색해 이름이 충분히 일치하는 첫 후보. 없거나 검색이 안 되면 None(확인 필요)."""
    try:
        candidates = searcher.search(f"{stop.place_name} {stop.region}")
    except PlaceSearchUnavailable:
        return None
    return next((c for c in candidates if names_match(stop.place_name, c.name)), None)


def _ask_gemini(suggester: PlanSuggester, request: PlanRequest) -> list[SuggestedStop]:
    """형식이 틀리면 한 번 더 묻고, 그래도 틀리면 502."""
    for attempt in range(2):
        try:
            return suggester.suggest(request)
        except SuggestionFormatError:
            if attempt == 1:
                raise ApiError(502, "ai_bad_response", "추천 일정을 만들지 못했습니다. 직접 일정을 써 주세요.")
        except SuggestionUnavailable:
            raise ApiError(502, "ai_unavailable", "추천 서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 직접 일정을 써 주세요.")
    raise AssertionError("unreachable")


def _start_of_today_kst() -> datetime:
    now = datetime.now(KST)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _item_out(item: SuggestedItem) -> SuggestedItemOut:
    place = (
        PlaceCandidateOut(
            kakao_place_id=item.kakao_place_id,
            name=item.kakao_name or item.place_name,
            address=item.kakao_address or "",
            road_address=item.kakao_road_address,
            latitude=item.latitude,
            longitude=item.longitude,
            category=item.kakao_category,
        )
        if item.status == "verified" and item.kakao_place_id and item.latitude is not None and item.longitude is not None
        else None
    )
    return SuggestedItemOut(
        id=item.id,
        date=item.date,
        order=item.order,
        place_name=item.place_name,
        region=item.region,
        stay_minutes=item.stay_minutes,
        description=item.description,
        status=item.status,  # type: ignore[arg-type]
        place=place,
        adopted=item.adopted_plan_item_id is not None,
    )


def _out(request: SuggestionRequest, reused: bool) -> SuggestionOut:
    return SuggestionOut(
        id=request.id,
        destination=request.destination,
        preferences=request.preferences,
        reused=reused,
        items=[_item_out(i) for i in request.items],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse, "description": "여행 없음"},
        429: {"model": ErrorResponse, "description": "오늘 추천 횟수를 다 씀"},
        502: {"model": ErrorResponse, "description": "Gemini 실패·형식 오류"},
    },
)
def ask_for_suggestions(
    trip_id: uuid.UUID,
    body: SuggestionAsk,
    response: Response,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    suggester: PlanSuggester = Depends(get_plan_suggester),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> SuggestionOut:
    """여행지·취향으로 날짜별 추천 일정을 받는다. 같은 입력이면 저장된 결과를 200으로 바로 돌려준다."""
    me = require_member(session, trip_id, user)
    trip = me.trip
    input_hash = _input_hash(trip, body)
    saved = session.scalars(
        select(SuggestionRequest).where(SuggestionRequest.trip_id == trip_id, SuggestionRequest.input_hash == input_hash)
    ).one_or_none()
    if saved is not None:
        response.status_code = status.HTTP_200_OK
        return _out(saved, reused=True)

    used_today = session.scalar(
        select(func.count()).where(SuggestionRequest.trip_id == trip_id, SuggestionRequest.created_at >= _start_of_today_kst())
    )
    if (used_today or 0) >= DAILY_LIMIT:
        raise ApiError(
            429,
            "suggestion_limit",
            f"이 여행의 오늘 추천 횟수({DAILY_LIMIT}회)를 모두 썼습니다. 내일 0시(한국 시간)부터 다시 요청할 수 있습니다.",
        )

    stops = _ask_gemini(suggester, PlanRequest(body.destination, trip.start_date, trip.end_date, body.preferences))
    request = SuggestionRequest(trip_id=trip_id, input_hash=input_hash, destination=body.destination, preferences=body.preferences)
    for stop in stops:
        found = _verify(searcher, stop)
        request.items.append(
            SuggestedItem(
                date=stop.date,
                order=stop.order,
                place_name=stop.place_name,
                region=stop.region,
                stay_minutes=stop.stay_minutes,
                description=stop.description,
                status="verified" if found else "needs_check",
                kakao_place_id=found.kakao_place_id if found else None,
                kakao_name=found.name if found else None,
                kakao_address=found.address if found else None,
                kakao_road_address=found.road_address if found else None,
                latitude=found.latitude if found else None,
                longitude=found.longitude if found else None,
                kakao_category=found.category if found else None,
            )
        )
    session.add(request)
    session.commit()
    return _out(request, reused=False)


@router.post(
    "/{request_id}/adopt",
    responses={404: {"model": ErrorResponse, "description": "여행·추천 없음"}},
)
def adopt_suggestions(
    trip_id: uuid.UUID,
    request_id: uuid.UUID,
    body: AdoptRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PlanItemOut]:
    """고른 추천 일정만 일정 항목으로 만든다. 기존 일정 항목은 건드리지 않는다. 이미 채택한 것은 건너뛴다."""
    me = require_member(session, trip_id, user)
    request = session.scalars(
        select(SuggestionRequest).where(SuggestionRequest.id == request_id, SuggestionRequest.trip_id == trip_id)
    ).one_or_none()
    if request is None:
        raise ApiError(404, "suggestion_not_found", "추천 결과를 찾을 수 없습니다.")
    chosen = set(body.item_ids)
    created: list[PlanItem] = []
    for item in request.items:
        if item.id not in chosen or item.adopted_plan_item_id is not None:
            continue
        check_in_period(me.trip, item.date)
        place = None
        if item.status == "verified" and item.kakao_place_id and item.latitude is not None and item.longitude is not None:
            place = place_from_candidate(
                session,
                trip_id,
                PlaceCandidate(
                    item.kakao_place_id, item.kakao_name or item.place_name, item.kakao_address or "",
                    item.kakao_road_address, item.latitude, item.longitude, item.kakao_category,
                ),
            )
        plan = PlanItem(
            trip_id=trip_id, date=item.date, position=0, title=item.place_name[:80],
            memo=item.description[:300], place=place, created_by=me,
        )
        session.add(plan)
        session.flush()
        slot_into_day(session, plan)
        item.adopted_plan_item_id = plan.id
        created.append(plan)
    session.commit()
    return [plan_item_out(p) for p in created]
