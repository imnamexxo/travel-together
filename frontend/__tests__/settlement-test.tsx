import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import type { Settlement } from '@/api/client';

import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const members = [
  member({ member_id: 'm1', display_name: '민지', join_order: 1, is_organizer: true, is_me: false }),
  member({ member_id: 'm2', display_name: '준호', join_order: 2, is_organizer: false, is_me: true }),
  member({ member_id: 'm3', display_name: '수빈', join_order: 3, is_organizer: false, is_me: false }),
];
const junhoTrip = tripDetail({ member_count: 3, me: { member_id: 'm2', join_order: 2, is_organizer: false } });

const balance = (id: string, name: string, order: number, paid: number, owed: number, value: number) =>
  ({ member_id: id, display_name: name, join_order: order, paid, owed, sent: 0, received: 0, balance: value });

/** 기획서 대표 사례. 단, 화면이 다시 계산하지 않는지 보려고 준호 값은 일부러 계산과 맞지 않게 둔다. */
const representative: Settlement = {
  confirmed_total: 30000,
  confirmed_count: 1,
  is_settled: false,
  members: [
    balance('m1', '민지', 1, 30000, 13000, 17000),
    balance('m2', '준호', 2, 0, 8500, -7777),
    balance('m3', '수빈', 3, 0, 8500, -8500),
  ],
  suggested_transfers: [
    { from_member_id: 'm2', from_name: '준호', to_member_id: 'm1', to_name: '민지', amount: 8500 },
    { from_member_id: 'm3', from_name: '수빈', to_member_id: 'm1', to_name: '민지', amount: 8500 },
  ],
  shares: [
    { member_id: 'm1', expense_id: 'e1', expense_name: '편의점', item_name: '간식', item_amount: 12000, sharer_count: 3, amount: 4000 },
    { member_id: 'm2', expense_id: 'e1', expense_name: '편의점', item_name: '간식', item_amount: 12000, sharer_count: 3, amount: 4000 },
    { member_id: 'm2', expense_id: 'e1', expense_name: '편의점', item_name: '음료', item_amount: 9000, sharer_count: 2, amount: 4500 },
  ],
};

function renderSettlement(settlement?: Settlement) {
  const api = fakeApi({}, { trips: [junhoTrip], members: { 'trip-jeju': members }, settlements: settlement ? { 'trip-jeju': settlement } : {} });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settlement' });
  return api;
}

afterEach(() => jest.restoreAllMocks());

test('서버가 계산한 내 잔액·결제액·부담액을 그대로 보여준다', async () => {
  renderSettlement(representative);

  expect(await screen.findByText('내가 보낼 금액')).toBeOnTheScreen();
  // 결제액 0 − 부담액 8,500이면 8,500이지만, 화면은 서버 값(7,777)을 그린다.
  expect(screen.getByText('7,777원')).toBeOnTheScreen();
  expect(screen.getByText('확정된 총지출 · 1건')).toBeOnTheScreen();
  expect(screen.getByText('30,000원')).toBeOnTheScreen();
});

test('송금 제안이 카드로 보이고, 안내문을 복사할 수 있다', async () => {
  renderSettlement(representative);

  expect(await screen.findByText('송금 제안')).toBeOnTheScreen();
  expect(screen.getAllByText('8,500원').length).toBeGreaterThanOrEqual(2);
  fireEvent.press(screen.getByRole('button', { name: '송금 안내문 복사' }));

  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    '[제주 여행] 정산 송금 안내\n준호 → 민지 8,500원\n수빈 → 민지 8,500원\n실제 송금은 은행 앱에서 해 주세요.',
  ));
  expect(await screen.findByText('송금 안내문을 복사했어요. 메신저에 붙여 넣으세요.')).toBeOnTheScreen();
});

test('실제 송금은 은행 앱에서 한다는 안내가 보인다', async () => {
  renderSettlement(representative);

  expect(await screen.findByText('실제 송금은 은행 앱에서 진행해주세요. 이 앱은 송금하지 않아요.')).toBeOnTheScreen();
});

test('부담액 근거 화면에는 내 품목별 부담만 지출별로 보인다', async () => {
  renderSettlement(representative);

  fireEvent.press(await screen.findByRole('button', { name: '내 부담액의 계산 근거' }));

  expect(await screen.findByText('부담액 계산 근거')).toBeOnTheScreen();
  expect(screen.getByText('품목 12,000원 · 3명 분담')).toBeOnTheScreen();
  expect(screen.getByText('품목 9,000원 · 2명 분담')).toBeOnTheScreen();
  expect(screen.getByText('4,500원')).toBeOnTheScreen();
  // 민지의 간식 몫은 내 근거가 아니다.
  expect(screen.getAllByText('간식')).toHaveLength(1);
});

test('멤버별 잔액이 받을 금액·보낼 금액으로 보인다', async () => {
  renderSettlement(representative);

  expect(await screen.findByText('17,000원 받을 금액')).toBeOnTheScreen();
  expect(screen.getByText('7,777원 보낼 금액')).toBeOnTheScreen();
  expect(screen.getByText('준호 (나)')).toBeOnTheScreen();
});

test('모든 잔액이 0이면 정산 완료가 보인다', async () => {
  renderSettlement({
    ...representative,
    is_settled: true,
    members: representative.members.map((m) => ({ ...m, balance: 0 })),
    suggested_transfers: [],
  });

  expect(await screen.findByText('모든 멤버의 잔액이 0원이에요.')).toBeOnTheScreen();
  expect(screen.getAllByText('정산 완료')).toHaveLength(1 + members.length);
  expect(screen.getByText('내 정산이 완료됐어요')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '송금 안내문 복사' })).toBeNull();
});

test('확정된 지출이 없으면 정산 완료 대신 안내가 보인다', async () => {
  renderSettlement();

  expect(await screen.findByText('아직 확정된 지출이 없어요')).toBeOnTheScreen();
  expect(screen.queryAllByText('정산 완료')).toHaveLength(0);
  expect(screen.getAllByText('0원').length).toBeGreaterThanOrEqual(members.length);
});

test('지출을 확정하고 돌아오면 정산 결과를 다시 불러온다', async () => {
  const organizerTrip = tripDetail({ member_count: 3, me: { member_id: 'm1', join_order: 1, is_organizer: true } });
  const api = fakeApi({}, { trips: [organizerTrip], members: { 'trip-jeju': members }, settlements: { 'trip-jeju': representative } });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settlement' });
  await screen.findByText('송금 제안');
  const before = api.getSettlement.mock.calls.length;

  fireEvent.press(screen.getByRole('tab', { name: '지출 내역' }));
  fireEvent.press(await screen.findByRole('button', { name: '＋ 직접 입력' }));
  fireEvent.changeText(await screen.findByLabelText('총액'), '9000');
  fireEvent.changeText(screen.getByLabelText('품목 1 이름'), '음료');
  fireEvent.changeText(screen.getByLabelText('품목 1 금액'), '9000');
  fireEvent.press(screen.getByRole('button', { name: '확정' }));

  await waitFor(() => expect(api.getSettlement.mock.calls.length).toBeGreaterThan(before));
});
