"""JPEG 메타데이터 제거와 Supabase Storage 어댑터(네트워크 없이 요청 모양만)."""

import json

import httpx
import pytest

from app.jpeg import NotJpeg, strip_metadata
from app.storage import StorageUnavailable, SupabaseStorage
from tests.jpeg_samples import EXIF_WITH_GPS, ICC, JFIF, jpeg


def test_strip_removes_exif_xmp_and_comments_but_keeps_image():
    cleaned = strip_metadata(jpeg())

    assert cleaned == jpeg(with_metadata=False)
    assert b"Exif" not in cleaned and b"GPS" not in cleaned and b"xmpmeta" not in cleaned
    assert JFIF in cleaned and ICC in cleaned
    assert cleaned.endswith(b"\x12\x34\xff\x00\x56\xff\xd9")


def test_already_clean_jpeg_is_unchanged():
    assert strip_metadata(jpeg(with_metadata=False)) == jpeg(with_metadata=False)


@pytest.mark.parametrize(
    "data",
    [b"", b"\x89PNG\r\n", b"\xff\xd8", b"\xff\xd8" + EXIF_WITH_GPS[:5], b"\xff\xd8\x00\x00"],
    ids=["empty", "png", "only-start", "cut-segment", "garbage"],
)
def test_not_jpeg_or_broken_is_rejected(data):
    with pytest.raises(NotJpeg):
        strip_metadata(data)


def storage_with(handler):
    return SupabaseStorage("https://proj.supabase.co/", "sb_secret_x", "trip-media", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_upload_posts_bytes_to_bucket_path_with_service_key():
    seen = {}

    def handler(request: httpx.Request):
        seen.update(method=request.method, url=str(request.url), headers=request.headers, body=request.content)
        return httpx.Response(200, json={"Key": "ok"})

    storage_with(handler).upload("trips/t/photos/p.jpg", b"jpegbytes", "image/jpeg")

    assert (seen["method"], seen["url"]) == ("POST", "https://proj.supabase.co/storage/v1/object/trip-media/trips/t/photos/p.jpg")
    assert seen["headers"]["apikey"] == "sb_secret_x"
    assert seen["headers"]["authorization"] == "Bearer sb_secret_x"
    assert seen["headers"]["content-type"] == "image/jpeg"
    assert seen["body"] == b"jpegbytes"


def test_signed_urls_map_paths_to_full_urls():
    seen = {}

    def handler(request: httpx.Request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=[
            {"path": "a.jpg", "signedURL": "/object/sign/trip-media/a.jpg?token=t1", "error": None},
            {"path": "gone.jpg", "signedURL": None, "error": "Not found"},
        ])

    urls = storage_with(handler).signed_urls(["a.jpg", "gone.jpg"], 600)

    assert seen["body"] == {"expiresIn": 600, "paths": ["a.jpg", "gone.jpg"]}
    assert urls == {"a.jpg": "https://proj.supabase.co/storage/v1/object/sign/trip-media/a.jpg?token=t1"}


def test_delete_sends_prefixes():
    seen = {}

    def handler(request: httpx.Request):
        seen.update(method=request.method, url=str(request.url), body=json.loads(request.content))
        return httpx.Response(200, json=[])

    storage_with(handler).delete(["a.jpg", "b.jpg"])

    assert (seen["method"], seen["url"], seen["body"]) == ("DELETE", "https://proj.supabase.co/storage/v1/object/trip-media", {"prefixes": ["a.jpg", "b.jpg"]})


def test_errors_and_missing_key_are_unavailable():
    with pytest.raises(StorageUnavailable):
        storage_with(lambda request: httpx.Response(403, json={"error": "denied"})).upload("k", b"x", "image/jpeg")
    with pytest.raises(StorageUnavailable):
        SupabaseStorage("https://proj.supabase.co", "", "trip-media").upload("k", b"x", "image/jpeg")
