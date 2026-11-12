/** 여행 날짜 계산. 서버는 "YYYY-MM-DD" 날짜(시간대 없음)를 주고받는다. */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 24 * 60 * 60 * 1000;

export type TripDay = {
  /** "YYYY-MM-DD" */
  iso: string;
  /** "11.12" */
  date: string;
  /** "목" */
  weekday: string;
  /** "11월 12일 목요일" */
  title: string;
};

/** "YYYY-MM-DD"가 실제로 있는 날짜면 UTC 기준 시각, 아니면 null. */
export function parseIsoDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return time;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function tripDays(startIso: string, endIso: string): TripDay[] {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start === null || end === null) return [];
  const days: TripDay[] = [];
  for (let time = start; time <= end; time += DAY_MS) {
    const d = new Date(time);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = WEEKDAYS[d.getUTCDay()];
    days.push({
      iso: `${d.getUTCFullYear()}-${pad(month)}-${pad(day)}`,
      date: `${pad(month)}.${pad(day)}`,
      weekday,
      title: `${month}월 ${day}일 ${weekday}요일`,
    });
  }
  return days;
}

/** "2026. 11. 12 – 11. 14". 해가 바뀌면 끝 날짜에도 연도를 붙인다. */
export function formatPeriod(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const start = `${sy}. ${sm}. ${sd}`;
  if (startIso === endIso) return start;
  return sy === ey ? `${start} – ${em}. ${ed}` : `${start} – ${ey}. ${em}. ${ed}`;
}
