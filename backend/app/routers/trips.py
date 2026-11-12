import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app.invites import new_invite_code
from app.models import TRIP_NAME_MAX, Member, Photo, PlanItem, Trip
from app.photos import delete_files, get_storage
from app.storage import ObjectStorage
from app.permissions import require_member, require_organizer
from app.profiles import ensure_profile

router = APIRouter(prefix="/trips", tags=["trips"], responses=ERROR_RESPONSES)

TripName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TRIP_NAME_MAX)
]


class TripCreate(BaseModel):
    name: TripName
    start_date: date
    end_date: date


class TripUpdate(BaseModel):
    """보낸 값만 바꾼다."""

    name: TripName | None = None
    start_date: date | None = None
    end_date: date | None = None


class MyMembership(BaseModel):
    member_id: uuid.UUID
    join_order: int
    is_organizer: bool


class TripSummary(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    member_count: int
    is_organizer: bool


class TripDetail(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    member_count: int
    me: MyMembership


def trip_detail(trip: Trip, me: Member, member_count: int) -> TripDetail:
    return TripDetail(
        id=trip.id,
        name=trip.name,
        start_date=trip.start_date,
        end_date=trip.end_date,
        member_count=member_count,
        me=MyMembership(
            member_id=me.id, join_order=me.join_order, is_organizer=me.is_organizer
        ),
    )


def member_count_of(session: Session, trip_id: uuid.UUID) -> int:
    return session.scalar(select(func.count()).where(Member.trip_id == trip_id)) or 0


def _check_dates(start: date, end: date) -> None:
    if start > end:
        raise ApiError(
            422,
            "validation_failed",
            "입력값을 확인해 주세요.",
            [ErrorDetail(field="end_date", message="종료일은 시작일과 같거나 뒤여야 합니다.")],
        )


def _dates_with_plan_items_outside(session: Session, trip: Trip, start: date, end: date) -> list[date]:
    """새 기간 밖으로 밀려나는 일정 항목의 날짜(겹치지 않게, 이른 순)."""
    return list(
        session.scalars(
            select(PlanItem.date)
            .where(PlanItem.trip_id == trip.id, (PlanItem.date < start) | (PlanItem.date > end))
            .distinct()
            .order_by(PlanItem.date)
        )
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_trip(
    body: TripCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    """여행을 만든다. 만든 사용자가 총무이자 첫 번째 멤버가 된다."""
    _check_dates(body.start_date, body.end_date)
    ensure_profile(session, user)
    trip = Trip(
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        organizer_user_id=user.id,
        invite_code=new_invite_code(session),
    )
    me = Member(trip=trip, user_id=user.id, join_order=1)
    session.add_all([trip, me])
    session.commit()
    return trip_detail(trip, me, member_count=1)


@router.get("")
def list_trips(
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TripSummary]:
    """내가 멤버인 여행. 시작일이 늦은 여행부터."""
    member_count = (
        select(func.count())
        .where(Member.trip_id == Trip.id)
        .correlate(Trip)
        .scalar_subquery()
    )
    rows = session.execute(
        select(Trip, member_count)
        .join(Member, Member.trip_id == Trip.id)
        .where(Member.user_id == user.id)
        .order_by(Trip.start_date.desc(), Trip.created_at.desc())
    ).all()
    return [
        TripSummary(
            id=trip.id,
            name=trip.name,
            start_date=trip.start_date,
            end_date=trip.end_date,
            member_count=count,
            is_organizer=trip.organizer_user_id == user.id,
        )
        for trip, count in rows
    ]


@router.get("/{trip_id}", responses={404: {"model": ErrorResponse, "description": "여행 없음"}})
def get_trip(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    """여행과 그 여행에서의 내 멤버 정보(총무 여부)."""
    me = require_member(session, trip_id, user)
    return trip_detail(me.trip, me, member_count_of(session, trip_id))


ORGANIZER_ONLY = {
    403: {"model": ErrorResponse, "description": "총무 아님"},
    404: {"model": ErrorResponse, "description": "여행 없음"},
}


@router.patch(
    "/{trip_id}",
    responses={**ORGANIZER_ONLY, 409: {"model": ErrorResponse, "description": "일정 항목이 있는 날짜가 빠짐"}},
)
def update_trip(
    trip_id: uuid.UUID,
    body: TripUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    """총무가 여행 이름·기간을 바꾼다. 일정 항목이 있는 날짜가 기간 밖으로 빠지면 409."""
    me = require_organizer(session, trip_id, user)
    trip = me.trip
    start = body.start_date or trip.start_date
    end = body.end_date or trip.end_date
    _check_dates(start, end)
    stranded = _dates_with_plan_items_outside(session, trip, start, end)
    if stranded:
        raise ApiError(
            409,
            "plan_items_outside_period",
            "일정 항목이 있는 날짜가 기간에서 빠집니다. 그 날짜의 일정을 먼저 옮기거나 지워 주세요.",
            [ErrorDetail(field="dates", message=d.isoformat()) for d in stranded],
        )
    if body.name is not None:
        trip.name = body.name
    trip.start_date, trip.end_date = start, end
    session.commit()
    return trip_detail(trip, me, member_count_of(session, trip_id))


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ORGANIZER_ONLY)
def delete_trip(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> None:
    """총무가 여행을 통째로 지운다. 여행에 속한 데이터는 DB cascade로, 사진 파일은 저장소에서 지운다."""
    me = require_organizer(session, trip_id, user)
    keys = list(session.scalars(select(Photo.storage_key).where(Photo.trip_id == trip_id)))
    session.delete(me.trip)
    session.commit()
    delete_files(storage, keys)
