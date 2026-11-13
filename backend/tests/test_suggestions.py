import datetime as dt

import pytest
from sqlalchemy import text

from app.gemini import SuggestedStop, SuggestionFormatError, SuggestionUnavailable
from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-13"}
ASK = {"destination": "제주", "preferences": "맛집 위주"}


def stop(day, order, name, region="제주시"):
    return SuggestedStop(date=dt.date.fromisoformat(day), order=order, place_name=name, region=region, stay_minutes=60, description=f"{name} 설명")


PLAN = [
    stop("2026-11-12", 1, "동문시장"),
    stop("2026-11-12", 2, "지어낸 가게"),
    stop("2026-11-13", 1, "함덕해수욕장"),
]


@pytest.fixture
def trip(client, auth, places):
    minji, _ = auth.add_user(display_name="민지")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    places.add("111", "동문재래시장", lat=33.511, lng=126.526, aliases=("동문시장",))
    places.add("222", "함덕해수욕장", lat=33.543, lng=126.669)

    class Trip:
        id = trip_id
        token = minji

        def url(self, suffix=""):
            return f"/trips/{trip_id}{suffix}"

    return Trip()


def ask(client, trip, body=ASK):
    return client.post(trip.url("/suggestions"), json=body, headers=bearer(trip.token))


def test_suggestions_are_checked_against_kakao(client, trip, suggester, places):
    suggester.responses = [PLAN]

    response = ask(client, trip)

    assert response.status_code == 201
    body = response.json()
    assert body["reused"] is False
    assert [(i["date"], i["order"], i["place_name"], i["status"]) for i in body["items"]] == [
        ("2026-11-12", 1, "동문시장", "verified"),
        ("2026-11-12", 2, "지어낸 가게", "needs_check"),
        ("2026-11-13", 1, "함덕해수욕장", "verified"),
    ]
    assert body["items"][0]["place"]["source_place_id"] == "111"
    assert body["items"][1]["place"] is None
    assert "동문시장 제주시" in places.queries
    request = suggester.requests[0]
    assert (request.destination, request.preferences, request.start_date, request.end_date) == ("제주", "맛집 위주", dt.date(2026, 11, 12), dt.date(2026, 11, 13))


def test_suggestions_do_not_create_places_until_adopted(client, trip, suggester, engine):
    suggester.responses = [PLAN]

    ask(client, trip)

    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places")) == 0


def test_only_chosen_cards_become_plan_items_and_existing_items_stay(client, trip, suggester):
    client.post(trip.url("/plan-items"), json={"date": "2026-11-12", "title": "원래 일정"}, headers=bearer(trip.token))
    suggester.responses = [PLAN]
    result = ask(client, trip).json()
    chosen = [result["items"][0]["id"], result["items"][1]["id"]]

    response = client.post(trip.url(f"/suggestions/{result['id']}/adopt"), json={"item_ids": chosen}, headers=bearer(trip.token))

    assert response.status_code == 200
    assert [(p["title"], p["memo"], p["place"] and p["place"]["name"]) for p in response.json()] == [
        ("동문시장", "동문시장 설명", "동문재래시장"),
        ("지어낸 가게", "지어낸 가게 설명", None),
    ]
    items = client.get(trip.url("/plan-items"), headers=bearer(trip.token)).json()
    assert [i["title"] for i in items] == ["원래 일정", "동문시장", "지어낸 가게"]


def test_adopted_place_reuses_existing_place(client, trip, suggester, engine):
    client.post(
        trip.url("/plan-items"),
        json={"date": "2026-11-12", "title": "시장", "place": {"source_place_id": "111", "name": "동문재래시장"}},
        headers=bearer(trip.token),
    )
    suggester.responses = [PLAN]
    result = ask(client, trip).json()

    adopted = client.post(trip.url(f"/suggestions/{result['id']}/adopt"), json={"item_ids": [result["items"][0]["id"]]}, headers=bearer(trip.token)).json()

    existing = client.get(trip.url("/plan-items"), headers=bearer(trip.token)).json()[0]
    assert adopted[0]["place"]["id"] == existing["place"]["id"]
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM places")) == 1


