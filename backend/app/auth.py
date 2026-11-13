"""인증 검증기 어댑터: 로그인 토큰 → 사용자.

서버의 나머지 코드는 AuthVerifier 인터페이스와 get_current_user 의존성만 안다.
"""

import logging
import uuid
from dataclasses import dataclass
from typing import Protocol

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import ApiError

logger = logging.getLogger(__name__)


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
        self._jwks_url = f"{supabase_url.strip().rstrip('/')}/auth/v1/.well-known/jwks.json"
        if jwks_client is None and supabase_url:
            jwks_client = jwt.PyJWKClient(self._jwks_url)
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
            # SUPABASE_URL이 틀리면 여기로 온다. 어느 주소에서 왜 실패했는지 남긴다.
            logger.warning("JWKS를 가져오지 못했습니다 (%s): %s", self._jwks_url, exc)
            raise AuthUnavailable() from exc
        except (jwt.PyJWTError, ValueError) as exc:
            raise InvalidToken() from exc

        return AuthenticatedUser(
            id=user_id,
            email=claims.get("email") or None,
            display_name=display_name_from_metadata(claims.get("user_metadata") or {}),
        )


# 이메일 가입은 앱이 display_name을 넣는다. 카카오·Google 로그인은 Supabase가 공급자의 이름을 이 필드들에 넣는다.
NAME_FIELDS = ("display_name", "full_name", "name", "nickname", "preferred_username", "user_name")


def display_name_from_metadata(metadata: dict) -> str | None:
    """첫 프로필에 쓸 이름. display_name → 카카오·Google 이름 필드 순. 없으면 None(이메일 앞부분을 쓴다)."""
    for field in NAME_FIELDS:
        value = metadata.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


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
