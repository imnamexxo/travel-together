"""사진 파일 정리: 저장소 접근과, DB에서 지운 사진의 파일 삭제."""

import logging

from fastapi import Request

from app.storage import ObjectStorage, StorageUnavailable

logger = logging.getLogger(__name__)

SIGNED_URL_SECONDS = 10 * 60


def get_storage(request: Request) -> ObjectStorage:
    return request.app.state.storage


def delete_files(storage: ObjectStorage, keys: list[str]) -> None:
    """DB 커밋이 끝난 뒤 부른다. 파일 삭제가 실패해도 데이터는 이미 지워졌으므로 기록만 남긴다."""
    if not keys:
        return
    try:
        storage.delete(keys)
    except StorageUnavailable as exc:
        logger.warning("저장소 파일 %d개를 지우지 못했습니다: %s", len(keys), exc)
