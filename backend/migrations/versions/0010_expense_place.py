"""expense place

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("place_id", sa.Uuid(), sa.ForeignKey("places.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("expenses", "place_id")
