import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from pydantic import AwareDatetime, BaseModel, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail, ErrorResponse
from app.jpeg import NotJpeg, strip_metadata
from app.models import Photo, Place, Trip
from app.permissions import require_member
from app.photos import SIGNED_URL_SECONDS, delete_files, get_storage
from app.place_search import PlaceSearcher
from app.places import get_place_searcher, place_for
from app.routers.planner import PlaceOut, PlaceRef, place_out
from app.storage import ObjectStorage, StorageUnavailable

router = APIRouter(prefix="/trips/{trip_id}/photos", tags=["photos"], responses=ERROR_RESPONSES)

MAX_PHOTOS = 200
# 앱이 긴 변 1600px JPEG로 줄여 보내므로 보통 1MB 아래다.
MAX_BYTES = 5 * 1024 * 1024
STORAGE_DOWN = {502: {"model": ErrorResponse, "description": "저장소 실패"}}
_aware = TypeAdapter(AwareDatetime)


class PhotoOut(BaseModel):
    id: uuid.UUID
    # 짧게 열리는 서명 URL. 만료되면 목록을 다시 불러와 새 URL을 받는다.
    url: str
    taken_at: datetime | None
    uploaded_at: datetime
    uploader_member_id: uuid.UUID
    uploader_name: str
    # 연결된 장소. 없으면 촬영 날짜로만 분류한다.
    place: PlaceOut | None
    # auto: 앱이 촬영 위치로 찾아 줌 / manual: 멤버가 직접 고름
    link_type: Literal["auto", "manual"] | None


class PhotoPlaceLink(BaseModel):
    """사진의 장소를 바꾼다. 둘 다 비우면 연결을 해제한다."""

    place_id: uuid.UUID | None = None
    # 일정에 없던 곳: 검색 결과에서 고른 카카오 장소. 서버가 확인한 뒤 여행의 장소로 만든다.
    source_place: PlaceRef | None = None


class PhotoList(BaseModel):
    photos: list[PhotoOut]
    count: int
    limit: int


def _utc(value: datetime | None) -> datetime | None:
    return value.astimezone(timezone.utc) if value else None


def _signed(storage: ObjectStorage, photos: list[Photo]) -> dict[str, str]:
    try:
        return storage.signed_urls([p.storage_key for p in photos], SIGNED_URL_SECONDS)
    except StorageUnavailable:
        raise ApiError(502, "storage_unavailable", "사진 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")


def _out(photo: Photo, url: str) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        url=url,
        taken_at=_utc(photo.taken_at),
        uploaded_at=_utc(photo.created_at),  # type: ignore[arg-type]
        uploader_member_id=photo.uploader_member_id,
        uploader_name=photo.uploader.profile.display_name,
        place=place_out(photo.place) if photo.place else None,
        link_type=photo.link_type,  # type: ignore[arg-type]
    )


def _trip_place(session: Session, trip_id: uuid.UUID, place_id: uuid.UUID, field: str) -> Place:
    """이 여행의 장소. 다른 여행의 장소나 없는 id면 422."""
    place = session.scalars(select(Place).where(Place.id == place_id, Place.trip_id == trip_id)).one_or_none()
    if place is None:
        raise ApiError(422, "validation_failed", "입력값을 확인해 주세요.", [ErrorDetail(field=field, message="이 여행의 장소가 아닙니다.")])
    return place


