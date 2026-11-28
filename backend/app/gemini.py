"""Gemini 클라이언트 어댑터: (여행지, 기간, 취향) → 날짜별 추천 일정.

서버의 나머지 코드는 PlanSuggester 인터페이스만 안다. 테스트에서는 가짜로 바꾼다.
응답 형식은 google-genai의 응답 스키마 지정으로 강제하고, 받은 뒤에도 다시 검사한다.
"""

import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta
from datetime import time as TimeOfDay
from typing import Literal, Protocol

from pydantic import BaseModel, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)


class SuggestedStop(BaseModel):
    """Gemini가 돌려줄 추천 일정 한 칸의 모양."""

    date: date
    order: int = Field(ge=1)
    place_name: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=60)
    stay_minutes: int = Field(ge=10, le=720)
    description: str = Field(max_length=200)
    # 그 장소에 도착하는 시각. 앞 장소(그날 첫 장소는 숙소·출발지)에서 오는 이동 시간과 수단.
    start_time: TimeOfDay | None = None
    travel_minutes: int | None = Field(default=None, ge=0, le=600)
    transport: str = Field(default="", max_length=20)

    @field_validator("start_time", mode="before")
    @classmethod
    def _pad_time(cls, value):
        """'9:00'처럼 한 자리 시도 받는다. 빈 문자열은 시각 없음으로 본다."""
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            hour, _, minute = value.partition(":")
            if hour.isdigit() and minute[:2].isdigit():
                return f"{int(hour):02d}:{minute[:2]}"
        return value


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
    start_time: str
    travel_minutes: int
    transport: str


class PlanShape(BaseModel):
    stops: list[StopShape]


@dataclass(frozen=True)
class FixedPlan:
    """추천 구간에 이미 잡혀 있는 일정. 추천은 이걸 피해 빈 시간만 채운다."""

    date: date
    time: TimeOfDay | None
    title: str
    place_name: str | None = None


Pace = Literal["relaxed", "normal", "packed"]
PACE_STOPS: dict[str, str] = {"relaxed": "2~3곳", "normal": "3~5곳", "packed": "5~7곳"}
PACE_LABEL: dict[str, str] = {"relaxed": "여유롭게", "normal": "보통", "packed": "빡빡하게"}


@dataclass(frozen=True)
class PlanRequest:
    destination: str
    # 추천받을 구간(여행 기간 안). 여러 도시를 도는 여행은 구간마다 따로 묻는다.
    start_date: date
    end_date: date
    preferences: str
    # 해외 여행이면 Google 지도 기준으로 장소 이름·지역을 쓰게 한다(ADR 0004).
    overseas: bool = False
    day_start: TimeOfDay = TimeOfDay(9, 0)
    day_end: TimeOfDay = TimeOfDay(21, 0)
    lodging: str = ""
    pace: Pace = "normal"
    fixed: tuple[FixedPlan, ...] = ()


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
    # 시각이 있으면 시각 순, 없으면 받은 순서. 그날 순서(order)는 1부터 다시 매긴다.
    stops = sorted(plan.stops, key=lambda s: (s.date, s.start_time is None, s.start_time or TimeOfDay(0), s.order))
    numbered: list[SuggestedStop] = []
    for stop in stops:
        same_day = sum(1 for n in numbered if n.date == stop.date)
        numbered.append(stop.model_copy(update={"order": same_day + 1}))
    return numbered


def _fixed_lines(request: PlanRequest) -> str:
    if not request.fixed:
        return "없음"
    lines = []
    for plan in sorted(request.fixed, key=lambda p: (p.date, p.time is None, p.time or TimeOfDay(0))):
        when = plan.time.strftime("%H:%M") if plan.time else "시간 미정"
        where = f" ({plan.place_name})" if plan.place_name and plan.place_name != plan.title else ""
        lines.append(f"- {plan.date.isoformat()} {when} {plan.title}{where}")
    return "\n".join(lines)


