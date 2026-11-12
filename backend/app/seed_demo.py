"""화면 확인용 예시 여행을 DB에 넣는다: 3일 일정·실제 제주 장소, 가짜 멤버 3명, 확정 지출과 송금.

    python -m app.seed_demo --email 내가입이메일@example.com

DATABASE_URL(backend/.env 또는 터미널 환경 변수)의 DB에 넣는다. 운영 DB에 넣으려면 터미널에서만
DATABASE_URL을 운영 주소로 잡고 실행한다(파일에 저장하지 않는다).

- 총무는 --email로 가입한 사용자다(Supabase auth.users에서 찾는다). 로컬 DB처럼 auth 스키마가 없으면 --user-id를 쓴다.
- 여행 이름은 "[예시] 제주 여행". 같은 사용자에게 이미 있으면 넣지 않는다. 지울 때는 앱의 여행 설정에서 여행을 삭제한다.
- 가짜 멤버는 로그인할 수 없다(존재하지 않는 사용자 id). 정산을 나눠 보는 용도다.
- 장소의 카카오 id는 "demo-"로 시작하는 가짜 값이다(좌표·주소는 실제와 비슷하게).
"""

import argparse
import datetime as dt
import sys
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import load_settings
from app.db import make_sessionmaker
from app.invites import new_invite_code
from app.models import Expense, LineItem, Member, Place, PlanItem, Transfer, Trip, UserProfile

TRIP_NAME = "[예시] 제주 여행"
KST = ZoneInfo("Asia/Seoul")

PLACES = {
    "airport": ("제주국제공항", "제주특별자치도 제주시 용담이동 2002", "제주특별자치도 제주시 공항로 2", 33.5070, 126.4929, "교통,수송 > 공항"),
    "market": ("동문재래시장", "제주특별자치도 제주시 일도일동 1436-7", "제주특별자치도 제주시 관덕로14길 20", 33.5116, 126.5258, "가정,생활 > 시장"),
    "hamdeok": ("함덕해수욕장", "제주특별자치도 제주시 조천읍 함덕리 1008", "제주특별자치도 제주시 조천읍 조함해안로 525", 33.5432, 126.6696, "여행 > 해수욕장"),
    "seongsan": ("성산일출봉", "제주특별자치도 서귀포시 성산읍 성산리 1", "제주특별자치도 서귀포시 성산읍 일출로 284-12", 33.4581, 126.9425, "여행 > 관광명소"),
    "osulloc": ("오설록 티뮤지엄", "제주특별자치도 서귀포시 안덕면 서광리 1235-3", "제주특별자치도 서귀포시 안덕면 신화역사로 15", 33.3059, 126.2895, "여행 > 관광명소"),
    "hyeopjae": ("협재해수욕장", "제주특별자치도 제주시 한림읍 협재리 2497-1", "제주특별자치도 제주시 한림읍 한림로 329-10", 33.3940, 126.2396, "여행 > 해수욕장"),
    "olle": ("서귀포매일올레시장", "제주특별자치도 서귀포시 서귀동 277-1", "제주특별자치도 서귀포시 중앙로62번길 18", 33.2497, 126.5636, "가정,생활 > 시장"),
}

# (날짜 순번, 시각, 제목, 메모, 예상 비용, 장소)
PLAN = [
    (0, "10:30", "제주 도착", "렌터카 받기", None, "airport"),
    (0, "12:30", "점심, 시장 구경", "고기국수, 귤 사기", 40000, "market"),
    (0, "16:00", "바다 산책", "해 질 때까지", None, "hamdeok"),
    (1, "06:30", "일출 보기", "일찍 출발", 20000, "seongsan"),
    (1, "13:00", "녹차 아이스크림", "", 30000, "osulloc"),
    (1, "15:30", "물놀이", "수건 챙기기", None, "hyeopjae"),
    (2, "11:00", "기념품 사기", "", 50000, "olle"),
    (2, "17:00", "공항으로", "렌터카 반납", None, "airport"),
]

FAKE_MEMBERS = ["민지", "서준", "하린"]


def find_user_id(session: Session, email: str) -> uuid.UUID:
    row = session.execute(text("SELECT id FROM auth.users WHERE lower(email) = lower(:email)"), {"email": email}).first()
    if row is None:
        sys.exit(f"{email}로 가입한 사용자가 없습니다. 앱에서 먼저 가입하세요.")
    return row[0]


