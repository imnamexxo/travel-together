"""실제 Gemini 어댑터. 네트워크 없이 가짜 google-genai 클라이언트로 요청·응답 변환을 확인한다."""

import datetime as dt
import json
from types import SimpleNamespace

import pytest

from app.gemini import (
    FixedPlan,
    GeminiPlanSuggester,
    ImportRequest,
    PlanRequest,
    PlanShape,
    SuggestionFormatError,
    SuggestionUnavailable,
    build_import_prompt,
    build_prompt,
    validate_plan,
)

@pytest.fixture(autouse=True)
def _forget_models_without_thinking():
    """생각 끄기를 거절한 모델 기억은 테스트마다 비운다."""
    from app import gemini

    gemini._NO_THINKING.clear()
    yield
    gemini._NO_THINKING.clear()


REQUEST = PlanRequest("제주", dt.date(2026, 11, 12), dt.date(2026, 11, 13), "맛집 위주")


def plan_json(*stops):
    return json.dumps({"stops": list(stops)}, ensure_ascii=False)


def stop(day="2026-11-12", order=1, name="동문시장"):
    return {"date": day, "order": order, "place_name": name, "region": "제주시", "stay_minutes": 60, "description": "시장 구경"}


class FakeModels:
    def __init__(self, text=None, error=None):
        self.text, self.error, self.calls = text, error, []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(text=self.text)


def suggester_with(models, key="key"):
    return GeminiPlanSuggester(key, "gemini-flash-latest", client=SimpleNamespace(models=models))


def test_parses_and_sorts_stops_and_asks_for_json_schema():
    models = FakeModels(plan_json(stop("2026-11-13", 1, "함덕"), stop("2026-11-12", 2, "카페"), stop("2026-11-12", 1, "시장")))

    stops = suggester_with(models).suggest(REQUEST)

    assert [(s.date.isoformat(), s.order, s.place_name) for s in stops] == [("2026-11-12", 1, "시장"), ("2026-11-12", 2, "카페"), ("2026-11-13", 1, "함덕")]
    call = models.calls[0]
    assert call["model"] == "gemini-flash-latest"
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_schema is PlanShape
    assert "2026-11-12, 2026-11-13" in call["contents"]


@pytest.mark.parametrize(
    "raw",
    [None, "", "not json", plan_json(), plan_json({**stop(), "order": 0}), plan_json(stop(day="2026-11-20"))],
    ids=["none", "empty", "not-json", "no-stops", "bad-order", "outside-trip"],
)
def test_wrong_shape_is_format_error(raw):
    with pytest.raises(SuggestionFormatError):
        validate_plan(raw, REQUEST)


def test_api_failure_and_missing_key_are_unavailable():
    with pytest.raises(SuggestionUnavailable):
        suggester_with(FakeModels(error=ConnectionError("down"))).suggest(REQUEST)
    with pytest.raises(SuggestionUnavailable):
        GeminiPlanSuggester("", "gemini-flash-latest").suggest(REQUEST)


def test_prompt_mentions_destination_preferences_and_real_places_rule():
    prompt = build_prompt(REQUEST)

    assert "여행지: 제주" in prompt
    assert "취향: 맛집 위주" in prompt
    assert "실제 상호" in prompt


class SequenceModels:
    """차례로 예외 또는 응답 텍스트를 돌려준다. 물은 모델 이름을 기록한다."""

    def __init__(self, *results):
        self.results, self.models = list(results), []

    def generate_content(self, **kwargs):
        self.models.append(kwargs["model"])
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return SimpleNamespace(text=result)


def busy():
    from google.genai import errors

    return errors.ServerError(503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})


def busy_suggester(models, slept):
    return GeminiPlanSuggester("key", "gemini-flash-latest", client=SimpleNamespace(models=models), sleep=slept.append)


def test_busy_model_is_asked_again_after_a_short_wait():
    models, slept = SequenceModels(busy(), plan_json(stop())), []

    stops = busy_suggester(models, slept).suggest(REQUEST)

    assert [s.place_name for s in stops] == ["동문시장"]
    assert models.models == ["gemini-flash-latest", "gemini-flash-latest"]
    assert slept == [1.5]


def test_still_busy_falls_back_to_the_lighter_model_then_gives_up():
    models, slept = SequenceModels(busy(), busy(), plan_json(stop())), []
    assert busy_suggester(models, slept).suggest(REQUEST)
    assert models.models == ["gemini-flash-latest", "gemini-flash-latest", "gemini-flash-lite-latest"]

    with pytest.raises(SuggestionUnavailable):
        busy_suggester(SequenceModels(busy(), busy(), busy()), []).suggest(REQUEST)


def bad_request():
    from google.genai import errors

    return errors.ClientError(400, {"error": {"code": 400, "message": "bad", "status": "INVALID_ARGUMENT"}})


def test_thinking_is_turned_off_and_a_400_is_retried_once_without_it():
    """생각(thinking)을 끄면 빠르다. 그 설정을 받지 않는 모델(400)이면 설정 없이 한 번만 다시 묻는다."""
    models = SequenceModels(bad_request(), plan_json(stop()))
    configs = []
    original = models.generate_content
    models.generate_content = lambda **kw: (configs.append(kw["config"]), original(**kw))[1]

    assert busy_suggester(models, []).suggest(REQUEST)
    assert configs[0].thinking_config.thinking_budget == 0
    assert configs[1].thinking_config is None
    assert models.models == ["gemini-flash-latest", "gemini-flash-latest"]


