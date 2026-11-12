import uuid

import pytest

from tests.conftest import bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}
MARKET = {"kakao_place_id": "111", "name": "동문시장"}


@pytest.fixture
def trip(client, auth, places):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    client.post("/trips/join", json={"code": code}, headers=bearer(junho))
    places.add("111", "동문시장")
    places.add("333", "새로운 카페")
    plan = client.post(f"/trips/{trip_id}/plan-items", json={"date": "2026-11-12", "title": "점심", "place": MARKET}, headers=bearer(minji)).json()

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho}
        market_id = plan["place"]["id"]

        def url(self, suffix=""):
            return f"/trips/{trip_id}/photos{suffix}"

    return Trip()


def upload(client, trip, who="민지", **form):
    return client.post(trip.url(), files={"file": ("p.jpg", jpeg(), "image/jpeg")}, data={"taken_at": "2026-11-12T13:30:00+09:00", **form}, headers=bearer(trip.tokens[who]))


def link(client, trip, photo_id, who="준호", **body):
    return client.put(trip.url(f"/{photo_id}/place"), json=body, headers=bearer(trip.tokens[who]))


def test_upload_with_trip_place_is_linked_automatically(client, trip):
    body = upload(client, trip, place_id=trip.market_id).json()

    assert body["place"]["name"] == "동문시장"
    assert body["link_type"] == "auto"


def test_upload_without_place_is_classified_by_date_only(client, trip):
    body = upload(client, trip).json()

    assert (body["place"], body["link_type"]) == (None, None)
    assert body["taken_at"] == "2026-11-12T04:30:00Z"


def test_place_of_another_trip_is_rejected(client, trip, auth):
    other, _ = auth.add_user()
    other_trip = client.post("/trips", json=JEJU, headers=bearer(other)).json()["id"]
    other_place = client.post(f"/trips/{other_trip}/plan-items", json={"date": "2026-11-12", "title": "x", "place": MARKET}, headers=bearer(other)).json()["place"]["id"]

    response = upload(client, trip, place_id=other_place)
    unknown = upload(client, trip, place_id=str(uuid.uuid4()))

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "place_id"
    assert unknown.status_code == 422


def test_any_member_changes_link_to_trip_place_and_it_becomes_manual(client, trip):
    photo = upload(client, trip).json()["id"]

    body = link(client, trip, photo, place_id=trip.market_id).json()

    assert (body["place"]["id"], body["link_type"]) == (trip.market_id, "manual")


def test_unlinking_clears_place(client, trip):
    photo = upload(client, trip, place_id=trip.market_id).json()["id"]

    body = link(client, trip, photo).json()

    assert (body["place"], body["link_type"]) == (None, None)


def test_linking_a_searched_place_creates_trip_place(client, trip):
    photo = upload(client, trip).json()["id"]

    body = link(client, trip, photo, kakao_place={"kakao_place_id": "333", "name": "새로운 카페"}).json()

    assert body["place"]["name"] == "새로운 카페"
    assert body["link_type"] == "manual"
    again = link(client, trip, upload(client, trip).json()["id"], kakao_place={"kakao_place_id": "333", "name": "새로운 카페"}).json()
    assert again["place"]["id"] == body["place"]["id"]


def test_unverified_kakao_place_is_rejected(client, trip):
    photo = upload(client, trip).json()["id"]

    response = link(client, trip, photo, kakao_place={"kakao_place_id": "999", "name": "새로운 카페"})

    assert response.status_code == 422
    assert response.json()["code"] == "place_not_verified"


def test_manual_link_stays_manual_in_the_list(client, trip):
    photo = upload(client, trip, place_id=trip.market_id).json()["id"]
    link(client, trip, photo, place_id=trip.market_id)

    listed = client.get(trip.url(), headers=bearer(trip.tokens["민지"])).json()["photos"]

    assert listed[0]["link_type"] == "manual"


def test_both_place_kinds_at_once_is_rejected(client, trip):
    photo = upload(client, trip).json()["id"]

    response = link(client, trip, photo, place_id=trip.market_id, kakao_place={"kakao_place_id": "333", "name": "새로운 카페"})

    assert response.status_code == 422


def test_outsider_cannot_link(client, trip, auth):
    photo = upload(client, trip).json()["id"]
    outsider, _ = auth.add_user()

    response = client.put(trip.url(f"/{photo}/place"), json={"place_id": trip.market_id}, headers=bearer(outsider))

    assert response.status_code == 404
