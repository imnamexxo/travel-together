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

        def url(self, suffix=""):
            return f"/trips/{trip_id}{suffix}"

    return Trip()


def store_items(m, with_drinks=True):
    everyone = [m["민지"], m["준호"], m["수빈"]]
    items = [{"name": "간식", "amount": 12000, "sharer_ids": everyone}]
    if with_drinks:
        items.append({"name": "음료", "amount": 9000, "sharer_ids": [m["준호"], m["수빈"]]})
    items.append({"name": "충전 케이블", "amount": 9000, "sharer_ids": [m["민지"]]})
    return {
        "payer_member_id": m["민지"],
        "merchant_name": "편의점",
        "total_amount": sum(i["amount"] for i in items),
        "default_sharer_ids": everyone,
        "items": items,
    }


def confirmed_store(client, trip):
    headers = bearer(trip.tokens["민지"])
    body = {**store_items(trip.member), "idempotency_key": str(uuid.uuid4())}
    expense_id = client.post(trip.url("/expenses"), json=body, headers=headers).json()["id"]
    client.post(trip.url(f"/expenses/{expense_id}/confirm"), headers=headers)
    return expense_id


def record(client, trip, frm, to, amount, who="민지"):
    m = trip.member
    return client.post(
        trip.url("/transfers"),
        json={"from_member_id": m[frm], "to_member_id": m[to], "amount": amount},
        headers=bearer(trip.tokens[who]),
    )


def settlement(client, trip, who="준호"):
    return client.get(trip.url("/settlement"), headers=bearer(trip.tokens[who])).json()


def balances(body):
    return {m["display_name"]: m["balance"] for m in body["members"]}


def suggested(body):
    return [(t["from_name"], t["to_name"], t["amount"]) for t in body["suggested_transfers"]]


def test_recorded_transfer_is_reflected_in_balances(client, trip):
    confirmed_store(client, trip)

    response = record(client, trip, "준호", "민지", 8500)

    assert response.status_code == 201
    assert (response.json()["from_name"], response.json()["to_name"], response.json()["amount"]) == ("준호", "민지", 8500)
    body = settlement(client, trip)
    assert balances(body) == {"민지": 8500, "준호": 0, "수빈": -8500}
    assert suggested(body) == [("수빈", "민지", 8500)]
    junho = next(m for m in body["members"] if m["display_name"] == "준호")
    assert (junho["sent"], junho["received"]) == (8500, 0)


def test_amount_different_from_suggestion_is_allowed(client, trip):
    confirmed_store(client, trip)

    assert record(client, trip, "준호", "민지", 5000).status_code == 201
    assert balances(settlement(client, trip))["준호"] == -3500


@pytest.mark.parametrize("amount", [0, -100, 1.5])
def test_amount_must_be_positive_integer(client, trip, amount):
    assert record(client, trip, "준호", "민지", amount).status_code == 422


def test_cannot_record_transfer_to_self_or_with_outsider(client, trip):
    self_transfer = record(client, trip, "준호", "준호", 1000)
    stranger = client.post(
        trip.url("/transfers"),
        json={"from_member_id": str(uuid.uuid4()), "to_member_id": trip.member["민지"], "amount": 1000},
        headers=bearer(trip.tokens["민지"]),
    )

    assert self_transfer.status_code == 422
    assert stranger.json()["details"][0]["field"] == "from_member_id"


def test_resettlement_after_expense_changes_keeps_recorded_transfers(client, trip):
    """준호가 8,500원 송금한 뒤 음료 지출이 빠지면 준호 잔액이 양수가 되고 제안이 민지 → 준호로 바뀐다."""
    expense_id = confirmed_store(client, trip)
    record(client, trip, "준호", "민지", 8500)
    headers = bearer(trip.tokens["민지"])

    client.put(trip.url(f"/expenses/{expense_id}"), json=store_items(trip.member, with_drinks=False), headers=headers)
    client.post(trip.url(f"/expenses/{expense_id}/confirm"), headers=headers)

    body = settlement(client, trip)
    assert balances(body) == {"민지": -500, "준호": 4500, "수빈": -4000}
    assert suggested(body) == [("수빈", "준호", 4000), ("민지", "준호", 500)]
    transfers = client.get(trip.url("/transfers"), headers=headers).json()
    assert [(t["from_name"], t["amount"]) for t in transfers] == [("준호", 8500)]


def test_all_balances_zero_means_settled(client, trip):
    confirmed_store(client, trip)
    record(client, trip, "준호", "민지", 8500)
    record(client, trip, "수빈", "민지", 8500)

    body = settlement(client, trip)

    assert body["is_settled"] is True
    assert body["suggested_transfers"] == []


def test_every_member_sees_recorded_transfers(client, trip):
    confirmed_store(client, trip)
    record(client, trip, "준호", "민지", 8500)
    record(client, trip, "수빈", "민지", 3000)

    for who in ("민지", "준호", "수빈"):
        listed = client.get(trip.url("/transfers"), headers=bearer(trip.tokens[who])).json()
        assert sorted((t["from_name"], t["amount"]) for t in listed) == [("수빈", 3000), ("준호", 8500)]


def test_organizer_deletes_wrong_transfer(client, trip):
    confirmed_store(client, trip)
    transfer_id = record(client, trip, "준호", "민지", 9999).json()["id"]

    response = client.delete(trip.url(f"/transfers/{transfer_id}"), headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 204
    assert client.get(trip.url("/transfers"), headers=bearer(trip.tokens["민지"])).json() == []
    assert balances(settlement(client, trip))["준호"] == -8500


def test_regular_member_cannot_record_or_delete(client, trip):
    confirmed_store(client, trip)
    transfer_id = record(client, trip, "준호", "민지", 8500).json()["id"]

    assert record(client, trip, "수빈", "민지", 8500, who="준호").status_code == 403
    assert client.delete(trip.url(f"/transfers/{transfer_id}"), headers=bearer(trip.tokens["준호"])).status_code == 403


def test_unknown_transfer_is_404_and_outsider_sees_nothing(client, trip, auth):
    outsider, _ = auth.add_user()

    missing = client.delete(trip.url(f"/transfers/{uuid.uuid4()}"), headers=bearer(trip.tokens["민지"]))
    assert missing.status_code == 404
    assert missing.json()["code"] == "transfer_not_found"
    assert client.get(trip.url("/transfers"), headers=bearer(outsider)).status_code == 404


def test_member_with_transfer_cannot_leave(client, trip):
    record(client, trip, "수빈", "준호", 1000)

    response = client.delete(trip.url("/members/me"), headers=bearer(trip.tokens["수빈"]))

    assert response.status_code == 409
    assert "송금 기록" in response.json()["message"]
