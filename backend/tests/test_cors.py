"""웹 버전(브라우저)에서 API를 부를 수 있게 하는 CORS 허용."""

import pytest

PREFLIGHT = {"access-control-request-method": "GET", "access-control-request-headers": "authorization"}


@pytest.mark.parametrize("origin", ["https://travel-together.expo.app", "https://travel-together--abc123.expo.app", "http://localhost:8081"])
def test_web_app_origins_may_call_the_api(client, origin):
    response = client.options("/trips", headers={"origin": origin, **PREFLIGHT})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_other_sites_are_not_allowed(client):
    response = client.options("/trips", headers={"origin": "https://evil.example.com", **PREFLIGHT})

    assert "access-control-allow-origin" not in response.headers


def test_simple_requests_get_the_allow_origin_header(client):
    response = client.get("/health", headers={"origin": "https://travel-together.expo.app"})

    assert response.headers["access-control-allow-origin"] == "https://travel-together.expo.app"
