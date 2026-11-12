import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

DISPLAY_NAME_MAX = 30
TRIP_NAME_MAX = 50
MAX_MEMBERS = 10
INVITE_CODE_LENGTH = 8


class UserProfile(Base):
    __tablename__ = "user_profiles"

    # Supabase Auth 사용자 id
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(DISPLAY_NAME_MAX))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="trips_dates_in_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(TRIP_NAME_MAX))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    # 총무는 여행을 만든 사용자다. 총무 위임은 하지 않는다.
    organizer_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_profiles.user_id")
    )
    # 지금 유효한 초대 코드 하나. 재발급하면 바뀌고 이전 코드는 무효가 된다.
    invite_code: Mapped[str] = mapped_column(String(INVITE_CODE_LENGTH), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # 여행을 지우면 멤버도 지워진다. DB의 ON DELETE CASCADE에 맡긴다.
    members: Mapped[list["Member"]] = relationship(
        back_populates="trip",
        order_by="Member.join_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("trip_id", "user_id", name="members_one_per_user"),
        UniqueConstraint("trip_id", "join_order", name="members_join_order_unique"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_profiles.user_id"))
    # 1부터. 정산에서 남는 원을 나눌 때 이 순서를 쓴다.
    join_order: Mapped[int] = mapped_column(Integer)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    trip: Mapped[Trip] = relationship(back_populates="members")
    profile: Mapped[UserProfile] = relationship()

    @property
    def is_organizer(self) -> bool:
        return self.user_id == self.trip.organizer_user_id
