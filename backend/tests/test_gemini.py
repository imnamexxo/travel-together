"""실제 Gemini 어댑터. 네트워크 없이 가짜 google-genai 클라이언트로 요청·응답 변환을 확인한다."""

import datetime as dt
import json
from types import SimpleNamespace

import pytest

from app.gemini import (
    GeminiPlanSuggester,
    PlanRequest,
    PlanShape,
    SuggestionFormatError,
    SuggestionUnavailable,
    build_prompt,
    validate_plan,
)

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
