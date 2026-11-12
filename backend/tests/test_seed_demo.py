"""예시 여행 스크립트가 앱에서 그대로 읽히는 데이터를 만드는지 확인한다."""

import datetime as dt

from sqlalchemy.orm import Session

from app.seed_demo import TRIP_NAME, seed
from tests.conftest import bearer


def test_seed_makes_a_trip_the_app_can_read(client, auth, engine):
    token, user = auth.add_user(display_name="동헌")
    client.get("/me", headers=bearer(token))  # 프로필 만들기
    today = dt.date(2026, 11, 12)

    with Session(engine) as session:
        assert seed(session, user.id, today) is not None
        session.commit()
    with Session(engine) as session:
        assert seed(session, user.id, today) is None  # 두 번 넣지 않는다

    trips = client.get("/trips", headers=bearer(token)).json()
    assert [t["name"] for t in trips] == [TRIP_NAME]
    trip_id = trips[0]["id"]
    assert len(client.get(f"/trips/{trip_id}/members", headers=bearer(token)).json()) == 4
    items = client.get(f"/trips/{trip_id}/plan-items", headers=bearer(token)).json()
    assert len(items) == 8 and all(i["place"] for i in items)
    expenses = client.get(f"/trips/{trip_id}/expenses", headers=bearer(token)).json()
    assert len(expenses) == 4 and all(e["status"] == "confirmed" for e in expenses)
    settlement = client.get(f"/trips/{trip_id}/settlement", headers=bearer(token))
    assert settlement.status_code == 200
    body = settlement.json()
    assert body["confirmed_total"] == 358000 and body["confirmed_count"] == 4
    assert sum(m["balance"] for m in body["members"]) == 0 and body["suggested_transfers"]
