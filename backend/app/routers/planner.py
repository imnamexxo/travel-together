import datetime as dt
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app import loading
from app.models import Place, PlanItem, Trip
from app.permissions import require_member
from app.place_search import PlaceCandidate, PlaceSearcher, PlaceSearchUnavailable
from app.places import get_place_searcher, place_for, search_places

router = APIRouter(prefix="/trips/{trip_id}", tags=["planner"], responses=ERROR_RESPONSES)

NOT_FOUND = {404: {"model": ErrorResponse, "description": "여행·일정 항목 없음"}}
EXTERNAL = {502: {"model": ErrorResponse, "description": "장소 검색(카카오·Google) 실패"}}


class PlaceOut(BaseModel):
    id: uuid.UUID
    source_place_id: str
    # kakao: 이름·주소가 함께 온다. google: 이름·주소·종류가 없고(저장 금지), 볼 때 /details로 받는다(ADR 0006).
    source: Literal["kakao", "google"]
    name: str | None
    address: str | None
    road_address: str | None
    # Google 좌표를 30일 안에 다시 받지 못하면 비어 있다. 그런 장소는 지도에 찍지 않는다.
    latitude: float | None
    longitude: float | None
    category: str | None


class PlaceDetailsOut(BaseModel):
    """볼 때만 받는 장소 이름·주소. 앱은 저장하지 않고 메모리에만 둔다."""

    name: str
    address: str


class PlaceCandidateOut(BaseModel):
    source_place_id: str
    name: str
    address: str
    road_address: str | None
    latitude: float
    longitude: float
    category: str | None


class PlaceRef(BaseModel):
    """검색 결과에서 고른 장소. 서버가 여행의 검색기(카카오·Google)로 다시 확인한다."""

    source_place_id: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class PlanItemIn(BaseModel):
    date: dt.date
    time: dt.time | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    memo: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""
    estimated_cost: Annotated[int, Field(ge=0, le=100_000_000)] | None = None
    # 없으면 장소 없는 일정 항목("자유시간")이다.
    place: PlaceRef | None = None


class PlanItemOut(BaseModel):
    id: uuid.UUID
    date: dt.date
    position: int
    time: dt.time | None
    title: str
    memo: str
    estimated_cost: int | None
    place: PlaceOut | None
    created_by_member_id: uuid.UUID | None
    created_by_name: str | None


class PlanOrder(BaseModel):
    date: dt.date
    item_ids: list[uuid.UUID]


def place_out(place: Place) -> PlaceOut:
    return PlaceOut(
        id=place.id,
        source_place_id=place.source_place_id,
        source=place.source,  # type: ignore[arg-type]
        name=place.name,
        address=place.address,
        road_address=place.road_address,
        latitude=place.latitude,
        longitude=place.longitude,
        category=place.category,
    )


def candidate_out(c: PlaceCandidate) -> PlaceCandidateOut:
    return PlaceCandidateOut(**c.__dict__)


def plan_item_out(item: PlanItem) -> PlanItemOut:
    return PlanItemOut(
        id=item.id,
        date=item.date,
        position=item.position,
        time=item.time,
        title=item.title,
        memo=item.memo,
        estimated_cost=item.estimated_cost,
        place=place_out(item.place) if item.place else None,
        created_by_member_id=item.created_by_member_id,
        created_by_name=item.created_by.profile.display_name if item.created_by else None,
    )


def check_in_period(trip: Trip, day: dt.date) -> None:
    if not trip.start_date <= day <= trip.end_date:
        raise ApiError(
            422,
            "validation_failed",
            "입력값을 확인해 주세요.",
            [ErrorDetail(field="date", message="여행 기간 안의 날짜를 골라 주세요.")],
        )


def _day_items(session: Session, trip_id: uuid.UUID, day: dt.date) -> list[PlanItem]:
    return list(
        session.scalars(
            select(PlanItem).where(PlanItem.trip_id == trip_id, PlanItem.date == day).order_by(PlanItem.position)
        )
    )


def _renumber(items: list[PlanItem]) -> None:
    for position, item in enumerate(items):
        item.position = position


def slot_into_day(session: Session, item: PlanItem) -> None:
    """그날 일정에 넣는다. 시간이 있으면 더 늦은 항목이나 시간 없는 항목 앞, 시간이 없으면 맨 뒤."""
    others = [i for i in _day_items(session, item.trip_id, item.date) if i.id != item.id]
    index = len(others)
    if item.time is not None:
        index = next((n for n, other in enumerate(others) if other.time is None or other.time > item.time), len(others))
    others.insert(index, item)
    _renumber(others)


def _get_item(session: Session, trip_id: uuid.UUID, item_id: uuid.UUID) -> PlanItem:
    item = session.scalars(select(PlanItem).where(PlanItem.id == item_id, PlanItem.trip_id == trip_id)).one_or_none()
    if item is None:
        raise ApiError(404, "plan_item_not_found", "일정 항목을 찾을 수 없습니다.")
    return item


def _apply(session: Session, searcher: PlaceSearcher, item: PlanItem, body: PlanItemIn, trip: Trip) -> None:
    check_in_period(trip, body.date)
    item.date = body.date
    item.time = body.time
    item.title = body.title
    item.memo = body.memo
    item.estimated_cost = body.estimated_cost
    item.place = (
        place_for(session, searcher, trip.id, body.place.source_place_id, body.place.name) if body.place else None
    )


