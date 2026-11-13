"""목록을 읽을 때 함께 쓰는 관계를 한 번에 읽어 오는 옵션.

서버(싱가포르)와 DB(서울) 사이 왕복이 질의마다 수십 ms라, 항목마다 관계를 따로 묻으면(N+1) 화면이 느려진다.
엔드포인트가 실제로 쓰는 관계만 골라 같이 읽는다.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Expense, LineItem, Member, PlanItem, Transfer

# 일정 항목: 장소, 만든 멤버 이름
PLAN_ITEM = (joinedload(PlanItem.place), joinedload(PlanItem.created_by).joinedload(Member.profile))
# 지출 목록: 장소, 결제자 이름, 품목 수
EXPENSE_SUMMARY = (joinedload(Expense.place), joinedload(Expense.payer).joinedload(Member.profile), selectinload(Expense.items))
# 지출 상세·정산: 분담 대상, 품목과 품목별 분담 대상, 장소, 영수증
EXPENSE_FULL = (
    joinedload(Expense.place),
    joinedload(Expense.receipt),
    selectinload(Expense.default_sharers),
    selectinload(Expense.items).selectinload(LineItem.sharers),
)
# 송금: 보낸·받은 멤버 이름
TRANSFER = (joinedload(Transfer.from_member).joinedload(Member.profile), joinedload(Transfer.to_member).joinedload(Member.profile))


def trip_members(session: Session, trip_id: uuid.UUID) -> list[Member]:
    """여행 멤버(가입 순)와 이름을 한 번에."""
    return list(session.scalars(
        select(Member).where(Member.trip_id == trip_id).order_by(Member.join_order).options(selectinload(Member.profile), joinedload(Member.trip))
    ))
