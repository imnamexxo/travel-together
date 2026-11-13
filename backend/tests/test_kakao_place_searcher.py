"""실제 카카오 장소 검색 어댑터. 다른 테스트는 가짜를 쓰므로 여기서만 요청·응답 변환을 확인한다(네트워크 없음)."""

import httpx
import pytest

from app.place_search import KakaoPlaceSearcher, PlaceSearchUnavailable

KAKAO_RESPONSE = {
    "documents": [
        {
            "id": "8169286",
            "place_name": "동문재래시장",
            "address_name": "제주특별자치도 제주시 일도일동 1436-7",
            "road_address_name": "제주특별자치도 제주시 관덕로14길 20",
            "x": "126.52583",
            "y": "33.51162",
            "category_name": "가정,생활 > 시장 > 전통시장",
        },
        {"id": "1", "place_name": "주소 없는 곳", "address_name": "", "road_address_name": "", "x": "1", "y": "2", "category_name": ""},
    ],
    "meta": {"total_count": 2},
}


def searcher_with(handler):
    return KakaoPlaceSearcher("test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_converts_kakao_documents_and_sends_key():
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers["Authorization"]
        seen["params"] = dict(request.url.params)
        return httpx.Response(200, json=KAKAO_RESPONSE)

    results = searcher_with(handler).search("동문시장")

    assert seen["auth"] == "KakaoAK test-key"
    assert seen["params"] == {"query": "동문시장", "size": "15"}
    first = results[0]
    assert (first.source_place_id, first.name, first.latitude, first.longitude) == ("8169286", "동문재래시장", 33.51162, 126.52583)
    assert first.road_address == "제주특별자치도 제주시 관덕로14길 20"
    assert (results[1].road_address, results[1].category) == (None, None)


def test_near_point_is_sent_as_x_longitude_y_latitude():
    seen = {}

    def handler(request: httpx.Request):
        seen.update(request.url.params)
        return httpx.Response(200, json={"documents": []})

    searcher_with(handler).search("카페", near=(33.5, 126.5))

    assert (seen["x"], seen["y"], seen["sort"]) == ("126.5", "33.5", "distance")


@pytest.mark.parametrize(
    "response",
    [httpx.Response(401, json={"msg": "wrong key"}), httpx.Response(200, json={"unexpected": True}), httpx.Response(200, text="not json")],
    ids=["kakao-error", "unexpected-shape", "not-json"],
)
def test_failures_become_unavailable(response):
    with pytest.raises(PlaceSearchUnavailable):
        searcher_with(lambda request: response).search("카페")


def test_missing_key_is_unavailable():
    with pytest.raises(PlaceSearchUnavailable):
        KakaoPlaceSearcher("").search("카페")


def test_failure_reason_is_logged_without_the_key(caplog):
    """앱에는 짧은 문구만 가므로, 카카오가 준 이유가 서버 로그에 남아야 원인을 찾을 수 있다."""
    def handler(request: httpx.Request):
        return httpx.Response(401, json={"errorType": "AccessDeniedError", "message": "wrong appKey"})

    with pytest.raises(PlaceSearchUnavailable):
        searcher_with(handler).search("카페")

    assert "장소 검색 실패" in caplog.text
    assert "401" in caplog.text and "wrong appKey" in caplog.text
    assert "test-key" not in caplog.text
