"""사진 썸네일: 목록·지도는 작은 사진(긴 변 400px)을 받아 저장소 전송량을 줄인다."""

import pytest

from app.routers import photos as photos_router
from tests.conftest import bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


@pytest.fixture
def setup(client, auth):
    minji, _ = auth.add_user(display_name="민지")
    trip_id = client.post("/trips", json=JEJU, headers=bearer(minji)).json()["id"]
    return trip_id, minji


def upload(client, trip_id, token, thumbnail=None, thumb_type="image/jpeg"):
    files = {"file": ("photo.jpg", jpeg(), "image/jpeg")}
    if thumbnail is not None:
        files["thumbnail"] = ("thumb.jpg", thumbnail, thumb_type)
    return client.post(f"/trips/{trip_id}/photos", files=files, data={"taken_at": "2026-11-12T15:30:00+09:00"}, headers=bearer(token))


def test_thumbnail_is_stored_without_exif_and_listed_separately(client, setup, storage):
    trip_id, minji = setup

    body = upload(client, trip_id, minji, thumbnail=jpeg()).json()

    assert body["thumbnail_url"] != body["url"]
    assert "_thumb.jpg" in body["thumbnail_url"]
    thumbs = [data for key, data in storage.files.items() if key.endswith("_thumb.jpg")]
    assert thumbs == [jpeg(with_metadata=False)]
    listed = client.get(f"/trips/{trip_id}/photos", headers=bearer(minji)).json()["photos"][0]
    assert (listed["url"], listed["thumbnail_url"]) == (body["url"], body["thumbnail_url"])


def test_photo_without_thumbnail_uses_original_in_lists(client, setup, storage):
    trip_id, minji = setup

    body = upload(client, trip_id, minji).json()

    assert body["thumbnail_url"] == body["url"]
    assert len(storage.files) == 1


def test_deleting_photo_removes_thumbnail_too(client, setup, storage):
    trip_id, minji = setup
    photo_id = upload(client, trip_id, minji, thumbnail=jpeg()).json()["id"]

    client.delete(f"/trips/{trip_id}/photos/{photo_id}", headers=bearer(minji))

    assert storage.files == {}


def test_deleting_trip_removes_thumbnails(client, setup, storage):
    trip_id, minji = setup
    upload(client, trip_id, minji, thumbnail=jpeg())

    client.delete(f"/trips/{trip_id}", headers=bearer(minji))

    assert storage.files == {}


def test_bad_thumbnails_are_rejected_without_storing_anything(client, setup, storage, monkeypatch):
    trip_id, minji = setup
    monkeypatch.setattr(photos_router, "MAX_THUMBNAIL_BYTES", 10)

    too_big = upload(client, trip_id, minji, thumbnail=jpeg())
    monkeypatch.setattr(photos_router, "MAX_THUMBNAIL_BYTES", 512 * 1024)
    not_jpeg = upload(client, trip_id, minji, thumbnail=b"not an image", thumb_type="image/png")

    assert (too_big.status_code, not_jpeg.status_code) == (413, 415)
    assert storage.files == {}


def test_map_photos_carry_thumbnail_url(client, setup, places):
    trip_id, minji = setup
    places.add("k1", "동문재래시장")
    place_id = client.post(
        f"/trips/{trip_id}/plan-items",
        json={"date": "2026-11-12", "title": "시장", "place": {"source_place_id": "k1", "name": "동문재래시장"}},
        headers=bearer(minji),
    ).json()["place"]["id"]
    photo_id = upload(client, trip_id, minji, thumbnail=jpeg()).json()["id"]
    client.put(f"/trips/{trip_id}/photos/{photo_id}/place", json={"place_id": place_id}, headers=bearer(minji))

    [spot] = client.get(f"/trips/{trip_id}/map", headers=bearer(minji)).json()["places"]

    assert "_thumb.jpg" in spot["photos"][0]["thumbnail_url"]
