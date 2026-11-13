import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import loading
from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app.models import Transfer
from app.permissions import require_member, require_organizer

router = APIRouter(prefix="/trips/{trip_id}/transfers", tags=["transfers"], responses=ERROR_RESPONSES)

NOT_FOUND = {404: {"model": ErrorResponse, "description": "여행·송금 없음"}}
ORGANIZER_ONLY = {403: {"model": ErrorResponse, "description": "총무 아님"}, **NOT_FOUND}


class TransferCreate(BaseModel):
    from_member_id: uuid.UUID
    to_member_id: uuid.UUID
    # 송금 제안과 달라도 된다(일부만 보낸 경우).
    amount: Annotated[int, Field(gt=0, le=100_000_000)]


class TransferOut(BaseModel):
    id: uuid.UUID
    from_member_id: uuid.UUID
    from_name: str
    to_member_id: uuid.UUID
    to_name: str
    amount: int
    recorded_at: datetime


def _out(t: Transfer) -> TransferOut:
    return TransferOut(
        id=t.id,
        from_member_id=t.from_member_id,
        from_name=t.from_member.profile.display_name,
        to_member_id=t.to_member_id,
        to_name=t.to_member.profile.display_name,
        amount=t.amount,
        recorded_at=t.recorded_at.astimezone(timezone.utc),
    )


@router.get("", responses=NOT_FOUND)
def list_transfers(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TransferOut]:
    """기록된 송금. 모든 멤버가 볼 수 있다. 최근 기록부터."""
    require_member(session, trip_id, user)
    transfers = session.scalars(
        select(Transfer).where(Transfer.trip_id == trip_id).order_by(Transfer.recorded_at.desc(), Transfer.id).options(*loading.TRANSFER)
    ).all()
    return [_out(t) for t in transfers]


@router.post("", status_code=status.HTTP_201_CREATED, responses=ORGANIZER_ONLY)
def record_transfer(
    trip_id: uuid.UUID,
    body: TransferCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TransferOut:
    """총무가 송금을 기록한다. 실제 송금은 하지 않는다."""
    organizer = require_organizer(session, trip_id, user)
    member_ids = {m.id for m in organizer.trip.members}
    problems = [
        ErrorDetail(field=field, message="이 여행의 멤버가 아닙니다.")
        for field, member_id in (("from_member_id", body.from_member_id), ("to_member_id", body.to_member_id))
        if member_id not in member_ids
    ]
    if body.from_member_id == body.to_member_id:
        problems.append(ErrorDetail(field="to_member_id", message="보낸 멤버와 받은 멤버가 같습니다."))
    if problems:
        raise ApiError(422, "validation_failed", "입력값을 확인해 주세요.", problems)

    transfer = Transfer(trip_id=trip_id, **body.model_dump())
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    return _out(transfer)


@router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ORGANIZER_ONLY)
def delete_transfer(
    trip_id: uuid.UUID,
    transfer_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """잘못 기록한 송금을 지운다."""
    require_organizer(session, trip_id, user)
    transfer = session.scalars(
        select(Transfer).where(Transfer.id == transfer_id, Transfer.trip_id == trip_id)
    ).one_or_none()
    if transfer is None:
        raise ApiError(404, "transfer_not_found", "송금 기록을 찾을 수 없습니다.")
    session.delete(transfer)
    session.commit()
