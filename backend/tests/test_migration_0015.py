"""마이그레이션 0015: 이미 저장된 해외 장소의 이름·주소·종류와 추천 후보의 Google 정보를 지운다(ADR 0006)."""

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from tests.conftest import BACKEND_DIR

USER = "00000000-0000-0000-0000-000000000001"
ABROAD, HOME = "10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002"


def test_0015_strips_google_details_and_keeps_kakao(engine, database_url):
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.downgrade(config, "0014")
    try:
        with engine.begin() as c:
            c.execute(text("INSERT INTO user_profiles (user_id, display_name) VALUES (:u, '민지')"), {"u": USER})
            for trip, overseas, code in [(ABROAD, True, "AAAAAA11"), (HOME, False, "BBBBBB22")]:
                c.execute(
                    text(
                        "INSERT INTO trips (id, name, start_date, end_date, organizer_user_id, invite_code, is_overseas) "
                        "VALUES (:t, 't', '2026-12-01', '2026-12-02', :u, :c, :o)"
                    ),
                    {"t": trip, "u": USER, "c": code, "o": overseas},
                )
            c.execute(
                text(
                    "INSERT INTO places (id, trip_id, source_place_id, name, address, latitude, longitude, category) VALUES "
                    "(gen_random_uuid(), :a, 'ChIJ-x', '오사카성', '일본', 34.6, 135.5, '명소'), "
                    "(gen_random_uuid(), :h, 'k1', '시장', '제주', 33.5, 126.5, '시장')"
                ),
                {"a": ABROAD, "h": HOME},
            )
            c.execute(
                text(
                    "INSERT INTO suggestion_requests (id, trip_id, input_hash, destination, preferences) "
                    "VALUES ('30000000-0000-0000-0000-000000000001', :a, 'h', '오사카', '')"
                ),
                {"a": ABROAD},
            )
            c.execute(
                text(
                    'INSERT INTO suggested_items (id, request_id, date, "order", place_name, region, stay_minutes, description, '
                    "status, source_place_id, found_name, latitude, longitude) VALUES (gen_random_uuid(), "
                    "'30000000-0000-0000-0000-000000000001', '2026-12-01', 1, '성', '오사카', 60, 'd', 'verified', 'ChIJ-x', '오사카성', 34.6, 135.5)"
                )
            )
    finally:
        command.upgrade(config, "head")

    with engine.begin() as c:
        places = c.execute(
            text("SELECT source_place_id, source, name, address, category, latitude, coords_fetched_at IS NOT NULL FROM places ORDER BY source")
        ).all()
        suggestion = c.execute(text("SELECT source_place_id, found_name, latitude FROM suggested_items")).one()

    assert places == [
        ("ChIJ-x", "google", None, None, None, 34.6, True),
        ("k1", "kakao", "시장", "제주", "시장", 33.5, False),
    ]
    assert tuple(suggestion) == ("ChIJ-x", None, None)
