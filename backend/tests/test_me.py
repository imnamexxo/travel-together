from tests.conftest import bearer


def test_no_token_is_401_in_common_error_format(client):
    response = client.get("/me")

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "unauthorized"
    assert body["message"]
    assert body["details"] == []


def test_invalid_token_is_401_in_common_error_format(client):
    response = client.get("/me", headers=bearer("not-a-real-token"))

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_non_bearer_scheme_is_401(client, auth):
    token, _ = auth.add_user(display_name="민지")

    response = client.get("/me", headers={"Authorization": f"Basic {token}"})

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_me_returns_display_name_chosen_at_signup(client, auth):
    token, user = auth.add_user(email="minji@example.com", display_name="민지")

    response = client.get("/me", headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == {"id": str(user.id), "display_name": "민지"}


def test_me_falls_back_to_email_name_without_display_name(client, auth):
    token, _ = auth.add_user(email="junho@example.com")

    response = client.get("/me", headers=bearer(token))

    assert response.json()["display_name"] == "junho"


def test_me_is_stable_across_calls(client, auth):
    token, _ = auth.add_user(email="subin@example.com", display_name="수빈")

    first = client.get("/me", headers=bearer(token)).json()
    second = client.get("/me", headers=bearer(token)).json()

    assert first == second


def test_each_user_sees_own_profile(client, auth):
    minji_token, _ = auth.add_user(display_name="민지")
    junho_token, _ = auth.add_user(display_name="준호")

    assert client.get("/me", headers=bearer(minji_token)).json()["display_name"] == "민지"
    assert client.get("/me", headers=bearer(junho_token)).json()["display_name"] == "준호"
