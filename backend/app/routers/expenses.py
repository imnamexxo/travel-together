import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import AwareDatetime, BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import loading
from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app.expenses import broken_conditions
from app.models import Expense, LineItem, Member, Trip
from app.permissions import require_member, require_organizer
from app.place_search import PlaceSearcher
from app.places import get_place_searcher, place_for
from app.routers.planner import PlaceOut, PlaceRef, place_out
from app.photos import SIGNED_URL_SECONDS, get_storage
from app.storage import ObjectStorage, StorageUnavailable

router = APIRouter(prefix="/trips/{trip_id}/expenses", tags=["expenses"], responses=ERROR_RESPONSES)

MAX_AMOUNT = 100_000_000
Amount = Annotated[int, Field(ge=0, le=MAX_AMOUNT)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
OptionalName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]
ExpenseStatus = Literal["draft", "needs_review", "confirmed"]

NOT_FOUND = {404: {"model": ErrorResponse, "description": "여행·지출 없음"}}
ORGANIZER_ONLY = {403: {"model": ErrorResponse, "description": "총무 아님"}, **NOT_FOUND}


class LineItemIn(BaseModel):
    name: Name
    quantity: int | None = Field(default=None, ge=1, le=9999)
    amount: Amount | None = None
    sharer_ids: list[uuid.UUID] = []


class ExpenseIn(BaseModel):
    """지출 초안의 내용. 비어 있는 값은 확정할 때 검사한다."""

    payer_member_id: uuid.UUID | None = None
    paid_at: AwareDatetime | None = None
    merchant_name: OptionalName | None = None
    total_amount: Amount | None = None
    default_sharer_ids: list[uuid.UUID] = []
    items: list[LineItemIn] = Field(default=[], max_length=100)
    # 장소 후보에서 고른 카카오 장소. 비우면 장소 없음. 서버가 카카오로 확인하고 같은 장소는 재사용한다.
    place: PlaceRef | None = None


class ExpenseCreate(ExpenseIn):
    # 네트워크 재시도로 같은 지출이 두 번 생기지 않도록 앱이 만든 키. 같은 키면 처음 결과를 돌려준다.
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=100)]


class LineItemOut(BaseModel):
    id: uuid.UUID
    name: str
    quantity: int | None
    amount: int | None
    sharer_ids: list[uuid.UUID]


class ExpenseOut(BaseModel):
    id: uuid.UUID
    status: ExpenseStatus
    payer_member_id: uuid.UUID | None
    paid_at: datetime | None
    merchant_name: str | None
    total_amount: int | None
    default_sharer_ids: list[uuid.UUID]
    items: list[LineItemOut]
    # 영수증으로 만든 지출이면 원본 이미지의 짧게 열리는 서명 URL(지출 조회 때만 채운다)
    receipt_url: str | None = None
    has_receipt: bool = False
    place: PlaceOut | None = None


class ExpenseSummary(BaseModel):
    id: uuid.UUID
    status: ExpenseStatus
    merchant_name: str | None
    paid_at: datetime | None
    total_amount: int | None
    payer_name: str | None
    item_count: int
    place: PlaceOut | None = None


def _utc(value: datetime | None) -> datetime | None:
    """DB 연결의 시간대와 상관없이 항상 UTC로 내보낸다."""
    return value.astimezone(timezone.utc) if value else None


def expense_out(expense: Expense, receipt_url: str | None = None) -> ExpenseOut:
    return ExpenseOut(
        id=expense.id,
        status=expense.status,  # type: ignore[arg-type]
        payer_member_id=expense.payer_member_id,
        paid_at=_utc(expense.paid_at),
        merchant_name=expense.merchant_name,
        total_amount=expense.total_amount,
        default_sharer_ids=[m.id for m in expense.default_sharers],
        items=[
            LineItemOut(
                id=item.id,
                name=item.name,
                quantity=item.quantity,
                amount=item.amount,
                sharer_ids=[m.id for m in item.sharers],
            )
            for item in expense.items
        ],
        receipt_url=receipt_url,
        has_receipt=expense.receipt_id is not None,
        place=place_out(expense.place) if expense.place else None,
    )


def _get_expense(session: Session, trip_id: uuid.UUID, expense_id: uuid.UUID) -> Expense:
    expense = session.scalars(
        select(Expense).where(Expense.id == expense_id, Expense.trip_id == trip_id).options(*loading.EXPENSE_FULL)
    ).one_or_none()
    if expense is None:
        raise ApiError(404, "expense_not_found", "지출을 찾을 수 없습니다.")
    return expense


