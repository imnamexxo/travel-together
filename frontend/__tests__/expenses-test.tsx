import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, expense, fakeApi, member, tripDetail } from './support/fakes';
import { pickDate, pickTime } from './support/pickers';
import { renderApp } from './support/render-app';

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

function render(api: ReturnType<typeof fakeApi>, initialUrl: string) {
  return renderApp({ auth: signedIn(), api, initialUrl });
}

function organizerApi(overrides = {}, expenses: ReturnType<typeof expense>[] = []) {
  return fakeApi(overrides, { trips: [organizerTrip], members: { 'trip-jeju': members }, expenses: { 'trip-jeju': expenses } });
}

const item = (n: number) => within(screen.getByLabelText(`품목 ${n}`));

async function fillItem(n: number, name: string, amount: string) {
  fireEvent.changeText(await screen.findByLabelText(`품목 ${n} 이름`), name);
  fireEvent.changeText(screen.getByLabelText(`품목 ${n} 금액`), amount);
}

afterEach(() => jest.restoreAllMocks());

test('총무가 품목별로 분담 대상을 고르면 저장 요청에 그대로 실린다', async () => {
  const api = organizerApi();
  render(api, '/trips/trip-jeju/settlement');

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));
  fireEvent.press(await screen.findByRole('button', { name: '＋ 직접 입력' }));
  fireEvent.changeText(await screen.findByLabelText('상호'), '편의점');
  fireEvent.changeText(screen.getByLabelText('총액'), '30000');
  await fillItem(1, '간식', '12000');
  fireEvent.press(screen.getByRole('button', { name: '＋ 품목 추가' }));
  await fillItem(2, '음료', '9000');
  fireEvent.press(screen.getByLabelText('품목 2 분담 민지'));
  fireEvent.press(screen.getByRole('button', { name: '＋ 품목 추가' }));
  await fillItem(3, '충전 케이블', '9000');
  // 기본 분담 대상에서 수빈을 빼면 예외로 바꾸지 않은 품목 1·3에만 반영된다.
  fireEvent.press(screen.getByLabelText('기본 분담 대상 수빈'));

  expect(item(2).getByText('예외')).toBeOnTheScreen();
  expect(screen.getByLabelText('품목 3 분담 수빈')).not.toBeChecked();
  expect(screen.getByLabelText('품목 2 분담 수빈')).toBeChecked();
  expect(screen.getByText('품목 합계와 총액이 같아요')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('초안으로 저장했어요. 확정해야 정산에 들어가요.')).toBeOnTheScreen();
  const [tripId, input, key] = api.createExpense.mock.calls[0];
  expect(tripId).toBe('trip-jeju');
  expect(key).toEqual(expect.any(String));
  expect(input).toMatchObject({
    payer_member_id: 'm1',
    merchant_name: '편의점',
    total_amount: 30000,
    default_sharer_ids: ['m1', 'm2'],
    items: [
      { name: '간식', amount: 12000, sharer_ids: ['m1', 'm2'] },
      { name: '음료', amount: 9000, sharer_ids: ['m2', 'm3'] },
      { name: '충전 케이블', amount: 9000, sharer_ids: ['m1', 'm2'] },
    ],
  });
});

test('품목 합계와 총액의 차이가 편집 화면에 항상 보인다', async () => {
  render(organizerApi(), '/trips/trip-jeju/expenses/new');

  fireEvent.changeText(await screen.findByLabelText('총액'), '30000');
  await fillItem(1, '간식', '21000');

  expect(screen.getByText('품목 합계 21,000원 · 총액 30,000원')).toBeOnTheScreen();
  expect(screen.getByText('차이 9,000원')).toBeOnTheScreen();
});

