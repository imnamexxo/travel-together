"""Google Places 약관 맞추기(ADR 0006): 해외 장소는 id와 30일 안의 좌표만 저장하고, 이름은 볼 때 받는다."""

import datetime as dt

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Place
from app.place_search import GooglePlaceSearcher, PlaceSearchUnavailable
from app.places import purge_expired_google_coords, refresh_places
from tests.conftest import bearer

OSAKA = {"name": "오사카 여행", "start_date": "2026-12-01", "end_date": "2026-12-02", "currency": "JPY", "is_overseas": True}
JEJU = {"name": "제주 여행", "start_date": "2026-12-01", "end_date": "2026-12-02"}
UTC = dt.timezone.utc


def make_trip(client, auth, body):
    minji, _ = auth.add_user(display_name="민지")
    return client.post("/trips", json=body, headers=bearer(minji)).json(), minji


def add_plan(client, trip, token, source_place_id, name, title="오사카성 가기"):
    return client.post(
        f"/trips/{trip['id']}/plan-items",
        json={"date": "2026-12-01", "title": title, "place": {"source_place_id": source_place_id, "name": name}},
        headers=bearer(token),
    )


def stored(engine, source_place_id) -> Place:
    with Session(engine) as session:
        return session.scalars(select(Place).where(Place.source_place_id == source_place_id)).one()


def test_overseas_place_keeps_only_id_and_coords(client, auth, engine, overseas_places):
    overseas_places.add("ChIJ-castle", "오사카성", lat=34.6873, lng=135.5262, address="일본 오사카")
    osaka, minji = make_trip(client, auth, OSAKA)

    response = add_plan(client, osaka, minji, "ChIJ-castle", "오사카성")

    assert response.status_code == 201
    out = response.json()["place"]
    assert (out["source"], out["name"], out["address"], out["category"]) == ("google", None, None, None)
    assert (out["latitude"], out["longitude"]) == (34.6873, 135.5262)
    place = stored(engine, "ChIJ-castle")
    assert (place.name, place.address, place.road_address, place.category) == (None, None, None, None)
    assert place.refreshed_at is not None
    # 이름 검색(Text Search)이 아니라 id 확인(Place Details Essentials)으로 확인한다.
    assert overseas_places.lookups == ["ChIJ-castle"] and overseas_places.queries == []


def test_unknown_google_place_is_rejected(client, auth, overseas_places):
    osaka, minji = make_trip(client, auth, OSAKA)

    response = add_plan(client, osaka, minji, "ChIJ-made-up", "아무데나")

    assert response.status_code == 422
    assert response.json()["code"] == "place_not_verified"


def test_domestic_place_still_keeps_name_and_address(client, auth, engine, places):
    places.add("k1", "동문재래시장", address="제주시 이도1동")
    jeju, minji = make_trip(client, auth, JEJU)

    out = add_plan(client, jeju, minji, "k1", "동문재래시장").json()["place"]

    assert (out["source"], out["name"], out["address"]) == ("kakao", "동문재래시장", "제주시 이도1동")


def test_details_are_fetched_from_google_each_time_and_not_stored(client, auth, engine, overseas_places):
    overseas_places.add("ChIJ-castle", "오사카성", address="일본 오사카부 오사카시")
    osaka, minji = make_trip(client, auth, OSAKA)
    place_id = add_plan(client, osaka, minji, "ChIJ-castle", "오사카성").json()["place"]["id"]
    url = f"/trips/{osaka['id']}/places/{place_id}/details"

    first = client.get(url, headers=bearer(minji))
    client.get(url, headers=bearer(minji))

    assert first.status_code == 200
    assert first.json() == {"name": "오사카성", "address": "일본 오사카부 오사카시"}
    assert overseas_places.detail_requests == ["ChIJ-castle", "ChIJ-castle"]
    assert stored(engine, "ChIJ-castle").name is None


def test_domestic_details_come_from_the_database(client, auth, places):
    places.add("k1", "동문재래시장", address="제주시 이도1동")
    jeju, minji = make_trip(client, auth, JEJU)
    place_id = add_plan(client, jeju, minji, "k1", "동문재래시장").json()["place"]["id"]

    body = client.get(f"/trips/{jeju['id']}/places/{place_id}/details", headers=bearer(minji)).json()

    assert body == {"name": "동문재래시장", "address": "제주시 이도1동"}


