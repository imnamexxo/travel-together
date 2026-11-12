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
from app.models import TRIP_NAME_MAX, Member, Trip
from app.permissions import require_member
from app.profiles import ensure_profile

router = APIRouter(prefix="/trips", tags=["trips"], responses=ERROR_RESPONSES)

TripName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TRIP_NAME_MAX)
]


class TripCreate(BaseModel):
    name: TripName
    start_date: date
    end_date: date


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


def _detail(trip: Trip, me: Member, member_count: int) -> TripDetail:
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


def _member_count(session: Session, trip_id: uuid.UUID) -> int:
    return session.scalar(select(func.count()).where(Member.trip_id == trip_id)) or 0


@router.post("", status_code=status.HTTP_201_CREATED)
def create_trip(
    body: TripCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    """여행을 만든다. 만든 사용자가 총무이자 첫 번째 멤버가 된다."""
    if body.start_date > body.end_date:
        raise ApiError(
            422,
            "validation_failed",
            "입력값을 확인해 주세요.",
            [ErrorDetail(field="end_date", message="종료일은 시작일과 같거나 뒤여야 합니다.")],
        )
    ensure_profile(session, user)
    trip = Trip(
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        organizer_user_id=user.id,
    )
    me = Member(trip=trip, user_id=user.id, join_order=1)
    session.add_all([trip, me])
    session.commit()
    return _detail(trip, me, member_count=1)


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
    return _detail(me.trip, me, _member_count(session, trip_id))
