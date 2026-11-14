"""앱을 여는 링크 페이지(초대 링크)."""


def test_join_link_page_opens_app_with_code(client):
    response = client.get("/join/abcd2345", headers={"user-agent": "Mozilla/5.0 (iPhone)"})

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert 'href="traveltogether://join?code=ABCD2345"' in response.text
    assert "여행에 초대받았어요" in response.text
    assert 'location.href="traveltogether://join?code=ABCD2345"' in response.text


def test_android_uses_intent_url_for_the_app_package(client):
    response = client.get("/join/ABCD2345", headers={"user-agent": "Mozilla/5.0 (Linux; Android 14) KAKAOTALK"})

    assert "intent://join?code=ABCD2345#Intent;scheme=traveltogether;package=com.kang1031.frontend;end" in response.text


def test_bad_code_shows_an_explanation_without_app_link(client):
    response = client.get("/join/<script>")

    assert response.status_code == 404
    assert "잘못된 초대 링크" in response.text
    assert "traveltogether://" not in response.text and "<script>alert" not in response.text


def test_link_pages_need_no_login_and_are_not_in_the_api_spec(client):
    assert client.get("/join/ABCD2345").status_code == 200
    assert "/join/{code}" not in client.get("/openapi.json").json()["paths"]
