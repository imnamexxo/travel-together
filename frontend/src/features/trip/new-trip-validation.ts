import { parseIsoDate } from './trip-dates';

export type NewTripFields = { name: string; startDate: string; endDate: string };
export type NewTripErrors = Partial<Record<keyof NewTripFields, string>>;

// 입력 안내용. 서버가 같은 규칙을 다시 검사한다.
export function validateNewTrip(fields: NewTripFields): NewTripErrors {
  const errors: NewTripErrors = {};
  if (!fields.name.trim()) errors.name = '여행 이름을 입력해주세요.';
  const start = parseIsoDate(fields.startDate);
  const end = parseIsoDate(fields.endDate);
  if (start === null) errors.startDate = '2026-11-12처럼 입력해주세요.';
  if (end === null) errors.endDate = '2026-11-14처럼 입력해주세요.';
  if (start !== null && end !== null && start > end) errors.endDate = '종료일은 시작일과 같거나 뒤여야 해요.';
  return errors;
}
