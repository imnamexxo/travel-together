"""객체 저장소 어댑터: 업로드, 삭제, 짧은 만료의 서명 URL. Supabase Storage 비공개 버킷을 쓴다.

서버의 나머지 코드는 ObjectStorage 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
"""

import logging
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)


def describe(exc: Exception) -> str:
    """HTTP 오류면 상대 서버가 준 이유(예: Bucket not found)도 붙인다."""
    if isinstance(exc, httpx.HTTPStatusError):
        return f"{exc} / {exc.response.text[:300]}"
    return repr(exc)


class StorageUnavailable(Exception):
    """저장소에 올리거나 지우거나 서명 URL을 받지 못했다(키 없음, 버킷 없음, 네트워크)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        # 앱에는 짧은 문구만 가므로, 원인(키 없음, 401, 버킷 없음 등)은 Render 로그에서 본다. 키 값은 담기지 않는다.
        logger.warning("Supabase 저장소 요청 실패: %s", reason)


class ObjectStorage(Protocol):
    def upload(self, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, keys: list[str]) -> None: ...

    def signed_urls(self, keys: list[str], expires_in: int) -> dict[str, str]:
        """키 → 서명 URL. 만료(초)가 지나면 열리지 않는다."""
        ...


class SupabaseStorage:
    def __init__(self, supabase_url: str, service_key: str, bucket: str, client: httpx.Client | None = None):
        self._base = f"{supabase_url.rstrip('/')}/storage/v1"
        self._key = service_key
        self._bucket = bucket
        self._client = client or httpx.Client(timeout=20.0)

    def _headers(self) -> dict[str, str]:
        if not self._key or self._base.startswith("/storage"):
            raise StorageUnavailable("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.")
        return {"apikey": self._key, "Authorization": f"Bearer {self._key}"}

    def _send(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            response = self._client.request(method, f"{self._base}{path}", headers={**self._headers(), **kwargs.pop("headers", {})}, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPError as exc:
            raise StorageUnavailable(describe(exc)) from exc

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        self._send("POST", f"/object/{self._bucket}/{key}", content=data, headers={"Content-Type": content_type, "x-upsert": "false"})

    def delete(self, keys: list[str]) -> None:
        if keys:
            self._send("DELETE", f"/object/{self._bucket}", json={"prefixes": keys})

    def signed_urls(self, keys: list[str], expires_in: int) -> dict[str, str]:
        if not keys:
            return {}
        response = self._send("POST", f"/object/sign/{self._bucket}", json={"expiresIn": expires_in, "paths": keys})
        try:
            return {row["path"]: f"{self._base}{row['signedURL']}" for row in response.json() if row.get("signedURL")}
        except (KeyError, TypeError, ValueError) as exc:
            raise StorageUnavailable(str(exc)) from exc