test('확정에 실패하면 깨진 조건이 해당 품목 옆에 보이고 상태가 확인 필요가 된다', async () => {
  const api = organizerApi({
    confirmExpense: jest.fn(async () => {
      throw new ApiError(422, 'confirm_conditions_failed', '확정 조건을 확인해 주세요.', [
        { field: 'items.1.sharers', message: '분담 대상을 한 명 이상 골라 주세요.' },
        { field: 'total_amount', message: '품목 합계(21,000원)와 총액(30,000원)이 다릅니다.' },
      ]);
    }),
  });
  render(api, '/trips/trip-jeju/expenses/new');

  fireEvent.changeText(await screen.findByLabelText('총액'), '30000');
  await fillItem(1, '간식', '12000');
  fireEvent.press(screen.getByRole('button', { name: '＋ 품목 추가' }));
  await fillItem(2, '음료', '9000');
  for (const name of ['민지', '준호', '수빈']) fireEvent.press(screen.getByLabelText(`품목 2 분담 ${name}`));
  fireEvent.press(screen.getByRole('button', { name: '확정' }));

  expect(await item(2).findByText('분담 대상을 한 명 이상 골라 주세요.')).toBeOnTheScreen();
  expect(item(1).queryByText('분담 대상을 한 명 이상 골라 주세요.')).toBeNull();
  expect(screen.getByText('품목 합계(21,000원)와 총액(30,000원)이 다릅니다.')).toBeOnTheScreen();
  expect(screen.getByText('확인 필요')).toBeOnTheScreen();
});

test('확정에 성공하면 정산 화면의 확정된 지출에 보인다', async () => {
  const api = organizerApi();
  render(api, '/trips/trip-jeju/settlement');

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));
  fireEvent.press(await screen.findByRole('button', { name: '＋ 직접 입력' }));
  fireEvent.changeText(await screen.findByLabelText('상호'), '고기국수');
  fireEvent.changeText(screen.getByLabelText('총액'), '36000');
  await fillItem(1, '고기국수 3그릇', '36000');
  fireEvent.press(screen.getByRole('button', { name: '확정' }));

  expect(await screen.findByText('확정된 지출 · 1건')).toBeOnTheScreen();
  expect(screen.getByText('고기국수')).toBeOnTheScreen();
  expect(api.confirmExpense).toHaveBeenCalledWith('trip-jeju', 'expense-1');
});

test('저장이 실패해 다시 눌러도 같은 멱등 키로 보낸다', async () => {
  const api = organizerApi();
  const create = api.createExpense.getMockImplementation()!;
  api.createExpense.mockReset();
  api.createExpense
    .mockRejectedValueOnce(new ApiError(0, 'network_error', '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'))
    .mockImplementation(create);
  render(api, '/trips/trip-jeju/expenses/new');

  await fillItem(1, '간식', '12000');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByText('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('초안으로 저장했어요. 확정해야 정산에 들어가요.')).toBeOnTheScreen();
  const [first, second] = api.createExpense.mock.calls;
  expect(second[2]).toBe(first[2]);
});

test('저장한 뒤 다시 저장하면 새로 만들지 않고 고친다', async () => {
  const api = organizerApi();
  render(api, '/trips/trip-jeju/expenses/new');

  await fillItem(1, '간식', '12000');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('초안으로 저장했어요. 확정해야 정산에 들어가요.');
  fireEvent.changeText(screen.getByLabelText('품목 1 금액'), '13000');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.updateExpense).toHaveBeenCalledTimes(1));
  expect(api.createExpense).toHaveBeenCalledTimes(1);
  expect(api.updateExpense.mock.calls[0][2].items?.[0].amount).toBe(13000);
});

