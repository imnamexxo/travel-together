import { formatDay, isIso, monthGrid, nights, pickRange, shiftMonth } from '@/components/pickers/calendar-logic';

test('한 달은 일요일부터 시작하는 주로 나뉜다', () => {
  const weeks = monthGrid(2026, 11); // 2026-11-01은 일요일
  expect(weeks[0][0]).toBe('2026-11-01');
  expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  expect(weeks.every((w) => w.length === 7)).toBe(true);
});

test('기간 고르기: 시작 → 끝, 시작보다 앞이면 시작을 바꾸고, 다 고른 뒤 누르면 새로 시작', () => {
  let r = pickRange({ start: null, end: null }, '2026-11-20');
  expect(r).toEqual({ start: '2026-11-20', end: null });
  r = pickRange(r, '2026-11-18');
  expect(r).toEqual({ start: '2026-11-18', end: null });
  r = pickRange(r, '2026-11-18');
  expect(r).toEqual({ start: '2026-11-18', end: '2026-11-18' }); // 당일치기
  expect(pickRange(r, '2026-12-01')).toEqual({ start: '2026-12-01', end: null });
});

test('달 넘기기, 날짜 표시, 일수, 날짜 확인', () => {
  expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  expect(formatDay('2026-11-12', '2026-11-12')).toBe('11월 12일 (목)');
  expect(formatDay('2027-01-03', '2026-11-12')).toBe('2027년 1월 3일 (일)');
  expect(nights({ start: '2026-11-30', end: '2026-12-02' })).toBe(3);
  expect([isIso('2026-02-30'), isIso('2026-2-3'), isIso('2026-02-28')]).toEqual([false, false, true]);
});
