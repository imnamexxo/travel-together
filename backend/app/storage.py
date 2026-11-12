"""객체 저장소 어댑터: 업로드, 삭제, 짧은 만료의 서명 URL. Supabase Storage 비공개 버킷을 쓴다.

서버의 나머지 코드는 ObjectStorage 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
"""

from typing import Protocol

import httpx


class StorageUnavailable(Exception):
    pass


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
            raise StorageUnavailable(str(exc)) from exc

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
