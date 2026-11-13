import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';
import { pickReceipt } from '@/features/expenses/receipt-prep';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, expense, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('@/features/expenses/receipt-prep', () => ({
  pickReceipt: jest.fn(),
  prepareReceipt: jest.fn(async () => 'file:///resized/receipt.jpg'),
}));
const mockPick = pickReceipt as jest.MockedFunction<typeof pickReceipt>;

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const members = [member({ member_id: 'm1', display_name: '민지', is_organizer: true, is_me: true }), member({ member_id: 'm2', display_name: '준호', join_order: 2, is_organizer: false, is_me: false })];
const organizerTrip = tripDetail({ me: { member_id: 'm1', join_order: 1, is_organizer: true } });
const readReceipt = {
  merchant_name: '제주 편의점', total_amount: 30000, paid_at: null, payer_member_id: 'm1', default_sharer_ids: ['m1', 'm2'],
  items: [
    { id: 'i1', name: '간식', quantity: 3, amount: 12000, sharer_ids: ['m1', 'm2'] },
    { id: 'i2', name: '음료', quantity: 2, amount: null, sharer_ids: ['m1', 'm2'] },
  ],
};

function render(options: Parameters<typeof fakeApi>[1] = {}) {
  const api = fakeApi({}, { trips: [organizerTrip], members: { 'trip-jeju': members }, receipt: { expense: readReceipt, analysis: 'read' }, ...options });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settlement' });
  return api;
}

async function addReceiptFrom(source: '앨범에서 고르기' | '사진 찍기') {
  const alert = spyOnAlerts();
  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));
  fireEvent.press(await screen.findByRole('button', { name: '영수증으로 추가' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], source);
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPick.mockReset();
});

test('영수증을 고르면 줄여서 올리고, 읽은 값이 채워진 초안 편집 화면이 열린다', async () => {
  const api = render();
  mockPick.mockResolvedValueOnce({ uri: 'file:///r.jpg', width: 3000, height: 4000 });

  await addReceiptFrom('앨범에서 고르기');

  expect(await screen.findByText('영수증에서 읽은 값이에요. 원본과 비교해 빈 칸을 채우고 확정해 주세요.')).toBeOnTheScreen();
  expect(mockPick).toHaveBeenCalledWith('library');
  expect(api.uploadReceipt).toHaveBeenCalledWith('trip-jeju', { uri: 'file:///resized/receipt.jpg' }, expect.any(String));
  expect(screen.getByDisplayValue('제주 편의점')).toBeOnTheScreen();
  expect(screen.getByText('초안')).toBeOnTheScreen();
});

test('읽지 못한 값은 강조된다', async () => {
  render();
  mockPick.mockResolvedValueOnce({ uri: 'file:///r.jpg', width: 3000, height: 4000 });

  await addReceiptFrom('사진 찍기');

  await screen.findByDisplayValue('제주 편의점');
  expect(within(screen.getByLabelText('품목 2')).getByText('읽지 못함')).toBeOnTheScreen();
  expect(within(screen.getByLabelText('품목 1')).queryByText('읽지 못함')).toBeNull();
  // 결제 날짜도 못 읽었다.
  expect(screen.getAllByText('읽지 못함').length).toBeGreaterThanOrEqual(2);
  expect(mockPick).toHaveBeenCalledWith('camera');
});

test('분석에 실패해도 빈 초안으로 직접 입력을 이어간다', async () => {
  render({ receipt: { expense: { merchant_name: null, total_amount: null, items: [] }, analysis: 'failed' } });
  mockPick.mockResolvedValueOnce({ uri: 'file:///r.jpg', width: 1000, height: 1000 });

  await addReceiptFrom('앨범에서 고르기');

  expect(await screen.findByText('영수증을 읽지 못했어요. 원본을 보며 직접 입력해 주세요.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '영수증 원본 크게 보기' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '확정' })).toBeOnTheScreen();
});

test('올리기에 실패해 다시 시도해도 같은 멱등 키를 쓴다', async () => {
  const api = render();
  const original = api.uploadReceipt.getMockImplementation()!;
  api.uploadReceipt.mockReset();
  api.uploadReceipt.mockRejectedValueOnce(new ApiError(0, 'network_error', '서버에 연결하지 못했습니다.')).mockImplementation(original);
  mockPick.mockResolvedValue({ uri: 'file:///r.jpg', width: 1000, height: 1000 });

  await addReceiptFrom('앨범에서 고르기');
  expect(await screen.findByText('서버에 연결하지 못했습니다.')).toBeOnTheScreen();
  const alert = spyOnAlerts();
  fireEvent.press(screen.getByRole('button', { name: '영수증으로 추가' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '앨범에서 고르기');

  await screen.findByDisplayValue('제주 편의점');
  const [first, second] = api.uploadReceipt.mock.calls;
  expect(second[2]).toBe(first[2]);
});

test('영수증 원본을 크게 볼 수 있다', async () => {
  render({ expenses: { 'trip-jeju': [expense({ id: 'e1', has_receipt: true, receipt_url: 'https://storage.test/r.jpg', payer_member_id: 'm1', default_sharer_ids: ['m1'] })] } });

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));
  fireEvent.press(await screen.findByRole('button', { name: '편의점 지출 열기' }));
  fireEvent.press(await screen.findByRole('button', { name: '영수증 원본 크게 보기' }));

  expect(await screen.findByLabelText('영수증 원본')).toBeOnTheScreen();
});

test('일반 멤버에게는 영수증으로 추가가 없다', async () => {
  render({ trips: [tripDetail({ me: { member_id: 'm2', join_order: 2, is_organizer: false } })] });

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));

  expect(await screen.findByText('지출은 총무가 입력하고 확정해요.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '영수증으로 추가' })).toBeNull();
});

test('카메라 권한이 없으면 이유가 보인다', async () => {
  render();
  mockPick.mockRejectedValueOnce(new Error('카메라 권한이 없어요. 설정에서 카메라를 허용하거나 앨범에서 골라 주세요.'));

  await addReceiptFrom('사진 찍기');

  await waitFor(() => expect(screen.getByText('카메라 권한이 없어요. 설정에서 카메라를 허용하거나 앨범에서 골라 주세요.')).toBeOnTheScreen());
});

test('영수증 통화가 여행 통화와 다르면 바꿔 넣으라고 알려 준다', async () => {
  render({ trips: [tripDetail({ currency: 'USD', me: { member_id: 'm1', join_order: 1, is_organizer: true } })], receipt: { expense: readReceipt, analysis: 'read', receipt_currency: 'JPY' } });
  mockPick.mockResolvedValueOnce({ uri: 'file:///r.jpg', width: 3000, height: 4000 });

  await addReceiptFrom('앨범에서 고르기');

  expect(await screen.findByText('영수증 금액이 JPY로 보여요. 이 여행은 USD로 적으니, 금액을 USD로 바꿔 넣어 주세요.')).toBeOnTheScreen();
});