def test_details_errors(client, auth, overseas_places):
    overseas_places.add("ChIJ-castle", "오사카성")
    osaka, minji = make_trip(client, auth, OSAKA)
    place_id = add_plan(client, osaka, minji, "ChIJ-castle", "오사카성").json()["place"]["id"]
    url = f"/trips/{osaka['id']}/places/{place_id}/details"
    stranger, _ = auth.add_user(display_name="남")

    assert client.get(url, headers=bearer(stranger)).status_code in (403, 404)
    overseas_places.unavailable = True
    down = client.get(url, headers=bearer(minji))
    assert (down.status_code, down.json()["code"]) == (502, "place_search_unavailable")
    overseas_places.unavailable = False
    overseas_places.places.clear()
    gone = client.get(url, headers=bearer(minji))
    assert (gone.status_code, gone.json()["code"]) == (404, "place_not_found")


def set_fetched_at(engine, source_place_id, when):
    with Session(engine) as session:
        place = session.scalars(select(Place).where(Place.source_place_id == source_place_id)).one()
        place.refreshed_at = when
        session.commit()


def test_refresh_renews_only_coords_older_than_29_days(client, auth, engine, overseas_places):
    overseas_places.add("ChIJ-old", "오래된 곳", lat=1.0, lng=2.0)
    overseas_places.add("ChIJ-new", "새 곳", lat=3.0, lng=4.0)
    osaka, minji = make_trip(client, auth, OSAKA)
    add_plan(client, osaka, minji, "ChIJ-old", "오래된 곳")
    add_plan(client, osaka, minji, "ChIJ-new", "새 곳")
    now = dt.datetime(2027, 1, 1, tzinfo=UTC)
    set_fetched_at(engine, "ChIJ-old", now - dt.timedelta(days=29, hours=1))
    set_fetched_at(engine, "ChIJ-new", now - dt.timedelta(days=5))
    overseas_places.places[0] = overseas_places.places[0].__class__("ChIJ-old", "오래된 곳", "", None, 1.5, 2.5, None)
    overseas_places.lookups.clear()

    with Session(engine) as session:
        assert refresh_places(session, {"google": overseas_places}, now) == 1

    old = stored(engine, "ChIJ-old")
    assert (old.latitude, old.longitude, old.refreshed_at) == (1.5, 2.5, now)
    assert overseas_places.lookups == ["ChIJ-old"]


def test_refresh_clears_coords_of_places_gone_from_google(client, auth, engine, overseas_places):
    overseas_places.add("ChIJ-closed", "폐업한 곳")
    osaka, minji = make_trip(client, auth, OSAKA)
    add_plan(client, osaka, minji, "ChIJ-closed", "폐업한 곳")
    now = dt.datetime(2027, 1, 1, tzinfo=UTC)
    set_fetched_at(engine, "ChIJ-closed", now - dt.timedelta(days=29, hours=1))
    overseas_places.places.clear()

    with Session(engine) as session:
        refresh_places(session, {"google": overseas_places}, now)

    gone = stored(engine, "ChIJ-closed")
    assert (gone.latitude, gone.longitude) == (None, None)


def test_coords_are_deleted_after_30_days_when_google_is_down(client, auth, engine, overseas_places):
    overseas_places.add("ChIJ-a", "가")
    overseas_places.add("ChIJ-b", "나")
    osaka, minji = make_trip(client, auth, OSAKA)
    add_plan(client, osaka, minji, "ChIJ-a", "가")
    add_plan(client, osaka, minji, "ChIJ-b", "나")
    now = dt.datetime(2027, 1, 1, tzinfo=UTC)
    set_fetched_at(engine, "ChIJ-a", now - dt.timedelta(days=31))
    set_fetched_at(engine, "ChIJ-b", now - dt.timedelta(days=29, hours=12))
    overseas_places.unavailable = True

    with Session(engine) as session:
        assert refresh_places(session, {"google": overseas_places}, now) == 0
        purge_expired_google_coords(session, now)

    assert stored(engine, "ChIJ-a").latitude is None
    # 아직 30일이 안 됐으면 다음 갱신을 기다린다.
    assert stored(engine, "ChIJ-b").latitude is not None


def test_map_returns_overseas_place_without_coords(client, auth, engine, overseas_places):
    overseas_places.add("ChIJ-a", "가")
    osaka, minji = make_trip(client, auth, OSAKA)
    add_plan(client, osaka, minji, "ChIJ-a", "가")
    with Session(engine) as session:
        purge_expired_google_coords(session, dt.datetime(2030, 1, 1, tzinfo=UTC))

    places = client.get(f"/trips/{osaka['id']}/map", headers=bearer(minji)).json()["places"]

    assert [(p["place"]["latitude"], p["plan_items"][0]["title"]) for p in places] == [(None, "오사카성 가기")]


