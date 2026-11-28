import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError, type Suggestion } from '@/api/client';
import { dayOffset } from '@/features/trip/import-screen';

import { FakeAuthService, fakeApi, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const pasted: Suggestion = {
  id: 'import-1', destination: '붙여 넣은 계획', preferences: '', start_date: '2026-11-12', end_date: '2026-11-14', reused: false,
  items: [
    { id: 'i1', date: '2026-11-12', order: 1, place_name: '호텔 체크인', region: '', stay_minutes: 60, description: '', status: 'needs_check', adopted: false, place: null,
      start_time: '15:00:00', travel_minutes: null, transport: null, distance_km: null },
    { id: 'i2', date: '2026-11-12', order: 2, place_name: '동문시장', region: '제주시', stay_minutes: 60, description: '고기국수', status: 'verified', adopted: false,
      place: { source_place_id: '111', name: '동문재래시장', address: '제주시 일도일동', road_address: null, latitude: 33.5, longitude: 126.5, category: null },
      start_time: '18:00:00', travel_minutes: null, transport: null, distance_km: null },
  ],
};

const lastYear = tripDetail({ id: 'trip-old', name: '작년 제주', start_date: '2025-05-01', end_date: '2025-05-03' });

function render(options: Parameters<typeof fakeApi>[1] = {}) {
  const api = fakeApi({}, { trips: [tripDetail(), lastYear], suggestion: pasted, ...options });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju' });
  return api;
}

async function openImport() {
  fireEvent.press(await screen.findByRole('button', { name: '가져오기' }));
  expect(await screen.findByText('일정 가져오기')).toBeOnTheScreen();
}

test('붙여 넣은 계획을 일정 후보로 나누고, 장소 없는 일정도 골라 넣는다', async () => {
  const api = render();

  await openImport();
  fireEvent.changeText(screen.getByLabelText('붙여 넣을 계획'), '1일차\n15시 체크인\n18시 동문시장');
  fireEvent.press(screen.getByRole('button', { name: '일정으로 나누기' }));

  await waitFor(() => expect(api.importPlanText).toHaveBeenCalledWith('trip-jeju', '1일차\n15시 체크인\n18시 동문시장'));
  expect(await screen.findByText('장소 없는 일정')).toBeOnTheScreen();
  expect(screen.queryByText('확인 필요')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '모두 선택' }));
  fireEvent.press(screen.getByRole('button', { name: '플래너에 추가 (2)' }));

  await waitFor(() => expect(api.adoptSuggestions).toHaveBeenCalledWith('trip-jeju', 'import-1', ['i1', 'i2']));
  expect(await screen.findByRole('button', { name: '동문시장, 일정 수정' })).toBeOnTheScreen();
});

test('빈 글은 보내지 않고, 일정을 못 찾으면 서버 안내를 보여 준다', async () => {
  const api = render();
  api.importPlanText.mockRejectedValueOnce(new ApiError(422, 'no_plans_found', '글에서 여행 기간에 맞는 일정을 찾지 못했습니다.'));

  await openImport();
  fireEvent.press(screen.getByRole('button', { name: '일정으로 나누기' }));
  expect(await screen.findByText('계획을 붙여 넣어 주세요.')).toBeOnTheScreen();
  expect(api.importPlanText).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText('붙여 넣을 계획'), '아무 말');
  fireEvent.press(screen.getByRole('button', { name: '일정으로 나누기' }));
  expect(await screen.findByText('글에서 여행 기간에 맞는 일정을 찾지 못했습니다.')).toBeOnTheScreen();
});

test('다른 여행의 일정을 고른 일차부터 복사하고, 기간을 넘는 날은 빠진다고 보여 준다', async () => {
  const api = render({ planItems: { 'trip-old': [
    planItem({ id: 'o1', date: '2025-05-01', time: '12:00:00', title: '시장 점심' }),
    planItem({ id: 'o2', date: '2025-05-02', title: '오름' }),
    planItem({ id: 'o3', date: '2025-05-03', title: '공항' }),
  ] } });

  await openImport();
  fireEvent.press(screen.getByRole('tab', { name: '다른 여행에서' }));
  fireEvent.press(await screen.findByRole('radio', { name: /작년 제주/ }));
  expect(await screen.findByText('일정 3개 가져오기')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('radio', { name: '2일 차부터' }));
  expect(screen.getByText('3일 차 → 기간 밖(빠져요)')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('checkbox', { name: '오름 가져오기' }));
  fireEvent.press(screen.getByRole('button', { name: '일정 1개 가져오기' }));

  await waitFor(() => expect(api.copyPlanItems).toHaveBeenCalledWith('trip-jeju', { source_trip_id: 'trip-old', item_ids: ['o1'], first_date: '2026-11-13' }));
  expect(await screen.findByText('일정 1개를 가져왔어요')).toBeOnTheScreen();
});

test('다른 여행이 없으면 안내한다', async () => {
  const api = fakeApi({}, { trips: [tripDetail()] });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju' });

  await openImport();
  fireEvent.press(screen.getByRole('tab', { name: '다른 여행에서' }));

  expect(await screen.findByText(/가져올 다른 여행이 없어요/)).toBeOnTheScreen();
});

test('원래 여행 날짜는 첫날부터 며칠째인지로 맞춘다', () => {
  expect(dayOffset('2025-05-01', '2025-05-01')).toBe(0);
  expect(dayOffset('2025-05-30', '2025-06-02')).toBe(3);
});
