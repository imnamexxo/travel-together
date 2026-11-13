"""요청마다 처리 시간과 DB 질의 횟수를 서버 로그(Render Logs)에 한 줄씩 남긴다.

예: GET /trips/{trip_id}/expenses 200 0.35초 DB 4번
경로는 라우트 모양(/trips/{trip_id}/…)으로 남겨 id·검색어 같은 값은 남기지 않는다.
"""

import contextvars
import logging
import time

from fastapi import FastAPI, Request
from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger("app.requests")
# 지금 요청의 DB 질의 수. 동기 엔드포인트는 스레드에서 돌지만 contextvar는 그대로 따라간다.
_queries: contextvars.ContextVar[list[int] | None] = contextvars.ContextVar("queries", default=None)


@event.listens_for(Engine, "before_cursor_execute")
def _count_query(*_args, **_kwargs) -> None:
    box = _queries.get()
    if box is not None:
        box[0] += 1


def install_request_log(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_request(request: Request, call_next):
        if request.url.path == "/health":  # 깨우기용 주기 호출은 남기지 않는다
            return await call_next(request)
        box = [0]
        token = _queries.set(box)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            _queries.reset(token)
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        logger.info("%s %s %d %.2f초 DB %d번", request.method, path, response.status_code, time.perf_counter() - started, box[0])
        return response
