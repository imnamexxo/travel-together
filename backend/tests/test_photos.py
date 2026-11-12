import uuid

import pytest
from sqlalchemy import text

from app.routers import photos as photos_router
from tests.conftest import bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


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
            return f"/trips/{trip_id}/photos{suffix}"

    return Trip()


def upload(client, trip, who="민지", data=None, taken_at="2026-11-12T15:30:00+09:00", content_type="image/jpeg", **extra):
    form = {k: v for k, v in {"taken_at": taken_at, **extra}.items() if v is not None}
    return client.post(trip.url(), files={"file": ("photo.jpg", data if data is not None else jpeg(), content_type)}, data=form, headers=bearer(trip.tokens[who]))


def listed(client, trip, who="민지"):
    return client.get(trip.url(), headers=bearer(trip.tokens[who])).json()


def test_upload_stores_jpeg_without_exif_and_returns_signed_url(client, trip, storage):
    response = upload(client, trip)

    assert response.status_code == 201
    body = response.json()
    assert body["taken_at"] == "2026-11-12T06:30:00Z"
    assert body["uploader_name"] == "민지"
    assert body["url"].startswith("https://storage.test/trips/") and body["url"].endswith("?expires_in=600")
    [stored] = storage.files.values()
    assert stored == jpeg(with_metadata=False)
    assert b"Exif" not in stored and b"GPS" not in stored


def test_upload_api_has_no_location_fields_and_ignores_them(client, trip, engine):
    schema = client.get("/openapi.json").json()
    upload_body = next(v for k, v in schema["components"]["schemas"].items() if k.startswith("Body_upload_photo"))
    # place_id는 이 여행의 장소를 가리키는 id다. 좌표가 아니다.
    assert set(upload_body["properties"]) == {"file", "taken_at", "place_id"}

    assert upload(client, trip, latitude="33.5", longitude="126.5").status_code == 201
    with engine.connect() as conn:
        columns = {r[0] for r in conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'photos'"))}
    assert not {c for c in columns if "lat" in c or "lng" in c or "lon" in c or "gps" in c}


def test_photo_without_taken_at_is_accepted(client, trip):
    response = upload(client, trip, taken_at=None)

    assert response.status_code == 201
    assert response.json()["taken_at"] is None


def test_bad_taken_at_is_rejected(client, trip):
    response = upload(client, trip, taken_at="어제 저녁")

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "taken_at"


def test_non_jpeg_is_rejected(client, trip, storage):
    response = upload(client, trip, data=b"\x89PNG\r\n\x1a\n...", content_type="image/png")

    assert response.status_code == 415
    assert response.json()["code"] == "not_jpeg"
    assert storage.files == {}


def test_too_large_is_rejected(client, trip, monkeypatch):
    monkeypatch.setattr(photos_router, "MAX_BYTES", 50)

    response = upload(client, trip, data=jpeg() + b"\x00" * 100)

    assert response.status_code == 413
    assert response.json()["code"] == "photo_too_large"


def test_trip_photo_limit(client, trip, monkeypatch):
    monkeypatch.setattr(photos_router, "MAX_PHOTOS", 2)
    upload(client, trip)
    upload(client, trip, who="준호")

    response = upload(client, trip)

    assert response.status_code == 409
    assert response.json()["code"] == "photo_limit"
    body = listed(client, trip)
    assert (body["count"], body["limit"]) == (2, 2)


def test_list_is_sorted_by_taken_time_and_shows_uploader(client, trip):
    upload(client, trip, taken_at="2026-11-13T10:00:00+09:00")
    upload(client, trip, who="준호", taken_at="2026-11-12T10:00:00+09:00")

    body = listed(client, trip, who="준호")

    assert [p["uploader_name"] for p in body["photos"]] == ["준호", "민지"]
    assert (body["count"], body["limit"]) == (2, 200)


def test_other_trip_users_cannot_see_or_touch_photos(client, trip, auth):
    photo = upload(client, trip).json()["id"]
    outsider, _ = auth.add_user()
    other_trip = client.post("/trips", json=JEJU, headers=bearer(outsider)).json()["id"]

    assert client.get(trip.url(), headers=bearer(outsider)).status_code == 404
    assert client.post(trip.url(), files={"file": ("p.jpg", jpeg(), "image/jpeg")}, headers=bearer(outsider)).status_code == 404
    response = client.delete(f"/trips/{other_trip}/photos/{photo}", headers=bearer(outsider))
    assert response.status_code == 404
    assert response.json()["code"] == "photo_not_found"


def test_member_deletes_own_photo_and_organizer_deletes_any(client, trip, storage):
    minjis = upload(client, trip).json()["id"]
    junhos = upload(client, trip, who="준호").json()["id"]
    another = upload(client, trip, who="준호").json()["id"]

    forbidden = client.delete(trip.url(f"/{minjis}"), headers=bearer(trip.tokens["준호"]))
    own = client.delete(trip.url(f"/{junhos}"), headers=bearer(trip.tokens["준호"]))
    organizer = client.delete(trip.url(f"/{another}"), headers=bearer(trip.tokens["민지"]))

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "not_photo_owner"
    assert (own.status_code, organizer.status_code) == (204, 204)
    assert listed(client, trip)["count"] == 1
    assert len(storage.files) == 1


def test_leaving_member_photos_are_deleted(client, trip, storage):
    upload(client, trip)
    upload(client, trip, who="준호")
    upload(client, trip, who="준호")

    assert client.delete(f"/trips/{trip.id}/members/me", headers=bearer(trip.tokens["준호"])).status_code == 204

    body = listed(client, trip)
    assert [p["uploader_name"] for p in body["photos"]] == ["민지"]
    assert len(storage.files) == 1


def test_deleting_trip_removes_photo_files(client, trip, storage, engine):
    upload(client, trip)
    upload(client, trip, who="준호")

    client.delete(f"/trips/{trip.id}", headers=bearer(trip.tokens["민지"]))

    assert storage.files == {}
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM photos")) == 0


def test_storage_failure_is_502_and_nothing_saved(client, trip, storage, engine):
    storage.unavailable = True

    response = upload(client, trip)

    assert response.status_code == 502
    assert response.json()["code"] == "storage_unavailable"
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM photos")) == 0


def test_unknown_photo_is_404(client, trip):
    assert client.delete(trip.url(f"/{uuid.uuid4()}"), headers=bearer(trip.tokens["민지"])).status_code == 404
