"""일정 가져오기: 다른 여행에서 복사, 써 둔 계획 글을 일정 후보로 바꾸기."""

import datetime as dt

from sqlalchemy import text

from app.gemini import ImportRequest, SuggestedStop
from app.routers.suggestions import DAILY_LIMIT
from tests.conftest import bearer

LAST_YEAR = {"name": "작년 제주", "start_date": "2025-11-12", "end_date": "2025-11-14"}
THIS_YEAR = {"name": "올해 제주", "start_date": "2026-12-01", "end_date": "2026-12-02"}
OSAKA = {"name": "오사카", "start_date": "2026-12-01", "end_date": "2026-12-03", "currency": "JPY", "is_overseas": True}


def post(client, token, url, body):
    return client.post(url, json=body, headers=bearer(token))


def make_trips(client, auth, places):
    minji, _ = auth.add_user(display_name="민지")
    places.add("111", "동문재래시장", lat=33.511, lng=126.526, aliases=("동문시장",))
    old = post(client, minji, "/trips", LAST_YEAR).json()["id"]
    new = post(client, minji, "/trips", THIS_YEAR).json()["id"]
    items = [
        post(client, minji, f"/trips/{old}/plan-items", {"date": "2025-11-12", "time": "12:00", "title": "시장 점심", "memo": "고기국수", "estimated_cost": 15000,
                                                         "place": {"source_place_id": "111", "name": "동문시장"}}).json(),
        post(client, minji, f"/trips/{old}/plan-items", {"date": "2025-11-12", "title": "카페"}).json(),
        post(client, minji, f"/trips/{old}/plan-items", {"date": "2025-11-14", "title": "공항"}).json(),
    ]
    return minji, old, new, [i["id"] for i in items]


def test_copy_moves_dates_keeps_details_and_skips_days_outside(client, auth, places):
    minji, old, new, ids = make_trips(client, auth, places)

    response = post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": old, "item_ids": ids, "first_date": "2026-12-01"})

    assert response.status_code == 201
    body = response.json()
    assert (body["skipped"], body["places_dropped"]) == (1, 0)
    assert [(i["date"], i["time"], i["title"], i["memo"], i["estimated_cost"]) for i in body["items"]] == [
        ("2026-12-01", "12:00:00", "시장 점심", "고기국수", 15000),
        ("2026-12-01", None, "카페", "", None),
    ]
    assert body["items"][0]["place"]["source_place_id"] == "111"
    assert len(client.get(f"/trips/{old}/plan-items", headers=bearer(minji)).json()) == 3


def test_copy_can_start_on_a_later_day(client, auth, places):
    minji, old, new, ids = make_trips(client, auth, places)

    body = post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": old, "item_ids": ids[:2], "first_date": "2026-12-02"}).json()

    assert [i["date"] for i in body["items"]] == ["2026-12-02", "2026-12-02"]


def test_copy_reuses_a_place_already_in_the_trip_and_does_not_lookup_again(client, auth, places, engine):
    minji, old, new, ids = make_trips(client, auth, places)
    post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": old, "item_ids": ids[:1], "first_date": "2026-12-01"})
    post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": old, "item_ids": ids[:1], "first_date": "2026-12-02"})

    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places WHERE trip_id = :t"), {"t": new}) == 1
        old_refreshed, new_refreshed = (conn.scalar(text("SELECT refreshed_at FROM places WHERE trip_id = :t"), {"t": t}) for t in (old, new))
    assert old_refreshed == new_refreshed


def test_copy_to_overseas_trip_drops_kakao_places(client, auth, places):
    minji, old, _, ids = make_trips(client, auth, places)
    osaka = post(client, minji, "/trips", OSAKA).json()["id"]

    body = post(client, minji, f"/trips/{osaka}/plan-items/copy", {"source_trip_id": old, "item_ids": ids, "first_date": "2026-12-01"}).json()

    assert (len(body["items"]), body["skipped"], body["places_dropped"]) == (3, 0, 1)
    assert all(i["place"] is None for i in body["items"])


