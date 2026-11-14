from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser
from app.errors import ApiError
from app.models import DISPLAY_NAME_MAX, UserProfile


def _initial_display_name(user: AuthenticatedUser) -> str:
    name = (user.display_name or "").strip()
    if not name and user.email:
        name = user.email.split("@", 1)[0]
    return (name or "사용자")[:DISPLAY_NAME_MAX]


def ensure_profile(session: Session, user: AuthenticatedUser) -> UserProfile:
    """사용자 프로필을 돌려준다. 없으면 가입 때 정한 표시 이름으로 만든다. 커밋은 호출한 쪽이 한다."""
    session.execute(
        insert(UserProfile)
        .values(user_id=user.id, display_name=_initial_display_name(user))
        .on_conflict_do_nothing(index_elements=[UserProfile.user_id])
    )
    profile = session.scalars(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).one()
    if profile.deleted_at is not None:
        # 탈퇴 뒤 아직 만료되지 않은 토큰. 프로필을 되살리지 않는다.
        raise ApiError(401, "account_deleted", "탈퇴한 계정입니다.")
    return profile
