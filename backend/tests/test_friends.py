"""친구와 친구 초대(#71)."""

from tests.conftest import bearer

JEJU = {"name": "제주 여행", "start_date": "2026-11-12", "end_date": "2026-11-14"}


class People:
    """민지·준호가 함께한 제주 여행, 따로 있는 수빈."""

    def __init__(self, client, auth):
        self.client = client
        self.t = {}
        self.u = {}
        for name in ("민지", "준호", "수빈"):
            self.t[name], self.u[name] = auth.add_user(display_name=name)
            client.get("/me", headers=bearer(self.t[name]))  # 앱은 로그인하면 프로필부터 만든다
        self.jeju = client.post("/trips", json=JEJU, headers=self.h("민지")).json()["id"]
        code = client.get(f"/trips/{self.jeju}/invite-code", headers=self.h("민지")).json()["code"]
        client.post("/trips/join", json={"code": code}, headers=self.h("준호"))

    def h(self, who):
        return bearer(self.t[who])

    def members(self, who, trip=None):
        return {m["display_name"]: m for m in self.client.get(f"/trips/{trip or self.jeju}/members", headers=self.h(who)).json()}

    def friends(self, who):
        return self.client.get("/friends", headers=self.h(who)).json()

    def request(self, who, target):
        member = self.members(who)[target]["member_id"]
        return self.client.post("/friends/requests", json={"trip_id": self.jeju, "member_id": member}, headers=self.h(who))


def names(people):
    return [p["display_name"] for p in people]


def test_request_to_trip_member_and_accept(client, auth):
    p = People(client, auth)

    assert p.request("민지", "준호").status_code == 201
    assert p.members("민지")["준호"]["friend_status"] == "requested"
    assert p.members("준호")["민지"]["friend_status"] == "incoming"
    incoming = p.friends("준호")["incoming"]
    assert p.members("준호")["민지"]["friend_request_id"] == incoming[0]["id"]
    assert names([r["person"] for r in incoming]) == ["민지"]

    accepted = client.post(f"/friends/requests/{incoming[0]['id']}/accept", headers=p.h("준호")).json()

    assert names(accepted["friends"]) == ["민지"]
    assert names(p.friends("민지")["friends"]) == ["준호"]
    jeju = p.members("민지")
    assert jeju["준호"]["friend_status"] == "friend" and jeju["준호"]["friend_user_id"] == str(p.u["준호"].id)
    assert jeju["민지"]["friend_status"] == "me"


def test_mutual_requests_become_friends(client, auth):
    p = People(client, auth)
    p.request("민지", "준호")

    p.request("준호", "민지")

    assert names(p.friends("민지")["friends"]) == ["준호"]


def test_decline_cancel_and_unfriend(client, auth):
    p = People(client, auth)
    p.request("민지", "준호")
    request_id = p.friends("민지")["outgoing"][0]["id"]

    cancelled = client.post(f"/friends/requests/{request_id}/decline", headers=p.h("민지")).json()
    assert cancelled["outgoing"] == [] and p.friends("준호")["incoming"] == []

    p.request("민지", "준호")
    rid = p.friends("준호")["incoming"][0]["id"]
    client.post(f"/friends/requests/{rid}/accept", headers=p.h("준호"))
    removed = client.delete(f"/friends/{p.u['준호'].id}", headers=p.h("민지")).json()
    assert removed["friends"] == [] and p.friends("준호")["friends"] == []


def test_cannot_request_member_of_trip_you_are_not_in(client, auth):
    p = People(client, auth)
    member = p.members("민지")["준호"]["member_id"]

    response = client.post("/friends/requests", json={"trip_id": p.jeju, "member_id": member}, headers=p.h("수빈"))

    assert response.status_code == 404


def test_friend_link_makes_friends_right_away(client, auth):
    p = People(client, auth)
    code = client.get("/me/friend-code", headers=p.h("민지")).json()["code"]
    assert client.get("/me/friend-code", headers=p.h("민지")).json()["code"] == code

    response = client.post("/friends/by-code", json={"code": code.lower()}, headers=p.h("수빈"))

    assert response.json()["display_name"] == "민지"
    assert names(p.friends("민지")["friends"]) == ["수빈"]
    assert client.post("/friends/by-code", json={"code": code}, headers=p.h("민지")).status_code == 409
    assert client.post("/friends/by-code", json={"code": "NOPE2345"}, headers=p.h("수빈")).status_code == 404


def test_organizer_invites_friend_who_accepts(client, auth):
    p = People(client, auth)
    code = client.get("/me/friend-code", headers=p.h("수빈")).json()["code"]
    client.post("/friends/by-code", json={"code": code}, headers=p.h("민지"))

    invited = client.post(f"/trips/{p.jeju}/invites", json={"user_id": str(p.u["수빈"].id)}, headers=p.h("민지"))
    assert invited.status_code == 201
    invites = client.get("/me/trip-invites", headers=p.h("수빈")).json()
    assert [(i["trip"]["name"], i["inviter_name"]) for i in invites] == [("제주 여행", "민지")]

    joined = client.post(f"/me/trip-invites/{invites[0]['id']}/accept", headers=p.h("수빈"))

    assert joined.status_code == 200 and joined.json()["id"] == p.jeju
    assert "수빈" in p.members("민지")
    assert client.get("/me/trip-invites", headers=p.h("수빈")).json() == []


def test_invite_rules(client, auth):
    p = People(client, auth)
    stranger = str(p.u["수빈"].id)

    assert client.post(f"/trips/{p.jeju}/invites", json={"user_id": stranger}, headers=p.h("민지")).json()["code"] == "not_friends"
    assert client.post(f"/trips/{p.jeju}/invites", json={"user_id": stranger}, headers=p.h("준호")).status_code == 403
    p.request("민지", "준호")
    rid = p.friends("준호")["incoming"][0]["id"]
    client.post(f"/friends/requests/{rid}/accept", headers=p.h("준호"))
    assert client.post(f"/trips/{p.jeju}/invites", json={"user_id": str(p.u["준호"].id)}, headers=p.h("민지")).json()["code"] == "already_member"


def test_declined_invite_disappears(client, auth):
    p = People(client, auth)
    code = client.get("/me/friend-code", headers=p.h("수빈")).json()["code"]
    client.post("/friends/by-code", json={"code": code}, headers=p.h("민지"))
    client.post(f"/trips/{p.jeju}/invites", json={"user_id": str(p.u["수빈"].id)}, headers=p.h("민지"))
    invite = client.get("/me/trip-invites", headers=p.h("수빈")).json()[0]

    assert client.post(f"/me/trip-invites/{invite['id']}/decline", headers=p.h("수빈")).status_code == 204
    assert client.get("/me/trip-invites", headers=p.h("수빈")).json() == []
    assert "수빈" not in p.members("민지")


def test_account_deletion_removes_friendships_and_invites(client, auth):
    p = People(client, auth)
    code = client.get("/me/friend-code", headers=p.h("수빈")).json()["code"]
    client.post("/friends/by-code", json={"code": code}, headers=p.h("민지"))
    client.post(f"/trips/{p.jeju}/invites", json={"user_id": str(p.u["수빈"].id)}, headers=p.h("민지"))

    client.delete("/me", headers=p.h("수빈"))

    assert p.friends("민지")["friends"] == []
    assert client.post("/friends/by-code", json={"code": code}, headers=p.h("준호")).status_code == 404


def test_friend_link_page(client):
    response = client.get("/friend/ab12cd34", headers={"user-agent": "iPhone"})

    assert 'href="traveltogether://friend?code=AB12CD34"' in response.text
    assert client.get("/friend/!!").status_code == 404
