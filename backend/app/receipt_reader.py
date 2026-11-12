"""Gemini 영수증 분석 어댑터: 영수증 이미지 → 지출 초안(상호, 품목, 수량, 품목 금액, 총액).

서버의 나머지 코드는 ReceiptReader 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
읽지 못한 값은 null로 받는다. 응답 형식은 google-genai의 응답 스키마 지정으로 강제한다.
"""

import logging
from typing import Protocol

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


class ReceiptLine(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    quantity: int | None = Field(default=None, ge=1, le=9999)
    amount: int | None = Field(default=None, ge=0, le=100_000_000)


class ReceiptDraft(BaseModel):
    merchant_name: str | None = Field(default=None, max_length=50)
    # 영수증에 찍힌 날짜·시각(한국 시간), "YYYY-MM-DD HH:MM". 못 읽으면 null.
    paid_at_local: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")
    total_amount: int | None = Field(default=None, ge=0, le=100_000_000)
    items: list[ReceiptLine] = Field(default=[], max_length=100)


class ReceiptUnreadable(Exception):
    """분석하지 못했다(키 없음, 네트워크, 형식 오류). 영수증은 저장하고 빈 초안으로 이어간다."""

    def __init__(self, reason: str):
        super().__init__(reason)
        # 앱에는 짧은 문구만 가므로, 원인(키 없음, 401, 버킷 없음 등)은 Render 로그에서 본다. 키 값은 담기지 않는다.
        logger.warning("Gemini 영수증 분석 실패: %s", reason)


class ReceiptReader(Protocol):
    def read(self, image: bytes) -> ReceiptDraft: ...


PROMPT = (
    "이 사진은 한국 영수증이다. 다음을 JSON으로 뽑아라.\n"
    "- merchant_name: 상호\n"
    "- paid_at_local: 결제 날짜와 시각, \"YYYY-MM-DD HH:MM\"\n"
    "- total_amount: 총 결제 금액(원, 숫자만)\n"
    "- items: 품목마다 name(품목명), quantity(수량), amount(그 품목의 금액 합계, 원)\n"
    "규칙: 읽을 수 없거나 확실하지 않은 값은 지어내지 말고 null로 둔다. 할인은 해당 품목 금액에서 뺀 값으로 적는다."
)


def parse_receipt(raw: str | None) -> ReceiptDraft:
    if not raw:
        raise ReceiptUnreadable("빈 응답")
    try:
        return ReceiptDraft.model_validate_json(raw)
    except ValidationError as exc:
        raise ReceiptUnreadable(str(exc)) from exc


class GeminiReceiptReader:
    def __init__(self, api_key: str, model: str, client=None):
        self._api_key = api_key
        self._model = model
        self._client = client

    def _get_client(self):
        if self._client is None:
            from google import genai
            from google.genai import types

            self._client = genai.Client(api_key=self._api_key, http_options=types.HttpOptions(timeout=60_000))
        return self._client

    def read(self, image: bytes) -> ReceiptDraft:
        if not self._api_key:
            raise ReceiptUnreadable("GEMINI_API_KEY가 설정되지 않았습니다.")
        from google.genai import types

        try:
            response = self._get_client().models.generate_content(
                model=self._model,
                contents=[types.Part.from_bytes(data=image, mime_type="image/jpeg"), PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ReceiptDraft,
                    temperature=0,
                ),
            )
        except Exception as exc:  # API 오류·네트워크 등. 어느 쪽이든 빈 초안으로 이어간다.
            raise ReceiptUnreadable(repr(exc)) from exc
        return parse_receipt(response.text)
