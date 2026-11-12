"""정산 계산 모듈: 입력 → 출력 사례 표."""

import pytest

from app.settlement import ExpenseIn, ItemIn, MemberIn, TransferIn, settle

MINJI, JUNHO, SUBIN = "민지", "준호", "수빈"
MEMBERS = [MemberIn(MINJI, 1), MemberIn(JUNHO, 2), MemberIn(SUBIN, 3)]


def expense(payer, *items, name="지출", id=None):
    return ExpenseIn(
        id=id or name,
        name=name,
        payer_id=payer,
        items=[ItemIn(id=f"{name}-{i}", name=n, amount=a, sharer_ids=s) for i, (n, a, s) in enumerate(items)],
    )


CONVENIENCE_STORE = expense(
    MINJI,
    ("간식", 12000, [MINJI, JUNHO, SUBIN]),
    ("음료", 9000, [JUNHO, SUBIN]),
    ("충전 케이블", 9000, [MINJI]),
    name="편의점",
)


def table(result):
    return {b.member_id: (b.paid, b.owed, b.balance) for b in result.balances}


def suggestions(result):
    return [(s.from_id, s.to_id, s.amount) for s in result.suggestions]


def test_representative_case_from_the_plan():
    result = settle(MEMBERS, [CONVENIENCE_STORE])

    assert table(result) == {
        MINJI: (30000, 13000, 17000),
        JUNHO: (0, 8500, -8500),
        SUBIN: (0, 8500, -8500),
    }
    assert suggestions(result) == [(JUNHO, MINJI, 8500), (SUBIN, MINJI, 8500)]


def test_remainder_goes_one_won_at_a_time_in_join_order():
    result = settle(MEMBERS, [expense(SUBIN, ("택시", 10000, [SUBIN, JUNHO, MINJI]))])

    assert {b.member_id: b.owed for b in result.balances} == {MINJI: 3334, JUNHO: 3333, SUBIN: 3333}
    assert sum(s.amount for s in result.shares) == 10000


def test_remainder_of_two_with_four_members():
    members = MEMBERS + [MemberIn("서연", 4)]
    result = settle(members, [expense(MINJI, ("숙소", 10002, [m.id for m in members]))])

    assert [b.owed for b in result.balances] == [2501, 2501, 2500, 2500]


def test_multiple_payers():
    result = settle(
        MEMBERS,
        [
            CONVENIENCE_STORE,
            expense(JUNHO, ("카페", 18000, [MINJI, JUNHO, SUBIN]), name="카페"),
            expense(SUBIN, ("택시", 9000, [MINJI, SUBIN]), name="택시"),
        ],
    )

    assert table(result) == {
        MINJI: (30000, 13000 + 6000 + 4500, 6500),
        JUNHO: (18000, 8500 + 6000, 3500),
        SUBIN: (9000, 8500 + 6000 + 4500, -10000),
    }
    assert suggestions(result) == [(SUBIN, MINJI, 6500), (SUBIN, JUNHO, 3500)]
    assert sum(b.balance for b in result.balances) == 0


def test_transfers_move_balances_and_can_flip_the_sign_after_an_expense_is_removed():
    """준호가 8,500원을 보낸 뒤 음료 지출이 빠지면, 준호가 받을 사람이 되고 민지 → 준호 제안이 생긴다."""
    paid_back = [TransferIn(JUNHO, MINJI, 8500)]
    before = settle(MEMBERS, [CONVENIENCE_STORE], paid_back)
    assert table(before)[JUNHO][2] == 0
    assert suggestions(before) == [(SUBIN, MINJI, 8500)]

    without_drinks = expense(MINJI, ("간식", 12000, [MINJI, JUNHO, SUBIN]), ("충전 케이블", 9000, [MINJI]), name="편의점")
    after = settle(MEMBERS, [without_drinks], paid_back)

    assert {b.member_id: b.balance for b in after.balances} == {MINJI: -500, JUNHO: 4500, SUBIN: -4000}
    assert suggestions(after) == [(SUBIN, JUNHO, 4000), (MINJI, JUNHO, 500)]


def test_all_zero_balances_mean_settled():
    result = settle(
        MEMBERS,
        [CONVENIENCE_STORE],
        [TransferIn(JUNHO, MINJI, 8500), TransferIn(SUBIN, MINJI, 8500)],
    )

    assert result.is_settled
    assert result.suggestions == []


def test_no_expenses_is_settled_with_no_suggestions():
    result = settle(MEMBERS, [])

    assert result.is_settled
    assert table(result) == {MINJI: (0, 0, 0), JUNHO: (0, 0, 0), SUBIN: (0, 0, 0)}


def test_same_input_gives_same_suggestions_and_ties_follow_join_order():
    # 준호와 수빈이 똑같이 5,000원씩 보낼 사람이다.
    tie = [expense(MINJI, ("저녁", 15000, [MINJI, JUNHO, SUBIN]))]

    first = suggestions(settle(MEMBERS, tie))
    second = suggestions(settle(list(reversed(MEMBERS)), tie))

    assert first == second == [(JUNHO, MINJI, 5000), (SUBIN, MINJI, 5000)]


def test_shares_explain_each_members_owed_amount():
    result = settle(MEMBERS, [CONVENIENCE_STORE])

    junho = [(s.expense_name, s.item_name, s.item_amount, s.sharer_count, s.amount) for s in result.shares if s.member_id == JUNHO]
    assert junho == [("편의점", "간식", 12000, 3, 4000), ("편의점", "음료", 9000, 2, 4500)]
    for b in result.balances:
        assert b.owed == sum(s.amount for s in result.shares if s.member_id == b.member_id)


@pytest.mark.parametrize("amount", [1, 2, 7, 99, 100_000_000])
def test_split_never_loses_or_creates_a_won(amount):
    result = settle(MEMBERS, [expense(MINJI, ("x", amount, [MINJI, JUNHO, SUBIN]))])

    assert sum(b.owed for b in result.balances) == amount
    assert sum(b.balance for b in result.balances) == 0