def _apply(session: Session, searcher: PlaceSearcher, expense: Expense, body: ExpenseIn, trip: Trip) -> None:
    """요청 내용으로 지출·품목·분담 대상을 통째로 바꾼다. 멤버 id는 이 여행의 멤버여야 한다."""
    members = {m.id: m for m in trip.members}
    unknown: list[ErrorDetail] = []

    def pick(ids: list[uuid.UUID], field: str) -> list[Member]:
        if any(i not in members for i in ids):
            unknown.append(ErrorDetail(field=field, message="이 여행의 멤버가 아닙니다."))
            return []
        return [members[i] for i in dict.fromkeys(ids)]

    if body.payer_member_id is not None and body.payer_member_id not in members:
        unknown.append(ErrorDetail(field="payer_member_id", message="이 여행의 멤버가 아닙니다."))
    default_sharers = pick(body.default_sharer_ids, "default_sharer_ids")
    item_sharers = [pick(item.sharer_ids, f"items.{i}.sharer_ids") for i, item in enumerate(body.items)]
    if unknown:
        raise ApiError(422, "validation_failed", "입력값을 확인해 주세요.", unknown)

    expense.payer_member_id = body.payer_member_id
    expense.paid_at = _utc(body.paid_at)
    expense.merchant_name = body.merchant_name or None
    expense.total_amount = body.total_amount
    expense.default_sharers = default_sharers
    expense.place = place_for(session, searcher, trip.id, body.place.kakao_place_id, body.place.name) if body.place else None
    expense.items = [
        LineItem(position=i, name=item.name, quantity=item.quantity, amount=item.amount, sharers=sharers)
        for i, (item, sharers) in enumerate(zip(body.items, item_sharers, strict=True))
    ]
    # 내용이 바뀌면 다시 확정해야 정산에 들어간다.
    expense.status = "draft"


@router.get("", responses=NOT_FOUND)
def list_expenses(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ExpenseSummary]:
    """여행의 모든 지출(초안 포함). 결제 시각이 늦은 것부터, 시각이 없는 초안이 맨 앞."""
    require_member(session, trip_id, user)
    expenses = session.scalars(
        select(Expense)
        .where(Expense.trip_id == trip_id)
        .order_by(Expense.paid_at.desc().nulls_first(), Expense.created_at.desc())
        .options(*loading.EXPENSE_SUMMARY)
    ).all()
    return [
        ExpenseSummary(
            id=e.id,
            status=e.status,  # type: ignore[arg-type]
            merchant_name=e.merchant_name,
            paid_at=_utc(e.paid_at),
            total_amount=e.total_amount,
            payer_name=e.payer.profile.display_name if e.payer else None,
            item_count=len(e.items),
            place=place_out(e.place) if e.place else None,
        )
        for e in expenses
    ]


@router.get("/{expense_id}", responses=NOT_FOUND)
def get_expense(
    trip_id: uuid.UUID,
    expense_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> ExpenseOut:
    require_member(session, trip_id, user)
    expense = _get_expense(session, trip_id, expense_id)
    receipt_url = None
    if expense.receipt is not None:
        try:
            receipt_url = storage.signed_urls([expense.receipt.storage_key], SIGNED_URL_SECONDS).get(expense.receipt.storage_key)
        except StorageUnavailable:
            receipt_url = None  # 영수증만 못 보여 줄 뿐, 지출은 그대로 보여준다.
    return expense_out(expense, receipt_url)


@router.post("", status_code=status.HTTP_201_CREATED, responses=ORGANIZER_ONLY)
def create_expense(
    trip_id: uuid.UUID,
    body: ExpenseCreate,
    response: Response,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> ExpenseOut:
    """총무가 지출 초안을 만든다. 같은 멱등 키로 다시 보내면 처음 만든 지출을 200으로 돌려준다."""
    organizer = require_organizer(session, trip_id, user)
    existing = session.scalars(
        select(Expense).where(Expense.trip_id == trip_id, Expense.idempotency_key == body.idempotency_key)
    ).one_or_none()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return expense_out(existing)

    expense = Expense(trip_id=trip_id, idempotency_key=body.idempotency_key)
    _apply(session, searcher, expense, body, organizer.trip)
    session.add(expense)
    try:
        session.commit()
    except IntegrityError:
        # 같은 키의 요청이 동시에 들어와 다른 쪽이 먼저 저장했다.
        session.rollback()
        response.status_code = status.HTTP_200_OK
        return expense_out(
            session.scalars(
                select(Expense).where(
                    Expense.trip_id == trip_id, Expense.idempotency_key == body.idempotency_key
                )
            ).one()
        )
    return expense_out(expense)


@router.put("/{expense_id}", responses=ORGANIZER_ONLY)
def update_expense(
    trip_id: uuid.UUID,
    expense_id: uuid.UUID,
    body: ExpenseIn,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> ExpenseOut:
    """지출 내용을 통째로 바꾼다. 확정된 지출도 고칠 수 있고, 고치면 다시 초안이 된다."""
    organizer = require_organizer(session, trip_id, user)
    expense = _get_expense(session, trip_id, expense_id)
    _apply(session, searcher, expense, body, organizer.trip)
    session.commit()
    return expense_out(expense)


@router.post(
    "/{expense_id}/confirm",
    responses={**ORGANIZER_ONLY, 422: {"model": ErrorResponse, "description": "확정 조건이 깨짐"}},
)
def confirm_expense(
    trip_id: uuid.UUID,
    expense_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ExpenseOut:
    """확정 조건이 모두 맞으면 confirmed. 아니면 needs_review로 바꾸고 깨진 조건과 함께 422. 강제 확정은 없다."""
    require_organizer(session, trip_id, user)
    expense = _get_expense(session, trip_id, expense_id)
    broken = broken_conditions(expense)
    expense.status = "needs_review" if broken else "confirmed"
    session.commit()
    if broken:
        raise ApiError(422, "confirm_conditions_failed", "확정 조건을 확인해 주세요.", broken)
    return expense_out(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ORGANIZER_ONLY)
def delete_expense(
    trip_id: uuid.UUID,
    expense_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    require_organizer(session, trip_id, user)
    session.delete(_get_expense(session, trip_id, expense_id))
    session.commit()
