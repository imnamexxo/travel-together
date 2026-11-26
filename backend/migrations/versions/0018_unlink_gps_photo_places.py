"""사진 위치(GPS)로 만들어진 장소 연결을 푼다(위치정보법, ADR-0003)

위치정보지원센터 안내(2026-11-26): 사진 촬영 좌표로 추천한 장소를 사용자가 확인해 저장해도
개인위치정보일 가능성을 배제하기 어렵다. 그래서 사진 위치를 쓰지 않기로 하고, 이미 저장된 연결을 푼다.
- link_type = 'auto': 2026-11-21 전에 촬영 위치로 자동 연결한 사진
- 2026-11-21부터 올라간 사진의 연결: 촬영 위치 추천을 확인해 올린 것과 직접 고친 것을 구분할 수 없어 함께 푼다
사진은 그대로 두고 장소 연결만 푼다. 되돌릴 수 없다(어떤 연결이었는지 남기지 않는다).

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-26
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE photos SET place_id = NULL, link_type = NULL "
        "WHERE link_type = 'auto' "
        "OR (place_id IS NOT NULL AND created_at >= TIMESTAMPTZ '2026-11-21 00:00:00+09:00')"
    )


def downgrade() -> None:
    # 풀어 버린 연결은 되살릴 수 없다.
    pass