def test_adopting_twice_does_not_duplicate(client, trip, suggester):
    suggester.responses = [PLAN]
    result = ask(client, trip).json()
    body = {"item_ids": [result["items"][0]["id"]]}

    client.post(trip.url(f"/suggestions/{result['id']}/adopt"), json=body, headers=bearer(trip.token))
    again = client.post(trip.url(f"/suggestions/{result['id']}/adopt"), json=body, headers=bearer(trip.token))

    assert again.json() == []
    assert len(client.get(trip.url("/plan-items"), headers=bearer(trip.token)).json()) == 1
    assert ask(client, trip).json()["items"][0]["adopted"] is True


def test_same_input_reuses_saved_result_without_calling_gemini(client, trip, suggester):
    suggester.responses = [PLAN]
    first = ask(client, trip).json()

    second = ask(client, trip, {"destination": " 제주 ", "preferences": "맛집 위주"})

    assert second.status_code == 200
    assert second.json()["reused"] is True
    assert second.json()["id"] == first["id"]
    assert len(suggester.requests) == 1


def test_bad_format_is_retried_once(client, trip, suggester):
    suggester.responses = [SuggestionFormatError("깨짐"), PLAN]

    response = ask(client, trip)

    assert response.status_code == 201
    assert len(suggester.requests) == 2


def test_bad_format_twice_is_502_and_nothing_saved(client, trip, suggester, engine):
    suggester.responses = [SuggestionFormatError("깨짐"), SuggestionFormatError("또 깨짐")]

    response = ask(client, trip)

    assert response.status_code == 502
    assert response.json()["code"] == "ai_bad_response"
    assert len(suggester.requests) == 2
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM suggestion_requests")) == 0


def test_gemini_unavailable_is_502_without_retry(client, trip, suggester):
    suggester.responses = [SuggestionUnavailable("down")]

    response = ask(client, trip)

    assert response.status_code == 502
    assert response.json()["code"] == "ai_unavailable"
    assert len(suggester.requests) == 1


def test_eleventh_new_request_of_the_day_is_429(client, trip, suggester):
    suggester.responses = [PLAN] * 10
    for n in range(10):
        assert ask(client, trip, {"destination": "제주", "preferences": f"취향 {n}"}).status_code == 201

    eleventh = ask(client, trip, {"destination": "제주", "preferences": "새 취향"})
    reused = ask(client, trip, {"destination": "제주", "preferences": "취향 3"})

    assert eleventh.status_code == 429
    assert eleventh.json()["code"] == "suggestion_limit"
    assert "내일 0시" in eleventh.json()["message"]
    assert reused.status_code == 200


def test_kakao_failure_marks_items_as_needs_check(client, trip, suggester, places):
    suggester.responses = [PLAN]
    places.unavailable = True

    body = ask(client, trip).json()

    assert {i["status"] for i in body["items"]} == {"needs_check"}


def test_outsider_and_other_trip_cannot_use_suggestions(client, trip, suggester, auth):
    suggester.responses = [PLAN]
    result = ask(client, trip).json()
    outsider, _ = auth.add_user()
    other_trip = client.post("/trips", json=JEJU, headers=bearer(outsider)).json()["id"]

    assert client.post(trip.url("/suggestions"), json=ASK, headers=bearer(outsider)).status_code == 404
    response = client.post(f"/trips/{other_trip}/suggestions/{result['id']}/adopt", json={"item_ids": [result["items"][0]["id"]]}, headers=bearer(outsider))
    assert response.status_code == 404
    assert response.json()["code"] == "suggestion_not_found"


@pytest.mark.parametrize(
    ("suggested", "found", "same"),
    [
        ("동문시장", "동문재래시장", True),
        ("함덕 해수욕장", "함덕해수욕장", True),
        ("성산일출봉", "성산일출봉 매표소", True),
        ("카페", "제주 오션뷰 디저트 카페 본점", False),
        ("한라산", "한라수목원", False),
        ("", "한라산", False),
    ],
)
def test_names_match(suggested, found, same):
    from app.routers.suggestions import names_match

    assert names_match(suggested, found) is same