@router.get("/places/search", responses={**NOT_FOUND, **EXTERNAL})
def search(
    trip_id: uuid.UUID,
    query: Annotated[str, Query(min_length=1, max_length=100)],
    lat: Annotated[float | None, Query(ge=-90, le=90, description="검색 기준점(장소·지역)의 위도")] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> list[PlaceCandidateOut]:
    """키워드로 실제 장소를 찾는다(국내 카카오, 해외 Google). 해외 결과는 저장하지 말고 보여 주기만 한다."""
    require_member(session, trip_id, user)
    near = (lat, lng) if lat is not None and lng is not None else None
    return [candidate_out(c) for c in search_places(searcher, query.strip(), near)]


@router.get("/places/{place_id}/details", responses={404: {"model": ErrorResponse, "description": "여행·장소 없음"}, **EXTERNAL})
def place_details(
    trip_id: uuid.UUID,
    place_id: uuid.UUID,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PlaceDetailsOut:
    """장소 이름·주소. 카카오 장소는 저장된 값, Google 장소는 그때 Google에서 받는다(저장하지 않음, ADR 0006).

    Google 하루 상한에 걸리면 502다. 앱은 이름 대신 일정 제목을 보여 준다.
    """
    require_member(session, trip_id, user)
    place = session.scalars(select(Place).where(Place.id == place_id, Place.trip_id == trip_id)).one_or_none()
    if place is None:
        raise ApiError(404, "place_not_found", "장소를 찾을 수 없습니다.")
    if place.source != "google":
        return PlaceDetailsOut(name=place.name or "", address=place.road_address or place.address or "")
    try:
        details = request.app.state.overseas_place_searcher.details(place.source_place_id)
    except PlaceSearchUnavailable:
        raise ApiError(502, "place_search_unavailable", "장소 정보를 받지 못했습니다. 잠시 후 다시 시도해 주세요.")
    if details is None:
        raise ApiError(404, "place_not_found", "Google 지도에서 이 장소를 찾을 수 없습니다.")
    return PlaceDetailsOut(name=details.name, address=details.address)


@router.get("/plan-items", responses=NOT_FOUND)
def list_plan_items(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PlanItemOut]:
    """여행의 모든 일정 항목. 날짜, 하루 안의 순서대로."""
    require_member(session, trip_id, user)
    items = session.scalars(
        select(PlanItem).where(PlanItem.trip_id == trip_id).order_by(PlanItem.date, PlanItem.position).options(*loading.PLAN_ITEM)
    ).all()
    return [plan_item_out(i) for i in items]


@router.post("/plan-items", status_code=status.HTTP_201_CREATED, responses={**NOT_FOUND, **EXTERNAL})
def create_plan_item(
    trip_id: uuid.UUID,
    body: PlanItemIn,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> PlanItemOut:
    """멤버 누구나 일정 항목을 만든다."""
    me = require_member(session, trip_id, user)
    item = PlanItem(trip_id=trip_id, created_by=me, position=0)
    _apply(session, searcher, item, body, me.trip)
    session.add(item)
    session.flush()
    slot_into_day(session, item)
    session.commit()
    return plan_item_out(item)


# "/plan-items/{item_id}"보다 먼저 선언해야 "order"를 id로 읽지 않는다.
@router.put("/plan-items/order", responses=NOT_FOUND)
def reorder_plan_items(
    trip_id: uuid.UUID,
    body: PlanOrder,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PlanItemOut]:
    """하루 안의 순서를 바꾼다. 그날의 일정 항목 id를 빠짐없이 새 순서대로 보낸다."""
    require_member(session, trip_id, user)
    items = {i.id: i for i in _day_items(session, trip_id, body.date)}
    if set(body.item_ids) != set(items) or len(body.item_ids) != len(items):
        raise ApiError(
            409,
            "plan_changed",
            "그사이 일정이 바뀌었습니다. 새로고침한 뒤 다시 순서를 바꿔 주세요.",
        )
    _renumber([items[i] for i in body.item_ids])
    session.commit()
    return [plan_item_out(items[i]) for i in body.item_ids]


@router.put("/plan-items/{item_id}", responses={**NOT_FOUND, **EXTERNAL})
def update_plan_item(
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    body: PlanItemIn,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> PlanItemOut:
    """멤버 누구나 고칠 수 있다(다른 멤버가 만든 것도). 마지막 저장이 반영된다."""
    me = require_member(session, trip_id, user)
    item = _get_item(session, trip_id, item_id)
    old_day, old_time = item.date, item.time
    _apply(session, searcher, item, body, me.trip)
    if (item.date, item.time) != (old_day, old_time):
        session.flush()
        slot_into_day(session, item)
        if item.date != old_day:
            _renumber(_day_items(session, trip_id, old_day))
    session.commit()
    return plan_item_out(item)


@router.delete(
    "/plan-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, 403: {"model": ErrorResponse, "description": "만든 사람·총무가 아님"}},
)
def delete_plan_item(
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """만든 멤버나 총무만 지울 수 있다."""
    me = require_member(session, trip_id, user)
    item = _get_item(session, trip_id, item_id)
    if not (me.is_organizer or item.created_by_member_id == me.id):
        raise ApiError(403, "not_plan_item_owner", "내가 만든 일정 항목만 지울 수 있습니다.")
    day = item.date
    session.delete(item)
    session.flush()
    _renumber(_day_items(session, trip_id, day))
    session.commit()
