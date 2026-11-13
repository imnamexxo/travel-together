"""지도 데이터: 이 여행의 장소 핀과 장소별 일정·사진·지출 요약을 한 번에 준다(#16).

사진이나 확정된 지출이 붙은 장소가 "들른 곳", 일정에만 있는 장소가 "계획만 한 곳"이다.
선(이동경로)은 없다. 사람의 위치는 쓰지 않는다(ADR-0003).
"""

import datetime as dt
import uuid
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app import loading
from app.models import Expense, Member, Photo, Place, PlanItem
from app.permissions import require_member
from app.photos import get_storage
from app.routers.photos import STORAGE_DOWN, _signed, _utc
from app.routers.planner import PlaceOut, PlanItemOut, place_out, plan_item_out
from app.storage import ObjectStorage

router = APIRouter(prefix="/trips/{trip_id}", tags=["map"], responses=ERROR_RESPONSES)

KST = ZoneInfo("Asia/Seoul")


class MapPhoto(BaseModel):
    id: uuid.UUID
    # 짧게 열리는 서명 URL(썸네일로 쓴다).
    url: str
    taken_at: dt.datetime | None
    uploader_member_id: uuid.UUID


class MapPlace(BaseModel):
    place: PlaceOut
    # 사진이나 확정된 지출이 있으면 들른 곳.
    visited: bool
    # 사진 촬영일·지출 결제일(한국 날짜). 들른 날짜다.
    visited_dates: list[dt.date]
    plan_items: list[PlanItemOut]
    photos: list[MapPhoto]
    # 확정된 지출만 센다.
    expense_count: int
    expense_total: int


class MapData(BaseModel):
    places: list[MapPlace]
    # 장소에 연결되지 않은 사진 수(필터 적용). 앨범에서 연결하도록 안내한다.
    unlinked_photo_count: int


def _kst_date(value: dt.datetime | None) -> dt.date | None:
    return value.astimezone(KST).date() if value else None


@router.get("/map", responses={404: {"model": ErrorResponse, "description": "여행 없음"}, **STORAGE_DOWN})
def map_data(
    trip_id: uuid.UUID,
    date: dt.date | None = None,
    member_id: uuid.UUID | None = None,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> MapData:
    """장소별 지도 데이터.

    - date: 그날 계획했거나(일정 항목) 들른(사진 촬영일·지출 결제일) 장소만.
    - member_id: 그 멤버가 사진을 올렸거나 결제한 장소만. 일정 항목은 함께 보여 주지만 장소를 고르는 기준은 아니다.
    """
    require_member(session, trip_id, user)
    if member_id is not None and session.scalar(select(Member.id).where(Member.id == member_id, Member.trip_id == trip_id)) is None:
        raise ApiError(422, "validation_failed", "입력값을 확인해 주세요.", [ErrorDetail(field="member_id", message="이 여행의 멤버가 아닙니다.")])

    plans = [
        i for i in session.scalars(select(PlanItem).where(PlanItem.trip_id == trip_id).order_by(PlanItem.date, PlanItem.position).options(*loading.PLAN_ITEM))
        if date is None or i.date == date
    ]
    photos = [
        p for p in session.scalars(select(Photo).where(Photo.trip_id == trip_id).order_by(Photo.taken_at, Photo.created_at))
        if (date is None or _kst_date(p.taken_at) == date) and (member_id is None or p.uploader_member_id == member_id)
    ]
    expenses = [
        e for e in session.scalars(select(Expense).where(Expense.trip_id == trip_id, Expense.status == "confirmed").order_by(Expense.paid_at))
        if (date is None or _kst_date(e.paid_at) == date) and (member_id is None or e.payer_member_id == member_id)
    ]

    place_ids: list[uuid.UUID] = []  # 처음 나온 순서(일정 순서가 먼저)
    for place_id in [i.place_id for i in plans] + [p.place_id for p in photos] + [e.place_id for e in expenses]:
        if place_id is not None and place_id not in place_ids:
            place_ids.append(place_id)
    places = {p.id: p for p in session.scalars(select(Place).where(Place.id.in_(place_ids)))} if place_ids else {}
    urls = _signed(storage, [p for p in photos if p.place_id is not None])

    result: list[MapPlace] = []
    for place_id in place_ids:
        place_plans = [i for i in plans if i.place_id == place_id]
        place_photos = [p for p in photos if p.place_id == place_id]
        place_expenses = [e for e in expenses if e.place_id == place_id]
        if member_id is not None and not place_photos and not place_expenses:
            continue
        days = {_kst_date(p.taken_at) for p in place_photos} | {_kst_date(e.paid_at) for e in place_expenses}
        result.append(MapPlace(
            place=place_out(places[place_id]),
            visited=bool(place_photos or place_expenses),
            visited_dates=sorted(d for d in days if d is not None),
            plan_items=[plan_item_out(i) for i in place_plans],
            photos=[MapPhoto(id=p.id, url=urls.get(p.storage_key, ""), taken_at=_utc(p.taken_at), uploader_member_id=p.uploader_member_id) for p in place_photos],
            expense_count=len(place_expenses),
            expense_total=sum(e.total_amount or 0 for e in place_expenses),
        ))
    return MapData(places=result, unlinked_photo_count=sum(1 for p in photos if p.place_id is None))
