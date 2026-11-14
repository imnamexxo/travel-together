"""계정 관리와 회원 탈퇴(ADR 0005)."""

import uuid

from tests.conftest import bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


class World:
    """민지가 만든 여행(준호·수빈 참여), 준호가 만든 여행(민지 참여), 민지 혼자 여행."""

    def __init__(self, client, auth):
        self.client = client
        self.tokens = {}
        self.users = {}
        for name in ("민지", "준호", "수빈"):
            self.tokens[name], self.users[name] = auth.add_user(display_name=name)
        self.minji_trip = self.make("민지", "민지의 제주", ["준호", "수빈"])
        self.junho_trip = self.make("준호", "준호의 부산", ["민지"])
        self.solo_trip = self.make("민지", "민지 혼자", [])

    def make(self, owner, name, joiners):
        trip_id = self.client.post("/trips", json={**JEJU, "name": name}, headers=bearer(self.tokens[owner])).json()["id"]
        code = self.client.get(f"/trips/{trip_id}/invite-code", headers=bearer(self.tokens[owner])).json()["code"]
        for who in joiners:
            self.client.post("/trips/join", json={"code": code}, headers=bearer(self.tokens[who]))
        return trip_id

    def get(self, path, who="민지"):
        return self.client.get(path, headers=bearer(self.tokens[who]))

    def members(self, trip_id, who):
        return {m["display_name"]: m for m in self.get(f"/trips/{trip_id}/members", who).json()}

    def expense_paid_by(self, trip_id, organizer, payer, sharers):
        m = self.members(trip_id, organizer)
        ids = [m[s]["member_id"] for s in sharers]
        body = {
            "idempotency_key": str(uuid.uuid4()), "payer_member_id": m[payer]["member_id"], "total_amount": 9000,
            "default_sharer_ids": ids, "items": [{"name": "회", "quantity": 1, "amount": 9000, "sharer_ids": ids}],
        }
        return self.client.post(f"/trips/{trip_id}/expenses", json=body, headers=bearer(self.tokens[organizer]))

    def photo(self, trip_id, who):
        return self.client.post(
            f"/trips/{trip_id}/photos", files={"file": ("p.jpg", jpeg(), "image/jpeg")},
            data={"taken_at": "2026-11-12T15:30:00+09:00"}, headers=bearer(self.tokens[who]),
        )


def test_display_name_change_shows_in_trips(client, auth):
    w = World(client, auth)

    changed = client.patch("/me", json={"display_name": "  민지짱 "}, headers=bearer(w.tokens["민지"]))

    assert changed.json()["display_name"] == "민지짱"
    assert "민지짱" in w.members(w.junho_trip, "준호")
    assert client.patch("/me", json={"display_name": " "}, headers=bearer(w.tokens["민지"])).status_code == 422


def test_organizer_hands_over_to_a_member(client, auth):
    w = World(client, auth)
    junho = w.members(w.minji_trip, "민지")["준호"]["member_id"]

    response = client.post(f"/trips/{w.minji_trip}/organizer", json={"member_id": junho}, headers=bearer(w.tokens["민지"]))

    assert response.status_code == 200
    assert response.json()["me"]["is_organizer"] is False
    assert w.members(w.minji_trip, "준호")["준호"]["is_organizer"] is True
    # 이제 민지는 총무 동작을 못 하고, 준호는 할 수 있다.
    assert w.get(f"/trips/{w.minji_trip}/invite-code").status_code == 403
    assert w.get(f"/trips/{w.minji_trip}/invite-code", "준호").status_code == 200


def test_only_organizer_hands_over_and_not_to_self(client, auth):
    w = World(client, auth)
    m = w.members(w.minji_trip, "민지")

    assert client.post(f"/trips/{w.minji_trip}/organizer", json={"member_id": m["수빈"]["member_id"]}, headers=bearer(w.tokens["준호"])).status_code == 403
    assert client.post(f"/trips/{w.minji_trip}/organizer", json={"member_id": m["민지"]["member_id"]}, headers=bearer(w.tokens["민지"])).status_code == 409
    assert client.post(f"/trips/{w.minji_trip}/organizer", json={"member_id": str(uuid.uuid4())}, headers=bearer(w.tokens["민지"])).status_code == 404


