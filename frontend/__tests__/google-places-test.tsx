import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { FakeAuthService, fakeApi, member, photo, place, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

// 해외 여행의 Google 장소(ADR 0006): 서버는 이름·주소를 저장하지 않는다. 앱은 꼭 필요한 곳에서만 이름을 받고 출처를 단다.

const osaka = tripDetail({ id: 'trip-osaka', name: '오사카 여행', currency: 'JPY', is_overseas: true, me: { member_id: 'm1', join_order: 1, is_organizer: true } });
const candidates = [
  { source_place_id: 'ChIJ-castle', name: '오사카성', address: '일본 오사카부 오사카시 주오구', road_address: null, latitude: 34.687, longitude: 135.526, category: '관광 명소' },
];
const castle = place({ id: 'place-ChIJ-castle', source_place_id: 'ChIJ-castle', source: 'google', name: null, address: null, road_address: null, latitude: 34.687, longitude: 135.526 });

function render(initialUrl: string, options: Parameters<typeof fakeApi>[1] = {}) {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  const api = fakeApi({}, { trips: [osaka], members: { 'trip-osaka': [member({ member_id: 'm1', is_me: true, is_organizer: true })] }, placeCandidates: candidates, ...options });
  renderApp({ auth, api, initialUrl });
  return api;
}

const originalOS = Platform.OS;
afterEach(() => { Platform.OS = originalOS; });

test('해외 장소를 고르면 제목은 Google 이름이 아니라 검색어로 채우고, 검색 결과에 Google 출처를 단다', async () => {
  const api = render('/trips/trip-osaka');

  fireEvent.press(await screen.findByRole('button', { name: '＋ 일정 추가' }));
  fireEvent.changeText(await screen.findByLabelText('장소 검색'), '오사카');
  fireEvent.press(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByRole('button', { name: '오사카성 선택' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Google Maps')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: '오사카성 선택' }));

  expect(screen.getByLabelText('장소 또는 일정 이름')).toHaveDisplayValue('오사카');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(api.createPlanItem).toHaveBeenCalledWith('trip-osaka', expect.objectContaining({
    title: '오사카', place: { source_place_id: 'ChIJ-castle', name: '오사카성' },
  })));
});

test('안드로이드 지도: 핀은 일정 제목으로 보이고, 고른 장소 하나만 Google에서 이름을 받아 출처와 함께 보여 준다', async () => {
  Platform.OS = 'android';
  const api = render('/trips/trip-osaka/map', { planItems: { 'trip-osaka': [planItem({ id: 'a', date: '2026-11-12', title: '성 구경', place: castle })] } });

  expect(await screen.findByText('오사카성')).toBeOnTheScreen();
  expect(screen.getByText('○ 성 구경')).toBeOnTheScreen();
  expect(screen.getByLabelText('Google Maps')).toBeOnTheScreen();
  expect(api.getPlaceDetails).toHaveBeenCalledTimes(1);
  expect(api.getPlaceDetails).toHaveBeenCalledWith('trip-osaka', 'place-ChIJ-castle');
});

test('이름 받기가 실패하면(하루 상한) 일정 제목을 대신 보여 준다', async () => {
  Platform.OS = 'android';
  const api = render('/trips/trip-osaka/map', {
    planItems: { 'trip-osaka': [planItem({ id: 'a', date: '2026-11-12', title: '성 구경', place: castle })] },
    placeDetailsFail: true,
  });

  await waitFor(() => expect(api.getPlaceDetails).toHaveBeenCalled());
  expect(screen.getAllByText(/성 구경/).length).toBeGreaterThan(0);
  expect(screen.queryByText('오사카성')).toBeNull();
  expect(screen.queryByLabelText('Google Maps')).toBeNull();
});

test('Google 지도가 아닌 지도(iOS)에서는 해외 장소 핀을 찍지 않고 이름도 받지 않는다', async () => {
  Platform.OS = 'ios';
  const api = render('/trips/trip-osaka/map', { planItems: { 'trip-osaka': [planItem({ id: 'a', date: '2026-11-12', title: '성 구경', place: castle })] } });

  expect(await screen.findByText('해외 장소는 Google 지도 약관 때문에 안드로이드 앱과 웹에서만 지도에 표시돼요.')).toBeOnTheScreen();
  expect(screen.queryByText('○ 성 구경')).toBeNull();
  expect(api.getPlaceDetails).not.toHaveBeenCalled();
});

test('일정 목록은 Google 장소 이름을 받지 않는다', async () => {
  const api = render('/trips/trip-osaka', { planItems: { 'trip-osaka': [planItem({ id: 'a', date: '2026-11-12', title: '성 구경', place: castle })] } });

  expect(await screen.findByText('성 구경')).toBeOnTheScreen();
  expect(api.getPlaceDetails).not.toHaveBeenCalled();
});

test('앨범 장소별 묶음은 Google 장소 이름을 받아 제목으로 쓴다', async () => {
  const api = render('/trips/trip-osaka/album', {
    planItems: { 'trip-osaka': [planItem({ id: 'a', date: '2026-11-12', title: '성 구경', place: castle })] },
    photos: { 'trip-osaka': [photo({ id: 'p1', place: castle })] },
  });

  fireEvent.press(await screen.findByText('장소별'));

  // 이름 바로 뒤에 같은 줄로 Google 출처가 붙는다.
  expect(await screen.findByText('오사카성  Google Maps')).toBeOnTheScreen();
  expect(api.getPlaceDetails).toHaveBeenCalledWith('trip-osaka', 'place-ChIJ-castle');
});