def build_prompt(request: PlanRequest) -> str:
    days = (request.end_date - request.start_date).days + 1
    dates = ", ".join((request.start_date + timedelta(days=i)).isoformat() for i in range(days))
    if request.overseas:
        intro = "너는 해외 여행 일정을 짜 주는 도우미다.\n"
        naming = (
            "- place_name은 Google 지도에서 검색되는 실제 장소의 이름을 한국어로 쓴다(한국어 표기가 없으면 현지 이름). 지어내지 않는다.\n"
            "- region은 그 장소가 있는 도시와 구역이다(예: 오사카 주오구, 도쿄 시부야구, 파리 7구).\n"
        )
    else:
        intro = "너는 한국 국내 여행 일정을 짜 주는 도우미다.\n"
        naming = (
            "- place_name은 지도 앱에서 검색되는 실제 상호나 장소 이름만 쓴다. 지어내지 않는다.\n"
            "- region은 그 장소가 있는 시·군·구(예: 제주시, 서귀포시, 강릉시)다.\n"
        )
    day_start, day_end = request.day_start.strftime("%H:%M"), request.day_end.strftime("%H:%M")
    return (
        intro
        + f"여행지: {request.destination}\n"
        f"날짜: {dates} ({days}일)\n"
        f"하루 일정 시간: {day_start}~{day_end}\n"
        f"숙소(출발·귀가 지점): {request.lodging or '정하지 않음'}\n"
        f"일정 밀도: {PACE_LABEL[request.pace]}(하루 {PACE_STOPS[request.pace]})\n"
        f"취향: {request.preferences or '특별히 없음'}\n"
        f"이미 잡힌 일정(바꾸거나 다시 추천하지 않는다):\n{_fixed_lines(request)}\n\n"
        "규칙:\n"
        "- 이미 잡힌 일정의 시간을 피해 빈 시간에만 장소를 넣는다. 시간 미정인 일정도 그날 동선에 들어간다고 생각한다.\n"
        "- 하루 동선이 짧아지도록 가까운 곳끼리 묶고, 같은 길을 되돌아가지 않게 순서를 정한다. 숙소가 있으면 숙소에서 출발해 숙소로 돌아온다고 생각한다.\n"
        "- start_time은 그 장소에 도착하는 시각(HH:MM, 24시간)이다. 앞 장소의 start_time + stay_minutes + 이번 travel_minutes 이후여야 하고, 하루 일정 시간 안이어야 한다.\n"
        "- travel_minutes와 transport는 앞 장소(그날 첫 장소는 숙소나 출발지)에서 오는 현실적인 이동 시간(분)과 수단(도보, 대중교통, 자동차, 택시 중 하나)이다.\n"
        "- 점심(11:30~13:30)과 저녁(17:30~19:30)에는 식당을 넣는다. 그 시간에 이미 식사 일정이 있으면 넣지 않는다.\n"
        + naming
        + "- stay_minutes는 예상 체류 시간(분), description은 한 줄 설명(60자 이내)이다.\n"
        "- date는 위 날짜 중 하나를 YYYY-MM-DD로 쓴다. order는 그날 방문 순서(1부터)다."
    )


# 모델이 바쁠 때(503 등) 잠깐 뒤 한 번 더 묻고, 그래도 바쁘면 이 가벼운 모델로 한 번 묻는다.
FALLBACK_MODEL = "gemini-flash-lite-latest"
BUSY_CODES = {429, 500, 502, 503, 504}
TIMEOUT_CODE = 504
# Gemini에 주는 답변 시간 제한(밀리초). 가벼운 모델은 몇 초면 답한다. 붐비는 모델을 오래 기다리지 않고 빨리 가벼운 모델로 넘어가도록 짧게 둔다.
TIMEOUT_MS = 30_000
# 생각 끄기를 거절한(400) 모델. 다음부터는 처음부터 설정 없이 묻는다(헛된 요청 한 번을 줄인다).
_NO_THINKING: set[str] = set()


def generate(client, model: str, *, sleep=time.sleep, **kwargs):
    """Gemini에 묻는다. 바쁘다는 응답이면 같은 모델로 한 번 더, 그다음 가벼운 모델로 한 번 더."""
    from google.genai import errors

    models = [model, model] + ([FALLBACK_MODEL] if model != FALLBACK_MODEL else [])
    for attempt, name in enumerate(models):
        config = kwargs.get("config")
        if name in _NO_THINKING and getattr(config, "thinking_config", None) is not None:
            kwargs = {**kwargs, "config": config.model_copy(update={"thinking_config": None})}
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
                _NO_THINKING.add(name)
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
