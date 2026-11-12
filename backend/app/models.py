import uuid
import datetime as dt
from datetime import date, datetime

from sqlalchemy import (
    Column,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Time,
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


# 지출의 기본 분담 대상, 품목의 분담 대상. 멤버를 지우려면 먼저 여기서 빠져야 한다(나가기 409).
# 멤버를 가리키는 외래 키는 커밋할 때 검사한다. 여행을 지울 때 DB가 멤버와 지출을 함께 지우는 도중에
# 검사하면 순서 때문에 실패하기 때문이다.
MEMBER_FK = {"deferrable": True, "initially": "DEFERRED"}
expense_default_sharers = Table(
    "expense_default_sharers",
    Base.metadata,
    Column("expense_id", ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("members.id", **MEMBER_FK), primary_key=True),
)
line_item_sharers = Table(
    "line_item_sharers",
    Base.metadata,
    Column("line_item_id", ForeignKey("line_items.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("members.id", **MEMBER_FK), primary_key=True),
)


class Expense(Base):
    """한 멤버가 한 번 결제한 것. 확정(confirmed)된 지출만 정산에 들어간다."""

    __tablename__ = "expenses"
    __table_args__ = (
        UniqueConstraint("trip_id", "idempotency_key", name="expenses_idempotency_key_unique"),
        CheckConstraint(
            "status IN ('draft', 'needs_review', 'confirmed')", name="expenses_status_valid"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    # 초안에서는 비어 있을 수 있다. 확정 조건에서 검사한다.
    payer_member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("members.id", **MEMBER_FK))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    merchant_name: Mapped[str | None] = mapped_column(String(50))
    total_amount: Mapped[int | None] = mapped_column(Integer)
    idempotency_key: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    payer: Mapped[Member | None] = relationship()
    default_sharers: Mapped[list[Member]] = relationship(
        secondary=expense_default_sharers, order_by=Member.join_order
    )
    items: Mapped[list["LineItem"]] = relationship(
        back_populates="expense",
        order_by="LineItem.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class LineItem(Base):
    """지출 안의 한 줄. 품목 금액의 합이 지출 총액이다."""

    __tablename__ = "line_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("expenses.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(50))
    # 수량은 보여주기용이다. 분담은 품목 금액을 분담 대상 수로 나눈다.
    quantity: Mapped[int | None] = mapped_column(Integer)
    amount: Mapped[int | None] = mapped_column(Integer)

    expense: Mapped[Expense] = relationship(back_populates="items")
    sharers: Mapped[list[Member]] = relationship(
        secondary=line_item_sharers, order_by=Member.join_order
    )


class Transfer(Base):
    """멤버 사이에 실제로 돈이 오갔다고 총무가 기록한 것. 잔액에 반영된다."""

    __tablename__ = "transfers"
    __table_args__ = (
        CheckConstraint("amount > 0", name="transfers_amount_positive"),
        CheckConstraint("from_member_id <> to_member_id", name="transfers_not_to_self"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    from_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id", **MEMBER_FK))
    to_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id", **MEMBER_FK))
    amount: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    from_member: Mapped[Member] = relationship(foreign_keys=[from_member_id])
    to_member: Mapped[Member] = relationship(foreign_keys=[to_member_id])


class Place(Base):
    """여행 안의 실제 장소. 카카오 검증을 통과한 것만 만든다. 한 여행에서 같은 카카오 장소는 하나다."""

    __tablename__ = "places"
    __table_args__ = (UniqueConstraint("trip_id", "kakao_place_id", name="places_one_per_kakao_place"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    kakao_place_id: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(String(200))
    road_address: Mapped[str | None] = mapped_column(String(200))
    # 장소의 좌표다. 사람의 위치가 아니다(ADR-0003).
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    category: Mapped[str | None] = mapped_column(String(100))


class PlanItem(Base):
    """플래너의 하루 일정 한 칸."""

    __tablename__ = "plan_items"
    __table_args__ = (CheckConstraint("estimated_cost IS NULL OR estimated_cost >= 0", name="plan_items_cost_not_negative"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    # 하루 안의 순서(0부터).
    position: Mapped[int] = mapped_column(Integer)
    time: Mapped[dt.time | None] = mapped_column(Time)
    title: Mapped[str] = mapped_column(String(80))
    memo: Mapped[str] = mapped_column(String(300), default="")
    estimated_cost: Mapped[int | None] = mapped_column(Integer)
    place_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("places.id"))
    # 만든 멤버가 나가도 일정 항목은 남는다(그때부터는 총무만 지울 수 있다).
    created_by_member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    place: Mapped[Place | None] = relationship()
    created_by: Mapped[Member | None] = relationship()
