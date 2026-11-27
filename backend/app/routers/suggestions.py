import datetime as dt
import hashlib
import json
import logging
import math
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app.gemini import FixedPlan, Pace, PlanRequest, PlanSuggester, SuggestedStop, SuggestionFormatError, SuggestionUnavailable
from app.models import PlanItem, SuggestedItem, SuggestionRequest, Trip
from app.permissions import require_member
from app.place_search import PlaceCandidate, PlaceSearcher, PlaceSearchUnavailable
from app.places import get_place_searcher, place_for, place_from_candidate
from app.routers.planner import PlaceCandidateOut, PlanItemOut, check_in_period, plan_item_out, slot_into_day

router = APIRouter(prefix="/trips/{trip_id}/suggestions", tags=["suggestions"], responses=ERROR_RESPONSES)

DAILY_LIMIT = 10
# 카카오 확인을 동시에 몇 곳까지 할지. 카카오 초당 요청 제한보다 넉넉히 낮게.
VERIFY_WORKERS = 6
logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))


class SuggestionAsk(BaseModel):
    destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    preferences: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    # 추천받을 구간. 비우면 여행 전체 기간. 여러 도시를 도는 여행은 구간마다 여행지를 바꿔 묻는다.
    start_date: dt.date | None = None
    end_date: dt.date | None = None
    day_start: dt.time = dt.time(9, 0)
    day_end: dt.time = dt.time(21, 0)
    lodging: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] = ""
    pace: Pace = "normal"


class SuggestedItemOut(BaseModel):
    id: uuid.UUID
    date: dt.date
    order: int
    place_name: str
    region: str
    stay_minutes: int
    description: str
    # verified: 검색기에서 확인한 장소가 있다 / needs_check: "확인 필요", 장소가 비어 있다
    # 해외 여행(Google)은 verified여도 place가 비어 있다(장소 정보 저장 금지, ADR 0006). 채택할 때 확인한다.
    status: Literal["verified", "needs_check"]
    place: PlaceCandidateOut | None
    adopted: bool
    start_time: dt.time | None
    travel_minutes: int | None
    transport: str | None
    # 그날 앞 추천 장소와의 직선거리(km). 두 곳 모두 좌표를 알 때만(국내 카카오 장소). 멀면 화면에서 경고한다.
    distance_km: float | None


class SuggestionOut(BaseModel):
    id: uuid.UUID
    destination: str
    preferences: str
    start_date: dt.date
    end_date: dt.date
    # 같은 입력의 저장된 결과를 돌려줬으면 true(Gemini를 다시 부르지 않음)
    reused: bool
    items: list[SuggestedItemOut]


class AdoptRequest(BaseModel):
    item_ids: list[uuid.UUID] = Field(min_length=1, max_length=60)


def get_plan_suggester(request: Request) -> PlanSuggester:
    return request.app.state.plan_suggester


def _input_hash(trip: Trip, body: SuggestionAsk, start: dt.date, end: dt.date, fixed: list[FixedPlan]) -> str:
    """같은 입력이면 저장된 결과를 다시 쓴다. 이미 잡힌 일정이 바뀌면 다른 입력이다."""
    key = [body.destination.lower(), start.isoformat(), end.isoformat(), body.preferences.lower()]
    if trip.is_overseas:
        key.append("overseas")
    key += [body.day_start.isoformat(), body.day_end.isoformat(), body.lodging.lower(), body.pace]
    key += [[f.date.isoformat(), f.time.isoformat() if f.time else "", f.title, f.place_name or ""] for f in fixed]
    return hashlib.sha256(json.dumps(key, ensure_ascii=False).encode()).hexdigest()


def _invalid(field: str, message: str) -> ApiError:
    return ApiError(422, "validation_failed", "입력값을 확인해 주세요.", [ErrorDetail(field=field, message=message)])


