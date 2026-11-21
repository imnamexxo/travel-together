"""places: Google 장소는 id와 30일 안의 좌표만 둔다(ADR 0006)

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-21
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("places", sa.Column("source", sa.String(10), server_default="kakao", nullable=False))
    op.add_column("places", sa.Column("coords_fetched_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("places_source_valid", "places", "source IN ('kakao', 'google')")
    for column in ("name", "address", "latitude", "longitude"):
        op.alter_column("places", column, nullable=True)
    # 해외 여행의 장소는 Google에서 왔다. 저장하면 안 되는 이름·주소·종류를 지운다.
    # 좌표를 받은 시각은 따로 없었다. 해외 장소 검색을 처음 낸 날(2026-11-14)로 두어 30일 기준을 넉넉히 잡는다.
    op.execute(
        "UPDATE places SET source = 'google', name = NULL, address = NULL, road_address = NULL, category = NULL, "
        "coords_fetched_at = TIMESTAMPTZ '2026-11-14 00:00:00+09:00' "
        "WHERE trip_id IN (SELECT id FROM trips WHERE is_overseas)"
    )
    op.execute(
        "UPDATE suggested_items SET found_name = NULL, found_address = NULL, found_road_address = NULL, "
        "found_category = NULL, latitude = NULL, longitude = NULL "
        "WHERE request_id IN (SELECT r.id FROM suggestion_requests r JOIN trips t ON t.id = r.trip_id WHERE t.is_overseas)"
    )


def downgrade() -> None:
    # 지운 Google 이름은 되살릴 수 없다. 빈 칸은 빈 문자열·0으로 채운다.
    op.execute("UPDATE places SET name = '' WHERE name IS NULL")
    op.execute("UPDATE places SET address = '' WHERE address IS NULL")
    op.execute("UPDATE places SET latitude = 0, longitude = 0 WHERE latitude IS NULL OR longitude IS NULL")
    for column in ("name", "address", "latitude", "longitude"):
        op.alter_column("places", column, nullable=False)
    op.drop_constraint("places_source_valid", "places", type_="check")
    op.drop_column("places", "coords_fetched_at")
    op.drop_column("places", "source")
