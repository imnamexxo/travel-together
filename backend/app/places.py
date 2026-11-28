"""여행의 장소: 여행에 맞는 검색기(국내 카카오, 해외 Google)로 검증하고, 같은 장소는 하나만 둔다.

Google 장소는 id와 30일 안의 좌표만 저장한다(ADR 0006). 카카오 장소는 이름·주소·좌표를 두되 30일마다 최신으로 맞춘다
(카카오 운영정책 제5조: 캐시한 데이터를 최신으로 유지). 둘 다 refresh_places가 한다.
"""

import datetime as dt
import logging
import uuid

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError, ErrorDetail
from app.db import get_session
from app.models import Place, Trip
from app.place_search import PlaceCandidate, PlaceSearcher, PlaceSearchUnavailable

logger = logging.getLogger(__name__)

# 약관은 Google 좌표를 30일까지 둘 수 있게 한다. 하루 먼저 다시 받는다. 카카오도 같은 주기로 최신으로 맞춘다.
COORDS_KEEP = dt.timedelta(days=30)
REFRESH_AFTER = dt.timedelta(days=29)
# 한 번 돌 때 다시 받는 장소 수의 상한(Place Details Essentials 무료 한도 보호).
REFRESH_BATCH = 200


def get_place_searcher(trip_id: uuid.UUID, request: Request, session: Session = Depends(get_session)) -> PlaceSearcher:
    """경로의 여행에 맞는 검색기. 해외 여행이면 Google, 아니면(여행이 없어도) 카카오. 권한 검사는 각 경로가 한다."""
    overseas = session.scalar(select(Trip.is_overseas).where(Trip.id == trip_id))
    return request.app.state.overseas_place_searcher if overseas else request.app.state.place_searcher


def search_places(searcher: PlaceSearcher, query: str, near: tuple[float, float] | None = None) -> list[PlaceCandidate]:
    try:
        return searcher.search(query, near=near)
    except PlaceSearchUnavailable:
        raise ApiError(502, "place_search_unavailable", "장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")


