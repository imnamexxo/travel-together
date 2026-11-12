import uuid

import pytest

from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


@pytest.fixture
def trip(client, auth):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    subin, _ = auth.add_user(display_name="수빈")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    for token in (junho, subin):
        client.post("/trips/join", json={"code": code}, headers=bearer(token))
    ids = {m["display_name"]: m["member_id"] for m in client.get(f"/trips/{trip_id}/members", headers=bearer(minji)).json()}

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho, "수빈": subin}
        member = ids

    return Trip()


def add_expense(client, trip, *, confirm=True, total=30000, payer="민지"):
    m = trip.member
    everyone = [m["민지"], m["준호"], m["수빈"]]
    body = {
        "idempotency_key": str(uuid.uuid4()),
        "payer_member_id": m[payer],
        "merchant_name": "편의점",
        "total_amount": total,
        "default_sharer_ids": everyone,
        "items": [
            {"name": "간식", "amount": 12000, "sharer_ids": everyone},
            {"name": "음료", "amount": 9000, "sharer_ids": [m["준호"], m["수빈"]]},
            {"name": "충전 케이블", "amount": 9000, "sharer_ids": [m["민지"]]},
        ],
    }
    headers = bearer(trip.tokens["민지"])
    expense_id = client.post(f"/trips/{trip.id}/expenses", json=body, headers=headers).json()["id"]
    if confirm:
        client.post(f"/trips/{trip.id}/expenses/{expense_id}/confirm", headers=headers)
    return expense_id


def settlement(client, trip, who="준호"):
    return client.get(f"/trips/{trip.id}/settlement", headers=bearer(trip.tokens[who]))


def test_settlement_from_confirmed_expense(client, trip):
    add_expense(client, trip)

    body = settlement(client, trip).json()

    assert body["confirmed_total"] == 30000
    assert body["confirmed_count"] == 1
    assert body["is_settled"] is False
    assert [(m["display_name"], m["paid"], m["owed"], m["balance"]) for m in body["members"]] == [
        ("민지", 30000, 13000, 17000),
        ("준호", 0, 8500, -8500),
        ("수빈", 0, 8500, -8500),
    ]
    assert [(t["from_name"], t["to_name"], t["amount"]) for t in body["suggested_transfers"]] == [
        ("준호", "민지", 8500),
        ("수빈", "민지", 8500),
    ]
    junho_shares = [(s["item_name"], s["amount"]) for s in body["shares"] if s["member_id"] == trip.member["준호"]]
    assert junho_shares == [("간식", 4000), ("음료", 4500)]


def test_draft_and_needs_review_expenses_are_not_counted(client, trip):
    add_expense(client, trip, confirm=False)
    broken = add_expense(client, trip, confirm=False, total=1)
    client.post(f"/trips/{trip.id}/expenses/{broken}/confirm", headers=bearer(trip.tokens["민지"]))

    body = settlement(client, trip).json()

    assert body["confirmed_total"] == 0
    assert body["confirmed_count"] == 0
    assert body["suggested_transfers"] == []
    assert all(m["balance"] == 0 for m in body["members"])


def test_editing_a_confirmed_expense_takes_it_out_until_confirmed_again(client, trip):
    expense_id = add_expense(client, trip)
    detail = client.get(f"/trips/{trip.id}/expenses/{expense_id}", headers=bearer(trip.tokens["민지"])).json()
    body = {k: detail[k] for k in ("payer_member_id", "merchant_name", "total_amount", "default_sharer_ids")}
    body["items"] = [{k: i[k] for k in ("name", "amount", "sharer_ids")} for i in detail["items"]]
    client.put(f"/trips/{trip.id}/expenses/{expense_id}", json=body, headers=bearer(trip.tokens["민지"]))

    assert settlement(client, trip).json()["confirmed_total"] == 0


def test_no_expenses_is_settled(client, trip):
    body = settlement(client, trip).json()

    assert body["is_settled"] is True
    assert body["confirmed_count"] == 0


def test_every_member_can_see_settlement_but_outsiders_cannot(client, trip, auth):
    add_expense(client, trip)
    outsider, _ = auth.add_user()

    for who in ("민지", "준호", "수빈"):
        assert settlement(client, trip, who).status_code == 200
    assert client.get(f"/trips/{trip.id}/settlement", headers=bearer(outsider)).status_code == 404
