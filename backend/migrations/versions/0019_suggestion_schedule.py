"""추천 일정을 시간표로: 추천 구간, 도착 시각, 이동 시간·수단

- suggestion_requests.start_date·end_date: 여러 도시를 도는 여행은 구간마다 따로 추천받는다.
- suggested_items.start_time·travel_minutes·transport: 채택하면 일정에 시각이 들어간다.

예전 추천은 모두 비어 있다(여행 전체 기간, 시각 없음).

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-27
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("suggestion_requests", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("suggestion_requests", sa.Column("end_date", sa.Date(), nullable=True))
    op.add_column("suggested_items", sa.Column("start_time", sa.Time(), nullable=True))
    op.add_column("suggested_items", sa.Column("travel_minutes", sa.Integer(), nullable=True))
    op.add_column("suggested_items", sa.Column("transport", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("suggested_items", "transport")
    op.drop_column("suggested_items", "travel_minutes")
    op.drop_column("suggested_items", "start_time")
    op.drop_column("suggestion_requests", "end_date")
    op.drop_column("suggestion_requests", "start_date")
