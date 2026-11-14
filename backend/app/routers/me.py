import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, StringConstraints
from sqlalchemy.orm import Session

from app.account import delete_account, plan_deletion
from app.auth import AuthenticatedUser, get_current_user
from app.auth_admin import AuthAdmin, AuthAdminUnavailable
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorResponse
from app.models import DISPLAY_NAME_MAX
from app.photos import delete_files, get_storage
from app.profiles import ensure_profile
from app.routers.trips import remove_trip
from app.storage import ObjectStorage

router = APIRouter(tags=["me"], responses=ERROR_RESPONSES)


class Profile(BaseModel):
    id: uuid.UUID
    display_name: str


class ProfileUpdate(BaseModel):
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=DISPLAY_NAME_MAX)]


class TripRef(BaseModel):
    id: uuid.UUID
    name: str


class HandOver(BaseModel):
    trip: TripRef
    new_organizer_name: str


class DeletionPreview(BaseModel):
    """탈퇴하면 일어나는 일. 확인 화면에 그대로 보여 준다."""

    # 나 혼자인 내 여행: 통째로 지워진다
    deleted_trips: list[TripRef]
    # 내가 총무인 여행: 가장 먼저 들어온 멤버에게 총무가 넘어간다
    handed_over: list[HandOver]
    # 지출·송금 기록이 남는 여행: 내 이름만 "탈퇴한 멤버"로 바뀐다
    kept_records: list[TripRef]


def get_auth_admin(request: Request) -> AuthAdmin:
    return request.app.state.auth_admin


@router.get("/me")
def get_me(
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Profile:
    """내 프로필. 처음 부르면 가입 때 정한 표시 이름으로 프로필을 만든다."""
    profile = ensure_profile(session, user)
    session.commit()
    return Profile(id=profile.user_id, display_name=profile.display_name)


@router.patch("/me")
def update_me(
    body: ProfileUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Profile:
    """표시 이름을 바꾼다. 모든 여행의 멤버 목록·정산에 바뀐 이름이 보인다."""
    profile = ensure_profile(session, user)
    profile.display_name = body.display_name
    session.commit()
    return Profile(id=profile.user_id, display_name=profile.display_name)


@router.get("/me/deletion-preview")
def preview_deletion(
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DeletionPreview:
    """탈퇴하면 내 여행들이 어떻게 되는지 미리 본다. 아무것도 바꾸지 않는다."""
    ensure_profile(session, user)
    plan = plan_deletion(session, user.id)
    ref = lambda t: TripRef(id=t.id, name=t.name)  # noqa: E731
    return DeletionPreview(
        deleted_trips=[ref(t) for t in plan.deleted_trips],
        handed_over=[HandOver(trip=ref(t), new_organizer_name=heir.profile.display_name) for t, heir in plan.handed_over],
        kept_records=[ref(t) for t in plan.kept_records],
    )


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={502: {"model": ErrorResponse, "description": "로그인 계정 삭제 실패"}},
)
def delete_me(
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
    admin: AuthAdmin = Depends(get_auth_admin),
) -> None:
    """회원 탈퇴(ADR 0005). 로그인 계정을 지우고, 여행 데이터는 규칙대로 지우거나 넘기거나 이름만 지운다.

    로그인 계정 삭제가 실패하면 DB도 되돌린다(아무것도 바뀌지 않은 채 502).
    """
    profile = ensure_profile(session, user)
    keys = delete_account(session, profile, remove_trip)
    session.flush()
    try:
        admin.delete_user(user.id)
    except AuthAdminUnavailable:
        session.rollback()
        raise ApiError(502, "account_deletion_failed", "탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    session.commit()
    delete_files(storage, keys)
