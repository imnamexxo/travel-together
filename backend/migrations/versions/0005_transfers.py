"""transfers

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 멤버 외래 키는 커밋 때 검사한다(여행 삭제 cascade 순서 문제). app/models.py MEMBER_FK와 같다.
MEMBER_FK = {"deferrable": True, "initially": "DEFERRED"}


def upgrade() -> None:
    op.create_table(
        "transfers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_member_id", sa.Uuid(), sa.ForeignKey("members.id", **MEMBER_FK), nullable=False),
        sa.Column("to_member_id", sa.Uuid(), sa.ForeignKey("members.id", **MEMBER_FK), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="transfers_amount_positive"),
        sa.CheckConstraint("from_member_id <> to_member_id", name="transfers_not_to_self"),
    )
    op.create_index("transfers_trip_id_idx", "transfers", ["trip_id"])
    op.execute("ALTER TABLE transfers ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("transfers")
