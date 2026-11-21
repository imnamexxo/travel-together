"""photos.thumbnail_key: 목록용 작은 사진(긴 변 400px)

목록·지도에서 원본(긴 변 1600px)을 받지 않게 해서 저장소 전송량을 줄인다.
썸네일이 없던 때 올린 사진은 비어 있고, 그 사진은 원본을 쓴다.

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-21
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("thumbnail_key", sa.String(200), nullable=True))
    op.create_unique_constraint("photos_thumbnail_key_unique", "photos", ["thumbnail_key"])


def downgrade() -> None:
    op.drop_constraint("photos_thumbnail_key_unique", "photos", type_="unique")
    op.drop_column("photos", "thumbnail_key")
