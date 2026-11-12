"""trips and members

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "organizer_user_id",
            sa.Uuid(),
            sa.ForeignKey("user_profiles.user_id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("start_date <= end_date", name="trips_dates_in_order"),
    )
    op.create_table(
        "members",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "trip_id",
            sa.Uuid(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("user_profiles.user_id"), nullable=False
        ),
        sa.Column("join_order", sa.Integer(), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("trip_id", "user_id", name="members_one_per_user"),
        sa.UniqueConstraint("trip_id", "join_order", name="members_join_order_unique"),
    )
    op.create_index("members_user_id_idx", "members", ["user_id"])
    # 클라이언트 접근은 전부 거부(ADR-0002).
    op.execute("ALTER TABLE trips ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE members ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("members")
    op.drop_table("trips")
