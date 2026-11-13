"""실제 인증 검증기 어댑터. 다른 테스트는 가짜를 쓰므로 여기서만 토큰 검증을 확인한다."""

import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.auth import InvalidToken, SupabaseJwtVerifier

SECRET = "test-secret-that-is-long-enough-for-hs256"


def _claims(**overrides):
    claims = {
        "sub": str(uuid.uuid4()),
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "email": "minji@example.com",
        "user_metadata": {"display_name": "민지"},
    }
    claims.update(overrides)
    return claims


class FakeJwksClient:
    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return SimpleNamespace(key=self._public_key)


def test_accepts_es256_token_signed_by_project_key():
    private_key = ec.generate_private_key(ec.SECP256R1())
    verifier = SupabaseJwtVerifier(
        "", jwks_client=FakeJwksClient(private_key.public_key())
    )
    claims = _claims()

    user = verifier.verify(jwt.encode(claims, private_key, algorithm="ES256"))

    assert user.id == uuid.UUID(claims["sub"])
    assert user.email == "minji@example.com"
    assert user.display_name == "민지"


def test_rejects_es256_token_signed_by_other_key():
    project_key = ec.generate_private_key(ec.SECP256R1())
    other_key = ec.generate_private_key(ec.SECP256R1())
    verifier = SupabaseJwtVerifier(
        "", jwks_client=FakeJwksClient(project_key.public_key())
    )

    with pytest.raises(InvalidToken):
        verifier.verify(jwt.encode(_claims(), other_key, algorithm="ES256"))


def test_accepts_legacy_hs256_token():
    verifier = SupabaseJwtVerifier("", jwt_secret=SECRET)

    user = verifier.verify(jwt.encode(_claims(), SECRET, algorithm="HS256"))

    assert user.display_name == "민지"


@pytest.mark.parametrize(
    "claims",
    [
        _claims(exp=int(time.time()) - 10),
        _claims(aud="anon"),
        _claims(sub="not-a-uuid"),
    ],
    ids=["expired", "wrong-audience", "bad-subject"],
)
def test_rejects_bad_claims(claims):
    verifier = SupabaseJwtVerifier("", jwt_secret=SECRET)

    with pytest.raises(InvalidToken):
        verifier.verify(jwt.encode(claims, SECRET, algorithm="HS256"))


def test_rejects_garbage():
    verifier = SupabaseJwtVerifier("", jwt_secret=SECRET)

    with pytest.raises(InvalidToken):
        verifier.verify("garbage")


@pytest.mark.parametrize(
    ("metadata", "expected"),
    [
        ({"display_name": "민지", "full_name": "Kim Minji"}, "민지"),
        ({"full_name": "Kim Minji", "name": "Minji"}, "Kim Minji"),  # Google
        ({"name": "민지짱", "preferred_username": "minji"}, "민지짱"),  # 카카오 닉네임
        ({"nickname": "  준호  "}, "준호"),
        ({"display_name": " ", "user_name": "subin"}, "subin"),
        ({"avatar_url": "https://x"}, None),
    ],
    ids=["email-signup", "google", "kakao", "nickname", "blank-skipped", "none"],
)
def test_display_name_comes_from_social_name_fields(metadata, expected):
    verifier = SupabaseJwtVerifier("", jwt_secret=SECRET)

    user = verifier.verify(jwt.encode(_claims(user_metadata=metadata), SECRET, algorithm="HS256"))

    assert user.display_name == expected


def test_kakao_account_without_email_is_allowed():
    """카카오는 이메일 동의 없이 가입할 수 있다. 그때 토큰의 email은 빈 값이다."""
    verifier = SupabaseJwtVerifier("", jwt_secret=SECRET)

    user = verifier.verify(jwt.encode(_claims(email="", user_metadata={"name": "하린"}), SECRET, algorithm="HS256"))

    assert (user.email, user.display_name) == (None, "하린")
