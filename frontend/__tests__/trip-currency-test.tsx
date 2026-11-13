import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { FakeAuthService, expense, fakeApi, member, tripDetail } from './support/fakes';
import { pickPeriod } from './support/pickers';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const members = [member({ member_id: 'm1', display_name: '민지', join_order: 1, is_organizer: true, is_me: true })];
const me = { member_id: 'm1', join_order: 1, is_organizer: true };

function tripIn(currency: string, expenses: ReturnType<typeof expense>[] = []) {
  const api = fakeApi({}, { trips: [tripDetail({ currency, me })], members: { 'trip-jeju': members }, expenses: { 'trip-jeju': expenses } });
  return api;
}

test('여행을 만들 때 통화를 고르면 그 통화로 만든다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/new' });

  fireEvent.changeText(await screen.findByLabelText('여행 이름'), '오사카 여행');
  await pickPeriod('2026-12-01', '2026-12-03');
  fireEvent.press(screen.getByRole('button', { name: '통화' }));
  fireEvent.press(screen.getByRole('button', { name: '엔 (일본)' }));
  expect(screen.getByText('엔 (일본) · JPY')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '여행 만들기' }));

  await waitFor(() => expect(api.createTrip).toHaveBeenCalledWith(expect.objectContaining({ currency: 'JPY' })));
});

test('달러 여행에서는 소수점으로 입력하고, 센트로 저장하고, 달러로 보여 준다', async () => {
  const api = tripIn('USD');
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/expenses/new' });

  expect(await screen.findByText('총액 ($)')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('총액'), '45.50');
  fireEvent.changeText(screen.getByLabelText('품목 1 이름'), '버거');
  fireEvent.changeText(screen.getByLabelText('품목 1 금액'), '45.5');
  expect(screen.getByText('품목 합계 $45.50 · 총액 $45.50')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.createExpense).toHaveBeenCalledTimes(1));
  expect(api.createExpense.mock.calls[0][1]).toMatchObject({ total_amount: 4550, items: [{ amount: 4550 }] });
});

test('소수점 자리가 너무 많으면 저장하지 않는다', async () => {
  const api = tripIn('USD');
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/expenses/new' });

  fireEvent.changeText(await screen.findByLabelText('총액'), '1.234');
  fireEvent.changeText(screen.getByLabelText('품목 1 이름'), '버거');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('숫자로 입력해주세요(소수점 2자리까지).')).toBeOnTheScreen();
  expect(api.createExpense).not.toHaveBeenCalled();
});

test('엔 여행의 지출 목록은 엔으로 보인다', async () => {
  renderApp({ auth: signedIn(), api: tripIn('JPY', [expense({ id: 'e1', status: 'confirmed', merchant_name: '라멘집', total_amount: 3200 })]), initialUrl: '/trips/trip-jeju/settlement' });

  fireEvent.press(await screen.findByRole('tab', { name: '지출 내역' }));

  expect(await screen.findByText('¥3,200')).toBeOnTheScreen();
});

test('여행 설정에서 통화를 바꿔 저장한다', async () => {
  const api = tripIn('KRW');
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settings' });

  fireEvent.press(await screen.findByRole('button', { name: '통화' }));
  fireEvent.press(screen.getByRole('button', { name: '달러 (미국)' }));
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.updateTrip).toHaveBeenCalledWith('trip-jeju', expect.objectContaining({ currency: 'USD' })));
});

test('해외 여행을 켜고 만들면 해외 여행으로 만든다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/new' });

  fireEvent.changeText(await screen.findByLabelText('여행 이름'), '오사카 여행');
  await pickPeriod('2026-12-01', '2026-12-03');
  fireEvent(screen.getByLabelText('해외 여행'), 'valueChange', true);
  expect(screen.getByText('장소를 Google 지도에서 찾아요.')).toBeOnTheScreen();
  expect(screen.getByText('해외 여행이면 현지 통화를 고르세요. 지출과 정산을 이 통화로 적어요.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '여행 만들기' }));

  await waitFor(() => expect(api.createTrip).toHaveBeenCalledWith(expect.objectContaining({ is_overseas: true })));
});

test('원이 아닌 통화를 고르면 해외 여행이 켜지고, 끄면 국내 검색만 된다고 알려 준다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/new' });

  fireEvent.changeText(await screen.findByLabelText('여행 이름'), '오사카 여행');
  await pickPeriod('2026-12-01', '2026-12-03');
  fireEvent.press(screen.getByRole('button', { name: '통화' }));
  fireEvent.press(screen.getByRole('button', { name: '엔 (일본)' }));
  expect(screen.getByText('장소를 Google 지도에서 찾아요.')).toBeOnTheScreen();
  fireEvent(screen.getByLabelText('해외 여행'), 'valueChange', false);
  expect(screen.getByText('국내 여행은 장소를 카카오맵(국내)에서만 찾아요. 해외로 가면 해외 여행을 켜 주세요.')).toBeOnTheScreen();
  fireEvent(screen.getByLabelText('해외 여행'), 'valueChange', true);
  fireEvent.press(screen.getByRole('button', { name: '여행 만들기' }));

  await waitFor(() => expect(api.createTrip).toHaveBeenCalledWith(expect.objectContaining({ currency: 'JPY', is_overseas: true })));
});
