// Precomputed UI fixtures, not a client-side settlement engine.
// Production balances and suggested transfers must come from FastAPI.
export const members = [
  { id: 'minji', name: '민지', role: '총무', paid: 66000, owed: 31000 },
  { id: 'junho', name: '준호', role: '멤버', paid: 18000, owed: 26500 },
  { id: 'seoyeon', name: '서연', role: '멤버', paid: 0, owed: 26500 },
] as const;
export type MemberId = typeof members[number]['id'];
export type Expense = {
  id: string; name: string; date: string; payer: MemberId; amount: number;
  lines: { name: string; amount: number; shares: Partial<Record<MemberId, number>> }[];
};
export const expenses: Expense[] = [
  { id: 'store', name: '편의점 장보기', date: '11.12', payer: 'minji', amount: 30000, lines: [
    { name: '간식', amount: 12000, shares: { minji: 4000, junho: 4000, seoyeon: 4000 } },
    { name: '음료', amount: 9000, shares: { junho: 4500, seoyeon: 4500 } },
    { name: '충전 케이블', amount: 9000, shares: { minji: 9000 } },
  ] },
  { id: 'lunch', name: '고기국수 점심', date: '11.13', payer: 'minji', amount: 36000,
    lines: [{ name: '고기국수 3그릇', amount: 36000, shares: { minji: 12000, junho: 12000, seoyeon: 12000 } }] },
  { id: 'cafe', name: '카페', date: '11.13', payer: 'junho', amount: 18000,
    lines: [{ name: '커피 3잔', amount: 18000, shares: { minji: 6000, junho: 6000, seoyeon: 6000 } }] },
];
export const totalExpense = 84000;
export const suggestedTransfers = [
  { id: 't1', from: 'junho', to: 'minji', amount: 8500 },
  { id: 't2', from: 'seoyeon', to: 'minji', amount: 26500 },
] as const;
export const snapshots: Record<string, Record<MemberId, number>> = {
  '00': { minji: 35000, junho: -8500, seoyeon: -26500 },
  '10': { minji: 26500, junho: 0, seoyeon: -26500 },
  '01': { minji: 8500, junho: -8500, seoyeon: 0 },
  '11': { minji: 0, junho: 0, seoyeon: 0 },
};
export const memberName = (id: MemberId) => members.find((member) => member.id === id)!.name;
