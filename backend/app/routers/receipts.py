import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorResponse
from app.jpeg import NotJpeg, strip_metadata
from app.models import Expense, LineItem, Receipt
from app.permissions import require_organizer
from app.photos import SIGNED_URL_SECONDS, get_storage
from app.receipt_reader import ReceiptDraft, ReceiptReader, ReceiptUnreadable
from app.routers.expenses import ExpenseOut, expense_out
from app.storage import ObjectStorage, StorageUnavailable

router = APIRouter(prefix="/trips/{trip_id}/receipts", tags=["receipts"], responses=ERROR_RESPONSES)

MAX_BYTES = 8 * 1024 * 1024


class ReceiptUploadOut(BaseModel):
    expense: ExpenseOut
    # read: 이번에 Gemini로 읽음 / reused: 같은 영수증의 저장된 결과를 씀 / failed: 읽지 못해 빈 초안
    analysis: Literal["read", "reused", "failed"]
    # 영수증에 보이는 통화가 여행 통화와 다르면 그 통화(예: "USD"). 같거나 모르면 null. 환산은 하지 않는다(ADR 0004).
    receipt_currency: str | None = None


def get_receipt_reader(request: Request) -> ReceiptReader:
    return request.app.state.receipt_reader


def _paid_at(local: str | None) -> datetime | None:
    if not local:
        return None
    try:
        return datetime.fromisoformat(f"{local.replace(' ', 'T')}:00+09:00")
    except ValueError:
        return None


def _signed(storage: ObjectStorage, key: str) -> str | None:
    try:
        return storage.signed_urls([key], SIGNED_URL_SECONDS).get(key)
    except StorageUnavailable:
        return None


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={
        403: {"model": ErrorResponse, "description": "총무 아님"},
        404: {"model": ErrorResponse, "description": "여행 없음"},
        413: {"model": ErrorResponse, "description": "파일이 너무 큼"},
        415: {"model": ErrorResponse, "description": "JPEG가 아님"},
        502: {"model": ErrorResponse, "description": "저장소 실패"},
    },
)
def upload_receipt(
    trip_id: uuid.UUID,
    file: Annotated[UploadFile, File(description="영수증 JPEG")],
    idempotency_key: Annotated[str, Form(min_length=1, max_length=100)],
    response: Response,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
    reader: ReceiptReader = Depends(get_receipt_reader),
) -> ReceiptUploadOut:
    """총무가 영수증을 올리면 지출 초안(항상 draft)을 만든다.

    같은 멱등 키면 처음 만든 초안을 200으로 돌려준다. 같은 이미지면 Gemini를 다시 부르지 않는다.
    분석에 실패해도 영수증은 저장하고 빈 초안을 만든다(직접 입력으로 이어간다).
    """
    organizer = require_organizer(session, trip_id, user)
    replay = session.scalars(select(Expense).where(Expense.trip_id == trip_id, Expense.idempotency_key == idempotency_key)).one_or_none()
    if replay is not None:
        response.status_code = status.HTTP_200_OK
        url = _signed(storage, replay.receipt.storage_key) if replay.receipt else None
        return ReceiptUploadOut(expense=expense_out(replay, url), analysis="reused")

    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(413, "receipt_too_large", f"영수증 사진이 너무 큽니다({MAX_BYTES // (1024 * 1024)}MB까지).")
    try:
        clean = strip_metadata(data)
    except NotJpeg:
        raise ApiError(415, "not_jpeg", "JPEG 사진만 올릴 수 있습니다.")

    image_hash = hashlib.sha256(clean).hexdigest()
    receipt = session.scalars(select(Receipt).where(Receipt.trip_id == trip_id, Receipt.image_hash == image_hash)).one_or_none()
    with ThreadPoolExecutor(max_workers=1) as pool:
        # 처음 보는 영수증이면 저장소에 올리는 동안 Gemini 분석을 같이 한다(둘을 차례로 기다리지 않는다).
        uploading = None
        if receipt is None:
            receipt = Receipt(trip_id=trip_id, storage_key=f"trips/{trip_id}/receipts/{uuid.uuid4()}.jpg", image_hash=image_hash)
            uploading = pool.submit(storage.upload, receipt.storage_key, clean, "image/jpeg")

        draft: ReceiptDraft | None
        if receipt.analysis:
            draft, analysis = ReceiptDraft.model_validate_json(receipt.analysis), "reused"
        else:
            try:
                draft, analysis = reader.read(clean, organizer.trip.currency), "read"
            except ReceiptUnreadable:
                draft, analysis = None, "failed"

        if uploading is not None:
            try:
                uploading.result()
            except StorageUnavailable:
                raise ApiError(502, "storage_unavailable", "영수증 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
            session.add(receipt)
    if analysis == "read" and draft is not None:
        receipt.analysis = draft.model_dump_json()

    everyone = list(organizer.trip.members)
    expense = Expense(
        trip_id=trip_id,
        idempotency_key=idempotency_key,
        status="draft",
        receipt=receipt,
        # 결제자는 영수증에 없으니 총무로 채워 둔다. 편집 화면에서 바꿀 수 있다.
        payer_member_id=organizer.id,
        default_sharers=everyone,
        merchant_name=draft.merchant_name if draft else None,
        paid_at=_paid_at(draft.paid_at_local) if draft else None,
        total_amount=draft.total_amount if draft else None,
        items=[
            LineItem(position=i, name=line.name, quantity=line.quantity, amount=line.amount, sharers=everyone)
            for i, line in enumerate(draft.items if draft else [])
        ],
    )
    session.add(expense)
    session.commit()
    other = draft.currency if draft and draft.currency and draft.currency != organizer.trip.currency else None
    return ReceiptUploadOut(
        expense=expense_out(expense, _signed(storage, receipt.storage_key)),
        analysis=analysis,  # type: ignore[arg-type]
        receipt_currency=other,
    )
