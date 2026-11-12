from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


def trip_with_member(client, auth):
    """총무 민지와 멤버 준호가 있는 여행."""
    minji, _ = auth.add_user(display_name="민지")
    junho, _ = auth.add_user(display_name="준호")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    client.post("/trips/join", json={"code": code}, headers=bearer(junho))
    return trip_id, minji, junho


def members(client, token, trip_id):
    return client.get(f"/trips/{trip_id}/members", headers=bearer(token)).json()


def test_organizer_changes_name_and_period(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)

    response = client.patch(
        f"/trips/{trip_id}",
        json={"name": " 제주 3박 ", "start_date": "2026-11-11", "end_date": "2026-11-15"},
        headers=bearer(minji),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "제주 3박"
    seen_by_member = client.get(f"/trips/{trip_id}", headers=bearer(junho)).json()
    assert (seen_by_member["start_date"], seen_by_member["end_date"]) == ("2026-11-11", "2026-11-15")


def test_partial_update_keeps_other_fields(client, auth):
    trip_id, minji, _ = trip_with_member(client, auth)

    body = client.patch(f"/trips/{trip_id}", json={"end_date": "2026-11-20"}, headers=bearer(minji)).json()

    assert (body["name"], body["start_date"], body["end_date"]) == ("제주 여행", "2026-11-12", "2026-11-20")


def test_update_rejects_end_before_existing_start(client, auth):
    trip_id, minji, _ = trip_with_member(client, auth)

    response = client.patch(f"/trips/{trip_id}", json={"end_date": "2026-11-01"}, headers=bearer(minji))

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "end_date"


def test_only_organizer_can_update(client, auth):
    trip_id, _, junho = trip_with_member(client, auth)
    outsider, _ = auth.add_user()

    assert client.patch(f"/trips/{trip_id}", json={"name": "x"}, headers=bearer(junho)).status_code == 403
    assert client.patch(f"/trips/{trip_id}", json={"name": "x"}, headers=bearer(outsider)).status_code == 404


def test_member_leaves_trip(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)

    response = client.delete(f"/trips/{trip_id}/members/me", headers=bearer(junho))

    assert response.status_code == 204
    assert client.get("/trips", headers=bearer(junho)).json() == []
    assert client.get(f"/trips/{trip_id}", headers=bearer(junho)).status_code == 404
    assert [m["display_name"] for m in members(client, minji, trip_id)] == ["민지"]


def test_organizer_cannot_leave(client, auth):
    trip_id, minji, _ = trip_with_member(client, auth)

    response = client.delete(f"/trips/{trip_id}/members/me", headers=bearer(minji))

    assert response.status_code == 409
    assert response.json()["code"] == "organizer_cannot_leave"


def test_left_member_can_rejoin_with_a_new_join_order(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)
    subin, _ = auth.add_user(display_name="수빈")
    code = client.get(f"/trips/{trip_id}/invite-code", headers=bearer(minji)).json()["code"]
    client.post("/trips/join", json={"code": code}, headers=bearer(subin))
    client.delete(f"/trips/{trip_id}/members/me", headers=bearer(junho))

    again = client.post("/trips/join", json={"code": code}, headers=bearer(junho)).json()

    assert again["me"]["join_order"] == 4
    assert [m["display_name"] for m in members(client, minji, trip_id)] == ["민지", "수빈", "준호"]


def test_organizer_removes_member(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)
    junho_member = members(client, minji, trip_id)[1]["member_id"]

    response = client.delete(f"/trips/{trip_id}/members/{junho_member}", headers=bearer(minji))

    assert response.status_code == 204
    assert client.get(f"/trips/{trip_id}", headers=bearer(junho)).status_code == 404


def test_member_cannot_remove_others(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)
    minji_member = members(client, minji, trip_id)[0]["member_id"]

    response = client.delete(f"/trips/{trip_id}/members/{minji_member}", headers=bearer(junho))

    assert response.status_code == 403


def test_organizer_cannot_remove_self_and_unknown_member_is_404(client, auth):
    trip_id, minji, _ = trip_with_member(client, auth)
    minji_member = members(client, minji, trip_id)[0]["member_id"]

    assert client.delete(f"/trips/{trip_id}/members/{minji_member}", headers=bearer(minji)).status_code == 409
    response = client.delete(f"/trips/{trip_id}/members/00000000-0000-0000-0000-000000000000", headers=bearer(minji))
    assert response.status_code == 404
    assert response.json()["code"] == "member_not_found"


def test_member_of_another_trip_cannot_be_removed_through_this_trip(client, auth):
    trip_id, minji, _ = trip_with_member(client, auth)
    other_trip, other_organizer, _ = trip_with_member(client, auth)
    stranger = members(client, other_organizer, other_trip)[1]["member_id"]

    response = client.delete(f"/trips/{trip_id}/members/{stranger}", headers=bearer(minji))

    assert response.status_code == 404
    assert len(members(client, other_organizer, other_trip)) == 2


def test_organizer_deletes_trip_and_everything_in_it(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)

    response = client.delete(f"/trips/{trip_id}", headers=bearer(minji))

    assert response.status_code == 204
    for token in (minji, junho):
        assert client.get("/trips", headers=bearer(token)).json() == []
        assert client.get(f"/trips/{trip_id}", headers=bearer(token)).status_code == 404


def test_member_cannot_delete_trip(client, auth):
    trip_id, minji, junho = trip_with_member(client, auth)

    assert client.delete(f"/trips/{trip_id}", headers=bearer(junho)).status_code == 403
    assert client.get(f"/trips/{trip_id}", headers=bearer(minji)).status_code == 200
