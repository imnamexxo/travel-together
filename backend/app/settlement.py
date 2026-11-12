"""정산 계산. DB도 HTTP도 모르는 순수 계산이다.

입력: 멤버(가입 순서), 확정된 지출(결제자, 품목, 품목별 분담 대상), 송금
출력: 멤버별 결제액·부담액·잔액, 송금 제안, 멤버별 품목별 부담 근거

규칙
- 모든 금액은 원 단위 정수다.
- 품목 금액을 분담 대상 수로 나눈 몫을 모두에게 주고, 나머지는 분담 대상을 가입 순서로 세워 앞에서부터 1원씩 준다.
- 잔액 = 결제액 − 부담액 + 보낸 송금액 − 받은 송금액. 양수면 받을 돈, 음수면 보낼 돈이다.
- 송금 제안은 받을 사람과 보낼 사람을 큰 금액부터 짝짓는다. 금액이 같으면 가입 순서가 앞선 사람이 먼저다.
  같은 입력이면 항상 같은 결과가 나온다. 최소 송금 횟수는 보장하지 않는다.
"""

from collections.abc import Hashable, Sequence
from dataclasses import dataclass, field

MemberId = Hashable


@dataclass(frozen=True)
class MemberIn:
    id: MemberId
    join_order: int


@dataclass(frozen=True)
class ItemIn:
    id: Hashable
    name: str
    amount: int
    sharer_ids: Sequence[MemberId]


@dataclass(frozen=True)
class ExpenseIn:
    id: Hashable
    name: str
    payer_id: MemberId
    items: Sequence[ItemIn]


@dataclass(frozen=True)
class TransferIn:
    from_id: MemberId
    to_id: MemberId
    amount: int


@dataclass(frozen=True)
class Share:
    """한 멤버가 한 품목에서 부담하는 금액(부담액의 근거)."""

    member_id: MemberId
    expense_id: Hashable
    expense_name: str
    item_id: Hashable
    item_name: str
    item_amount: int
    sharer_count: int
    amount: int


@dataclass
class MemberBalance:
    member_id: MemberId
    paid: int = 0
    owed: int = 0
    sent: int = 0
    received: int = 0

    @property
    def balance(self) -> int:
        return self.paid - self.owed + self.sent - self.received


@dataclass(frozen=True)
class SuggestedTransfer:
    from_id: MemberId
    to_id: MemberId
    amount: int


@dataclass
class Settlement:
    balances: list[MemberBalance]
    suggestions: list[SuggestedTransfer]
    shares: list[Share] = field(default_factory=list)

    @property
    def is_settled(self) -> bool:
        return all(b.balance == 0 for b in self.balances)


def split(amount: int, sharer_ids: Sequence[MemberId], join_order: dict[MemberId, int]) -> dict[MemberId, int]:
    """품목 금액을 분담 대상에게 나눈다. 남는 원은 가입 순서 앞사람부터 1원씩."""
    ordered = sorted(dict.fromkeys(sharer_ids), key=lambda m: join_order[m])
    base, remainder = divmod(amount, len(ordered))
    return {member: base + (1 if index < remainder else 0) for index, member in enumerate(ordered)}


def settle(
    members: Sequence[MemberIn],
    expenses: Sequence[ExpenseIn],
    transfers: Sequence[TransferIn] = (),
) -> Settlement:
    join_order = {m.id: m.join_order for m in members}
    balances = {m.id: MemberBalance(m.id) for m in sorted(members, key=lambda m: m.join_order)}
    shares: list[Share] = []

    for expense in expenses:
        for item in expense.items:
            balances[expense.payer_id].paid += item.amount
            for member, amount in split(item.amount, item.sharer_ids, join_order).items():
                balances[member].owed += amount
                shares.append(
                    Share(
                        member_id=member,
                        expense_id=expense.id,
                        expense_name=expense.name,
                        item_id=item.id,
                        item_name=item.name,
                        item_amount=item.amount,
                        sharer_count=len(set(item.sharer_ids)),
                        amount=amount,
                    )
                )
    for transfer in transfers:
        balances[transfer.from_id].sent += transfer.amount
        balances[transfer.to_id].received += transfer.amount

    return Settlement(
        balances=list(balances.values()),
        suggestions=_suggest(balances, join_order),
        shares=shares,
    )


def _suggest(balances: dict[MemberId, MemberBalance], join_order: dict[MemberId, int]) -> list[SuggestedTransfer]:
    remaining = {member: b.balance for member, b in balances.items() if b.balance != 0}
    suggestions: list[SuggestedTransfer] = []

    def largest(sign: int) -> MemberId | None:
        candidates = [m for m, v in remaining.items() if v * sign > 0]
        return min(candidates, key=lambda m: (-abs(remaining[m]), join_order[m]), default=None)

    while True:
        creditor, debtor = largest(+1), largest(-1)
        if creditor is None or debtor is None:
            return suggestions
        amount = min(remaining[creditor], -remaining[debtor])
        suggestions.append(SuggestedTransfer(from_id=debtor, to_id=creditor, amount=amount))
        remaining[creditor] -= amount
        remaining[debtor] += amount
        for member in (creditor, debtor):
            if remaining[member] == 0:
                del remaining[member]
