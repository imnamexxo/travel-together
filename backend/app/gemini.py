"""Gemini 클라이언트 어댑터: (여행지, 기간, 취향) → 날짜별 추천 일정.

서버의 나머지 코드는 PlanSuggester 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
응답 형식은 google-genai의 응답 스키마 지정으로 강제하고, 받은 뒤에도 다시 검사한다.
"""

import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Protocol

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


class SuggestedStop(BaseModel):
    """Gemini가 돌려줄 추천 일정 한 칸의 모양."""

    date: date
    order: int = Field(ge=1)
    place_name: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=60)
    stay_minutes: int = Field(ge=10, le=720)
    description: str = Field(max_length=200)


class SuggestedPlan(BaseModel):
    stops: list[SuggestedStop] = Field(min_length=1, max_length=60)


class StopShape(BaseModel):
    """Gemini에 보내는 응답 모양. 형식(format)·길이·범위 제한은 모델에 따라 400으로 거절될 수 있어 타입만 둔다.
    받은 답은 SuggestedPlan으로 다시 엄격하게 검사한다."""

    date: str
    order: int
    place_name: str
    region: str
    stay_minutes: int
    description: str


class PlanShape(BaseModel):
    stops: list[StopShape]


@dataclass(frozen=True)
class PlanRequest:
    destination: str
    start_date: date
    end_date: date
    preferences: str


class SuggestionFormatError(Exception):
    """응답이 약속한 형식이 아니다(다시 요청해 볼 만하다)."""


class SuggestionUnavailable(Exception):
    """Gemini에 묻지 못했다(키 없음, 네트워크, 할당량)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        # 앱에는 짧은 문구만 가므로, 원인(키 없음, 401, 버킷 없음 등)은 Render 로그에서 본다. 키 값은 담기지 않는다.
        logger.warning("Gemini 추천 요청 실패: %s", reason)


class PlanSuggester(Protocol):
    def suggest(self, request: PlanRequest) -> list[SuggestedStop]: ...


def validate_plan(raw: str | None, request: PlanRequest) -> list[SuggestedStop]:
    """형식과 날짜 범위를 검사한다. 어긋나면 SuggestionFormatError."""
    if not raw:
        raise SuggestionFormatError("빈 응답")
    try:
        plan = SuggestedPlan.model_validate_json(raw)
    except ValidationError as exc:
        raise SuggestionFormatError(str(exc)) from exc
    outside = [s for s in plan.stops if not request.start_date <= s.date <= request.end_date]
    if outside:
        raise SuggestionFormatError(f"여행 기간 밖 날짜: {outside[0].date}")
    return sorted(plan.stops, key=lambda s: (s.date, s.order))


def build_prompt(request: PlanRequest) -> str:
    days = (request.end_date - request.start_date).days + 1
    dates = ", ".join((request.start_date + timedelta(days=i)).isoformat() for i in range(days))
    return (
        "너는 한국 국내 여행 일정을 짜 주는 도우미다.\n"
        f"여행지: {request.destination}\n"
        f"날짜: {dates} ({days}일)\n"
        f"취향: {request.preferences or '특별히 없음'}\n\n"
        "규칙:\n"
        "- 날짜마다 3~5곳을 하루 동선 순서대로 추천한다(order는 그날 1부터).\n"
        "- place_name은 지도 앱에서 검색되는 실제 상호나 장소 이름만 쓴다. 지어내지 않는다.\n"
        "- region은 그 장소가 있는 시·군·구(예: 제주시, 서귀포시, 강릉시)다.\n"
        "- stay_minutes는 예상 체류 시간(분), description은 한 줄 설명(60자 이내)이다.\n"
        "- date는 위 날짜 중 하나를 YYYY-MM-DD로 쓴다."
    )


# 모델이 바쁠 때(503 등) 잠깐 뒤 한 번 더 묻고, 그래도 바쁘면 이 가벼운 모델로 한 번 묻는다.
FALLBACK_MODEL = "gemini-flash-lite-latest"
BUSY_CODES = {429, 500, 502, 503, 504}
TIMEOUT_CODE = 504
# Gemini에 주는 답변 시간 제한(밀리초). 여행 기간 전체 일정을 한 번에 만들어서 60초로는 모자랄 때가 있다.
TIMEOUT_MS = 120_000


def generate(client, model: str, *, sleep=time.sleep, **kwargs):
    """Gemini에 묻는다. 바쁘다는 응답이면 같은 모델로 한 번 더, 그다음 가벼운 모델로 한 번 더."""
    from google.genai import errors

    models = [model, model] + ([FALLBACK_MODEL] if model != FALLBACK_MODEL else [])
    for attempt, name in enumerate(models):
        started = time.monotonic()
        try:
            response = client.models.generate_content(model=name, **kwargs)
            logger.info("Gemini %s 응답 %.1f초", name, time.monotonic() - started)
            return response
        except errors.APIError as exc:
            config = kwargs.get("config")
            if exc.code == 400 and getattr(config, "thinking_config", None) is not None:
                # 이 모델이 생각 끄기를 지원하지 않으면 400이 난다. 생각 설정 없이 한 번 더 묻는다.
                logger.warning("Gemini %s가 생각 끄기를 받지 않아 설정 없이 다시 묻습니다", name)
                return generate(client, name, sleep=sleep, **{**kwargs, "config": config.model_copy(update={"thinking_config": None})})
            if exc.code not in BUSY_CODES or attempt == len(models) - 1:
                logger.warning("Gemini %s 요청 실패(%s)", name, exc.code)
                raise
            logger.warning("Gemini %s 바쁨(%s), 다시 묻습니다", name, exc.code)
            if exc.code == TIMEOUT_CODE and name != FALLBACK_MODEL:
                # 시간 초과는 같은 모델로 다시 물어도 또 오래 걸리므로 바로 가벼운 모델로 간다.
                return generate(client, FALLBACK_MODEL, sleep=sleep, **kwargs)
            if attempt == 0:
                sleep(1.5)
    raise AssertionError("unreachable")


class GeminiPlanSuggester:
    def __init__(self, api_key: str, model: str, client=None, sleep=time.sleep):
        self._api_key = api_key
        self._model = model
        self._client = client
        self._sleep = sleep

    def _get_client(self):
        if self._client is None:
            from google import genai
            from google.genai import types

            self._client = genai.Client(api_key=self._api_key, http_options=types.HttpOptions(timeout=TIMEOUT_MS))
        return self._client

    def suggest(self, request: PlanRequest) -> list[SuggestedStop]:
        if not self._api_key:
            raise SuggestionUnavailable("GEMINI_API_KEY가 설정되지 않았습니다.")
        from google.genai import errors, types

        try:
            response = generate(
                self._get_client(),
                self._model,
                sleep=self._sleep,
                contents=build_prompt(request),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PlanShape,
                    temperature=0.7,
                    # 생각(thinking)은 답을 몇 배 느리게 만든다. 일정 추천에는 필요 없다.
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
        except errors.APIError as exc:
            raise SuggestionUnavailable(str(exc)) from exc
        except Exception as exc:  # 네트워크 오류 등. 원인은 로그로만 남긴다.
            raise SuggestionUnavailable(repr(exc)) from exc
        return validate_plan(response.text, request)
