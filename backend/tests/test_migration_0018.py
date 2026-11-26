"""마이그레이션 0018: 사진 위치(GPS)로 만들어진 장소 연결을 푼다(위치정보법, ADR-0003)."""

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from tests.conftest import BACKEND_DIR, bearer
from tests.jpeg_samples import jpeg

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}
MARKET = {"source_place_id": "111", "name": "동문시장"}


def test_0018_unlinks_gps_links_and_keeps_old_manual_ones(client, auth, places, engine, database_url):
    places.add("111", "동문시장")
    minji, _ = auth.add_user(display_name="민지")
    h = bearer(minji)
    trip = client.post("/trips", json=JEJU, headers=h).json()["id"]
    place = client.post(f"/trips/{trip}/plan-items", json={"date": "2026-11-12", "title": "시장", "place": MARKET}, headers=h).json()["place"]["id"]
    ids = []
    for _ in range(4):
        photo = client.post(f"/trips/{trip}/photos", files={"file": ("p.jpg", jpeg(), "image/jpeg")}, headers=h).json()["id"]
        client.put(f"/trips/{trip}/photos/{photo}/place", json={"place_id": place}, headers=h)
        ids.append(photo)
    auto_old, manual_old, after_21, unlinked = ids
    with engine.begin() as c:
        c.execute(text("UPDATE photos SET link_type = 'auto', created_at = '2026-11-15T00:00:00+09:00' WHERE id = :i"), {"i": auto_old})
        c.execute(text("UPDATE photos SET created_at = '2026-11-15T00:00:00+09:00' WHERE id = :i"), {"i": manual_old})
        c.execute(text("UPDATE photos SET created_at = '2026-11-22T00:00:00+09:00' WHERE id = :i"), {"i": after_21})
        c.execute(text("UPDATE photos SET place_id = NULL, link_type = NULL, created_at = '2026-11-22T00:00:00+09:00' WHERE id = :i"), {"i": unlinked})

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.downgrade(config, "0017")
    command.upgrade(config, "head")

    with engine.begin() as c:
        rows = {str(r[0]): (r[1] is not None, r[2]) for r in c.execute(text("SELECT id, place_id, link_type FROM photos"))}
    assert rows[auto_old] == (False, None)
    assert rows[after_21] == (False, None)
    # 11-21 전에 멤버가 직접 고른 연결은 사진 위치와 상관없어 남긴다.
    assert rows[manual_old] == (True, "manual")
    assert rows[unlinked] == (False, None)
