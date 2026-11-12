import uuid

import pytest
from sqlalchemy import text

from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


@pytest.fixture
def trip(client, auth):
    """총무 민지, 멤버 준호·수빈이 있는 여행."""
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    subin, _ = auth.add_user(display_name="수빈")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    for token in (junho, subin):
        client.post("/trips/join", json={"code": code}, headers=bearer(token))
    members = client.get(f"/trips/{trip_id}/members", headers=bearer(minji)).json()
    ids = {m["display_name"]: m["member_id"] for m in members}

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho, "수빈": subin}
        member = ids

        def url(self, suffix=""):
            return f"/trips/{trip_id}/expenses{suffix}"

    return Trip()


def convenience_store(trip, **overrides):
    """기획서 대표 사례: 간식 12,000(3명), 음료 9,000(준호·수빈), 케이블 9,000(민지)."""
    m = trip.member
    everyone = [m["민지"], m["준호"], m["수빈"]]
    body = {
        "idempotency_key": str(uuid.uuid4()),
        "payer_member_id": m["민지"],
        "paid_at": "2026-11-12T15:30:00+09:00",
        "merchant_name": "편의점",
        "total_amount": 30000,
        "default_sharer_ids": everyone,
        "items": [
            {"name": "간식", "quantity": 3, "amount": 12000, "sharer_ids": everyone},
            {"name": "음료", "quantity": 2, "amount": 9000, "sharer_ids": [m["준호"], m["수빈"]]},
            {"name": "충전 케이블", "quantity": 1, "amount": 9000, "sharer_ids": [m["민지"]]},
        ],
    }
    body.update(overrides)
    return body


def create(client, trip, body, who="민지"):
    return client.post(trip.url(), json=body, headers=bearer(trip.tokens[who]))


def confirm(client, trip, expense_id, who="민지"):
    return client.post(trip.url(f"/{expense_id}/confirm"), headers=bearer(trip.tokens[who]))


def test_create_saves_expense_items_and_sharers_as_draft(client, trip):
    response = create(client, trip, convenience_store(trip))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["merchant_name"] == "편의점"
    assert body["paid_at"] == "2026-11-12T06:30:00Z"
    assert [(i["name"], i["quantity"], i["amount"]) for i in body["items"]] == [
        ("간식", 3, 12000), ("음료", 2, 9000), ("충전 케이블", 1, 9000),
    ]
    assert body["items"][1]["sharer_ids"] == [trip.member["준호"], trip.member["수빈"]]
    assert body["default_sharer_ids"] == [trip.member[n] for n in ("민지", "준호", "수빈")]
    again = client.get(trip.url(f"/{body['id']}"), headers=bearer(trip.tokens["준호"])).json()
    assert again == body


def test_valid_expense_is_confirmed(client, trip):
    expense_id = create(client, trip, convenience_store(trip)).json()["id"]

    response = confirm(client, trip, expense_id)

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


@pytest.mark.parametrize(
    ("change", "fields"),
    [
        (lambda b: b.update(total_amount=31000), ["total_amount"]),
        (lambda b: b["items"][1].update(sharer_ids=[]), ["items.1.sharers"]),
        (lambda b: b.update(payer_member_id=None), ["payer_member_id"]),
        (lambda b: (b["items"][2].update(amount=0), b.update(total_amount=21000)), ["items.2.amount"]),
        (lambda b: b["items"][0].update(amount=None), ["items.0.amount"]),
        (lambda b: b.update(total_amount=None), ["total_amount"]),
        (lambda b: b.update(items=[]), ["items"]),
    ],
    ids=["sum-not-total", "item-without-sharer", "no-payer", "zero-amount", "missing-amount", "missing-total", "no-items"],
)
def test_each_broken_condition_is_reported_and_marks_needs_review(client, trip, change, fields):
    body = convenience_store(trip)
    change(body)
    expense_id = create(client, trip, body).json()["id"]

    response = confirm(client, trip, expense_id)

    assert response.status_code == 422
    assert response.json()["code"] == "confirm_conditions_failed"
    assert [d["field"] for d in response.json()["details"]] == fields
    stored = client.get(trip.url(f"/{expense_id}"), headers=bearer(trip.tokens["민지"])).json()
    assert stored["status"] == "needs_review"


def test_several_broken_conditions_are_all_listed(client, trip):
    body = convenience_store(trip, payer_member_id=None, total_amount=1)
    body["items"][0]["sharer_ids"] = []
    expense_id = create(client, trip, body).json()["id"]

    fields = [d["field"] for d in confirm(client, trip, expense_id).json()["details"]]

    assert fields == ["payer_member_id", "items.0.sharers", "total_amount"]


def test_there_is_no_way_to_force_confirm(client, trip):
    body = convenience_store(trip, total_amount=1)
    expense_id = create(client, trip, body).json()["id"]

    forced = client.post(trip.url(f"/{expense_id}/confirm?force=true"), json={"force": True}, headers=bearer(trip.tokens["민지"]))
    put_status = client.put(trip.url(f"/{expense_id}"), json={**body, "status": "confirmed"}, headers=bearer(trip.tokens["민지"]))

    assert forced.status_code == 422
    assert put_status.json()["status"] == "draft"


def test_editing_a_confirmed_expense_makes_it_draft_again(client, trip):
    expense_id = create(client, trip, convenience_store(trip)).json()["id"]
    confirm(client, trip, expense_id)
    body = convenience_store(trip)
    body["items"][2]["amount"] = 8000
    body["total_amount"] = 29000

    updated = client.put(trip.url(f"/{expense_id}"), json=body, headers=bearer(trip.tokens["민지"]))

    assert updated.status_code == 200
    assert updated.json()["status"] == "draft"
    assert updated.json()["items"][2]["amount"] == 8000
    assert confirm(client, trip, expense_id).json()["status"] == "confirmed"


