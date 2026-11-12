import re

from app.invites import ALPHABET
from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


def make_trip(client, token):
    return client.post("/trips", json=JEJU, headers=bearer(token)).json()["id"]


def invite_code(client, token, trip_id):
    return client.get(f"/trips/{trip_id}/invite-code", headers=bearer(token)).json()["code"]


def join(client, token, code):
    return client.post("/trips/join", json={"code": code}, headers=bearer(token))


def test_invite_code_is_8_chars_without_confusing_letters(client, auth):
    token, _ = auth.add_user()
    trip_id = make_trip(client, token)

    code = invite_code(client, token, trip_id)

    assert re.fullmatch(f"[{ALPHABET}]{{8}}", code)
    assert not set("0O1I") & set(code)


def test_join_with_code_makes_member_with_next_join_order(client, auth):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    trip_id = make_trip(client, minji)

    response = join(client, junho, invite_code(client, minji, trip_id))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == trip_id
    assert body["member_count"] == 2
    assert body["me"]["join_order"] == 2
    assert body["me"]["is_organizer"] is False
    assert [t["id"] for t in client.get("/trips", headers=bearer(junho)).json()] == [trip_id]


def test_code_is_matched_ignoring_case_and_spaces(client, auth):
    minji, _ = auth.add_user()
    junho, _ = auth.add_user()
    trip_id = make_trip(client, minji)
    code = invite_code(client, minji, trip_id)

    response = join(client, junho, f" {code[:4].lower()} {code[4:].lower()} ")

    assert response.status_code == 200


def test_joining_again_does_not_duplicate(client, auth):
    minji, _ = auth.add_user()
    junho, _ = auth.add_user()
    trip_id = make_trip(client, minji)
    code = invite_code(client, minji, trip_id)

    join(client, junho, code)
    again = join(client, junho, code)
    organizer_again = join(client, minji, code)

    assert again.status_code == 200
    assert again.json()["me"]["join_order"] == 2
    assert organizer_again.json()["me"]["is_organizer"] is True
    assert len(client.get(f"/trips/{trip_id}/members", headers=bearer(minji)).json()) == 2


def test_wrong_code_is_rejected_with_reason(client, auth):
    token, _ = auth.add_user()

    response = join(client, token, "ABCDEFGH")

    assert response.status_code == 404
    assert response.json()["code"] == "invalid_invite_code"
    assert response.json()["message"]


def test_reissued_code_invalidates_old_one(client, auth):
    minji, _ = auth.add_user()
    junho, _ = auth.add_user()
    trip_id = make_trip(client, minji)
    old = invite_code(client, minji, trip_id)

    response = client.post(f"/trips/{trip_id}/invite-code", headers=bearer(minji))

    assert response.status_code == 200
    new = response.json()["code"]
    assert new != old
    assert invite_code(client, minji, trip_id) == new
    assert join(client, junho, old).json()["code"] == "invalid_invite_code"
    assert join(client, junho, new).status_code == 200


def test_trip_with_10_members_rejects_more(client, auth):
    organizer, _ = auth.add_user()
    trip_id = make_trip(client, organizer)
    code = invite_code(client, organizer, trip_id)
    for _ in range(9):
        token, _ = auth.add_user()
        assert join(client, token, code).status_code == 200
    eleventh, _ = auth.add_user()

    response = join(client, eleventh, code)

    assert response.status_code == 409
    assert response.json()["code"] == "trip_full"
    assert "10명" in response.json()["message"]
    assert client.get(f"/trips/{trip_id}", headers=bearer(organizer)).json()["member_count"] == 10


def test_regular_member_cannot_see_or_reissue_code(client, auth):
    minji, _ = auth.add_user()
    junho, _ = auth.add_user()
    trip_id = make_trip(client, minji)
    join(client, junho, invite_code(client, minji, trip_id))

    assert client.get(f"/trips/{trip_id}/invite-code", headers=bearer(junho)).status_code == 403
    response = client.post(f"/trips/{trip_id}/invite-code", headers=bearer(junho))
    assert response.status_code == 403
    assert response.json()["code"] == "organizer_only"


def test_outsider_gets_404_for_members_and_code(client, auth):
    minji, _ = auth.add_user()
    outsider, _ = auth.add_user()
    trip_id = make_trip(client, minji)

    assert client.get(f"/trips/{trip_id}/members", headers=bearer(outsider)).status_code == 404
    assert client.get(f"/trips/{trip_id}/invite-code", headers=bearer(outsider)).status_code == 404
    assert client.post(f"/trips/{trip_id}/invite-code", headers=bearer(outsider)).status_code == 404


def test_members_listed_in_join_order_with_organizer_marked(client, auth):
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    subin, _ = auth.add_user(display_name="수빈")
    trip_id = make_trip(client, minji)
    code = invite_code(client, minji, trip_id)
    join(client, junho, code)
    join(client, subin, code)

    members = client.get(f"/trips/{trip_id}/members", headers=bearer(junho)).json()

    assert [(m["display_name"], m["join_order"], m["is_organizer"], m["is_me"]) for m in members] == [
        ("민지", 1, True, False),
        ("준호", 2, False, True),
        ("수빈", 3, False, False),
    ]
