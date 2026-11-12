"""권한 판정은 모두 여기서 한다. 엔드포인트는 이 모듈을 거쳐 여행 자원에 접근한다."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser
from app.errors import ApiError
from app.models import Member


def require_member(
    session: Session, trip_id: uuid.UUID, user: AuthenticatedUser
) -> Member:
    """이 사용자의 이 여행 멤버 정보. 멤버가 아니면 여행이 있어도 404로 숨긴다."""
    member = session.scalars(
        select(Member).where(Member.trip_id == trip_id, Member.user_id == user.id)
    ).one_or_none()
    if member is None:
        raise ApiError(404, "trip_not_found", "여행을 찾을 수 없습니다.")
    return member