def seed(session: Session, organizer_id: uuid.UUID, today: dt.date) -> Trip | None:
    """예시 여행을 만든다. 이미 있으면 None."""
    organizer = session.get(UserProfile, organizer_id)
    if organizer is None:
        sys.exit("이 사용자의 프로필이 없습니다. 앱에서 한 번 로그인한 뒤 다시 실행하세요.")
    exists = session.scalar(select(Trip).where(Trip.organizer_user_id == organizer_id, Trip.name == TRIP_NAME))
    if exists is not None:
        return None

    days = [today + dt.timedelta(days=i) for i in range(3)]
    trip = Trip(name=TRIP_NAME, start_date=days[0], end_date=days[-1], organizer_user_id=organizer_id, invite_code=new_invite_code(session))
    session.add(trip)
    session.flush()

    members = [Member(trip_id=trip.id, user_id=organizer_id, join_order=1)]
    for order, name in enumerate(FAKE_MEMBERS, start=2):
        profile = UserProfile(user_id=uuid.uuid4(), display_name=name)
        session.add(profile)
        members.append(Member(trip_id=trip.id, user_id=profile.user_id, join_order=order))
    session.add_all(members)
    session.flush()
    me, minji, seojun, harin = members

    places: dict[str, Place] = {}
    for key, (name, address, road, lat, lng, category) in PLACES.items():
        places[key] = Place(trip_id=trip.id, kakao_place_id=f"demo-{key}", name=name, address=address, road_address=road, latitude=lat, longitude=lng, category=category)
    session.add_all(places.values())
    session.flush()

    positions: dict[int, int] = {}
    for day, time, title, memo, cost, place in PLAN:
        position = positions.get(day, 0)
        positions[day] = position + 1
        session.add(PlanItem(
            trip_id=trip.id, date=days[day], position=position, time=dt.time.fromisoformat(time), title=title, memo=memo,
            estimated_cost=cost, place_id=places[place].id, created_by_member_id=me.id,
        ))

    def paid(day: int, time: str) -> dt.datetime:
        return dt.datetime.combine(days[day], dt.time.fromisoformat(time), KST)

    def expense(key: str, payer: Member, at: dt.datetime, merchant: str, place: str | None, items: list[tuple[str, int, int | None, list[Member]]]) -> None:
        e = Expense(
            trip_id=trip.id, status="confirmed", payer_member_id=payer.id, paid_at=at, merchant_name=merchant,
            total_amount=sum(amount for _, amount, _, _ in items), idempotency_key=f"seed-demo-{key}",
            place_id=places[place].id if place else None,
        )
        e.default_sharers = list(members)
        e.items = [LineItem(position=i, name=name, amount=amount, quantity=quantity, sharers=sharers) for i, (name, amount, quantity, sharers) in enumerate(items)]
        session.add(e)

    everyone = list(members)
    expense("rentcar", me, paid(0, "10:40"), "제주 렌터카", "airport", [("렌터카 3일", 180000, 1, everyone)])
    expense("lunch", minji, paid(0, "12:50"), "동문시장 고기국수", "market", [("고기국수", 36000, 4, everyone), ("귤 한 박스", 15000, 1, [minji, harin])])
    expense("cafe", seojun, paid(0, "16:30"), "함덕 카페", "hamdeok", [("아메리카노", 18000, 4, everyone), ("케이크", 9000, 1, [seojun, harin])])
    expense("dinner", me, paid(0, "19:30"), "흑돼지 식당", None, [("흑돼지 4인분", 88000, 4, everyone), ("음료", 12000, 4, [me, seojun])])

    session.add(Transfer(trip_id=trip.id, from_member_id=harin.id, to_member_id=me.id, amount=30000))
    session.flush()
    return trip


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--email", help="총무가 될 가입 이메일(Supabase auth.users에서 찾음)")
    who.add_argument("--user-id", type=uuid.UUID, help="총무 사용자 id(auth 스키마가 없는 로컬 DB용)")
    args = parser.parse_args()

    settings = load_settings()
    if not settings.database_url:
        sys.exit("DATABASE_URL이 없습니다.")
    with make_sessionmaker(settings.database_url)() as session:
        user_id = args.user_id or find_user_id(session, args.email)
        trip = seed(session, user_id, dt.datetime.now(KST).date())
        if trip is None:
            print(f"이미 '{TRIP_NAME}'이 있어 넣지 않았습니다. 다시 넣으려면 앱에서 그 여행을 삭제하세요.")
            return
        session.commit()
        print(f"'{TRIP_NAME}'을 만들었습니다 ({trip.start_date} ~ {trip.end_date}). 앱에서 여행 목록을 새로고침하세요.")


if __name__ == "__main__":
    main()
