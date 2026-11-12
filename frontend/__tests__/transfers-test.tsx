import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import type { Settlement, Transfer } from '@/api/client';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const members = [
  member({ member_id: 'm1', display_name: '민지', join_order: 1, is_organizer: true, is_me: true }),
  member({ member_id: 'm2', display_name: '준호', join_order: 2, is_organizer: false, is_me: false }),
  member({ member_id: 'm3', display_name: '수빈', join_order: 3, is_organizer: false, is_me: false }),
];
const organizerTrip = tripDetail({ member_count: 3, me: { member_id: 'm1', join_order: 1, is_organizer: true } });
const memberTrip = tripDetail({ member_count: 3, me: { member_id: 'm2', join_order: 2, is_organizer: false } });

const balance = (id: string, name: string, order: number, value: number) =>
  ({ member_id: id, display_name: name, join_order: order, paid: 0, owed: 0, sent: 0, received: 0, balance: value });
const settlement: Settlement = {
  confirmed_total: 30000,
  confirmed_count: 1,
  is_settled: false,
  members: [balance('m1', '민지', 1, 17000), balance('m2', '준호', 2, -8500), balance('m3', '수빈', 3, -8500)],
  suggested_transfers: [
    { from_member_id: 'm2', from_name: '준호', to_member_id: 'm1', to_name: '민지', amount: 8500 },
    { from_member_id: 'm3', from_name: '수빈', to_member_id: 'm1', to_name: '민지', amount: 8500 },
  ],
  shares: [],
};
const recorded: Transfer = {
  id: 't1', from_member_id: 'm2', from_name: '준호', to_member_id: 'm1', to_name: '민지', amount: 5000, recorded_at: '2026-11-14T03:00:00Z',
};

function render(trip = organizerTrip, transfers: Transfer[] = []) {
  const api = fakeApi({}, { trips: [trip], members: { 'trip-jeju': members }, settlements: { 'trip-jeju': settlement }, transfers: { 'trip-jeju': transfers } });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settlement' });
  return api;
}

function lastButtons(alert: jest.SpyInstance) {
  return alert.mock.calls.at(-1)![2] as AlertButton[];
}

afterEach(() => jest.restoreAllMocks());

test('카드의 송금 완료로 기록이 올바른 보낸·받은 멤버와 금액으로 요청된다', async () => {
  const api = render();
  const alert = spyOnAlerts();

  fireEvent.press(await screen.findByRole('button', { name: '수빈 → 민지 8,500원 송금 완료로 기록' }));
  expect(api.recordTransfer).not.toHaveBeenCalled();
  await pressAlertButton(lastButtons(alert), '기록');

  expect(api.recordTransfer).toHaveBeenCalledWith('trip-jeju', { from_member_id: 'm3', to_member_id: 'm1', amount: 8500 });
  expect(await screen.findByText('수빈 → 민지 8,500원 송금을 기록했어요.')).toBeOnTheScreen();
});

test('일부만 보낸 경우 금액을 직접 입력해 기록한다', async () => {
  const api = render();

  fireEvent.press(await screen.findByRole('button', { name: '준호 → 민지 금액 직접 입력' }));
  expect(await screen.findByDisplayValue('8500')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('보낸 금액'), '5000');
  fireEvent.press(screen.getByRole('button', { name: '기록' }));

  await waitFor(() => expect(api.recordTransfer).toHaveBeenCalledWith('trip-jeju', { from_member_id: 'm2', to_member_id: 'm1', amount: 5000 }));
});

test('0원이나 숫자가 아닌 금액은 기록하지 않는다', async () => {
  const api = render();

  fireEvent.press(await screen.findByRole('button', { name: '준호 → 민지 금액 직접 입력' }));
  for (const amount of ['0', '5,000', '']) {
    fireEvent.changeText(await screen.findByLabelText('보낸 금액'), amount);
    fireEvent.press(screen.getByRole('button', { name: '기록' }));
    expect(await screen.findByText('0보다 큰 원 단위 숫자로 입력해주세요.')).toBeOnTheScreen();
  }
  expect(api.recordTransfer).not.toHaveBeenCalled();
});

test('기록된 송금이 목록에 보이고, 총무는 확인 창을 거쳐 지울 수 있다', async () => {
  const api = render(organizerTrip, [recorded]);
  const alert = spyOnAlerts();

  expect(await screen.findByText('5,000원 · 11.14 12:00 기록')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '준호 → 민지 5,000원 기록 지우기' }));
  await pressAlertButton(lastButtons(alert), '지우기');

  expect(api.deleteTransfer).toHaveBeenCalledWith('trip-jeju', 't1');
  expect(await screen.findByText('아직 기록된 송금이 없어요.')).toBeOnTheScreen();
});

test('일반 멤버는 송금 기록을 볼 수 있지만 기록·삭제 버튼이 없다', async () => {
  render(memberTrip, [recorded]);

  expect(await screen.findByText('5,000원 · 11.14 12:00 기록')).toBeOnTheScreen();
  expect(screen.queryByText('송금 완료로 기록')).toBeNull();
  expect(screen.queryByText('금액 직접 입력')).toBeNull();
  expect(screen.queryByText('지우기')).toBeNull();
});

test('송금을 기록하면 정산 결과를 다시 불러온다', async () => {
  const api = render();
  const alert = spyOnAlerts();
  await screen.findByText('송금 제안');
  const before = api.getSettlement.mock.calls.length;

  fireEvent.press(screen.getByRole('button', { name: '준호 → 민지 8,500원 송금 완료로 기록' }));
  await pressAlertButton(lastButtons(alert), '기록');

  await waitFor(() => expect(api.getSettlement.mock.calls.length).toBeGreaterThan(before));
  expect(await screen.findByText('8,500원 · 11.14 12:00 기록')).toBeOnTheScreen();
});