def test_confirmed_expense_can_be_deleted(client, trip):
    expense_id = create(client, trip, convenience_store(trip)).json()["id"]
    confirm(client, trip, expense_id)

    response = client.delete(trip.url(f"/{expense_id}"), headers=bearer(trip.tokens["민지"]))

    assert response.status_code == 204
    assert client.get(trip.url(f"/{expense_id}"), headers=bearer(trip.tokens["민지"])).status_code == 404


def test_same_idempotency_key_creates_one_expense(client, trip):
    body = convenience_store(trip)

    first = create(client, trip, body)
    second = create(client, trip, body)

    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get(trip.url(), headers=bearer(trip.tokens["민지"])).json()) == 1


def test_expense_and_items_are_saved_in_one_transaction(client, trip, engine):
    """품목 하나라도 저장할 수 없으면 지출도 남지 않는다."""
    body = convenience_store(trip)
    body["items"][1]["sharer_ids"] = [str(uuid.uuid4())]

    response = create(client, trip, body)

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "items.1.sharer_ids"
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM expenses")) == 0
        assert conn.scalar(text("SELECT count(*) FROM line_items")) == 0


def test_payer_must_be_member_of_this_trip(client, trip):
    response = create(client, trip, convenience_store(trip, payer_member_id=str(uuid.uuid4())))

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "payer_member_id"


def test_regular_member_can_view_but_not_change(client, trip):
    expense_id = create(client, trip, convenience_store(trip)).json()["id"]
    junho = bearer(trip.tokens["준호"])

    assert client.get(trip.url(), headers=junho).status_code == 200
    assert client.get(trip.url(f"/{expense_id}"), headers=junho).status_code == 200
    assert create(client, trip, convenience_store(trip), who="준호").status_code == 403
    assert client.put(trip.url(f"/{expense_id}"), json=convenience_store(trip), headers=junho).status_code == 403
    assert confirm(client, trip, expense_id, who="준호").status_code == 403
    assert client.delete(trip.url(f"/{expense_id}"), headers=junho).status_code == 403


def test_outsider_and_other_trip_cannot_see_expense(client, trip, auth):
    expense_id = create(client, trip, convenience_store(trip)).json()["id"]
    outsider, _ = auth.add_user()
    other_trip = client.post("/trips", json=JEJU, headers=bearer(outsider)).json()["id"]

    assert client.get(trip.url(f"/{expense_id}"), headers=bearer(outsider)).status_code == 404
    assert client.get(f"/trips/{other_trip}/expenses/{expense_id}", headers=bearer(outsider)).json()["code"] == "expense_not_found"


def test_list_puts_drafts_without_time_first_then_latest(client, trip):
    create(client, trip, convenience_store(trip, merchant_name="첫날", paid_at="2026-11-12T10:00:00+09:00"))
    create(client, trip, convenience_store(trip, merchant_name="둘째날", paid_at="2026-11-13T10:00:00+09:00"))
    create(client, trip, convenience_store(trip, merchant_name="시각 없음", paid_at=None, payer_member_id=None))

    listed = client.get(trip.url(), headers=bearer(trip.tokens["수빈"])).json()

    assert [e["merchant_name"] for e in listed] == ["시각 없음", "둘째날", "첫날"]
    assert listed[1]["payer_name"] == "민지"
    assert listed[0]["payer_name"] is None
    assert listed[1]["item_count"] == 3


@pytest.mark.parametrize("role", ["payer", "item-sharer", "default-sharer"])
def test_member_in_an_expense_cannot_leave_or_be_removed(client, trip, role):
    m = trip.member
    body = convenience_store(trip)
    if role == "payer":
        body.update(payer_member_id=m["수빈"], default_sharer_ids=[])
        for item in body["items"]:
            item["sharer_ids"] = [m["민지"]]
    elif role == "item-sharer":
        body.update(default_sharer_ids=[])
        body["items"] = [{"name": "음료", "amount": 9000, "sharer_ids": [m["수빈"]]}]
    else:
        body.update(default_sharer_ids=[m["수빈"]], items=[])
    create(client, trip, body)

    leave = client.delete(f"/trips/{trip.id}/members/me", headers=bearer(trip.tokens["수빈"]))
    kick = client.delete(f"/trips/{trip.id}/members/{m['수빈']}", headers=bearer(trip.tokens["민지"]))

    assert (leave.status_code, kick.status_code) == (409, 409)
    assert leave.json()["code"] == "member_has_expenses"
    assert "나갈 수 없습니다" in leave.json()["message"]
    assert "내보낼 수 없습니다" in kick.json()["message"]


def test_member_without_expenses_can_still_leave(client, trip):
    body = convenience_store(trip)
    m = trip.member
    body["default_sharer_ids"] = [m["민지"], m["준호"]]
    for item in body["items"]:
        item["sharer_ids"] = [m["민지"]]
    create(client, trip, body)

    assert client.delete(f"/trips/{trip.id}/members/me", headers=bearer(trip.tokens["수빈"])).status_code == 204


def test_deleting_trip_removes_its_expenses(client, trip, engine):
    create(client, trip, convenience_store(trip))

    assert client.delete(f"/trips/{trip.id}", headers=bearer(trip.tokens["민지"])).status_code == 204
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM expenses")) == 0
        assert conn.scalar(text("SELECT count(*) FROM line_item_sharers")) == 0