def test_other_api_errors_are_not_retried_further():
    models = SequenceModels(bad_request(), bad_request())

    with pytest.raises(SuggestionUnavailable):
        busy_suggester(models, []).suggest(REQUEST)
    assert models.models == ["gemini-flash-latest", "gemini-flash-latest"]


def test_timeout_goes_straight_to_the_lighter_model():
    from google.genai import errors

    timeout = errors.ServerError(504, {"error": {"code": 504, "message": "Deadline expired", "status": "DEADLINE_EXCEEDED"}})
    models, slept = SequenceModels(timeout, plan_json(stop())), []

    assert busy_suggester(models, slept).suggest(REQUEST)
    assert models.models == ["gemini-flash-latest", "gemini-flash-lite-latest"]
    assert slept == []


def test_schema_sent_to_gemini_has_only_types():
    """format·길이·범위·패턴 제한은 모델에 따라 400(INVALID_ARGUMENT)이 되므로 보내지 않는다."""
    from app.receipt_reader import ReceiptShape

    for shape in (PlanShape, ReceiptShape):
        text = json.dumps(shape.model_json_schema())
        for keyword in ("format", "maxLength", "minLength", "minimum", "maximum", "pattern", "maxItems", "minItems"):
            assert f'"{keyword}"' not in text, (shape.__name__, keyword)


def test_model_that_rejected_thinking_is_asked_without_it_next_time():
    first = SequenceModels(bad_request(), plan_json(stop()))
    assert busy_suggester(first, []).suggest(REQUEST)

    second = SequenceModels(plan_json(stop()))
    configs = []
    original = second.generate_content
    second.generate_content = lambda **kw: (configs.append(kw["config"]), original(**kw))[1]
    assert busy_suggester(second, []).suggest(REQUEST)

    assert len(configs) == 1 and configs[0].thinking_config is None


def test_answer_deadline_is_short_so_a_busy_model_falls_back_quickly():
    from app.gemini import TIMEOUT_MS

    assert TIMEOUT_MS <= 30_000


def test_stops_are_sorted_by_start_time_and_renumbered_with_padded_hours():
    raw = plan_json(
        {**stop(order=1, name="저녁 식당"), "start_time": "18:00", "travel_minutes": 10, "transport": "도보"},
        {**stop(order=2, name="동문시장"), "start_time": "9:30", "travel_minutes": 20, "transport": "대중교통"},
        {**stop(day="2026-11-13", order=3, name="함덕해수욕장"), "start_time": "", "travel_minutes": 0, "transport": ""},
    )

    stops = validate_plan(raw, REQUEST)

    assert [(s.date.day, s.order, s.place_name, s.start_time) for s in stops] == [
        (12, 1, "동문시장", dt.time(9, 30)),
        (12, 2, "저녁 식당", dt.time(18)),
        (13, 1, "함덕해수욕장", None),
    ]


def test_old_style_answers_without_times_still_validate():
    assert validate_plan(plan_json(stop()), REQUEST)[0].start_time is None


def test_prompt_has_day_hours_lodging_pace_and_fixed_plans():
    request = PlanRequest(
        "제주 동쪽", dt.date(2026, 11, 13), dt.date(2026, 11, 13), "", day_start=dt.time(10), day_end=dt.time(18),
        lodging="함덕 호텔", pace="relaxed", fixed=(FixedPlan(dt.date(2026, 11, 13), dt.time(12), "점심 약속", "동문재래시장"), FixedPlan(dt.date(2026, 11, 13), None, "카페")),
    )

    prompt = build_prompt(request)

    assert "날짜: 2026-11-13 (1일)" in prompt
    assert "하루 일정 시간: 10:00~18:00" in prompt
    assert "숙소(출발·귀가 지점): 함덕 호텔" in prompt
    assert "하루 2~3곳" in prompt
    assert "- 2026-11-13 12:00 점심 약속 (동문재래시장)" in prompt
    assert "- 2026-11-13 시간 미정 카페" in prompt
    assert "travel_minutes" in prompt


def test_prompt_without_fixed_plans_says_none():
    assert "이미 잡힌 일정(바꾸거나 다시 추천하지 않는다):\n없음" in build_prompt(REQUEST)


IMPORT = ImportRequest("1일차 동문시장\n3일차 공항", dt.date(2026, 11, 12), dt.date(2026, 11, 13))


def test_parse_drops_days_outside_the_trip_and_asks_with_low_temperature():
    models = FakeModels(plan_json(stop("2026-11-12", 1, "동문시장"), stop("2026-11-14", 1, "공항")))

    stops = suggester_with(models).parse(IMPORT)

    assert [s.place_name for s in stops] == ["동문시장"]
    assert models.calls[0]["config"].temperature == 0.1


def test_import_prompt_maps_trip_days_and_keeps_the_text():
    prompt = build_import_prompt(IMPORT)

    assert "1일 차=2026-11-12, 2일 차=2026-11-13" in prompt
    assert "새 일정을 지어내지 않는다" in prompt
    assert "region을 빈 문자열" in prompt
    assert "1일차 동문시장" in prompt
