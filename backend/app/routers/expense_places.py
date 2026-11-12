import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_session
from app.errors import ERROR_RESPONSES, ErrorResponse
from app.models import Place
from app.permissions import require_organizer
from app.place_search import PlaceSearcher
from app.places import get_place_searcher, search_places
from app.routers.planner import PlaceCandidateOut

# 지출 라우터의 "/{expense_id}"보다 먼저 등록한다(main.py). 그래야 "place-candidates"를 지출 id로 읽지 않는다.
router = APIRouter(prefix="/trips/{trip_id}/expenses", tags=["expenses"], responses=ERROR_RESPONSES)


class ExpensePlaceCandidate(PlaceCandidateOut):
    # 이 여행에 이미 있는 장소(일정·사진·다른 지출에 쓰인 곳)면 true. 이런 후보가 앞에 온다.
    in_trip: bool


@router.get(
    "/place-candidates",
    responses={403: {"model": ErrorResponse, "description": "총무 아님"}, 404: {"model": ErrorResponse, "description": "여행 없음"}, 502: {"model": ErrorResponse, "description": "카카오 실패"}},
)
def expense_place_candidates(
    trip_id: uuid.UUID,
    query: Annotated[str, Query(min_length=1, max_length=100, description="영수증 상호 또는 총무가 입력한 검색어")],
    user: AuthenticatedUser = Depends(get_current_user),
    session: Session = Depends(get_session),
    searcher: PlaceSearcher = Depends(get_place_searcher),
) -> list[ExpensePlaceCandidate]:
    """지출에 붙일 장소 후보. 위치 좌표 없이 검색어로만 찾는다(ADR-0003). 고르기 전에는 붙이지 않는다."""
    require_organizer(session, trip_id, user)
    known = set(session.scalars(select(Place.kakao_place_id).where(Place.trip_id == trip_id)))
    candidates = [
        ExpensePlaceCandidate(**c.__dict__, in_trip=c.kakao_place_id in known) for c in search_places(searcher, query.strip())
    ]
    # 이 여행의 장소를 앞으로(같은 그룹 안에서는 카카오 순서 유지).
    return sorted(candidates, key=lambda c: not c.in_trip)