test('지출 목록에 확인이 필요한 지출이 따로 모여 보인다', async () => {
  const expenses = [
    expense({ id: 'e1', status: 'needs_review', merchant_name: '카페', payer_member_id: 'm1' }),
    expense({ id: 'e2', status: 'confirmed', merchant_name: '편의점' }),
    expense({ id: 'e3', status: 'draft', merchant_name: null, total_amount: null, payer_member_id: null, paid_at: null }),
  ];
  render(organizerApi({}, expenses), '/trips/trip-jeju/settlement');

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));

  expect(await screen.findByText('확인 필요 · 2건')).toBeOnTheScreen();
  expect(screen.getByText('확정된 지출 · 1건')).toBeOnTheScreen();
  expect(screen.getByText('민지 결제 · 확인 필요')).toBeOnTheScreen();
  expect(screen.getByText('결제자 미지정 · 초안')).toBeOnTheScreen();
  expect(screen.getByText('금액 미입력')).toBeOnTheScreen();
});

test('확정된 지출도 고치거나 확인 창을 거쳐 지울 수 있다', async () => {
  const confirmed = expense({
    id: 'e1', status: 'confirmed', merchant_name: '편의점', total_amount: 9000, default_sharer_ids: ['m1', 'm2', 'm3'],
    items: [{ id: 'i1', name: '음료', quantity: 2, amount: 9000, sharer_ids: ['m2', 'm3'] }],
  });
  const api = organizerApi({}, [confirmed]);
  render(api, '/trips/trip-jeju/expenses/e1');

  expect(await screen.findByDisplayValue('음료')).toBeOnTheScreen();
  expect(item(1).getByText('예외')).toBeOnTheScreen();
  expect(screen.getByText('고쳐서 저장하면 다시 초안이 돼요. 확정해야 정산에 다시 들어가요.')).toBeOnTheScreen();
  const alert = spyOnAlerts();
  fireEvent.press(screen.getByRole('button', { name: '지출 삭제' }));
  expect(api.deleteExpense).not.toHaveBeenCalled();
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '삭제');

  expect(api.deleteExpense).toHaveBeenCalledWith('trip-jeju', 'e1');
  expect(await screen.findByText('여행 정산')).toBeOnTheScreen();
});

test('일반 멤버는 지출을 볼 수만 있고 수정 버튼이 보이지 않는다', async () => {
  const confirmed = expense({ id: 'e1', status: 'confirmed', merchant_name: '편의점', items: [{ id: 'i1', name: '간식', quantity: null, amount: 30000, sharer_ids: ['m1'] }] });
  const api = fakeApi({}, { trips: [memberTrip], members: { 'trip-jeju': members.map((m) => ({ ...m, is_me: m.member_id === 'm2' })) }, expenses: { 'trip-jeju': [confirmed] } });
  render(api, '/trips/trip-jeju/settlement');

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));
  expect(await screen.findByText('지출은 총무가 입력하고 확정해요.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '＋ 직접 입력' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '편의점 지출 열기' }));

  expect(await screen.findByText('지출 상세')).toBeOnTheScreen();
  for (const name of ['저장', '확정', '지출 삭제', '＋ 품목 추가']) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  expect(screen.getByLabelText('품목 1 이름')).toHaveProp('editable', false);
  expect(screen.getByLabelText('결제자 민지')).toBeDisabled();
});

test('결제 날짜는 달력에서, 결제 시각은 시·분을 눌러 고르고 저장된다', async () => {
  const api = organizerApi();
  render(api, '/trips/trip-jeju/expenses/new');

  fireEvent.changeText(await screen.findByLabelText('상호'), '편의점');
  fireEvent.changeText(screen.getByLabelText('품목 1 이름'), '음료');
  await pickDate('결제 날짜', '2026-11-13');
  await pickTime('결제 시각', '14:35');
  expect(screen.getByText('11월 13일 (금)')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.createExpense).toHaveBeenCalledTimes(1));
  expect(api.createExpense.mock.calls[0][1].paid_at).toBe('2026-11-13T14:35:00+09:00');
});

test('날짜만 고르고 시각을 고르지 않으면 이유가 보인다', async () => {
  const api = organizerApi();
  render(api, '/trips/trip-jeju/expenses/new');

  await pickDate('결제 날짜', '2026-11-13');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('결제 시각을 골라 주세요.')).toBeOnTheScreen();
});
