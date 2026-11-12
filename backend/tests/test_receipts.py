import json
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.receipt_reader import GeminiReceiptReader, ReceiptDraft, ReceiptLine, ReceiptUnreadable, parse_receipt
from tests.conftest import bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}
STORE = ReceiptDraft(
    merchant_name="제주 편의점",
    paid_at_local="2026-11-12 15:30",
    total_amount=30000,
    items=[ReceiptLine(name="간식", quantity=3, amount=12000), ReceiptLine(name="음료", quantity=2, amount=None)],
)


@pytest.fixture
def trip(client, auth):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    client.post("/trips/join", json={"code": code}, headers=bearer(junho))

    class Trip:
        id = trip_id
        tokens = {"민지": minji, "준호": junho}

        def url(self, suffix=""):
            return f"/trips/{trip_id}{suffix}"

    return Trip()


def upload(client, trip, who="민지", key=None, data=None):
    return client.post(
        trip.url("/receipts"),
        files={"file": ("r.jpg", data if data is not None else jpeg(), "image/jpeg")},
        data={"idempotency_key": key or str(uuid.uuid4())},
        headers=bearer(trip.tokens[who]),
    )


def test_receipt_becomes_draft_expense_with_unread_values_empty(client, trip, receipts, storage):
    receipts.results = [STORE]

    response = upload(client, trip)

    assert response.status_code == 201
    body = response.json()
    assert body["analysis"] == "read"
    expense = body["expense"]
    assert expense["status"] == "draft"
    assert (expense["merchant_name"], expense["total_amount"], expense["paid_at"]) == ("제주 편의점", 30000, "2026-11-12T06:30:00Z")
    assert [(i["name"], i["quantity"], i["amount"]) for i in expense["items"]] == [("간식", 3, 12000), ("음료", 2, None)]
    assert len(expense["items"][0]["sharer_ids"]) == 2
    assert expense["has_receipt"] is True
    assert expense["receipt_url"].startswith("https://storage.test/trips/") and "/receipts/" in expense["receipt_url"]
    [stored] = storage.files.values()
    assert b"Exif" not in stored
    assert receipts.images == [stored]


def test_receipt_original_is_shown_with_signed_url_on_expense_detail(client, trip, receipts):
    receipts.results = [STORE]
    expense_id = upload(client, trip).json()["expense"]["id"]

    detail = client.get(trip.url(f"/expenses/{expense_id}"), headers=bearer(trip.tokens["준호"])).json()

    assert detail["receipt_url"].endswith("?expires_in=600")


def test_same_image_reuses_saved_analysis(client, trip, receipts, storage):
    receipts.results = [STORE]
    first = upload(client, trip).json()

    second = upload(client, trip).json()

    assert second["analysis"] == "reused"
    assert second["expense"]["id"] != first["expense"]["id"]
    assert second["expense"]["merchant_name"] == "제주 편의점"
    assert len(receipts.images) == 1
    assert len(storage.files) == 1


def test_failed_analysis_keeps_receipt_and_makes_empty_draft(client, trip, receipts, storage):
    receipts.results = [ReceiptUnreadable("down")]

    body = upload(client, trip).json()

    assert body["analysis"] == "failed"
    expense = body["expense"]
    assert (expense["status"], expense["merchant_name"], expense["total_amount"], expense["items"]) == ("draft", None, None, [])
    assert expense["has_receipt"] is True
    assert len(storage.files) == 1


def test_failed_image_is_read_again_next_time(client, trip, receipts):
    receipts.results = [ReceiptUnreadable("down"), STORE]
    upload(client, trip)

    second = upload(client, trip).json()

    assert second["analysis"] == "read"
    assert len(receipts.images) == 2


def test_same_idempotency_key_makes_one_draft(client, trip, receipts):
    receipts.results = [STORE]
    key = str(uuid.uuid4())

    first = upload(client, trip, key=key)
    second = upload(client, trip, key=key)

    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["expense"]["id"] == second.json()["expense"]["id"]
    assert len(client.get(trip.url("/expenses"), headers=bearer(trip.tokens["민지"])).json()) == 1


def test_draft_from_receipt_can_be_confirmed_after_filling_blanks(client, trip, receipts):
    receipts.results = [STORE]
    expense = upload(client, trip).json()["expense"]
    body = {k: expense[k] for k in ("payer_member_id", "merchant_name", "paid_at", "default_sharer_ids")}
    body["total_amount"] = 21000
    body["items"] = [{"name": i["name"], "quantity": i["quantity"], "amount": i["amount"] or 9000, "sharer_ids": i["sharer_ids"]} for i in expense["items"]]
    client.put(trip.url(f"/expenses/{expense['id']}"), json=body, headers=bearer(trip.tokens["민지"]))

    confirmed = client.post(trip.url(f"/expenses/{expense['id']}/confirm"), headers=bearer(trip.tokens["민지"]))

    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["has_receipt"] is True


def test_regular_member_cannot_upload_receipt(client, trip, storage):
    response = upload(client, trip, who="준호")

    assert response.status_code == 403
    assert storage.files == {}


def test_non_jpeg_receipt_is_rejected(client, trip):
    assert upload(client, trip, data=b"%PDF-1.4").status_code == 415


def test_deleting_trip_removes_receipt_files(client, trip, receipts, storage, engine):
    receipts.results = [STORE]
    upload(client, trip)

    client.delete(trip.url(), headers=bearer(trip.tokens["민지"]))

    assert storage.files == {}
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM receipts")) == 0


def test_gemini_receipt_reader_sends_image_and_schema():
    calls = []

    class Models:
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text=json.dumps({"merchant_name": "카페", "paid_at_local": None, "total_amount": 9000, "items": [{"name": "커피", "quantity": 2, "amount": 9000}]}))

    draft = GeminiReceiptReader("key", "gemini-flash-latest", client=SimpleNamespace(models=Models())).read(b"jpegbytes")

    assert (draft.merchant_name, draft.total_amount, draft.items[0].amount) == ("카페", 9000, 9000)
    assert calls[0]["config"].response_schema is ReceiptDraft
    assert calls[0]["contents"][0].inline_data.data == b"jpegbytes"


@pytest.mark.parametrize("raw", [None, "", "nope", json.dumps({"paid_at_local": "어제"}), json.dumps({"items": [{"name": ""}]})])
def test_bad_receipt_response_is_unreadable(raw):
    with pytest.raises(ReceiptUnreadable):
        parse_receipt(raw)


def test_missing_key_is_unreadable():
    with pytest.raises(ReceiptUnreadable):
        GeminiReceiptReader("", "gemini-flash-latest").read(b"x")
