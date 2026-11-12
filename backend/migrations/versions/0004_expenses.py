"""expenses, line items, sharers

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("expenses", "expense_default_sharers", "line_items", "line_item_sharers")
# 멤버 외래 키는 커밋 때 검사한다(여행 삭제 cascade 순서 문제). app/models.py MEMBER_FK와 같다.
MEMBER_FK = {"deferrable": True, "initially": "DEFERRED"}


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("payer_member_id", sa.Uuid(), sa.ForeignKey("members.id", **MEMBER_FK), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("merchant_name", sa.String(50), nullable=True),
        sa.Column("total_amount", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("trip_id", "idempotency_key", name="expenses_idempotency_key_unique"),
        sa.CheckConstraint("status IN ('draft', 'needs_review', 'confirmed')", name="expenses_status_valid"),
    )
    op.create_index("expenses_trip_id_idx", "expenses", ["trip_id"])
    op.create_table(
        "expense_default_sharers",
        sa.Column("expense_id", sa.Uuid(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("member_id", sa.Uuid(), sa.ForeignKey("members.id", **MEMBER_FK), primary_key=True),
    )
    op.create_table(
        "line_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("expense_id", sa.Uuid(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=True),
    )
    op.create_index("line_items_expense_id_idx", "line_items", ["expense_id"])
    op.create_table(
        "line_item_sharers",
        sa.Column("line_item_id", sa.Uuid(), sa.ForeignKey("line_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("member_id", sa.Uuid(), sa.ForeignKey("members.id", **MEMBER_FK), primary_key=True),
    )
    # 멤버가 지출에 엮였는지 빨리 찾기 위해(나가기·내보내기 검사).
    op.create_index("line_item_sharers_member_id_idx", "line_item_sharers", ["member_id"])
    op.create_index("expense_default_sharers_member_id_idx", "expense_default_sharers", ["member_id"])
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
