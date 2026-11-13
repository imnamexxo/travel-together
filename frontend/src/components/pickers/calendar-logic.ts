/** 달력 고르기의 순수 계산(날짜는 'YYYY-MM-DD' 문자열, 한국 날짜 기준). */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const WEEKDAY_HEADERS = WEEKDAYS;

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** 오늘(한국 시간) */
export function todayIso(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isIso(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = parts(value);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 한 달을 일요일부터 시작하는 주 단위로. 앞뒤 빈칸은 null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => toIso(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = parts(iso);
  return { year: y, month: m };
}

export type Range = { start: string | null; end: string | null };

/** 기간 고르기: 처음 누른 날이 시작, 다음에 누른 날이 끝. 시작보다 앞을 누르면 시작을 바꾼다. 다 고른 뒤 누르면 새로 시작. */
export function pickRange(current: Range, tapped: string): Range {
  if (!current.start || current.end) return { start: tapped, end: null };
  if (tapped < current.start) return { start: tapped, end: null };
  return { start: current.start, end: tapped };
}

export function inRange(iso: string, range: Range): boolean {
  return !!range.start && !!range.end && iso >= range.start && iso <= range.end;
}

/** 11월 12일 (목). 올해가 아니면 2027년 1월 3일 (일) */
export function formatDay(iso: string, today = todayIso()): string {
  const [y, m, d] = parts(iso);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const year = y === parts(today)[0] ? '' : `${y}년 `;
  return `${year}${m}월 ${d}일 (${weekday})`;
}

/** 달력 칸의 접근성 이름: 11월 12일 */
export function dayLabel(iso: string): string {
  const [, m, d] = parts(iso);
  return `${m}월 ${d}일`;
}

/** 기간 일수(시작·끝 포함) */
export function nights(range: { start: string; end: string }): number {
  const [a, b] = [range.start, range.end].map((iso) => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86_400_000) + 1;
}
