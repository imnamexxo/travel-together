import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/client';

import { FakeAuthService, expense, fakeApi, member, place, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const members = [member({ member_id: 'm1', display_name: '민지', is_organizer: true, is_me: true })];
const organizerTrip = tripDetail({ me: { member_id: 'm1', join_order: 1, is_organizer: true } });
const airport = place({ id: 'place-902', source_place_id: '902', name: '제주 편의점 공항점', latitude: 33.507, longitude: 126.493 });
const candidates = [
  { source_place_id: '902', name: '제주 편의점 공항점', address: '제주시 용담동', road_address: null, latitude: 33.507, longitude: 126.493, category: null, in_trip: true },
  { source_place_id: '901', name: '제주 편의점 시청점', address: '제주시 이도동', road_address: null, latitude: 33.5, longitude: 126.53, category: null, in_trip: false },
];

function render(options: Parameters<typeof fakeApi>[1] = {}, initialUrl = '/trips/trip-jeju/expenses/new') {
  const api = fakeApi({}, { trips: [organizerTrip], members: { 'trip-jeju': members }, expensePlaceCandidates: candidates, ...options });
  renderApp({ auth: signedIn(), api, initialUrl });
  return api;
}

afterEach(() => jest.restoreAllMocks());

test('상호로 장소 후보를 받고, 이 여행의 장소가 표시된다', async () => {
  const api = render();

  fireEvent.changeText(await screen.findByLabelText('상호'), '제주 편의점');
  fireEvent.press(screen.getByRole('button', { name: '장소 후보 보기' }));

  expect(await screen.findByText('이 여행의 장소')).toBeOnTheScreen();
  expect(api.getExpensePlaceCandidates).toHaveBeenCalledWith('trip-jeju', '제주 편의점');
  expect(screen.getByLabelText('장소 검색어')).toHaveDisplayValue('제주 편의점');
});

test('검색어를 바꿔 다시 찾을 수 있다', async () => {
  const api = render();

  fireEvent.changeText(await screen.findByLabelText('상호'), '제주 편의점');
  fireEvent.press(screen.getByRole('button', { name: '장소 후보 보기' }));
  fireEvent.changeText(await screen.findByLabelText('장소 검색어'), '시청점');
  fireEvent.press(screen.getByRole('button', { name: '장소 후보 다시 찾기' }));

  await waitFor(() => expect(api.getExpensePlaceCandidates).toHaveBeenLastCalledWith('trip-jeju', '시청점'));
  expect(await screen.findByRole('button', { name: '제주 편의점 시청점 장소로 지정' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '제주 편의점 공항점 장소로 지정' })).toBeNull();
});

test('후보를 고르면 저장 요청에 그 장소가 실리고, 고르지 않으면 장소 없이 저장된다', async () => {
  const api = render();

  fireEvent.changeText(await screen.findByLabelText('상호'), '제주 편의점');
  fireEvent.changeText(screen.getByLabelText('품목 1 이름'), '음료');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(api.createExpense).toHaveBeenCalledTimes(1));
  expect(api.createExpense.mock.calls[0][1].place).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: '장소 후보 보기' }));
  fireEvent.press(await screen.findByRole('button', { name: '제주 편의점 공항점 장소로 지정' }));
  expect(screen.getByText('📍 제주 편의점 공항점')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.updateExpense).toHaveBeenCalledTimes(1));
  expect(api.updateExpense.mock.calls[0][2].place).toEqual({ source_place_id: '902', name: '제주 편의점 공항점' });
});

test('후보를 열기 전에는 장소를 붙이지 않는다', async () => {
  const api = render();

  fireEvent.changeText(await screen.findByLabelText('상호'), '제주 편의점');

  expect(api.getExpensePlaceCandidates).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '장소 후보 보기' })).toBeOnTheScreen();
});

test('후보를 찾지 못하면 이유가 보인다', async () => {
  const api = render();
  api.getExpensePlaceCandidates.mockRejectedValueOnce(new ApiError(502, 'place_search_unavailable', '장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'));

  fireEvent.changeText(await screen.findByLabelText('상호'), '제주 편의점');
  fireEvent.press(screen.getByRole('button', { name: '장소 후보 보기' }));

  expect(await screen.findByText('장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeOnTheScreen();
});

test('장소가 지정된 확정 지출의 금액이 그날 그 장소의 일정 항목에 보인다', async () => {
  render({
    planItems: { 'trip-jeju': [planItem({ title: '도착', place: airport })] },
    expenses: { 'trip-jeju': [
      expense({ id: 'e1', status: 'confirmed', total_amount: 9000, paid_at: '2026-11-12T03:00:00Z', place: airport }),
      expense({ id: 'e2', status: 'draft', total_amount: 5000, paid_at: '2026-11-12T03:00:00Z', place: airport }),
      expense({ id: 'e3', status: 'confirmed', total_amount: 7000, paid_at: '2026-11-13T03:00:00Z', place: airport }),
    ] },
  }, '/trips/trip-jeju');

  expect(await screen.findByText('지출 9,000원')).toBeOnTheScreen();
});

test('확정된 지출이 붙은 장소는 지도에서 들른 곳이다(일정에 없어도)', async () => {
  render({ expenses: { 'trip-jeju': [expense({ id: 'e1', status: 'confirmed', total_amount: 9000, place: airport })] } }, '/trips/trip-jeju/map');

  fireEvent.press(await screen.findByRole('tab', { name: '● 들른 곳' }));

  expect(await screen.findByText('1곳')).toBeOnTheScreen();
  expect(screen.getByText('일정 0개 · 사진 0장 · 지출 9,000원')).toBeOnTheScreen();
});
