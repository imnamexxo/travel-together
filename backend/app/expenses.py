"""지출 규칙: 확정 조건, 멤버가 지출·송금에 엮였는지."""

import uuid

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.currency import DEFAULT_CURRENCY, format_money
from app.errors import ErrorDetail
from app.models import Expense, Transfer, expense_default_sharers, line_item_sharers


def broken_conditions(expense: Expense, currency: str = DEFAULT_CURRENCY) -> list[ErrorDetail]:
    """확정 조건 4가지 중 깨진 것. 비어 있으면 확정할 수 있다.

    1. 품목 금액 합 = 총액
    2. 모든 품목에 분담 대상 1명 이상
    3. 결제자 지정
    4. 모든 금액이 0보다 큰 정수(여행 통화의 가장 작은 단위)
    field는 앱이 해당 칸 옆에 표시할 수 있도록 위치를 가리킨다(items.<번호>.amount 등).
    """
    broken: list[ErrorDetail] = []
    if expense.payer_member_id is None:
        broken.append(ErrorDetail(field="payer_member_id", message="결제자를 지정해 주세요."))
    if expense.total_amount is None or expense.total_amount <= 0:
        broken.append(ErrorDetail(field="total_amount", message="총액은 0보다 큰 금액이어야 합니다."))
    if not expense.items:
        broken.append(ErrorDetail(field="items", message="품목을 하나 이상 넣어 주세요."))
    for index, item in enumerate(expense.items):
        if item.amount is None or item.amount <= 0:
            broken.append(
                ErrorDetail(field=f"items.{index}.amount", message="품목 금액은 0보다 큰 금액이어야 합니다.")
            )
        if not item.sharers:
            broken.append(
                ErrorDetail(field=f"items.{index}.sharers", message="분담 대상을 한 명 이상 골라 주세요.")
            )
    amounts = [item.amount for item in expense.items if item.amount is not None]
    total = expense.total_amount
    # 비어 있는 금액이 있으면 위에서 이미 걸렸으니, 다 채워졌을 때만 합계를 비교한다.
    if expense.items and total is not None and len(amounts) == len(expense.items) and sum(amounts) != total:
        broken.append(
            ErrorDetail(
                field="total_amount",
                message=f"품목 합계({format_money(sum(amounts), currency)})와 총액({format_money(total, currency)})이 다릅니다.",
            )
        )
    return broken


def has_money_records(session: Session, member_id: uuid.UUID) -> bool:
    """결제자·분담 대상(기본 분담 대상 포함)이거나 송금 기록에 있는가. 지출 상태와 상관없다."""
    return bool(
        session.scalar(
            select(
                or_(
                    exists().where(Expense.payer_member_id == member_id),
                    exists().where(line_item_sharers.c.member_id == member_id),
                    exists().where(expense_default_sharers.c.member_id == member_id),
                    exists().where((Transfer.from_member_id == member_id) | (Transfer.to_member_id == member_id)),
                )
            )
        )
    )
