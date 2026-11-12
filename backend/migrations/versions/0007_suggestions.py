"""suggestion requests and suggested items

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "suggestion_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("destination", sa.String(60), nullable=False),
        sa.Column("preferences", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("trip_id", "input_hash", name="suggestion_requests_input_unique"),
    )
    op.create_table(
        "suggested_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_id", sa.Uuid(), sa.ForeignKey("suggestion_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("place_name", sa.String(100), nullable=False),
        sa.Column("region", sa.String(60), nullable=False),
        sa.Column("stay_minutes", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("kakao_place_id", sa.String(30), nullable=True),
        sa.Column("kakao_name", sa.String(100), nullable=True),
        sa.Column("kakao_address", sa.String(200), nullable=True),
        sa.Column("kakao_road_address", sa.String(200), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("kakao_category", sa.String(100), nullable=True),
        sa.Column("adopted_plan_item_id", sa.Uuid(), sa.ForeignKey("plan_items.id", ondelete="SET NULL"), nullable=True),
        sa.CheckConstraint("status IN ('verified', 'needs_check')", name="suggested_items_status_valid"),
    )
    op.create_index("suggested_items_request_id_idx", "suggested_items", ["request_id"])
    op.execute("ALTER TABLE suggestion_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE suggested_items ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("suggested_items")
    op.drop_table("suggestion_requests")
