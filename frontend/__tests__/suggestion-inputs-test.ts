import { nextRange, normalizeTime } from '@/features/trip/suggestions-screen';

test('시각은 9:00, 0930처럼 써도 HH:MM으로 맞춘다', () => {
  expect(normalizeTime('9:00')).toBe('09:00');
  expect(normalizeTime('0930')).toBe('09:30');
  expect(normalizeTime(' 21:00 ')).toBe('21:00');
  expect(normalizeTime('24:00')).toBeNull();
  expect(normalizeTime('9시')).toBeNull();
});

test('날짜 칩: 하루가 골라져 있으면 누른 날까지 늘리고, 구간이면 누른 날 하루로', () => {
  expect(nextRange([0, 3], 1)).toEqual([1, 1]);
  expect(nextRange([1, 1], 3)).toEqual([1, 3]);
  expect(nextRange([2, 2], 0)).toEqual([0, 2]);
  expect(nextRange([2, 2], 2)).toEqual([2, 2]);
});
