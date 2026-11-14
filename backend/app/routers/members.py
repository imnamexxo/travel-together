import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import loading
from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorResponse
from app.expenses import has_money_records
from app.invites import new_invite_code, normalize_code
from app.models import MAX_MEMBERS, Friendship, Member, Photo, Trip
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
    # 나와의 친구 관계: me(나), friend, requested(내가 요청함), incoming(나에게 요청함), none, deleted(탈퇴한 멤버)
    friend_status: str = "none"
    # 친구일 때만: 여행 초대에 쓰는 상대 계정 id
    friend_user_id: uuid.UUID | None = None
    # 나에게 온 요청(incoming)일 때만: 수락에 쓰는 요청 id
    friend_request_id: uuid.UUID | None = None


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
    relations = {
        (f.addressee_id if f.requester_id == user.id else f.requester_id): f
        for f in session.scalars(select(Friendship).where(or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id)))
    }

    def status_of(m: Member) -> str:
        if m.id == me.id:
            return "me"
        if m.profile.deleted_at is not None:
            return "deleted"
        f = relations.get(m.user_id)
        if f is None:
            return "none"
        if f.status == "accepted":
            return "friend"
        return "requested" if f.requester_id == user.id else "incoming"

    out = []
    for m in loading.trip_members(session, trip_id):
        state = status_of(m)
        out.append(MemberOut(
            member_id=m.id,
            display_name=m.profile.display_name,
            join_order=m.join_order,
            is_organizer=m.is_organizer,
            is_me=m.id == me.id,
            friend_status=state,
            friend_user_id=m.user_id if state == "friend" else None,
            friend_request_id=relations[m.user_id].id if state == "incoming" else None,
        ))
    return out


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
    ensure_profile(session, user)  # 탈퇴한 계정이면 여기서 401
    # 같은 여행에 동시에 들어오는 요청이 인원 제한과 가입 순서를 깨지 않도록 여행 행을 잠근다.
    trip = session.scalars(
        select(Trip).where(Trip.invite_code == normalize_code(body.code)).with_for_update()
    ).one_or_none()
    if trip is None:
        raise ApiError(
            404, "invalid_invite_code", "초대 코드가 맞지 않습니다. 총무에게 새 코드를 받아 주세요."
        )

    me = add_member(session, trip, user.id)
    session.commit()
    return trip_detail(trip, me, member_count_of(session, trip.id))


def add_member(session: Session, trip: Trip, user_id: uuid.UUID) -> Member:
    """여행에 멤버로 넣는다(이미 멤버면 그대로). 여행 행은 호출한 쪽이 잠가 둔다. 커밋도 호출한 쪽이 한다."""
    existing = next((m for m in trip.members if m.user_id == user_id), None)
    if existing is not None:
        return existing
    if member_count_of(session, trip.id) >= MAX_MEMBERS:
        raise ApiError(
            409, "trip_full", f"이 여행은 멤버가 {MAX_MEMBERS}명이라 더 들어갈 수 없습니다."
        )
    last_order = session.scalar(
        select(func.max(Member.join_order)).where(Member.trip_id == trip.id)
    )
    me = Member(trip=trip, user_id=user_id, join_order=(last_order or 0) + 1)
    session.add(me)
    session.flush()
    return me


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


class OrganizerChange(BaseModel):
    member_id: uuid.UUID


@router.post(
    "/{trip_id}/organizer",
    responses={**ORGANIZER_ONLY, 409: {"model": ErrorResponse, "description": "넘길 수 없는 멤버"}},
)
def hand_over_organizer(
    trip_id: uuid.UUID,
    body: OrganizerChange,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    """총무가 다른 멤버에게 총무를 넘긴다(ADR 0005). 넘긴 뒤 나는 일반 멤버가 된다."""
    me = require_organizer(session, trip_id, user)
    trip = me.trip
    target = next((m for m in trip.members if m.id == body.member_id), None)
    if target is None:
        raise ApiError(404, "member_not_found", "멤버를 찾을 수 없습니다.")
    if target.id == me.id:
        raise ApiError(409, "already_organizer", "이미 총무입니다.")
    if target.profile.deleted_at is not None:
        raise ApiError(409, "member_deleted", "탈퇴한 멤버에게는 넘길 수 없습니다.")
    trip.organizer_user_id = target.user_id
    session.commit()
    return trip_detail(trip, me, member_count_of(session, trip_id))
