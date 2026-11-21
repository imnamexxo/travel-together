"""여행의 장소: 여행에 맞는 검색기(국내 카카오, 해외 Google)로 검증하고, 같은 장소는 하나만 둔다.

Google 장소는 id와 30일 안의 좌표만 저장한다(ADR 0006). 좌표는 refresh_google_coords가 다시 받는다.
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

# 약관은 Google 좌표를 30일까지 둘 수 있게 한다. 하루 먼저 다시 받는다.
COORDS_KEEP = dt.timedelta(days=30)
COORDS_REFRESH_AFTER = dt.timedelta(days=29)
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
        coords_fetched_at=None if keep else dt.datetime.now(dt.timezone.utc),
    )
    session.add(place)
    session.flush()
    return place


def refresh_google_coords(session: Session, searcher: PlaceSearcher, now: dt.datetime | None = None) -> int:
    """29일이 지난 Google 좌표를 다시 받는다. 못 받은 채 30일이 지났으면 좌표를 지운다. 다시 받은 수를 돌려준다.

    AI 추천 후보에는 Google 좌표를 두지 않으므로(ADR 0006) places만 본다.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    stale = session.scalars(
        select(Place)
        .where(
            Place.source == "google",
            Place.latitude.is_not(None),
            Place.coords_fetched_at < now - COORDS_REFRESH_AFTER,
        )
        .order_by(Place.coords_fetched_at)
        .limit(REFRESH_BATCH)
    ).all()
    refreshed = 0
    for place in stale:
        try:
            found = searcher.lookup(place.source_place_id, "")
        except PlaceSearchUnavailable:
            # Google이 멈췄거나 하루 상한에 걸렸다. 나머지는 다음에(30일이 지나면 purge가 지운다).
            break
        if found is None:
            # Google에서 사라진 장소(폐업 등)다. 다시 받을 수 없으니 좌표를 지운다.
            place.latitude = place.longitude = None
        else:
            place.latitude, place.longitude, place.coords_fetched_at = found.latitude, found.longitude, now
            refreshed += 1
    session.commit()
    if stale:
        logger.info("Google 좌표 갱신: %d곳 중 %d곳", len(stale), refreshed)
    return refreshed


def purge_expired_google_coords(session: Session, now: dt.datetime | None = None) -> None:
    """Google이 멈춰 다시 받지 못한 좌표도 30일이 지나면 지운다."""
    now = now or dt.datetime.now(dt.timezone.utc)
    for place in session.scalars(
        select(Place).where(
            Place.source == "google",
            Place.latitude.is_not(None),
            Place.coords_fetched_at < now - COORDS_KEEP,
        )
    ):
        place.latitude = place.longitude = None
    session.commit()
