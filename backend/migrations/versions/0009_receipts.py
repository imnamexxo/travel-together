"""receipts

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "receipts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_key", sa.String(200), nullable=False, unique=True),
        sa.Column("image_hash", sa.String(64), nullable=False),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("trip_id", "image_hash", name="receipts_one_per_image"),
    )
    op.add_column("expenses", sa.Column("receipt_id", sa.Uuid(), sa.ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True))
    op.execute("ALTER TABLE receipts ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_column("expenses", "receipt_id")
    op.drop_table("receipts")
