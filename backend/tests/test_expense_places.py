import uuid

import pytest
from sqlalchemy import text

from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


@pytest.fixture
def trip(client, auth, places):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    client.post("/trips/join", json={"code": code}, headers=bearer(junho))
    places.add("901", "제주 편의점 시청점")
    places.add("902", "제주 편의점 공항점")
    # 공항점은 이미 이 여행의 장소다(일정에 들어 있음).
    client.post(f"/trips/{trip_id}/plan-items", json={"date": "2026-11-12", "title": "도착", "place": {"source_place_id": "902", "name": "제주 편의점 공항점"}}, headers=bearer(minji))
    me = client.get(f"/trips/{trip_id}", headers=bearer(minji)).json()["me"]["member_id"]

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho}
        organizer_member = me

        def url(self, suffix=""):
            return f"/trips/{trip_id}{suffix}"

    return Trip()


def candidates(client, trip, query, who="민지"):
    return client.get(trip.url("/expenses/place-candidates"), params={"query": query}, headers=bearer(trip.tokens[who]))


def create(client, trip, **body):
    payload = {"idempotency_key": str(uuid.uuid4()), "merchant_name": "제주 편의점", "payer_member_id": trip.organizer_member, **body}
    return client.post(trip.url("/expenses"), json=payload, headers=bearer(trip.tokens["민지"]))


def test_candidates_put_trip_places_first(client, trip, places):
    response = candidates(client, trip, "제주 편의점")

    assert response.status_code == 200
    assert [(c["name"], c["in_trip"]) for c in response.json()] == [("제주 편의점 공항점", True), ("제주 편의점 시청점", False)]
    assert places.queries[-1] == "제주 편의점"


def test_organizer_can_search_again_with_another_query(client, trip, places):
    places.add("903", "동문시장 떡볶이")

    response = candidates(client, trip, "떡볶이")

    assert [c["name"] for c in response.json()] == ["동문시장 떡볶이"]


def test_regular_member_cannot_get_candidates(client, trip):
    assert candidates(client, trip, "제주", who="준호").status_code == 403


def test_expense_has_no_place_unless_chosen(client, trip):
    body = create(client, trip).json()

    assert body["place"] is None


def test_chosen_candidate_reuses_trip_place(client, trip, engine):
    body = create(client, trip, place={"source_place_id": "902", "name": "제주 편의점 공항점"}).json()

    plan_place = client.get(trip.url("/plan-items"), headers=bearer(trip.tokens["민지"])).json()[0]["place"]
    assert body["place"]["id"] == plan_place["id"]
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places")) == 1


def test_new_candidate_becomes_trip_place_and_can_be_cleared(client, trip):
    expense = create(client, trip, place={"source_place_id": "901", "name": "제주 편의점 시청점"}).json()
    assert expense["place"]["name"] == "제주 편의점 시청점"

    cleared = client.put(trip.url(f"/expenses/{expense['id']}"), json={"merchant_name": "제주 편의점", "place": None}, headers=bearer(trip.tokens["민지"])).json()

    assert cleared["place"] is None


def test_expense_list_shows_place(client, trip):
    create(client, trip, place={"source_place_id": "901", "name": "제주 편의점 시청점"})

    listed = client.get(trip.url("/expenses"), headers=bearer(trip.tokens["준호"])).json()

    assert listed[0]["place"]["name"] == "제주 편의점 시청점"
    assert listed[0]["place"]["latitude"] == 33.5


def test_unverified_place_is_rejected(client, trip):
    response = create(client, trip, place={"source_place_id": "999", "name": "제주 편의점"})

    assert response.status_code == 422
    assert response.json()["code"] == "place_not_verified"