def _range(trip: Trip, body: SuggestionAsk) -> tuple[dt.date, dt.date]:
    start, end = body.start_date or trip.start_date, body.end_date or trip.end_date
    if not trip.start_date <= start <= trip.end_date:
        raise _invalid("start_date", "여행 기간 안의 날짜를 골라 주세요.")
    if not trip.start_date <= end <= trip.end_date:
        raise _invalid("end_date", "여행 기간 안의 날짜를 골라 주세요.")
    if end < start:
        raise _invalid("end_date", "끝 날짜는 시작 날짜와 같거나 뒤여야 합니다.")
    if body.day_end <= body.day_start:
        raise _invalid("day_end", "하루 일정이 끝나는 시각은 시작 시각보다 늦어야 합니다.")
    return start, end


def _fixed_plans(session: Session, trip_id: uuid.UUID, start: dt.date, end: dt.date) -> list[FixedPlan]:
    """구간에 이미 있는 일정. 장소 이름은 저장된 것만 쓴다(Google 장소는 이름이 없어 일정 제목만, ADR 0006)."""
    items = session.scalars(
        select(PlanItem).where(PlanItem.trip_id == trip_id, PlanItem.date >= start, PlanItem.date <= end)
        .order_by(PlanItem.date, PlanItem.position)
    ).all()
    return [FixedPlan(i.date, i.time, i.title, i.place.name if i.place else None) for i in items]


def _km(a: SuggestedItem, b: SuggestedItem) -> float | None:
    """두 추천 장소의 직선거리(km). 좌표를 모르면 None."""
    if None in (a.latitude, a.longitude, b.latitude, b.longitude):
        return None
    lat1, lng1, lat2, lng2 = map(math.radians, (a.latitude, a.longitude, b.latitude, b.longitude))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(h)), 1)


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


def _verify(searcher: PlaceSearcher, stop: SuggestedStop, *, overseas: bool = False) -> PlaceCandidate | None:
    """"장소명 + 지역"으로 검색해 이름이 충분히 일치하는 첫 후보. 없거나 검색이 안 되면 None(확인 필요).

    해외 여행(Google)은 같은 장소도 한국어 표기가 여러 가지라 이름이 맞는 후보가 없으면 첫 후보를 쓴다.
    Google은 "장소명 + 지역" 검색의 첫 결과가 대개 그 장소다. 사용자가 일정에 넣기 전에 보고 고른다.
    """
    try:
        candidates = searcher.search(f"{stop.place_name} {stop.region}")
    except PlaceSearchUnavailable:
        return None
    match = next((c for c in candidates if names_match(stop.place_name, c.name)), None)
    if match is None and overseas and candidates:
        return candidates[0]
    return match


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


def _item_out(item: SuggestedItem, previous: SuggestedItem | None = None) -> SuggestedItemOut:
    place = (
        PlaceCandidateOut(
            source_place_id=item.source_place_id,
            name=item.found_name or item.place_name,
            address=item.found_address or "",
            road_address=item.found_road_address,
            latitude=item.latitude,
            longitude=item.longitude,
            category=item.found_category,
        )
        if item.status == "verified" and item.source_place_id and item.latitude is not None and item.longitude is not None
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
        start_time=item.start_time,
        travel_minutes=item.travel_minutes,
        transport=item.transport or None,
        distance_km=_km(previous, item) if previous is not None and previous.date == item.date else None,
    )


