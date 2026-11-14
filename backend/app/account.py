"""회원 탈퇴 규칙(ADR 0005).

- 내가 총무인 여행: 다른 멤버가 있으면 가장 먼저 들어온 멤버에게 총무를 넘기고, 나 혼자면 여행을 지운다.
- 내가 멤버인 여행: 내가 올린 사진은 지운다. 지출·송금에 엮였으면 정산이 깨지지 않도록 멤버 기록을 남기고
  (이름은 "탈퇴한 멤버"), 아니면 여행에서 뺀다.
- 프로필은 이름을 지우고 탈퇴 시각을 남긴다. 남은 토큰으로는 아무것도 할 수 없다.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.expenses import has_money_records
from app.models import DELETED_NAME, Member, Photo, Trip, UserProfile


def active_members(trip: Trip) -> list[Member]:
    """탈퇴하지 않은 멤버(가입 순서)."""
    return [m for m in trip.members if m.profile.deleted_at is None]


def next_organizer(trip: Trip, leaving_user_id: uuid.UUID) -> Member | None:
    """총무가 떠날 때 넘겨받을 멤버: 남은 멤버 중 가장 먼저 들어온 사람."""
    return next((m for m in active_members(trip) if m.user_id != leaving_user_id), None)


@dataclass
class DeletionPlan:
    deleted_trips: list[Trip] = field(default_factory=list)
    # (여행, 새 총무)
    handed_over: list[tuple[Trip, Member]] = field(default_factory=list)
    kept_records: list[Trip] = field(default_factory=list)


def my_memberships(session: Session, user_id: uuid.UUID) -> list[Member]:
    return list(session.scalars(select(Member).where(Member.user_id == user_id).join(Trip).order_by(Trip.start_date.desc())))


def plan_deletion(session: Session, user_id: uuid.UUID) -> DeletionPlan:
    plan = DeletionPlan()
    for member in my_memberships(session, user_id):
        trip = member.trip
        if member.is_organizer:
            heir = next_organizer(trip, user_id)
            if heir is None:
                plan.deleted_trips.append(trip)
                continue
            plan.handed_over.append((trip, heir))
        if has_money_records(session, member.id):
            plan.kept_records.append(trip)
    return plan


def delete_account(session: Session, profile: UserProfile, remove_trip) -> list[str]:
    """탈퇴를 DB에 반영한다(커밋은 호출한 쪽). 커밋 뒤 저장소에서 지울 파일 키를 돌려준다.

    remove_trip(session, trip) -> 파일 키: 여행 삭제는 여행 라우터의 규칙을 그대로 쓴다.
    """
    plan = plan_deletion(session, profile.user_id)
    keys: list[str] = []
    for trip in plan.deleted_trips:
        keys += remove_trip(session, trip)
    for trip, heir in plan.handed_over:
        trip.organizer_user_id = heir.user_id
    kept = {t.id for t in plan.kept_records}
    deleted = {t.id for t in plan.deleted_trips}
    for member in my_memberships(session, profile.user_id):
        if member.trip_id in deleted:
            continue
        photos = list(session.scalars(select(Photo).where(Photo.uploader_member_id == member.id)))
        keys += [p.storage_key for p in photos]
        for photo in photos:
            session.delete(photo)
        if member.trip_id not in kept:
            session.delete(member)
    profile.display_name = DELETED_NAME
    profile.deleted_at = datetime.now(UTC)
    return keys
