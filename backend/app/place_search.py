"""장소 검색기 어댑터: (키워드, 선택적 좌표) → 장소 후보. 국내 여행은 카카오, 해외 여행은 Google Places(ADR 0004).

서버의 나머지 코드는 PlaceSearcher 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
좌표는 장소의 위치이거나 검색 기준점이다. 사람의 위치를 받지 않는다(ADR-0003).
"""

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.storage import describe

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlaceCandidate:
    source_place_id: str
    name: str
    address: str
    road_address: str | None
    latitude: float
    longitude: float
    category: str | None


class PlaceSearchUnavailable(Exception):
    """검색기에 묻지 못했다(키 없음, 네트워크, 검색기 오류, 할당량 초과)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        # 앱에는 짧은 문구만 가므로, 원인(키 없음, 401, 버킷 없음 등)은 Render 로그에서 본다. 키 값은 담기지 않는다.
        logger.warning("장소 검색 실패: %s", reason)


class PlaceSearcher(Protocol):
    def search(self, query: str, *, near: tuple[float, float] | None = None) -> list[PlaceCandidate]:
        """near는 (위도, 경도). 가까운 장소가 먼저 나오도록 기준점으로만 쓴다."""
        ...


class KakaoPlaceSearcher:
    URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

    def __init__(self, rest_api_key: str, client: httpx.Client | None = None):
        self._key = rest_api_key
        self._client = client or httpx.Client(timeout=5.0)

    def search(self, query: str, *, near: tuple[float, float] | None = None) -> list[PlaceCandidate]:
        if not self._key:
            raise PlaceSearchUnavailable("KAKAO_REST_API_KEY가 설정되지 않았습니다.")
        params: dict[str, str | int] = {"query": query, "size": 15}
        if near is not None:
            # 카카오는 x = 경도, y = 위도다.
            params.update(y=str(near[0]), x=str(near[1]), sort="distance")
        try:
            response = self._client.get(self.URL, params=params, headers={"Authorization": f"KakaoAK {self._key}"})
            response.raise_for_status()
            documents = response.json()["documents"]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise PlaceSearchUnavailable(describe(exc)) from exc
        return [
            PlaceCandidate(
                source_place_id=str(d["id"]),
                name=d["place_name"],
                address=d.get("address_name") or "",
                road_address=d.get("road_address_name") or None,
                latitude=float(d["y"]),
                longitude=float(d["x"]),
                category=d.get("category_name") or None,
            )
            for d in documents
        ]


class GooglePlaceSearcher:
    """Google Places API (New) Text Search. 해외 여행에서 쓴다.

    필드 마스크는 id·이름·주소·좌표·종류만 둔다. 이 필드들은 Text Search Pro 요금 단계라,
    별점·영업시간·전화번호처럼 더 비싼 단계의 필드는 넣지 않는다.
    """

    URL = "https://places.googleapis.com/v1/places:searchText"
    FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName"
    # near가 있을 때 이 반경(미터) 안을 우선한다(제한이 아니라 치우침).
    BIAS_RADIUS_M = 5000.0

    def __init__(self, api_key: str, client: httpx.Client | None = None):
        self._key = api_key
        self._client = client or httpx.Client(timeout=5.0)

    def search(self, query: str, *, near: tuple[float, float] | None = None) -> list[PlaceCandidate]:
        if not self._key:
            raise PlaceSearchUnavailable("GOOGLE_PLACES_API_KEY가 설정되지 않았습니다.")
        body: dict = {"textQuery": query, "languageCode": "ko", "pageSize": 15}
        if near is not None:
            body["locationBias"] = {
                "circle": {"center": {"latitude": near[0], "longitude": near[1]}, "radius": self.BIAS_RADIUS_M}
            }
        try:
            response = self._client.post(
                self.URL, json=body, headers={"X-Goog-Api-Key": self._key, "X-Goog-FieldMask": self.FIELDS}
            )
            response.raise_for_status()
            places = response.json().get("places", [])
            return [
                PlaceCandidate(
                    source_place_id=p["id"],
                    name=p["displayName"]["text"],
                    address=p.get("formattedAddress") or "",
                    road_address=None,
                    latitude=float(p["location"]["latitude"]),
                    longitude=float(p["location"]["longitude"]),
                    category=(p.get("primaryTypeDisplayName") or {}).get("text"),
                )
                for p in places
            ]
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise PlaceSearchUnavailable(describe(exc)) from exc
