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


def test_first_profile_uses_kakao_nickname_and_user_without_email(engine, database_url):
    """실제 토큰 검증기로: 카카오 로그인(이메일 없음, 닉네임만)도 첫 프로필이 닉네임으로 만들어진다."""
    import time
    import uuid

    import jwt
    from fastapi.testclient import TestClient

    from app.auth import SupabaseJwtVerifier
    from app.config import Settings
    from app.main import create_app

    secret = "test-secret-that-is-long-enough-for-hs256"
    app = create_app(settings=Settings(database_url=database_url, supabase_url="", supabase_jwt_secret=secret), auth_verifier=SupabaseJwtVerifier("", jwt_secret=secret))
    claims = {"sub": str(uuid.uuid4()), "aud": "authenticated", "exp": int(time.time()) + 3600, "email": "", "user_metadata": {"name": "제주러버", "provider_id": "123"}}
    with TestClient(app) as client:
        response = client.get("/me", headers={"Authorization": f"Bearer {jwt.encode(claims, secret, algorithm='HS256')}"})

    assert response.status_code == 200
    assert response.json()["display_name"] == "제주러버"
