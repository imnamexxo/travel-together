import { fireEvent, screen } from '@testing-library/react-native';

/** 달력이 그 날짜의 달을 보여 주도록 이전/다음 달을 누른다. */
function showMonthOf(iso: string) {
  const [year, month] = iso.split('-').map(Number);
  const header = screen.getByText(/^\d{4}년 \d{1,2}월$/).props.children as (string | number)[];
  const [shownYear, , shownMonth] = header.map(Number);
  const delta = (year * 12 + month) - (shownYear * 12 + shownMonth);
  for (let i = 0; i < Math.abs(delta); i++) fireEvent.press(screen.getByRole('button', { name: delta > 0 ? '다음 달' : '이전 달' }));
}

function pressDay(iso: string) {
  showMonthOf(iso);
  const [, month, day] = iso.split('-').map(Number);
  fireEvent.press(screen.getByRole('button', { name: `${month}월 ${day}일` }));
}

/** 여행 기간 칸을 눌러 시작일·종료일을 고르고 확인한다. */
export async function pickPeriod(start: string, end: string) {
  fireEvent.press(await screen.findByRole('button', { name: '여행 기간' }));
  pressDay(start);
  pressDay(end);
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
}

/** 날짜 칸(label)을 눌러 하루를 고르고 확인한다. */
export async function pickDate(label: string, iso: string) {
  fireEvent.press(await screen.findByRole('button', { name: label }));
  pressDay(iso);
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
}

/** 시간 칸(label)을 눌러 'HH:MM'을 고르고 확인한다(분은 5분 단위). */
export async function pickTime(label: string, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  fireEvent.press(await screen.findByRole('button', { name: label }));
  fireEvent.press(screen.getByRole('button', { name: `${hour}시` }));
  fireEvent.press(screen.getByRole('button', { name: `${minute}분` }));
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
}