def test_deletion_preview_lists_what_will_happen(client, auth):
    w = World(client, auth)
    w.expense_paid_by(w.junho_trip, "준호", "준호", ["준호", "민지"])

    preview = w.get("/me/deletion-preview").json()

    assert [t["name"] for t in preview["deleted_trips"]] == ["민지 혼자"]
    assert [(h["trip"]["name"], h["new_organizer_name"]) for h in preview["handed_over"]] == [("민지의 제주", "준호")]
    assert [t["name"] for t in preview["kept_records"]] == ["준호의 부산"]


def test_account_deletion(client, auth, auth_admin, storage):
    w = World(client, auth)
    w.expense_paid_by(w.junho_trip, "준호", "민지", ["준호", "민지"])
    w.photo(w.junho_trip, "민지")
    w.photo(w.junho_trip, "준호")
    w.photo(w.solo_trip, "민지")
    files_before = set(storage.files)

    response = client.delete("/me", headers=bearer(w.tokens["민지"]))

    assert response.status_code == 204
    assert auth_admin.deleted == [w.users["민지"].id]
    # 혼자 여행은 사라지고, 민지의 여행은 준호가 총무가 된다.
    assert w.get(f"/trips/{w.solo_trip}", "준호").status_code == 404
    jeju = w.members(w.minji_trip, "준호")
    assert "민지" not in jeju and jeju["준호"]["is_organizer"] is True
    # 지출에 엮인 여행에는 이름만 지운 멤버로 남고, 민지가 올린 사진만 지워진다.
    busan = w.members(w.junho_trip, "준호")
    assert "탈퇴한 멤버" in busan and "민지" not in busan
    photos = w.get(f"/trips/{w.junho_trip}/photos", "준호").json()["photos"]
    assert [p["uploader_name"] for p in photos] == ["준호"]
    assert len(files_before - set(storage.files)) == 2
    settlement = w.get(f"/trips/{w.junho_trip}/settlement", "준호")
    assert settlement.status_code == 200


def test_deleted_account_token_can_do_nothing(client, auth):
    w = World(client, auth)
    w.expense_paid_by(w.junho_trip, "준호", "민지", ["준호", "민지"])
    client.delete("/me", headers=bearer(w.tokens["민지"]))

    assert w.get("/me").status_code == 401
    assert w.get("/trips").json() == []
    assert w.get(f"/trips/{w.junho_trip}").status_code == 404
    assert client.post("/trips", json=JEJU, headers=bearer(w.tokens["민지"])).status_code == 401


def test_failed_login_deletion_changes_nothing(client, auth, auth_admin):
    w = World(client, auth)
    auth_admin.failing = True

    response = client.delete("/me", headers=bearer(w.tokens["민지"]))

    assert response.status_code == 502
    assert response.json()["code"] == "account_deletion_failed"
    assert w.get("/me").json()["display_name"] == "민지"
    assert w.get(f"/trips/{w.solo_trip}").status_code == 200


def test_cannot_hand_over_to_deleted_member(client, auth):
    w = World(client, auth)
    w.expense_paid_by(w.minji_trip, "민지", "수빈", ["민지", "수빈"])
    subin = w.members(w.minji_trip, "민지")["수빈"]["member_id"]
    client.delete("/me", headers=bearer(w.tokens["수빈"]))

    response = client.post(f"/trips/{w.minji_trip}/organizer", json={"member_id": subin}, headers=bearer(w.tokens["민지"]))

    assert response.status_code == 409


def test_supabase_admin_deletes_user_with_service_key():
    import httpx
    import pytest

    from app.auth_admin import AuthAdminUnavailable, SupabaseAuthAdmin

    seen = {}

    def handler(request: httpx.Request):
        seen["method"], seen["url"], seen["auth"] = request.method, str(request.url), request.headers["Authorization"]
        return httpx.Response(200, json={})

    user_id = uuid.uuid4()
    SupabaseAuthAdmin("https://x.supabase.co/\n", "svc", client=httpx.Client(transport=httpx.MockTransport(handler))).delete_user(user_id)

    assert (seen["method"], seen["url"], seen["auth"]) == ("DELETE", f"https://x.supabase.co/auth/v1/admin/users/{user_id}", "Bearer svc")
    # 이미 없는 계정은 지운 것과 같다.
    SupabaseAuthAdmin("https://x.supabase.co", "svc", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404)))).delete_user(user_id)
    with pytest.raises(AuthAdminUnavailable):
        SupabaseAuthAdmin("https://x.supabase.co", "svc", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500)))).delete_user(user_id)
    with pytest.raises(AuthAdminUnavailable):
        SupabaseAuthAdmin("", "").delete_user(user_id)
