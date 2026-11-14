"""친구와 친구 초대(#71).

- 친구 맺기: 함께 여행한 멤버에게 요청을 보내 상대가 수락하거나, 친구 링크(내 친구 코드)를 누른 사람과 바로 친구가 된다.
- 친구 초대: 총무가 친구를 여행에 초대하면 친구의 "받은 초대"에 뜨고, 수락하면 멤버가 된다.
"""

import secrets
import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError
from app.invites import ALPHABET, normalize_code
from app.models import INVITE_CODE_LENGTH, Friendship, Member, Trip, TripInvite, UserProfile
from app.permissions import require_member, require_organizer
from app.profiles import ensure_profile
from app.routers.members import add_member
from app.routers.trips import TripDetail, member_count_of, trip_detail

router = APIRouter(tags=["friends"], responses=ERROR_RESPONSES)


class Person(BaseModel):
    user_id: uuid.UUID
    display_name: str


class FriendRequestOut(BaseModel):
    id: uuid.UUID
    person: Person


class FriendsOut(BaseModel):
    friends: list[Person]
    # 나에게 온 요청(수락/거절할 수 있다)
    incoming: list[FriendRequestOut]
    # 내가 보내고 기다리는 요청
    outgoing: list[FriendRequestOut]


class FriendCode(BaseModel):
    code: str


class FriendRequestCreate(BaseModel):
    """함께 여행한 멤버에게 요청: 그 여행과 멤버를 가리킨다(상대의 계정 id는 앱에 주지 않는다)."""

    trip_id: uuid.UUID
    member_id: uuid.UUID


class TripInviteCreate(BaseModel):
    user_id: uuid.UUID


class TripRefOut(BaseModel):
    id: uuid.UUID
    name: str
    start_date: str
    end_date: str


class TripInviteOut(BaseModel):
    id: uuid.UUID
    trip: TripRefOut
    inviter_name: str


def _person(profile: UserProfile) -> Person:
    return Person(user_id=profile.user_id, display_name=profile.display_name)


def relation(session: Session, a: uuid.UUID, b: uuid.UUID) -> Friendship | None:
    return session.scalars(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == a) & (Friendship.addressee_id == b),
                (Friendship.requester_id == b) & (Friendship.addressee_id == a),
            )
        )
    ).one_or_none()


def are_friends(session: Session, a: uuid.UUID, b: uuid.UUID) -> bool:
    found = relation(session, a, b)
    return found is not None and found.status == "accepted"


def _active(session: Session, user_id: uuid.UUID) -> UserProfile:
    """탈퇴하지 않은 사용자. 탈퇴했으면 404로 숨긴다."""
    profile = session.get(UserProfile, user_id)
    if profile is None or profile.deleted_at is not None:
        raise ApiError(404, "user_not_found", "사용자를 찾을 수 없습니다.")
    return profile


def _befriend(session: Session, me: uuid.UUID, other: uuid.UUID, *, accept_now: bool) -> Friendship:
    """관계를 만들거나 진행한다. 상대가 이미 나에게 요청했으면 그대로 수락된다."""
    if me == other:
        raise ApiError(409, "cannot_befriend_self", "나 자신과는 친구가 될 수 없습니다.")
    found = relation(session, me, other)
    if found is None:
        found = Friendship(requester_id=me, addressee_id=other, status="accepted" if accept_now else "pending")
        session.add(found)
    elif found.status == "pending" and (accept_now or found.requester_id == other):
        found.status = "accepted"
    return found


@router.get("/friends")
def list_friends(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> FriendsOut:
    """내 친구, 받은 요청, 보낸 요청(탈퇴한 사람은 빼고)."""
    ensure_profile(session, user)
    rows = session.scalars(select(Friendship).where(or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id))).all()
    friends, incoming, outgoing = [], [], []
    for f in rows:
        other = f.addressee if f.requester_id == user.id else f.requester
        if other.deleted_at is not None:
            continue
        if f.status == "accepted":
            friends.append(_person(other))
        elif f.addressee_id == user.id:
            incoming.append(FriendRequestOut(id=f.id, person=_person(other)))
        else:
            outgoing.append(FriendRequestOut(id=f.id, person=_person(other)))
    friends.sort(key=lambda p: p.display_name)
    return FriendsOut(friends=friends, incoming=incoming, outgoing=outgoing)