def place_for(
    session: Session,
    searcher: PlaceSearcher,
    trip_id: uuid.UUID,
    source_place_id: str,
    name: str,
    *,
    field: str = "place",
) -> Place:
    """이 여행의 장소. 이미 있으면 그대로 쓰고, 없으면 검색기에서 확인한 뒤 만든다.

    카카오는 이름으로 다시 검색해 같은 id가 나오는지 보고, Google은 id로 장소를 확인한다.
    앱이 보낸 이름·주소·좌표는 믿지 않고 검색기가 준 값으로 저장한다.
    """
    existing = session.scalars(
        select(Place).where(Place.trip_id == trip_id, Place.source_place_id == source_place_id)
    ).one_or_none()
    if existing is not None:
        return existing
    try:
        match = searcher.lookup(source_place_id, name)
    except PlaceSearchUnavailable:
        raise ApiError(502, "place_search_unavailable", "장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    if match is None:
        raise ApiError(
            422,
            "place_not_verified",
            "장소 검색에서 확인되지 않은 장소입니다. 장소를 다시 검색해 골라 주세요.",
            [ErrorDetail(field=field, message="검색 결과에 없는 장소입니다.")],
        )
    return place_from_candidate(session, searcher, trip_id, match)


def place_from_candidate(session: Session, searcher: PlaceSearcher, trip_id: uuid.UUID, candidate: PlaceCandidate) -> Place:
    """서버가 검색기에서 직접 받은 후보로 장소를 만든다. 같은 장소가 이미 있으면 그것을 쓴다.

    이름·주소를 저장하면 안 되는 검색기(Google)는 id와 좌표, 받은 시각만 둔다.
    """
    existing = session.scalars(
        select(Place).where(Place.trip_id == trip_id, Place.source_place_id == candidate.source_place_id)
    ).one_or_none()
    if existing is not None:
        return existing
    keep = searcher.stores_details
    place = Place(
        trip_id=trip_id,
        source_place_id=candidate.source_place_id,
        source="kakao" if keep else "google",
        name=candidate.name if keep else None,
        address=candidate.address if keep else None,
        road_address=candidate.road_address if keep else None,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        category=candidate.category if keep else None,
        refreshed_at=dt.datetime.now(dt.timezone.utc),
    )
    session.add(place)
    session.flush()
    return place


def copy_place(session: Session, trip_id: uuid.UUID, original: Place) -> Place:
    """다른 여행의 장소를 이 여행으로 복사한다. 같은 장소가 이미 있으면 그것을 쓴다.

    받은 시각(refreshed_at)을 그대로 옮겨서 갱신·만료 기한(카카오 최신 유지, Google 좌표 30일, ADR 0006)이 늘어나지 않게 한다.
    """
    existing = session.scalars(
        select(Place).where(Place.trip_id == trip_id, Place.source_place_id == original.source_place_id)
    ).one_or_none()
    if existing is not None:
        return existing
    place = Place(
        trip_id=trip_id, source_place_id=original.source_place_id, source=original.source, name=original.name,
        address=original.address, road_address=original.road_address, latitude=original.latitude,
        longitude=original.longitude, category=original.category, refreshed_at=original.refreshed_at,
    )
    session.add(place)
    session.flush()
    return place


def _due(session: Session, source: str, now: dt.datetime) -> list[Place]:
    query = select(Place).where(Place.source == source, Place.refreshed_at < now - REFRESH_AFTER)
    if source == "google":
        query = query.where(Place.latitude.is_not(None))
    return list(session.scalars(query.order_by(Place.refreshed_at).limit(REFRESH_BATCH)))


def _refresh(place: Place, searcher: PlaceSearcher, now: dt.datetime) -> bool:
    """한 곳을 다시 받는다. 받았으면 True. 검색기가 멈췄으면 PlaceSearchUnavailable."""
    found = searcher.lookup(place.source_place_id, place.name or "")
    if found is None:
        if place.source == "google":
            # Google에서 사라진 장소(폐업 등)다. 다시 받을 수 없으니 좌표를 지운다.
            place.latitude = place.longitude = None
        else:
            # 카카오에서 같은 id가 안 나온다(폐업·이름 변경). 정보는 두고 30일 뒤에 다시 본다.
            logger.info("카카오 장소 확인 안 됨: %s", place.source_place_id)
            place.refreshed_at = now
        return False
    if searcher.stores_details:
        place.name, place.address, place.road_address, place.category = found.name, found.address, found.road_address, found.category
    place.latitude, place.longitude, place.refreshed_at = found.latitude, found.longitude, now
    return True


def refresh_places(session: Session, searchers: dict[str, PlaceSearcher], now: dt.datetime | None = None) -> int:
    """29일이 지난 장소를 검색기에서 다시 받는다. 다시 받은 수를 돌려준다.

    Google은 좌표만(이름은 저장하지 않으므로), 카카오는 이름·주소·종류·좌표를 최신으로 맞춘다.
    AI 추천 후보는 잠깐 쓰는 값이라 places만 본다.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    refreshed = 0
    for source, searcher in searchers.items():
        due = _due(session, source, now)
        done = 0
        for place in due:
            try:
                done += _refresh(place, searcher, now)
            except PlaceSearchUnavailable:
                # 검색기가 멈췄거나 하루 상한에 걸렸다. 나머지는 다음에(Google 좌표는 30일이 지나면 purge가 지운다).
                break
        session.commit()
        if due:
            logger.info("장소 갱신(%s): %d곳 중 %d곳", source, len(due), done)
        refreshed += done
    return refreshed


def purge_expired_google_coords(session: Session, now: dt.datetime | None = None) -> None:
    """Google이 멈춰 다시 받지 못한 좌표도 30일이 지나면 지운다."""
    now = now or dt.datetime.now(dt.timezone.utc)
    for place in session.scalars(
        select(Place).where(
            Place.source == "google",
            Place.latitude.is_not(None),
            Place.refreshed_at < now - COORDS_KEEP,
        )
    ):
        place.latitude = place.longitude = None
    session.commit()
