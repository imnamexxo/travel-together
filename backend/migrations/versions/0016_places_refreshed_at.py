"""places.coords_fetched_at → refreshed_at: 카카오 장소도 30일마다 최신으로 맞춘다(ADR 0006)

카카오 운영정책 제5조는 캐시한 데이터를 최신으로 유지하라고 한다. 그래서 Google 좌표만 보던
받은 시각을 모든 장소의 "마지막으로 받은 시각"으로 바꾼다.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-21
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("places", "coords_fetched_at", new_column_name="refreshed_at")
    # 기존 카카오 장소는 받은 시각이 없다. 오래된 것으로 두어 서버가 곧 다시 받게 한다.
    op.execute("UPDATE places SET refreshed_at = TIMESTAMPTZ '2026-10-01 00:00:00+09:00' WHERE refreshed_at IS NULL")
    op.alter_column("places", "refreshed_at", nullable=False, server_default=sa.func.now())


def downgrade() -> None:
    op.alter_column("places", "refreshed_at", nullable=True, server_default=None)
    op.execute("UPDATE places SET refreshed_at = NULL WHERE source = 'kakao'")
    op.alter_column("places", "refreshed_at", new_column_name="coords_fetched_at")
