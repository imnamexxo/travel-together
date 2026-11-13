"""지도 데이터(#16): 장소 핀, 들른 곳 여부, 날짜·멤버 필터."""

import uuid

import pytest

from tests.conftest import bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


@pytest.fixture
def trip(client, auth, places):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    client.post("/trips/join", json={"code": code}, headers=bearer(junho))
    for kakao_id, name in [("1", "동문시장"), ("2", "함덕해수욕장"), ("3", "성산일출봉"), ("4", "흑돼지 식당")]:
        places.add(kakao_id, name)
    h = bearer(minji)
    url = f"/trips/{trip_id}"
    plan = lambda date, title, kakao, name: client.post(f"{url}/plan-items", json={"date": date, "title": title, "place": {"source_place_id": kakao, "name": name}}, headers=h).json()
    market = plan("2026-11-12", "점심", "1", "동문시장")["place"]["id"]
    beach = plan("2026-11-12", "산책", "2", "함덕해수욕장")["place"]["id"]
    peak = plan("2026-11-13", "일출", "3", "성산일출봉")["place"]["id"]
    members = {m["display_name"]: m["member_id"] for m in client.get(f"{url}/members", headers=h).json()}

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho}
        member = members
        place = {"market": market, "beach": beach, "peak": peak}

    return Trip()


def photo(client, trip, who, taken_at, place_id=None):
    data = {"taken_at": taken_at, **({"place_id": place_id} if place_id else {})}
    return client.post(f"/trips/{trip.id}/photos", files={"file": ("p.jpg", jpeg(), "image/jpeg")}, data=data, headers=bearer(trip.tokens[who])).json()


def expense(client, trip, payer, paid_at, total, *, place=None, confirm=True):
    m = trip.member
    body = {
        "idempotency_key": str(uuid.uuid4()), "payer_member_id": m[payer], "merchant_name": "가게", "paid_at": paid_at,
        "total_amount": total, "default_sharer_ids": [m["민지"], m["준호"]],
        "items": [{"name": "음식", "amount": total, "sharer_ids": [m["민지"], m["준호"]]}],
        **({"place": place} if place else {}),
    }
    h = bearer(trip.tokens["민지"])
    expense_id = client.post(f"/trips/{trip.id}/expenses", json=body, headers=h).json()["id"]
    if confirm:
        assert client.post(f"/trips/{trip.id}/expenses/{expense_id}/confirm", headers=h).status_code == 200


def map_data(client, trip, who="준호", **params):
    return client.get(f"/trips/{trip.id}/map", params=params, headers=bearer(trip.tokens[who]))


def by_name(body):
    return {p["place"]["name"]: p for p in body["places"]}


def test_places_with_visited_flag_plans_photos_and_expense_summary(client, trip):
    photo(client, trip, "준호", "2026-11-12T13:30:00+09:00", trip.place["market"])
    photo(client, trip, "민지", "2026-11-12T14:00:00+09:00")  # 장소 없음
    expense(client, trip, "민지", "2026-11-12T12:40:00+09:00", 30000, place={"source_place_id": "1", "name": "동문시장"})
    expense(client, trip, "민지", "2026-11-12T12:50:00+09:00", 9999, place={"source_place_id": "1", "name": "동문시장"}, confirm=False)
    # 일정에 없던 곳도 확정 지출이 있으면 들른 곳이다.
    expense(client, trip, "준호", "2026-11-12T19:00:00+09:00", 40000, place={"source_place_id": "4", "name": "흑돼지 식당"})

    body = map_data(client, trip).json()

    assert [p["place"]["name"] for p in body["places"]] == ["동문시장", "함덕해수욕장", "성산일출봉", "흑돼지 식당"]
    places = by_name(body)
    market = places["동문시장"]
    assert (market["visited"], market["visited_dates"], market["expense_count"], market["expense_total"]) == (True, ["2026-11-12"], 1, 30000)
    assert [i["title"] for i in market["plan_items"]] == ["점심"]
    assert len(market["photos"]) == 1 and market["photos"][0]["url"].startswith("https://storage.test/")
    assert (places["함덕해수욕장"]["visited"], places["함덕해수욕장"]["visited_dates"]) == (False, [])
    assert (places["흑돼지 식당"]["visited"], places["흑돼지 식당"]["plan_items"]) == (True, [])
    assert body["unlinked_photo_count"] == 1


def test_date_filter_keeps_places_planned_or_visited_that_day(client, trip):
    # 성산일출봉은 13일 계획이지만 12일에 사진을 찍었다.
    photo(client, trip, "준호", "2026-11-12T07:00:00+09:00", trip.place["peak"])

    day1 = by_name(map_data(client, trip, date="2026-11-12").json())
    day2 = by_name(map_data(client, trip, date="2026-11-13").json())

    assert set(day1) == {"동문시장", "함덕해수욕장", "성산일출봉"}
    assert (day1["성산일출봉"]["plan_items"], day1["성산일출봉"]["visited"]) == ([], True)
    assert set(day2) == {"성산일출봉"}
    assert (len(day2["성산일출봉"]["plan_items"]), day2["성산일출봉"]["visited"], day2["성산일출봉"]["photos"]) == (1, False, [])


def test_member_filter_keeps_places_where_that_member_took_photos_or_paid(client, trip):
    photo(client, trip, "준호", "2026-11-12T13:30:00+09:00", trip.place["market"])
    expense(client, trip, "민지", "2026-11-12T16:00:00+09:00", 12000, place={"source_place_id": "2", "name": "함덕해수욕장"})

    junho = by_name(map_data(client, trip, member_id=trip.member["준호"]).json())
    minji = by_name(map_data(client, trip, member_id=trip.member["민지"]).json())

    assert set(junho) == {"동문시장"} and len(junho["동문시장"]["plan_items"]) == 1
    assert set(minji) == {"함덕해수욕장"} and minji["함덕해수욕장"]["photos"] == []


def test_member_of_another_trip_is_rejected_and_outsiders_get_404(client, trip, auth):
    assert map_data(client, trip, member_id=str(uuid.uuid4())).status_code == 422
    stranger, _ = auth.add_user()
    assert client.get(f"/trips/{trip.id}/map", headers=bearer(stranger)).status_code == 404
