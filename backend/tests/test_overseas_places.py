"""해외 여행 장소 검색(ADR 0004): 해외 여행은 Google Places, 국내 여행은 카카오."""

import datetime as dt

import httpx
import pytest

from app.gemini import PlanRequest, SuggestedStop, build_prompt
from app.place_search import GooglePlaceSearcher, PlaceSearchUnavailable
from tests.conftest import bearer

OSAKA = {"name": "오사카 여행", "start_date": "2026-12-01", "end_date": "2026-12-02", "currency": "JPY", "is_overseas": True}
JEJU = {"name": "제주 여행", "start_date": "2026-12-01", "end_date": "2026-12-02"}


def make_trip(client, auth, body):
    minji, _ = auth.add_user(display_name="민지")
    trip = client.post("/trips", json=body, headers=bearer(minji)).json()
    return trip, minji


def test_trip_is_domestic_by_default_and_can_be_overseas(client, auth):
    domestic, _ = make_trip(client, auth, JEJU)
    overseas, minji = make_trip(client, auth, OSAKA)

    assert domestic["is_overseas"] is False
    assert overseas["is_overseas"] is True
    assert {t["is_overseas"] for t in client.get("/trips", headers=bearer(minji)).json()} == {True}


def test_overseas_trip_searches_google_and_domestic_searches_kakao(client, auth, places, overseas_places):
    places.add("k1", "동문재래시장")
    overseas_places.add("ChIJ-dotonbori", "도톤보리", lat=34.6687, lng=135.5013, address="일본 오사카부 오사카시 주오구")
    osaka, minji = make_trip(client, auth, OSAKA)
    jeju = client.post("/trips", json=JEJU, headers=bearer(minji)).json()

    abroad = client.get(f"/trips/{osaka['id']}/places/search", params={"query": "도톤보리"}, headers=bearer(minji)).json()
    home = client.get(f"/trips/{jeju['id']}/places/search", params={"query": "시장"}, headers=bearer(minji)).json()

    assert [c["source_place_id"] for c in abroad] == ["ChIJ-dotonbori"]
    assert [c["source_place_id"] for c in home] == ["k1"]
    assert overseas_places.queries == ["도톤보리"]
    assert places.queries == ["시장"]


def test_plan_item_place_is_verified_with_google_on_overseas_trip(client, auth, overseas_places):
    overseas_places.add("ChIJ-castle", "오사카성", lat=34.6873, lng=135.5262)
    osaka, minji = make_trip(client, auth, OSAKA)

    response = client.post(
        f"/trips/{osaka['id']}/plan-items",
        json={"date": "2026-12-01", "title": "오사카성", "place": {"source_place_id": "ChIJ-castle", "name": "오사카성"}},
        headers=bearer(minji),
    )

    assert response.status_code == 201
    assert response.json()["place"]["source_place_id"] == "ChIJ-castle"


def test_overseas_setting_is_locked_once_a_place_exists(client, auth, places):
    places.add("k1", "동문재래시장")
    jeju, minji = make_trip(client, auth, JEJU)
    url = f"/trips/{jeju['id']}"

    assert client.patch(url, json={"is_overseas": True}, headers=bearer(minji)).json()["is_overseas"] is True
    assert client.patch(url, json={"is_overseas": False}, headers=bearer(minji)).status_code == 200
    client.post(f"{url}/plan-items", json={"date": "2026-12-01", "title": "시장", "place": {"source_place_id": "k1", "name": "동문재래시장"}}, headers=bearer(minji))

    locked = client.patch(url, json={"is_overseas": True}, headers=bearer(minji))

    assert locked.status_code == 409
    assert locked.json()["code"] == "places_exist"


def test_overseas_suggestions_use_google_and_fall_back_to_first_result(client, auth, suggester, overseas_places):
    # Gemini가 영어 이름을 줘도 Google이 한국어 이름으로 돌려준다 → 이름은 안 맞지만 첫 결과를 쓴다.
    overseas_places.add("ChIJ-kuromon", "구로몬 시장", address="일본 오사카", aliases=("Kuromon",))
    osaka, minji = make_trip(client, auth, OSAKA)
    stop = SuggestedStop(date=dt.date(2026, 12, 1), order=1, place_name="Kuromon Market", region="오사카 주오구", stay_minutes=60, description="시장")
    suggester.responses = [[stop]]

    body = client.post(f"/trips/{osaka['id']}/suggestions", json={"destination": "오사카", "preferences": ""}, headers=bearer(minji)).json()

    assert suggester.requests[0].overseas is True
    assert body["items"][0]["status"] == "verified"
    assert body["items"][0]["place"]["source_place_id"] == "ChIJ-kuromon"


def test_overseas_prompt_asks_for_google_names():
    request = PlanRequest("오사카", dt.date(2026, 12, 1), dt.date(2026, 12, 2), "", overseas=True)

    prompt = build_prompt(request)

    assert "해외 여행" in prompt and "Google 지도" in prompt
    assert "한국 국내" in build_prompt(PlanRequest("제주", dt.date(2026, 12, 1), dt.date(2026, 12, 2), ""))


GOOGLE_RESPONSE = {
    "places": [
        {
            "id": "ChIJ-dotonbori",
            "displayName": {"text": "도톤보리", "languageCode": "ko"},
            "formattedAddress": "일본 〒542-0071 오사카부 오사카시 주오구 도톤보리",
            "location": {"latitude": 34.6687, "longitude": 135.5013},
            "primaryTypeDisplayName": {"text": "관광 명소"},
        },
        {"id": "x2", "displayName": {"text": "이름만"}, "location": {"latitude": 1, "longitude": 2}},
    ]
}


def google_with(handler):
    return GooglePlaceSearcher("g-key", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_google_searcher_sends_key_field_mask_and_converts_places():
    seen = {}

    def handler(request: httpx.Request):
        seen["key"] = request.headers["X-Goog-Api-Key"]
        seen["mask"] = request.headers["X-Goog-FieldMask"]
        seen["body"] = request.read()
        return httpx.Response(200, json=GOOGLE_RESPONSE)

    results = google_with(handler).search("도톤보리", near=(34.66, 135.50))

    assert seen["key"] == "g-key"
    # 비싼 단계의 필드(별점·영업시간 등)는 받지 않는다.
    assert seen["mask"] == "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName"
    assert b'"textQuery":"' in seen["body"].replace(b" ", b"") and b'"locationBias"' in seen["body"]
    first, second = results
    assert (first.source_place_id, first.name, first.latitude, first.category) == ("ChIJ-dotonbori", "도톤보리", 34.6687, "관광 명소")
    assert (second.address, second.category, second.road_address) == ("", None, None)


def test_google_empty_result_is_empty_list():
    assert google_with(lambda r: httpx.Response(200, json={})).search("없는곳") == []


@pytest.mark.parametrize("response", [httpx.Response(429, json={"error": {"message": "quota"}}), httpx.Response(200, json={"places": [{"id": "x"}]})])
def test_google_errors_are_unavailable(response):
    with pytest.raises(PlaceSearchUnavailable):
        google_with(lambda r: response).search("도톤보리")


def test_google_without_key_is_unavailable():
    with pytest.raises(PlaceSearchUnavailable):
        GooglePlaceSearcher("").search("도톤보리")