def test_copy_needs_membership_of_both_trips_and_a_different_trip(client, auth, places):
    minji, old, new, ids = make_trips(client, auth, places)
    stranger, _ = auth.add_user(display_name="남")
    theirs = post(client, stranger, "/trips", LAST_YEAR).json()["id"]

    assert post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": theirs, "item_ids": ids, "first_date": "2026-12-01"}).status_code == 404
    assert post(client, stranger, f"/trips/{new}/plan-items/copy", {"source_trip_id": old, "item_ids": ids, "first_date": "2026-12-01"}).status_code == 404
    assert post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": new, "item_ids": ids, "first_date": "2026-12-01"}).status_code == 422
    assert post(client, minji, f"/trips/{new}/plan-items/copy", {"source_trip_id": old, "item_ids": ids, "first_date": "2026-12-09"}).status_code == 422


def stop(day, order, name, region="제주시", at=None, memo=""):
    return SuggestedStop.model_validate({"date": day, "order": order, "place_name": name, "region": region, "stay_minutes": 60, "description": memo, "start_time": at or ""})


def test_pasted_text_becomes_candidates_and_non_places_are_not_searched(client, auth, places, suggester):
    minji, _, new, _ = make_trips(client, auth, places)
    places.queries.clear()
    suggester.responses = [[
        stop("2026-12-01", 1, "호텔 체크인", region="", at="15:00"),
        stop("2026-12-01", 2, "동문시장", at="18:00", memo="고기국수"),
    ]]

    response = post(client, minji, f"/trips/{new}/suggestions/import", {"text": "1일차\n15시 체크인\n18시 동문시장 고기국수"})

    assert response.status_code == 201
    body = response.json()
    assert body["destination"] == "붙여 넣은 계획"
    assert [(i["place_name"], i["status"], i["start_time"], i["description"]) for i in body["items"]] == [
        ("호텔 체크인", "needs_check", "15:00:00", ""),
        ("동문시장", "verified", "18:00:00", "고기국수"),
    ]
    assert places.queries == ["동문시장 제주시"]
    request = suggester.requests[0]
    assert isinstance(request, ImportRequest)
    assert (request.text, request.start_date, request.end_date, request.overseas) == ("1일차\n15시 체크인\n18시 동문시장 고기국수", dt.date(2026, 12, 1), dt.date(2026, 12, 2), False)

    adopted = post(client, minji, f"/trips/{new}/suggestions/{body['id']}/adopt", {"item_ids": [i["id"] for i in body["items"]]}).json()
    assert [(i["title"], i["time"], i["place"] is not None) for i in adopted] == [("호텔 체크인", "15:00:00", False), ("동문시장", "18:00:00", True)]


def test_same_text_is_reused_and_empty_result_is_explained(client, auth, places, suggester):
    minji, _, new, _ = make_trips(client, auth, places)
    suggester.responses = [[stop("2026-12-01", 1, "동문시장")], []]

    first = post(client, minji, f"/trips/{new}/suggestions/import", {"text": "동문시장"})
    again = post(client, minji, f"/trips/{new}/suggestions/import", {"text": "동문시장"})
    nothing = post(client, minji, f"/trips/{new}/suggestions/import", {"text": "아무 말"})

    assert (first.status_code, again.status_code, again.json()["reused"]) == (201, 200, True)
    assert nothing.status_code == 422
    assert nothing.json()["code"] == "no_plans_found"


def test_import_shares_the_daily_limit_with_suggestions(client, auth, places, suggester):
    minji, _, new, _ = make_trips(client, auth, places)
    suggester.responses = [[stop("2026-12-01", 1, f"장소{n}")] for n in range(DAILY_LIMIT)]
    for n in range(DAILY_LIMIT):
        assert post(client, minji, f"/trips/{new}/suggestions/import", {"text": f"계획 {n}"}).status_code == 201

    assert post(client, minji, f"/trips/{new}/suggestions/import", {"text": "하나 더"}).status_code == 429
    assert post(client, minji, f"/trips/{new}/suggestions", {"destination": "제주"}).status_code == 429


def test_text_length_is_limited(client, auth, places):
    minji, _, new, _ = make_trips(client, auth, places)

    assert post(client, minji, f"/trips/{new}/suggestions/import", {"text": "가" * 3001}).status_code == 422
    assert post(client, minji, f"/trips/{new}/suggestions/import", {"text": "   "}).status_code == 422
