"""account deletion: user_profiles.deleted_at

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-14
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 탈퇴한 사용자는 프로필을 "탈퇴한 멤버"로만 남긴다(ADR 0005). 남은 지출 기록이 이 프로필을 가리킨다.
    op.add_column("user_profiles", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user_profiles", "deleted_at")
