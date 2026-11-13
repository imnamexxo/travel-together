"""overseas places: neutral place source ids, trips.is_overseas

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-14
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 카카오 전용이던 이름을 검색기와 상관없는 이름으로(국내는 카카오, 해외는 Google Places). ADR 0004.
SUGGESTED = [
    ("kakao_place_id", "source_place_id"),
    ("kakao_name", "found_name"),
    ("kakao_address", "found_address"),
    ("kakao_road_address", "found_road_address"),
    ("kakao_category", "found_category"),
]


def upgrade() -> None:
    op.add_column("trips", sa.Column("is_overseas", sa.Boolean(), nullable=False, server_default=sa.false()))
    # Google 장소 id는 카카오 id(숫자 10자 안팎)보다 훨씬 길다.
    op.alter_column("places", "kakao_place_id", new_column_name="source_place_id", type_=sa.String(300), existing_nullable=False)
    op.execute("ALTER TABLE places RENAME CONSTRAINT places_one_per_kakao_place TO places_one_per_source_place")
    for old, new in SUGGESTED:
        op.alter_column("suggested_items", old, new_column_name=new)
    op.alter_column("suggested_items", "source_place_id", type_=sa.String(300), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("suggested_items", "source_place_id", type_=sa.String(30), existing_nullable=True)
    for old, new in SUGGESTED:
        op.alter_column("suggested_items", new, new_column_name=old)
    op.execute("ALTER TABLE places RENAME CONSTRAINT places_one_per_source_place TO places_one_per_kakao_place")
    op.alter_column("places", "source_place_id", new_column_name="kakao_place_id", type_=sa.String(30), existing_nullable=False)
    op.drop_column("trips", "is_overseas")
