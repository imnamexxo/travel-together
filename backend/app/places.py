"""여행의 장소: 여행에 맞는 검색기(국내 카카오, 해외 Google)로 검증하고, 같은 장소는 하나만 둔다."""

import uuid

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError, ErrorDetail
from app.db import get_session
from app.models import Place, Trip
from app.place_search import PlaceCandidate, PlaceSearcher, PlaceSearchUnavailable


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

    카카오에는 id로 장소를 찾는 API가 없어서, 이름으로 다시 검색해 같은 id가 나오는지 본다(Google도 같은 방식).
    앱이 보낸 이름·주소·좌표는 믿지 않고 검색기가 준 값으로 저장한다.
    """
    existing = session.scalars(
        select(Place).where(Place.trip_id == trip_id, Place.source_place_id == source_place_id)
    ).one_or_none()
    if existing is not None:
        return existing
    match = next((c for c in search_places(searcher, name) if c.source_place_id == source_place_id), None)
    if match is None:
        raise ApiError(
            422,
            "place_not_verified",
            "장소 검색에서 확인되지 않은 장소입니다. 장소를 다시 검색해 골라 주세요.",
            [ErrorDetail(field=field, message="검색 결과에 없는 장소입니다.")],
        )
    return place_from_candidate(session, trip_id, match)


def place_from_candidate(session: Session, trip_id: uuid.UUID, candidate: PlaceCandidate) -> Place:
    """서버가 검색기에서 직접 받은 후보로 장소를 만든다. 같은 장소가 이미 있으면 그것을 쓴다."""
    existing = session.scalars(
        select(Place).where(Place.trip_id == trip_id, Place.source_place_id == candidate.source_place_id)
    ).one_or_none()
    if existing is not None:
        return existing
    place = Place(
        trip_id=trip_id,
        source_place_id=candidate.source_place_id,
        name=candidate.name,
        address=candidate.address,
        road_address=candidate.road_address,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        category=candidate.category,
    )
    session.add(place)
    session.flush()
    return place
