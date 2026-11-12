"""trip invite code

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-12
"""
import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# app.invites.ALPHABET와 같다. 마이그레이션은 앱 코드에 의존하지 않도록 복사해 둔다.
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    op.add_column("trips", sa.Column("invite_code", sa.String(8), nullable=True))
    bind = op.get_bind()
    used: set[str] = set()
    for (trip_id,) in bind.execute(sa.text("SELECT id FROM trips")):
        code = ""
        while not code or code in used:
            code = "".join(secrets.choice(ALPHABET) for _ in range(8))
        used.add(code)
        bind.execute(
            sa.text("UPDATE trips SET invite_code = :code WHERE id = :id"),
            {"code": code, "id": trip_id},
        )
    op.alter_column("trips", "invite_code", nullable=False)
    op.create_unique_constraint("trips_invite_code_key", "trips", ["invite_code"])


def downgrade() -> None:
    op.drop_constraint("trips_invite_code_key", "trips", type_="unique")
    op.drop_column("trips", "invite_code")
