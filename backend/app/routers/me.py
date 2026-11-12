import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES
from app.profiles import ensure_profile

router = APIRouter(tags=["me"], responses=ERROR_RESPONSES)


class Profile(BaseModel):
    id: uuid.UUID
    display_name: str


@router.get("/me")
def get_me(
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Profile:
    """내 프로필. 처음 부르면 가입 때 정한 표시 이름으로 프로필을 만든다."""
    profile = ensure_profile(session, user)
    session.commit()
    return Profile(id=profile.user_id, display_name=profile.display_name)
