"""여행 통화(ADR 0004)."""

import uuid

import pytest

from app.currency import format_money
from tests.conftest import bearer

OSAKA = {"name": "오사카 여행", "start_date": "2026-12-01", "end_date": "2026-12-03"}


def make_trip(client, auth, **extra):
    minji, _ = auth.add_user(display_name="민지")
    response = client.post("/trips", json={**OSAKA, **extra}, headers=bearer(minji))
    return response, minji


def test_new_trip_is_won_by_default(client, auth):
    response, minji = make_trip(client, auth)

    assert response.json()["currency"] == "KRW"
    assert client.get("/trips", headers=bearer(minji)).json()[0]["currency"] == "KRW"


def test_trip_can_be_made_in_yen(client, auth):
    response, minji = make_trip(client, auth, currency="JPY")

    assert response.status_code == 201
    trip_id = response.json()["id"]
    assert client.get(f"/trips/{trip_id}", headers=bearer(minji)).json()["currency"] == "JPY"


def test_currency_outside_list_is_rejected(client, auth):
    response, _ = make_trip(client, auth, currency="BTC")

    assert response.status_code == 422


def test_organizer_changes_currency_while_no_money_records(client, auth):
    response, minji = make_trip(client, auth)
    trip_id = response.json()["id"]

    changed = client.patch(f"/trips/{trip_id}", json={"currency": "USD"}, headers=bearer(minji))

    assert changed.status_code == 200
    assert changed.json()["currency"] == "USD"


def _expense(member_id):
    return {
        "idempotency_key": str(uuid.uuid4()),
        "payer_member_id": member_id,
        "paid_at": "2026-12-01T12:00:00+09:00",
        "total_amount": 3000,
        "default_sharer_ids": [member_id],
        "items": [{"name": "라멘", "quantity": 1, "amount": 3000, "sharer_ids": [member_id]}],
    }


@pytest.mark.parametrize("record", ["expense", "transfer"])
def test_currency_is_locked_once_money_is_recorded(client, auth, record):
    response, minji = make_trip(client, auth, currency="JPY")
    trip_id = response.json()["id"]
    me = response.json()["me"]["member_id"]
    if record == "expense":
        client.post(f"/trips/{trip_id}/expenses", json=_expense(me), headers=bearer(minji))
    else:
        junho, _ = auth.add_user(display_name="준호")
        code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
        client.post("/trips/join", json={"code": code}, headers=bearer(junho))
        other = next(m["member_id"] for m in client.get(f"/trips/{trip_id}/members", headers=bearer(minji)).json() if m["member_id"] != me)
        assert client.post(f"/trips/{trip_id}/transfers", json={"from_member_id": other, "to_member_id": me, "amount": 1000}, headers=bearer(minji)).status_code == 201

    locked = client.patch(f"/trips/{trip_id}", json={"currency": "KRW"}, headers=bearer(minji))
    same = client.patch(f"/trips/{trip_id}", json={"currency": "JPY", "name": "오사카 2박"}, headers=bearer(minji))

    assert locked.status_code == 409
    assert locked.json()["code"] == "currency_locked"
    assert same.status_code == 200


def test_confirm_message_uses_trip_currency(client, auth):
    response, minji = make_trip(client, auth, currency="USD")
    trip_id = response.json()["id"]
    me = response.json()["me"]["member_id"]
    body = {**_expense(me), "total_amount": 4550}
    expense_id = client.post(f"/trips/{trip_id}/expenses", json=body, headers=bearer(minji)).json()["id"]

    failed = client.post(f"/trips/{trip_id}/expenses/{expense_id}/confirm", headers=bearer(minji))

    assert failed.json()["details"][0]["message"] == "품목 합계($30.00)와 총액($45.50)이 다릅니다."


@pytest.mark.parametrize(
    ("amount", "code", "shown"),
    [(12000, "KRW", "12,000원"), (12000, "JPY", "¥12,000"), (4550, "USD", "$45.50"), (5, "EUR", "€0.05")],
)
def test_format_money(amount, code, shown):
    assert format_money(amount, code) == shown
