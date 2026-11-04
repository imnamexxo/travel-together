"""인증 검증기 어댑터: 로그인 토큰 → 사용자.

서버의 나머지 코드는 AuthVerifier 인터페이스와 get_current_user 의존성만 안다.
"""

import uuid
from dataclasses import dataclass
from typing import Protocol

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import ApiError


@dataclass(frozen=True)
class AuthenticatedUser:
    id: uuid.UUID
    email: str | None
    # 가입할 때 앱이 user_metadata.display_name으로 넣은 값
    display_name: str | None


class InvalidToken(Exception):
    pass


class AuthUnavailable(Exception):
    """토큰 서명 키를 가져오지 못했다. 토큰이 틀렸다는 뜻이 아니다."""


class AuthVerifier(Protocol):
    def verify(self, token: str) -> AuthenticatedUser: ...


class SupabaseJwtVerifier:
    """Supabase Auth가 발급한 액세스 토큰을 검증한다.

    새 프로젝트의 비대칭 서명 키(JWKS)를 기본으로 쓰고,
    SUPABASE_JWT_SECRET이 있으면 예전 방식(HS256) 토큰도 받는다.
    """

    def __init__(self, supabase_url: str, jwt_secret: str = "", jwks_client=None):
        self._jwt_secret = jwt_secret
        if jwks_client is None and supabase_url:
            jwks_client = jwt.PyJWKClient(
                f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            )
        self._jwks_client = jwks_client

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            if jwt.get_unverified_header(token).get("alg") == "HS256":
                if not self._jwt_secret:
                    raise InvalidToken("HS256 토큰을 검증할 비밀키가 없습니다.")
                key, algorithms = self._jwt_secret, ["HS256"]
            else:
                if self._jwks_client is None:
                    raise InvalidToken("SUPABASE_URL이 설정되지 않았습니다.")
                key = self._jwks_client.get_signing_key_from_jwt(token).key
                algorithms = ["ES256", "RS256"]
            claims = jwt.decode(
                token,
                key,
                algorithms=algorithms,
                audience="authenticated",
                options={"require": ["sub", "exp"]},
            )
            user_id = uuid.UUID(claims["sub"])
        except jwt.PyJWKClientConnectionError as exc:
            raise AuthUnavailable() from exc
        except (jwt.PyJWTError, ValueError) as exc:
            raise InvalidToken() from exc

        metadata = claims.get("user_metadata") or {}
        return AuthenticatedUser(
            id=user_id,
            email=claims.get("email"),
            display_name=metadata.get("display_name"),
        )


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedUser:
    if credentials is None:
        raise ApiError(401, "unauthorized", "로그인이 필요합니다.")
    verifier: AuthVerifier = request.app.state.auth_verifier
    try:
        return verifier.verify(credentials.credentials)
    except InvalidToken:
        raise ApiError(401, "unauthorized", "로그인이 만료되었거나 올바르지 않습니다.")
    except AuthUnavailable:
        raise ApiError(502, "auth_unavailable", "로그인 확인 서버에 연결하지 못했습니다.")