@router.post("/friends/requests", status_code=status.HTTP_201_CREATED)
def request_friend(
    body: FriendRequestCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FriendsOut:
    """함께 여행한 멤버에게 친구 요청. 상대가 이미 나에게 요청했으면 바로 친구가 된다."""
    require_member(session, body.trip_id, user)
    target = session.scalars(select(Member).where(Member.id == body.member_id, Member.trip_id == body.trip_id)).one_or_none()
    if target is None:
        raise ApiError(404, "member_not_found", "멤버를 찾을 수 없습니다.")
    _active(session, target.user_id)
    _befriend(session, user.id, target.user_id, accept_now=False)
    session.commit()
    return list_friends(user, session)


@router.post("/friends/requests/{request_id}/accept")
def accept_friend(request_id: uuid.UUID, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> FriendsOut:
    found = session.get(Friendship, request_id)
    if found is None or found.addressee_id != user.id or found.status != "pending":
        raise ApiError(404, "request_not_found", "친구 요청을 찾을 수 없습니다.")
    found.status = "accepted"
    session.commit()
    return list_friends(user, session)


@router.post("/friends/requests/{request_id}/decline")
def decline_friend(request_id: uuid.UUID, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> FriendsOut:
    """받은 요청을 거절하거나, 보낸 요청을 취소한다."""
    found = session.get(Friendship, request_id)
    if found is None or found.status != "pending" or user.id not in (found.addressee_id, found.requester_id):
        raise ApiError(404, "request_not_found", "친구 요청을 찾을 수 없습니다.")
    session.delete(found)
    session.commit()
    return list_friends(user, session)


@router.delete("/friends/{user_id}")
def remove_friend(user_id: uuid.UUID, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> FriendsOut:
    """친구 끊기. 상대 쪽 목록에서도 사라진다."""
    found = relation(session, user.id, user_id)
    if found is None or found.status != "accepted":
        raise ApiError(404, "friend_not_found", "친구를 찾을 수 없습니다.")
    session.delete(found)
    session.commit()
    return list_friends(user, session)


@router.get("/me/friend-code")
def my_friend_code(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> FriendCode:
    """친구 링크에 넣을 내 코드. 없으면 만든다."""
    profile = ensure_profile(session, user)
    if profile.friend_code is None:
        while True:
            code = "".join(secrets.choice(ALPHABET) for _ in range(INVITE_CODE_LENGTH))
            if not session.scalar(select(exists().where(UserProfile.friend_code == code))):
                break
        profile.friend_code = code
        session.commit()
    return FriendCode(code=profile.friend_code)


@router.post("/friends/by-code")
def befriend_by_code(body: FriendCode, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> Person:
    """친구 링크를 누른 사람과 링크 주인이 바로 친구가 된다."""
    ensure_profile(session, user)
    owner = session.scalars(select(UserProfile).where(UserProfile.friend_code == normalize_code(body.code))).one_or_none()
    if owner is None or owner.deleted_at is not None:
        raise ApiError(404, "invalid_friend_code", "친구 링크가 맞지 않습니다. 친구에게 다시 받아 주세요.")
    _befriend(session, user.id, owner.user_id, accept_now=True)
    session.commit()
    return _person(owner)


@router.post("/trips/{trip_id}/invites", status_code=status.HTTP_201_CREATED)
def invite_friend(
    trip_id: uuid.UUID,
    body: TripInviteCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Person:
    """총무가 친구를 여행에 초대한다. 이미 멤버거나 이미 초대했으면 그대로 둔다."""
    organizer = require_organizer(session, trip_id, user)
    friend = _active(session, body.user_id)
    if not are_friends(session, user.id, friend.user_id):
        raise ApiError(409, "not_friends", "친구만 초대할 수 있습니다.")
    if any(m.user_id == friend.user_id for m in organizer.trip.members):
        raise ApiError(409, "already_member", "이미 이 여행의 멤버입니다.")
    exists_already = session.scalars(select(TripInvite).where(TripInvite.trip_id == trip_id, TripInvite.invitee_id == friend.user_id)).one_or_none()
    if exists_already is None:
        session.add(TripInvite(trip_id=trip_id, invitee_id=friend.user_id, inviter_id=user.id))
        session.commit()
    return _person(friend)


@router.get("/me/trip-invites")
def my_trip_invites(user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> list[TripInviteOut]:
    """받은 여행 초대(최근 것부터)."""
    ensure_profile(session, user)
    invites = session.scalars(select(TripInvite).where(TripInvite.invitee_id == user.id).order_by(TripInvite.created_at.desc())).all()
    return [
        TripInviteOut(
            id=i.id,
            trip=TripRefOut(id=i.trip.id, name=i.trip.name, start_date=i.trip.start_date.isoformat(), end_date=i.trip.end_date.isoformat()),
            inviter_name=i.inviter.display_name,
        )
        for i in invites
    ]


def _my_invite(session: Session, invite_id: uuid.UUID, user: AuthenticatedUser) -> TripInvite:
    invite = session.get(TripInvite, invite_id)
    if invite is None or invite.invitee_id != user.id:
        raise ApiError(404, "invite_not_found", "초대를 찾을 수 없습니다.")
    return invite


@router.post("/me/trip-invites/{invite_id}/accept")
def accept_trip_invite(invite_id: uuid.UUID, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> TripDetail:
    """초대를 수락하면 그 여행의 멤버가 된다(인원이 꽉 찼으면 409)."""
    ensure_profile(session, user)
    invite = _my_invite(session, invite_id, user)
    trip = session.scalars(select(Trip).where(Trip.id == invite.trip_id).with_for_update()).one()
    me = add_member(session, trip, user.id)
    session.delete(invite)
    session.commit()
    return trip_detail(trip, me, member_count_of(session, trip.id))


@router.post("/me/trip-invites/{invite_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_trip_invite(invite_id: uuid.UUID, user: AuthenticatedUser = Depends(get_current_user), session: Session = Depends(get_session)) -> None:
    session.delete(_my_invite(session, invite_id, user))
    session.commit()
