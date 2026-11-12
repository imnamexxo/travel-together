import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorResponse
from app.expenses import has_money_records
from app.invites import new_invite_code, normalize_code
from app.models import MAX_MEMBERS, Member, Photo, Trip
from app.photos import delete_files, get_storage
from app.storage import ObjectStorage
from app.permissions import require_member, require_organizer
from app.profiles import ensure_profile
from app.routers.trips import TripDetail, member_count_of, trip_detail

router = APIRouter(prefix="/trips", tags=["members"], responses=ERROR_RESPONSES)

NOT_FOUND = {404: {"model": ErrorResponse, "description": "여행 없음"}}
ORGANIZER_ONLY = {
    403: {"model": ErrorResponse, "description": "총무 아님"},
    **NOT_FOUND,
}


class MemberOut(BaseModel):
    member_id: uuid.UUID
    display_name: str
    join_order: int
    is_organizer: bool
    is_me: bool


class InviteCode(BaseModel):
    code: str


class JoinRequest(BaseModel):
    code: str


@router.get("/{trip_id}/members", responses=NOT_FOUND)
def list_members(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MemberOut]:
    """여행 멤버, 가입 순서대로."""
    me = require_member(session, trip_id, user)
    return [
        MemberOut(
            member_id=m.id,
            display_name=m.profile.display_name,
            join_order=m.join_order,
            is_organizer=m.is_organizer,
            is_me=m.id == me.id,
        )
        for m in me.trip.members
    ]


@router.get("/{trip_id}/invite-code", responses=ORGANIZER_ONLY)
def get_invite_code(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> InviteCode:
    organizer = require_organizer(session, trip_id, user)
    return InviteCode(code=organizer.trip.invite_code)


@router.post("/{trip_id}/invite-code", responses=ORGANIZER_ONLY)
def reissue_invite_code(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> InviteCode:
    """새 코드를 발급한다. 이전 코드로는 더 이상 들어올 수 없다."""
    organizer = require_organizer(session, trip_id, user)
    organizer.trip.invite_code = new_invite_code(session)
    session.commit()
    return InviteCode(code=organizer.trip.invite_code)


@router.post(
    "/join",
    responses={
        404: {"model": ErrorResponse, "description": "코드 없음"},
        409: {"model": ErrorResponse, "description": "멤버 10명"},
    },
)
def join_trip(
    body: JoinRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    """초대 코드로 여행의 멤버가 된다. 이미 멤버면 그대로 돌려준다."""
    # 같은 여행에 동시에 들어오는 요청이 인원 제한과 가입 순서를 깨지 않도록 여행 행을 잠근다.
    trip = session.scalars(
        select(Trip).where(Trip.invite_code == normalize_code(body.code)).with_for_update()
    ).one_or_none()
    if trip is None:
        raise ApiError(
            404, "invalid_invite_code", "초대 코드가 맞지 않습니다. 총무에게 새 코드를 받아 주세요."
        )

    existing = next((m for m in trip.members if m.user_id == user.id), None)
    if existing is not None:
        return trip_detail(trip, existing, member_count_of(session, trip.id))

    count = member_count_of(session, trip.id)
    if count >= MAX_MEMBERS:
        raise ApiError(
            409, "trip_full", f"이 여행은 멤버가 {MAX_MEMBERS}명이라 더 들어갈 수 없습니다."
        )

    ensure_profile(session, user)
    last_order = session.scalar(
        select(func.max(Member.join_order)).where(Member.trip_id == trip.id)
    )
    me = Member(trip=trip, user_id=user.id, join_order=(last_order or 0) + 1)
    session.add(me)
    session.commit()
    return trip_detail(trip, me, count + 1)


def _remove(session: Session, storage: ObjectStorage, member: Member, verb: str) -> None:
    """멤버를 여행에서 뺀다. 그 멤버가 올린 사진도 지운다."""
    if member.is_organizer:
        raise ApiError(409, "organizer_cannot_leave", "총무는 여행에서 나갈 수 없습니다.")
    # 잔액이 깨지지 않도록, 지출이나 송금 기록에 엮인 멤버는 뺄 수 없다.
    if has_money_records(session, member.id):
        raise ApiError(
            409, "member_has_expenses", f"지출의 결제자·분담 대상이거나 송금 기록이 있어 {verb} 수 없습니다."
        )
    photos = list(session.scalars(select(Photo).where(Photo.uploader_member_id == member.id)))
    keys = [p.storage_key for p in photos]
    for photo in photos:
        session.delete(photo)
    session.delete(member)
    session.commit()
    delete_files(storage, keys)


@router.delete(
    "/{trip_id}/members/me",
    status_code=204,
    responses={**NOT_FOUND, 409: {"model": ErrorResponse, "description": "나갈 수 없음"}},
)
def leave_trip(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> None:
    """내가 여행에서 나간다. 총무는 나갈 수 없다."""
    _remove(session, storage, require_member(session, trip_id, user), "나갈")


@router.delete(
    "/{trip_id}/members/{member_id}",
    status_code=204,
    responses={**ORGANIZER_ONLY, 409: {"model": ErrorResponse, "description": "내보낼 수 없음"}},
)
def remove_member(
    trip_id: uuid.UUID,
    member_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> None:
    """총무가 다른 멤버를 내보낸다."""
    organizer = require_organizer(session, trip_id, user)
    target = next((m for m in organizer.trip.members if m.id == member_id), None)
    if target is None:
        raise ApiError(404, "member_not_found", "멤버를 찾을 수 없습니다.")
    _remove(session, storage, target, "내보낼")
