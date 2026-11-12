"""photos

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 멤버 외래 키는 커밋 때 검사한다(여행 삭제 cascade 순서 문제). app/models.py MEMBER_FK와 같다.
MEMBER_FK = {"deferrable": True, "initially": "DEFERRED"}


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploader_member_id", sa.Uuid(), sa.ForeignKey("members.id", **MEMBER_FK), nullable=False),
        sa.Column("storage_key", sa.String(200), nullable=False, unique=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("place_id", sa.Uuid(), sa.ForeignKey("places.id"), nullable=True),
        sa.Column("link_type", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("link_type IS NULL OR link_type IN ('auto', 'manual')", name="photos_link_type_valid"),
    )
    op.create_index("photos_trip_id_idx", "photos", ["trip_id"])
    op.execute("ALTER TABLE photos ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("photos")
