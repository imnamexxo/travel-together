"""장소 검색기 어댑터: (키워드, 선택적 좌표) → 장소 후보. 국내 여행은 카카오, 해외 여행은 Google Places(ADR 0004).

서버의 나머지 코드는 PlaceSearcher 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
좌표는 장소의 위치이거나 검색 기준점이다. 사람의 위치를 받지 않는다(ADR-0003).
"""

import logging
from urllib.parse import quote
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


@dataclass(frozen=True)
class PlaceDetails:
    """볼 때만 받아 오는 장소 이름·주소(ADR 0006). 저장하지 않는다."""

    name: str
    address: str


class PlaceSearchUnavailable(Exception):
    """검색기에 묻지 못했다(키 없음, 네트워크, 검색기 오류, 할당량 초과)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        # 앱에는 짧은 문구만 가므로, 원인(키 없음, 401, 버킷 없음 등)은 Render 로그에서 본다. 키 값은 담기지 않는다.
        logger.warning("장소 검색 실패: %s", reason)


class PlaceSearcher(Protocol):
    # 이름·주소·종류를 DB에 저장해도 되는 검색기인가. Google은 아니다(ADR 0006): id와 30일 안의 좌표만 둔다.
    stores_details: bool

    def search(self, query: str, *, near: tuple[float, float] | None = None) -> list[PlaceCandidate]:
        """near는 (위도, 경도). 가까운 장소가 먼저 나오도록 기준점으로만 쓴다."""
        ...

    def lookup(self, source_place_id: str, name: str) -> PlaceCandidate | None:
        """앱이 고른 장소가 실제로 있는지 확인하고 좌표를 받는다. 없으면 None.

        stores_details가 아닌 검색기는 이름·주소를 빈 값으로 돌려준다(저장하지 않으므로).
        """
        ...

    def details(self, source_place_id: str) -> PlaceDetails | None:
        """볼 때만 받는 이름·주소. 장소가 없으면 None."""
        ...


class KakaoPlaceSearcher:
    URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
    stores_details = True

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

    def lookup(self, source_place_id: str, name: str) -> PlaceCandidate | None:
        return _lookup_by_search(self, source_place_id, name)

    def details(self, source_place_id: str) -> PlaceDetails | None:
        # 카카오 장소는 이름·주소를 저장해 두므로 따로 받지 않는다.
        raise NotImplementedError


def _lookup_by_search(searcher: PlaceSearcher, source_place_id: str, name: str) -> PlaceCandidate | None:
    # 카카오에는 id로 장소를 찾는 API가 없어서, 이름으로 다시 검색해 같은 id가 나오는지 본다.
    return next((c for c in searcher.search(name) if c.source_place_id == source_place_id), None)


class GooglePlaceSearcher:
    """Google Places API (New). 해외 여행에서 쓴다.

    검색(Text Search) 필드 마스크는 id·이름·주소·좌표·종류만 둔다. 이 필드들은 Text Search Pro 요금 단계라,
    별점·영업시간·전화번호처럼 더 비싼 단계의 필드는 넣지 않는다.
    약관상 이름·주소·종류는 저장할 수 없고 좌표는 30일까지만 둔다(ADR 0006).
    확인·좌표 갱신은 Place Details Essentials(id·좌표), 이름 보기는 Place Details Pro(이름·주소)다.
    """

    URL = "https://places.googleapis.com/v1/places:searchText"
    DETAILS_URL = "https://places.googleapis.com/v1/places/{id}"
    LOCATION_FIELDS = "id,location"
    DETAILS_FIELDS = "id,displayName,formattedAddress"
    stores_details = False
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

    def _place(self, source_place_id: str, fields: str) -> dict | None:
        if not self._key:
            raise PlaceSearchUnavailable("GOOGLE_PLACES_API_KEY가 설정되지 않았습니다.")
        try:
            response = self._client.get(
                # id는 앱이 보낸 값이라 경로에 그대로 넣지 않는다.
                self.DETAILS_URL.format(id=quote(source_place_id, safe="")),
                params={"languageCode": "ko"},
                headers={"X-Goog-Api-Key": self._key, "X-Goog-FieldMask": fields},
            )
            # 없는 id(지워진 장소, 엉터리 값)는 400 INVALID_REQUEST 또는 404로 온다.
            if response.status_code in (400, 404):
                return None
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PlaceSearchUnavailable(describe(exc)) from exc

    def lookup(self, source_place_id: str, name: str) -> PlaceCandidate | None:
        place = self._place(source_place_id, self.LOCATION_FIELDS)
        if place is None:
            return None
        try:
            return PlaceCandidate(
                source_place_id=place["id"],
                name="",
                address="",
                road_address=None,
                latitude=float(place["location"]["latitude"]),
                longitude=float(place["location"]["longitude"]),
                category=None,
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise PlaceSearchUnavailable(describe(exc)) from exc

    def details(self, source_place_id: str) -> PlaceDetails | None:
        place = self._place(source_place_id, self.DETAILS_FIELDS)
        if place is None:
            return None
        try:
            return PlaceDetails(name=place["displayName"]["text"], address=place.get("formattedAddress") or "")
        except (KeyError, TypeError) as exc:
            raise PlaceSearchUnavailable(describe(exc)) from exc