def google_with(handler):
    return GooglePlaceSearcher("g-key", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_google_lookup_asks_only_for_id_and_location():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["mask"] = str(request.url), request.headers["X-Goog-FieldMask"]
        return httpx.Response(200, json={"id": "ChIJ/x", "location": {"latitude": 34.1, "longitude": 135.2}})

    found = google_with(handler).lookup("ChIJ/x", "무시되는 이름")

    # Essentials 단계 필드만. 경로에 넣는 id는 이스케이프한다.
    assert seen["mask"] == "id,location"
    assert seen["url"].startswith("https://places.googleapis.com/v1/places/ChIJ%2Fx?")
    assert (found.source_place_id, found.name, found.latitude, found.longitude) == ("ChIJ/x", "", 34.1, 135.2)


def test_google_details_ask_for_name_and_address():
    seen = {}

    def handler(request: httpx.Request):
        seen["mask"] = request.headers["X-Goog-FieldMask"]
        return httpx.Response(200, json={"id": "x", "displayName": {"text": "오사카성"}, "formattedAddress": "일본 오사카"})

    details = google_with(handler).details("x")

    assert seen["mask"] == "id,displayName,formattedAddress"
    assert (details.name, details.address) == ("오사카성", "일본 오사카")


@pytest.mark.parametrize("status", [400, 404])
def test_google_missing_place_is_none(status):
    searcher = google_with(lambda r: httpx.Response(status, json={"error": {"status": "NOT_FOUND"}}))

    assert searcher.lookup("gone", "") is None
    assert searcher.details("gone") is None


def test_google_quota_is_unavailable():
    searcher = google_with(lambda r: httpx.Response(429, json={"error": {"message": "quota"}}))

    with pytest.raises(PlaceSearchUnavailable):
        searcher.details("x")
    with pytest.raises(PlaceSearchUnavailable):
        searcher.lookup("x", "")


# 카카오(국내) 장소: 저장은 되지만 최신으로 유지해야 한다(카카오 운영정책 제5조).


def test_kakao_place_is_refreshed_after_29_days_with_latest_details(client, auth, engine, places):
    places.add("k1", "동문재래시장", lat=33.5, lng=126.5, address="제주시 이도1동")
    jeju, minji = make_trip(client, auth, JEJU)
    add_plan(client, jeju, minji, "k1", "동문재래시장")
    now = dt.datetime(2027, 1, 1, tzinfo=UTC)
    set_fetched_at(engine, "k1", now - dt.timedelta(days=29, hours=1))
    # 그사이 카카오에서 주소와 좌표가 바뀌었다.
    places.places[0] = places.places[0].__class__("k1", "동문재래시장", "제주시 일도1동", "제주시 관덕로 1", 33.51, 126.52, "시장")
    places.queries.clear()

    with Session(engine) as session:
        assert refresh_places(session, {"kakao": places}, now) == 1

    fresh = stored(engine, "k1")
    assert (fresh.address, fresh.road_address, fresh.latitude, fresh.refreshed_at) == ("제주시 일도1동", "제주시 관덕로 1", 33.51, now)
    # 카카오에는 id로 찾는 API가 없어 저장된 이름으로 다시 검색한다.
    assert places.queries == ["동문재래시장"]


def test_kakao_place_missing_from_search_keeps_its_details_and_waits(client, auth, engine, places):
    places.add("k1", "없어진 가게")
    jeju, minji = make_trip(client, auth, JEJU)
    add_plan(client, jeju, minji, "k1", "없어진 가게")
    now = dt.datetime(2027, 1, 1, tzinfo=UTC)
    set_fetched_at(engine, "k1", now - dt.timedelta(days=40))
    places.places.clear()

    with Session(engine) as session:
        assert refresh_places(session, {"kakao": places}, now) == 0
        # 30일 뒤에 다시 본다. 같은 시간에 또 묻지 않는다.
        places.queries.clear()
        refresh_places(session, {"kakao": places}, now + dt.timedelta(hours=1))

    kept = stored(engine, "k1")
    assert (kept.name, kept.latitude, kept.refreshed_at) == ("없어진 가게", 33.5, now)
    assert places.queries == []


def test_kakao_down_stops_the_round_without_changing_places(client, auth, engine, places):
    places.add("k1", "시장")
    jeju, minji = make_trip(client, auth, JEJU)
    add_plan(client, jeju, minji, "k1", "시장")
    old = dt.datetime(2026, 11, 1, tzinfo=UTC)
    set_fetched_at(engine, "k1", old)
    places.unavailable = True

    with Session(engine) as session:
        assert refresh_places(session, {"kakao": places}, dt.datetime(2027, 1, 1, tzinfo=UTC)) == 0

    assert stored(engine, "k1").refreshed_at == old
