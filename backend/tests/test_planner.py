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
    places.add("111", "동문시장", lat=33.511, lng=126.526)
    places.add("222", "함덕해수욕장", lat=33.543, lng=126.669)

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho}

        def url(self, suffix=""):
            return f"/trips/{trip_id}{suffix}"

    return Trip()


def add(client, trip, who="민지", **body):
    payload = {"date": "2026-11-12", "title": "일정", **body}
    return client.post(trip.url("/plan-items"), json=payload, headers=bearer(trip.tokens[who]))


def items(client, trip, who="민지"):
    return client.get(trip.url("/plan-items"), headers=bearer(trip.tokens[who])).json()


MARKET = {"kakao_place_id": "111", "name": "동문시장"}


def test_search_returns_kakao_candidates(client, trip, places):
    response = client.get(trip.url("/places/search"), params={"query": "시장"}, headers=bearer(trip.tokens["준호"]))

    assert response.status_code == 200
    assert response.json()[0]["kakao_place_id"] == "111"
    assert response.json()[0]["name"] == "동문시장"
    assert places.queries == ["시장"]


def test_search_failure_is_502(client, trip, places):
    places.unavailable = True

    response = client.get(trip.url("/places/search"), params={"query": "시장"}, headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 502
    assert response.json()["code"] == "place_search_unavailable"


def test_create_plan_item_with_verified_place(client, trip):
    response = add(client, trip, title="점심", time="13:00", memo="천천히 구경", estimated_cost=45000, place=MARKET)

    assert response.status_code == 201
    body = response.json()
    assert (body["title"], body["time"], body["memo"], body["estimated_cost"]) == ("점심", "13:00:00", "천천히 구경", 45000)
    assert body["place"]["name"] == "동문시장"
    assert (body["place"]["latitude"], body["place"]["longitude"]) == (33.511, 126.526)
    assert body["created_by_name"] == "민지"


def test_same_kakao_place_is_one_place(client, trip, engine):
    first = add(client, trip, title="점심", place=MARKET).json()
    second = add(client, trip, date="2026-11-13", title="또 시장", place=MARKET).json()

    assert first["place"]["id"] == second["place"]["id"]
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places")) == 1


def test_place_not_found_on_kakao_is_rejected_and_nothing_saved(client, trip, engine):
    response = add(client, trip, place={"kakao_place_id": "999", "name": "동문시장"})

    assert response.status_code == 422
    assert response.json()["code"] == "place_not_verified"
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places")) == 0
        assert conn.scalar(text("SELECT count(*) FROM plan_items")) == 0


def test_app_supplied_place_details_are_not_trusted(client, trip):
    body = add(client, trip, place={"kakao_place_id": "111", "name": "동문"}).json()

    # 이름으로 다시 찾은 카카오 결과로 저장한다.
    assert body["place"]["name"] == "동문시장"


def test_plan_item_without_place(client, trip):
    body = add(client, trip, title="자유시간").json()

    assert body["place"] is None
    assert body["time"] is None


def test_date_outside_trip_is_rejected(client, trip):
    response = add(client, trip, date="2026-11-15")

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "date"


def test_any_member_can_add_and_edit_others_items(client, trip):
    item = add(client, trip, who="민지", title="민지 일정").json()

    by_junho = add(client, trip, who="준호", title="준호 일정")
    edited = client.put(
        trip.url(f"/plan-items/{item['id']}"),
        json={"date": "2026-11-12", "title": "준호가 고침", "place": MARKET},
        headers=bearer(trip.tokens["준호"]),
    )

    assert by_junho.status_code == 201
    assert edited.status_code == 200
    assert edited.json()["title"] == "준호가 고침"
    assert edited.json()["created_by_name"] == "민지"


def test_member_deletes_only_own_items_and_organizer_deletes_any(client, trip):
    minjis = add(client, trip, who="민지", title="민지 일정").json()["id"]
    junhos = add(client, trip, who="준호", title="준호 일정").json()["id"]
    another = add(client, trip, who="준호", title="준호 일정 2").json()["id"]

    forbidden = client.delete(trip.url(f"/plan-items/{minjis}"), headers=bearer(trip.tokens["준호"]))
    own = client.delete(trip.url(f"/plan-items/{junhos}"), headers=bearer(trip.tokens["준호"]))
    organizer = client.delete(trip.url(f"/plan-items/{another}"), headers=bearer(trip.tokens["민지"]))

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "not_plan_item_owner"
    assert (own.status_code, organizer.status_code) == (204, 204)
    assert [i["title"] for i in items(client, trip)] == ["민지 일정"]


def test_items_are_slotted_by_time_and_untimed_go_last(client, trip):
    add(client, trip, title="점심", time="13:00")
    add(client, trip, title="자유시간")
    add(client, trip, title="아침", time="09:00")
    add(client, trip, title="저녁", time="19:00")

    listed = items(client, trip)

    assert [(i["title"], i["position"]) for i in listed] == [("아침", 0), ("점심", 1), ("저녁", 2), ("자유시간", 3)]


def test_reorder_within_a_day(client, trip):
    ids = [add(client, trip, title=t).json()["id"] for t in ("가", "나", "다")]

    response = client.put(
        trip.url("/plan-items/order"),
        json={"date": "2026-11-12", "item_ids": [ids[2], ids[0], ids[1]]},
        headers=bearer(trip.tokens["준호"]),
    )

    assert response.status_code == 200
    assert [i["title"] for i in items(client, trip)] == ["다", "가", "나"]


def test_reorder_with_stale_list_is_409(client, trip):
    ids = [add(client, trip, title=t).json()["id"] for t in ("가", "나")]
    add(client, trip, title="그사이 추가")

    response = client.put(trip.url("/plan-items/order"), json={"date": "2026-11-12", "item_ids": ids}, headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 409
    assert response.json()["code"] == "plan_changed"


def test_moving_an_item_to_another_day_renumbers_both_days(client, trip):
    first, second, _third = (add(client, trip, title=t).json()["id"] for t in ("가", "나", "다"))

    client.put(trip.url(f"/plan-items/{second}"), json={"date": "2026-11-13", "title": "나"}, headers=bearer(trip.tokens["민지"]))

    listed = [(i["date"], i["title"], i["position"]) for i in items(client, trip)]
    assert listed == [("2026-11-12", "가", 0), ("2026-11-12", "다", 1), ("2026-11-13", "나", 0)]
    assert first


def test_shrinking_period_past_plan_items_is_409_with_dates(client, trip):
    add(client, trip, date="2026-11-13", title="둘째 날")
    add(client, trip, date="2026-11-14", title="셋째 날")
    add(client, trip, date="2026-11-14", title="셋째 날 2")

    response = client.patch(trip.url(), json={"start_date": "2026-11-12", "end_date": "2026-11-12"}, headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 409
    assert response.json()["code"] == "plan_items_outside_period"
    assert [d["message"] for d in response.json()["details"]] == ["2026-11-13", "2026-11-14"]
    assert client.get(trip.url(), headers=bearer(trip.tokens["민지"])).json()["end_date"] == "2026-11-14"


def test_shrinking_period_without_items_on_removed_days_is_fine(client, trip):
    add(client, trip, date="2026-11-12", title="첫날")

    response = client.patch(trip.url(), json={"end_date": "2026-11-13"}, headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 200


def test_items_stay_when_creator_leaves_and_organizer_can_delete_them(client, trip):
    item = add(client, trip, who="준호", title="준호 일정").json()["id"]

    assert client.delete(trip.url("/members/me"), headers=bearer(trip.tokens["준호"])).status_code == 204
    listed = items(client, trip)
    assert listed[0]["created_by_member_id"] is None
    assert client.delete(trip.url(f"/plan-items/{item}"), headers=bearer(trip.tokens["민지"])).status_code == 204


def test_outsider_cannot_see_or_change_plan(client, trip, auth):
    item = add(client, trip, title="비밀").json()["id"]
    outsider, _ = auth.add_user()

    assert client.get(trip.url("/plan-items"), headers=bearer(outsider)).status_code == 404
    assert client.get(trip.url("/places/search"), params={"query": "시장"}, headers=bearer(outsider)).status_code == 404
    assert client.delete(trip.url(f"/plan-items/{item}"), headers=bearer(outsider)).status_code == 404


def test_item_of_another_trip_is_404(client, trip, auth):
    other, _ = auth.add_user()
    other_trip = client.post("/trips", json=JEJU, headers=bearer(other)).json()["id"]
    item = add(client, trip, title="우리 일정").json()["id"]

    response = client.delete(f"/trips/{other_trip}/plan-items/{item}", headers=bearer(other))

    assert response.status_code == 404
    assert response.json()["code"] == "plan_item_not_found"


def test_deleting_trip_removes_places_and_items(client, trip, engine):
    add(client, trip, place=MARKET)

    client.delete(trip.url(), headers=bearer(trip.tokens["민지"]))

    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places")) == 0
        assert conn.scalar(text("SELECT count(*) FROM plan_items")) == 0


def test_unknown_item_id_is_404(client, trip):
    response = client.put(trip.url(f"/plan-items/{uuid.uuid4()}"), json={"date": "2026-11-12", "title": "x"}, headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 404