def _out(request: SuggestionRequest, trip: Trip, reused: bool) -> SuggestionOut:
    items = sorted(request.items, key=lambda i: (i.date, i.order))  # 방금 만든 요청은 넣은 순서라 다시 정렬
    return SuggestionOut(
        id=request.id,
        destination=request.destination,
        preferences=request.preferences,
        start_date=request.start_date or trip.start_date,
        end_date=request.end_date or trip.end_date,
        reused=reused,
        items=[_item_out(item, items[n - 1] if n else None) for n, item in enumerate(items)],
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
    """구간·여행지·취향·하루 시간·숙소로 시간표 추천을 받는다. 이미 잡힌 일정은 피해 빈 시간만 채운다.
    같은 입력(이미 잡힌 일정 포함)이면 저장된 결과를 200으로 바로 돌려준다."""
    me = require_member(session, trip_id, user)
    trip = me.trip
    start, end = _range(trip, body)
    fixed = _fixed_plans(session, trip_id, start, end)
    input_hash = _input_hash(trip, body, start, end, fixed)
    saved = session.scalars(
        select(SuggestionRequest).where(SuggestionRequest.trip_id == trip_id, SuggestionRequest.input_hash == input_hash)
    ).one_or_none()
    if saved is not None:
        response.status_code = status.HTTP_200_OK
        return _out(saved, trip, reused=True)

    used_today = session.scalar(
        select(func.count()).where(SuggestionRequest.trip_id == trip_id, SuggestionRequest.created_at >= _start_of_today_kst())
    )
    if (used_today or 0) >= DAILY_LIMIT:
        raise ApiError(
            429,
            "suggestion_limit",
            f"이 여행의 오늘 추천 횟수({DAILY_LIMIT}회)를 모두 썼습니다. 내일 0시(한국 시간)부터 다시 요청할 수 있습니다.",
        )

    stops = _ask_gemini(suggester, PlanRequest(
        body.destination, start, end, body.preferences, overseas=trip.is_overseas,
        day_start=body.day_start, day_end=body.day_end, lodging=body.lodging, pace=body.pace, fixed=tuple(fixed),
    ))
    request = SuggestionRequest(
        trip_id=trip_id, input_hash=input_hash, destination=body.destination, preferences=body.preferences, start_date=start, end_date=end,
    )
    # 장소마다 검색(카카오·Google)이 필요하다. 한 곳씩 하면 12곳이면 12번을 기다리므로 동시에 묻는다(순서는 그대로).
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as pool:
        verified = list(pool.map(lambda stop: _verify(searcher, stop, overseas=trip.is_overseas), stops))
    logger.info("장소 확인(%s) %d곳 %.1f초", "Google" if trip.is_overseas else "카카오", len(stops), time.monotonic() - started)
    for stop, found in zip(stops, verified):
        keep = found is not None and searcher.stores_details
        request.items.append(
            SuggestedItem(
                date=stop.date,
                order=stop.order,
                place_name=stop.place_name,
                region=stop.region,
                stay_minutes=stop.stay_minutes,
                description=stop.description,
                start_time=stop.start_time,
                travel_minutes=stop.travel_minutes,
                transport=stop.transport or None,
                status="verified" if found else "needs_check",
                source_place_id=found.source_place_id if found else None,
                # Google 장소는 id만 둔다(ADR 0006). 화면에는 AI가 쓴 이름(place_name)을 보여 준다.
                found_name=found.name if keep else None,
                found_address=found.address if keep else None,
                found_road_address=found.road_address if keep else None,
                latitude=found.latitude if keep else None,
                longitude=found.longitude if keep else None,
                found_category=found.category if keep else None,
            )
        )
    session.add(request)
    session.commit()
    return _out(request, trip, reused=False)


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
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> list[PlanItemOut]:
    """고른 추천 일정만 일정 항목으로 만든다(추천 시각이 있으면 그 시각으로). 기존 일정 항목은 건드리지 않는다. 이미 채택한 것은 건너뛴다."""
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
        if item.status == "verified" and item.source_place_id:
            if item.latitude is not None and item.longitude is not None:
                place = place_from_candidate(
                    session,
                    searcher,
                    trip_id,
                    PlaceCandidate(
                        item.source_place_id, item.found_name or item.place_name, item.found_address or "",
                        item.found_road_address, item.latitude, item.longitude, item.found_category,
                    ),
                )
            else:
                # Google 장소는 id만 있으니 채택할 때 Google에서 확인하고 좌표를 받는다. 안 되면 장소 없이 넣는다.
                try:
                    place = place_for(session, searcher, trip_id, item.source_place_id, item.place_name)
                except ApiError:
                    place = None
        plan = PlanItem(
            trip_id=trip_id, date=item.date, position=0, time=item.start_time, title=item.place_name[:80],
            memo=item.description[:300], place=place, created_by=me,
        )
        session.add(plan)
        session.flush()
        slot_into_day(session, plan)
        item.adopted_plan_item_id = plan.id
        created.append(plan)
    session.commit()
    return [plan_item_out(p) for p in created]
