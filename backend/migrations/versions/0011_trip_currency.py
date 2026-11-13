"""trip currency

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-14
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 기존 여행은 모두 원화다.
    op.add_column("trips", sa.Column("currency", sa.String(3), nullable=False, server_default="KRW"))


def downgrade() -> None:
    op.drop_column("trips", "currency")
