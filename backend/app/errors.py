from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str


class ErrorResponse(BaseModel):
    """모든 오류 응답의 공통 형식."""

    code: str
    message: str
    details: list[ErrorDetail] = []


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


ERROR_RESPONSES = {
    401: {"model": ErrorResponse, "description": "로그인 필요"},
    422: {"model": ErrorResponse, "description": "검증 실패"},
}

_HTTP_CODES = {
    401: ("unauthorized", "로그인이 필요합니다."),
    403: ("forbidden", "권한이 없습니다."),
    404: ("not_found", "찾을 수 없습니다."),
    405: ("method_not_allowed", "허용되지 않는 요청입니다."),
}


def _response(status_code: int, body: ErrorResponse) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=body.model_dump())


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return _response(
            exc.status_code,
            ErrorResponse(code=exc.code, message=exc.message, details=exc.details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code, message = _HTTP_CODES.get(
            exc.status_code, ("error", "요청을 처리하지 못했습니다.")
        )
        return _response(exc.status_code, ErrorResponse(code=code, message=message))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = [
            ErrorDetail(
                field=".".join(str(part) for part in error["loc"][1:]) or None,
                message=error["msg"],
            )
            for error in exc.errors()
        ]
        return _response(
            422,
            ErrorResponse(
                code="validation_failed",
                message="입력값을 확인해 주세요.",
                details=details,
            ),
        )
