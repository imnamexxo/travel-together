"""places and plan items

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kakao_place_id", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("address", sa.String(200), nullable=False),
        sa.Column("road_address", sa.String(200), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.UniqueConstraint("trip_id", "kakao_place_id", name="places_one_per_kakao_place"),
    )
    op.create_table(
        "plan_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("time", sa.Time(), nullable=True),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("memo", sa.String(300), nullable=False, server_default=""),
        sa.Column("estimated_cost", sa.Integer(), nullable=True),
        sa.Column("place_id", sa.Uuid(), sa.ForeignKey("places.id"), nullable=True),
        sa.Column("created_by_member_id", sa.Uuid(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("estimated_cost IS NULL OR estimated_cost >= 0", name="plan_items_cost_not_negative"),
    )
    op.create_index("plan_items_trip_date_idx", "plan_items", ["trip_id", "date"])
    op.execute("ALTER TABLE places ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE plan_items ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("plan_items")
    op.drop_table("places")
