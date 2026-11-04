import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES
from app.models import DISPLAY_NAME_MAX, UserProfile

router = APIRouter(tags=["me"], responses=ERROR_RESPONSES)


class Profile(BaseModel):
    id: uuid.UUID
    display_name: str


def _initial_display_name(user: AuthenticatedUser) -> str:
    name = (user.display_name or "").strip()
    if not name and user.email:
        name = user.email.split("@", 1)[0]
    return (name or "사용자")[:DISPLAY_NAME_MAX]


@router.get("/me")
def get_me(
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Profile:
    """내 프로필. 처음 부르면 가입 때 정한 표시 이름으로 프로필을 만든다."""
    session.execute(
        insert(UserProfile)
        .values(user_id=user.id, display_name=_initial_display_name(user))
        .on_conflict_do_nothing(index_elements=[UserProfile.user_id])
    )
    session.commit()
    profile = session.scalars(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).one()
    return Profile(id=profile.user_id, display_name=profile.display_name)
