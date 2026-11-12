import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ErrorResponse
from app.models import Expense
from app.permissions import require_member
from app.settlement import ExpenseIn, ItemIn, MemberIn, settle

router = APIRouter(prefix="/trips/{trip_id}/settlement", tags=["settlement"], responses=ERROR_RESPONSES)


class MemberBalanceOut(BaseModel):
    member_id: uuid.UUID
    display_name: str
    join_order: int
    paid: int
    owed: int
    sent: int
    received: int
    balance: int


class SuggestedTransferOut(BaseModel):
    from_member_id: uuid.UUID
    from_name: str
    to_member_id: uuid.UUID
    to_name: str
    amount: int


class ShareOut(BaseModel):
    member_id: uuid.UUID
    expense_id: uuid.UUID
    expense_name: str
    item_name: str
    item_amount: int
    sharer_count: int
    amount: int


class SettlementOut(BaseModel):
    confirmed_total: int
    confirmed_count: int
    is_settled: bool
    members: list[MemberBalanceOut]
    suggested_transfers: list[SuggestedTransferOut]
    # 모든 멤버의 품목별 부담 근거. 앱은 보통 내 것만 보여준다.
    shares: list[ShareOut]


@router.get("", responses={404: {"model": ErrorResponse, "description": "여행 없음"}})
def get_settlement(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SettlementOut:
    """확정된 지출과 송금으로 계산한 정산 결과. 초안·확인 필요 지출은 들어가지 않는다."""
    me = require_member(session, trip_id, user)
    members = me.trip.members
    names = {m.id: m.profile.display_name for m in members}
    confirmed = session.scalars(
        select(Expense)
        .where(Expense.trip_id == trip_id, Expense.status == "confirmed")
        .order_by(Expense.paid_at.asc().nulls_last(), Expense.created_at.asc())
    ).all()

    result = settle(
        members=[MemberIn(m.id, m.join_order) for m in members],
        expenses=[
            ExpenseIn(
                id=e.id,
                name=e.merchant_name or "이름 없는 지출",
                # 확정 조건을 통과했으므로 결제자·금액·분담 대상이 모두 있다.
                payer_id=e.payer_member_id,
                items=[ItemIn(i.id, i.name, i.amount or 0, [s.id for s in i.sharers]) for i in e.items],
            )
            for e in confirmed
        ],
    )
    order = {m.id: m.join_order for m in members}
    return SettlementOut(
        confirmed_total=sum(b.paid for b in result.balances),
        confirmed_count=len(confirmed),
        is_settled=result.is_settled,
        members=[
            MemberBalanceOut(
                member_id=b.member_id,
                display_name=names[b.member_id],
                join_order=order[b.member_id],
                paid=b.paid,
                owed=b.owed,
                sent=b.sent,
                received=b.received,
                balance=b.balance,
            )
            for b in result.balances
        ],
        suggested_transfers=[
            SuggestedTransferOut(
                from_member_id=s.from_id,
                from_name=names[s.from_id],
                to_member_id=s.to_id,
                to_name=names[s.to_id],
                amount=s.amount,
            )
            for s in result.suggestions
        ],
        shares=[
            ShareOut(
                member_id=s.member_id,
                expense_id=s.expense_id,
                expense_name=s.expense_name,
                item_name=s.item_name,
                item_amount=s.item_amount,
                sharer_count=s.sharer_count,
                amount=s.amount,
            )
            for s in result.shares
        ],
    )
