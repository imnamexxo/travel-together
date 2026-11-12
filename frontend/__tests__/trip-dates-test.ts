import { formatPeriod, parseIsoDate, tripDays } from '@/features/trip/trip-dates';

test('여행 기간의 날짜를 하루씩 만든다', () => {
  expect(tripDays('2026-11-12', '2026-11-14').map((d) => [d.iso, d.date, d.weekday, d.title])).toEqual([
    ['2026-11-12', '11.12', '목', '11월 12일 목요일'],
    ['2026-11-13', '11.13', '금', '11월 13일 금요일'],
    ['2026-11-14', '11.14', '토', '11월 14일 토요일'],
  ]);
});

test('달과 해가 바뀌어도 이어진다', () => {
  expect(tripDays('2026-12-31', '2027-01-01').map((d) => d.iso)).toEqual(['2026-12-31', '2027-01-01']);
});

test('하루짜리 여행은 하루다', () => {
  expect(tripDays('2026-11-12', '2026-11-12')).toHaveLength(1);
});

test('없는 날짜는 거른다', () => {
  expect(parseIsoDate('2026-02-29')).toBeNull();
  expect(parseIsoDate('2028-02-29')).not.toBeNull();
  expect(parseIsoDate('2026-13-01')).toBeNull();
  expect(parseIsoDate('20261112')).toBeNull();
});

test('기간 표시', () => {
  expect(formatPeriod('2026-11-12', '2026-11-14')).toBe('2026. 11. 12 – 11. 14');
  expect(formatPeriod('2026-12-31', '2027-01-02')).toBe('2026. 12. 31 – 2027. 1. 2');
  expect(formatPeriod('2026-11-12', '2026-11-12')).toBe('2026. 11. 12');
});
