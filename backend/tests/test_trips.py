import uuid

from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


def create_trip(client, token, **overrides):
    return client.post("/trips", json={**JEJU, **overrides}, headers=bearer(token))


def test_creator_becomes_organizer_and_first_member(client, auth):
    token, _ = auth.add_user(display_name="민지")

    response = create_trip(client, token)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "제주 여행"
    assert body["start_date"] == "2026-11-12"
    assert body["end_date"] == "2026-11-14"
    assert body["member_count"] == 1
    assert body["me"]["is_organizer"] is True
    assert body["me"]["join_order"] == 1


def test_creating_trip_works_before_profile_was_ever_fetched(client, auth):
    """/me를 부른 적 없는 사용자도 여행을 만들 수 있다(프로필이 함께 생긴다)."""
    token, _ = auth.add_user(email="junho@example.com")

    assert create_trip(client, token).status_code == 201
    assert client.get("/me", headers=bearer(token)).json()["display_name"] == "junho"


def test_one_day_trip_is_allowed(client, auth):
    token, _ = auth.add_user()

    response = create_trip(client, token, start_date="2026-11-12", end_date="2026-11-12")

    assert response.status_code == 201


def test_start_after_end_is_rejected(client, auth):
    token, _ = auth.add_user()

    response = create_trip(client, token, start_date="2026-11-15", end_date="2026-11-14")

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_failed"
    assert [d["field"] for d in body["details"]] == ["end_date"]
    assert client.get("/trips", headers=bearer(token)).json() == []


def test_blank_name_is_rejected(client, auth):
    token, _ = auth.add_user()

    response = create_trip(client, token, name="   ")

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "name"


def test_name_is_trimmed(client, auth):
    token, _ = auth.add_user()

    assert create_trip(client, token, name="  부산  ").json()["name"] == "부산"


def test_list_shows_only_my_trips_latest_first(client, auth):
    minji, _ = auth.add_user()
    junho, _ = auth.add_user()
    create_trip(client, minji, name="강릉", start_date="2026-08-01", end_date="2026-08-02")
    create_trip(client, minji, name="제주")
    create_trip(client, junho, name="준호 여행")

    trips = client.get("/trips", headers=bearer(minji)).json()

    assert [t["name"] for t in trips] == ["제주", "강릉"]
    assert all(t["is_organizer"] and t["member_count"] == 1 for t in trips)


def test_list_is_empty_for_new_user(client, auth):
    token, _ = auth.add_user()

    assert client.get("/trips", headers=bearer(token)).json() == []


def test_member_can_open_trip_with_membership(client, auth):
    token, _ = auth.add_user()
    trip_id = create_trip(client, token).json()["id"]

    response = client.get(f"/trips/{trip_id}", headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["me"]["is_organizer"] is True


def test_other_users_trip_is_404(client, auth):
    minji, _ = auth.add_user()
    junho, _ = auth.add_user()
    trip_id = create_trip(client, minji).json()["id"]

    response = client.get(f"/trips/{trip_id}", headers=bearer(junho))

    assert response.status_code == 404
    assert response.json()["code"] == "trip_not_found"


def test_unknown_trip_is_404_same_as_others_trip(client, auth):
    token, _ = auth.add_user()

    response = client.get(f"/trips/{uuid.uuid4()}", headers=bearer(token))

    assert response.status_code == 404
    assert response.json()["code"] == "trip_not_found"


def test_trips_need_login(client):
    assert client.get("/trips").status_code == 401
    assert client.post("/trips", json=JEJU).status_code == 401
    assert client.get(f"/trips/{uuid.uuid4()}").status_code == 401
