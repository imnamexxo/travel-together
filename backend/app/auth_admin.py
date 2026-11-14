"""로그인 계정 관리자 어댑터: 회원 탈퇴 때 Supabase Auth 사용자를 지운다.

서버만 가진 service role 키로 Supabase Admin API를 부른다(앱에는 이 키가 없다).
테스트에서는 가짜로 바꾼다.
"""

import logging
import uuid
from typing import Protocol

import httpx

from app.storage import describe

logger = logging.getLogger(__name__)


class AuthAdminUnavailable(Exception):
    """계정을 지우지 못했다(키 없음, 네트워크, Supabase 오류)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        logger.warning("로그인 계정 삭제 실패: %s", reason)


class AuthAdmin(Protocol):
    def delete_user(self, user_id: uuid.UUID) -> None: ...


class SupabaseAuthAdmin:
    def __init__(self, supabase_url: str, service_key: str, client: httpx.Client | None = None):
        self._base = f"{supabase_url.strip().rstrip('/')}/auth/v1"
        self._key = service_key
        self._client = client or httpx.Client(timeout=10.0)

    def delete_user(self, user_id: uuid.UUID) -> None:
        if not self._key or self._base.startswith("/auth"):
            raise AuthAdminUnavailable("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.")
        try:
            response = self._client.delete(
                f"{self._base}/admin/users/{user_id}",
                headers={"apikey": self._key, "Authorization": f"Bearer {self._key}"},
            )
            # 이미 없는 계정이면 지운 것과 같다.
            if response.status_code != 404:
                response.raise_for_status()
        except (httpx.HTTPError, httpx.InvalidURL) as exc:
            raise AuthAdminUnavailable(describe(exc)) from exc