def _parse_taken_at(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return _aware.validate_python(raw)
    except ValidationError:
        raise ApiError(422, "validation_failed", "입력값을 확인해 주세요.", [ErrorDetail(field="taken_at", message="시간대를 포함한 ISO 시각이어야 합니다.")])


@router.get("", responses={404: {"model": ErrorResponse, "description": "여행 없음"}, **STORAGE_DOWN})
def list_photos(
    trip_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> PhotoList:
    """여행의 사진. 촬영 시각 순(시각 없는 사진은 올린 시각으로). 이미지는 서명 URL로만 준다."""
    require_member(session, trip_id, user)
    photos = list(
        session.scalars(
            select(Photo).where(Photo.trip_id == trip_id).order_by(func.coalesce(Photo.taken_at, Photo.created_at), Photo.created_at)
        )
    )
    urls = _signed(storage, photos)
    return PhotoList(photos=[_out(p, urls.get(p.storage_key, "")) for p in photos], count=len(photos), limit=MAX_PHOTOS)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorResponse, "description": "여행 없음"},
        409: {"model": ErrorResponse, "description": "사진 200장 초과"},
        413: {"model": ErrorResponse, "description": "파일이 너무 큼"},
        415: {"model": ErrorResponse, "description": "JPEG가 아님"},
        **STORAGE_DOWN,
    },
)
def upload_photo(
    trip_id: uuid.UUID,
    file: Annotated[UploadFile, File(description="JPEG. 앱이 긴 변 1600px로 줄이고 EXIF를 지운 파일")],
    taken_at: Annotated[str | None, Form(description="촬영 시각(시간대 포함 ISO). 모르면 비운다")] = None,
    place_id: Annotated[uuid.UUID | None, Form(description="앱이 휴대폰 안에서 촬영 위치로 찾은 이 여행의 장소(자동 연결). 좌표는 보내지 않는다")] = None,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> PhotoOut:
    """사진 한 장을 올린다. 위치 좌표는 받지 않는다(ADR-0003). 서버도 저장 전에 EXIF를 지운다."""
    me = require_member(session, trip_id, user)
    when = _parse_taken_at(taken_at)
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(413, "photo_too_large", f"사진이 너무 큽니다({MAX_BYTES // (1024 * 1024)}MB까지).")
    try:
        clean = strip_metadata(data)
    except NotJpeg:
        raise ApiError(415, "not_jpeg", "JPEG 사진만 올릴 수 있습니다.")

    # 동시에 올려도 200장을 넘지 않도록 여행 행을 잠그고 센다.
    session.execute(select(Trip).where(Trip.id == trip_id).with_for_update())
    count = session.scalar(select(func.count()).where(Photo.trip_id == trip_id)) or 0
    if count >= MAX_PHOTOS:
        raise ApiError(409, "photo_limit", f"여행 사진은 {MAX_PHOTOS}장까지 올릴 수 있습니다.")

    place = _trip_place(session, trip_id, place_id, "place_id") if place_id else None
    photo = Photo(
        trip_id=trip_id, uploader_member_id=me.id, storage_key=f"trips/{trip_id}/photos/{uuid.uuid4()}.jpg",
        taken_at=when, size_bytes=len(clean), place=place, link_type="auto" if place else None,
    )
    try:
        storage.upload(photo.storage_key, clean, "image/jpeg")
    except StorageUnavailable:
        raise ApiError(502, "storage_unavailable", "사진 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    session.add(photo)
    try:
        session.commit()
    except Exception:
        session.rollback()
        delete_files(storage, [photo.storage_key])
        raise
    session.refresh(photo)
    return _out(photo, _signed(storage, [photo]).get(photo.storage_key, ""))


@router.delete(
    "/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"model": ErrorResponse, "description": "올린 사람·총무가 아님"}, 404: {"model": ErrorResponse, "description": "여행·사진 없음"}},
)
def delete_photo(
    trip_id: uuid.UUID,
    photo_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
) -> None:
    """올린 멤버나 총무만 지울 수 있다."""
    me = require_member(session, trip_id, user)
    photo = session.scalars(select(Photo).where(Photo.id == photo_id, Photo.trip_id == trip_id)).one_or_none()
    if photo is None:
        raise ApiError(404, "photo_not_found", "사진을 찾을 수 없습니다.")
    if not (me.is_organizer or photo.uploader_member_id == me.id):
        raise ApiError(403, "not_photo_owner", "내가 올린 사진만 지울 수 있습니다.")
    key = photo.storage_key
    session.delete(photo)
    session.commit()
    delete_files(storage, [key])


@router.put(
    "/{photo_id}/place",
    responses={404: {"model": ErrorResponse, "description": "여행·사진 없음"}, 502: {"model": ErrorResponse, "description": "카카오 장소 검색 실패"}},
)
def link_photo_place(
    trip_id: uuid.UUID,
    photo_id: uuid.UUID,
    body: PhotoPlaceLink,
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    storage: ObjectStorage = Depends(get_storage),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> PhotoOut:
    """멤버 누구나 사진의 장소를 바꾸거나 해제한다. 수동 연결은 이후 자동으로 바뀌지 않는다."""
    require_member(session, trip_id, user)
    photo = session.scalars(select(Photo).where(Photo.id == photo_id, Photo.trip_id == trip_id)).one_or_none()
    if photo is None:
        raise ApiError(404, "photo_not_found", "사진을 찾을 수 없습니다.")
    if body.place_id and body.source_place:
        raise ApiError(422, "validation_failed", "입력값을 확인해 주세요.", [ErrorDetail(field="place_id", message="장소는 하나만 고를 수 있습니다.")])
    if body.place_id:
        photo.place = _trip_place(session, trip_id, body.place_id, "place_id")
    elif body.source_place:
        photo.place = place_for(session, searcher, trip_id, body.source_place.source_place_id, body.source_place.name, field="source_place")
    else:
        photo.place = None
    photo.link_type = "manual" if photo.place else None
    session.commit()
    return _out(photo, _signed(storage, [photo]).get(photo.storage_key, ""))
