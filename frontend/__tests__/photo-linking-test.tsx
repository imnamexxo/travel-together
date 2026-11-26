import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { pickPhotos, type PickedPhoto } from '@/features/album/photo-prep';

import { FakeAuthService, fakeApi, photo, place, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('@/features/album/photo-prep', () => ({
  pickPhotos: jest.fn(),
  preparePhoto: jest.fn(async (p: { key: string }) => ({ uri: `file:///resized/${p.key}.jpg`, thumbnailUri: `file:///resized/${p.key}_thumb.jpg` })),
}));
const mockPick = pickPhotos as jest.MockedFunction<typeof pickPhotos>;

const market = place({ id: 'place-market', name: '동문시장', latitude: 33.5116, longitude: 126.5258 });
const beach = place({ id: 'place-beach', source_place_id: '222', name: '함덕해수욕장', latitude: 33.5431, longitude: 126.6697 });
const plans = [
  planItem({ id: 'lunch', date: '2026-11-12', title: '점심', time: '12:00:00', place: market }),
  planItem({ id: 'swim', date: '2026-11-13', title: '바다', place: beach }),
];

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const candidates = [{ source_place_id: '333', name: '성산일출봉', address: '서귀포시 성산읍', road_address: null, latitude: 33.458, longitude: 126.942, category: null }];

function render(options: Parameters<typeof fakeApi>[1] = {}, initialUrl = '/trips/trip-jeju/album') {
  const api = fakeApi({}, { trips: [tripDetail()], planItems: { 'trip-jeju': plans }, placeCandidates: candidates, ...options });
  renderApp({ auth: signedIn(), api, initialUrl });
  return api;
}

afterEach(() => mockPick.mockReset());

const picked: PickedPhoto = { key: 'a', uri: 'file:///a.heic', width: 100, height: 100, takenAt: '2026-11-12T13:00:00+09:00' };

test('사진은 장소 없이 올리고, 사진 위치로 장소를 고르지 않는다(위치정보법, ADR-0003)', async () => {
  const api = render();
  mockPick.mockResolvedValueOnce([picked]);

  fireEvent.press(await screen.findByRole('button', { name: '사진 추가' }));

  await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledTimes(1));
  expect(api.uploadPhoto.mock.calls[0][1]).toEqual({ uri: 'file:///resized/a.jpg', thumbnailUri: 'file:///resized/a_thumb.jpg', takenAt: '2026-11-12T13:00:00+09:00' });
  expect(screen.queryByText('사진을 이 장소에 연결할까요?')).toBeNull();
});

test('장소별로 보고, 장소 미연결 사진 수가 보인다', async () => {
  render({ photos: { 'trip-jeju': [photo({ id: 'p1', place: market, link_type: 'manual' }), photo({ id: 'p2' })] } });

  expect(await screen.findByText('장소 미연결 1장')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('tab', { name: '장소별' }));
  expect(screen.getByText('동문시장')).toBeOnTheScreen();
  expect(screen.getByText('장소 미연결')).toBeOnTheScreen();
});

test('사진 상세에서 연결된 장소와 그날의 일정이 보이고, 다른 장소로 바꿀 수 있다', async () => {
  const api = render({ photos: { 'trip-jeju': [photo({ id: 'p1', place: market, link_type: 'manual', taken_at: '2026-11-12T04:00:00Z' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '민지님 사진 크게 보기' }));
  expect(await screen.findByText('동문시장 (직접 연결)')).toBeOnTheScreen();
  expect(await screen.findByText(/1일 차 12:00 점심/)).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '함덕해수욕장에 연결' }));

  await waitFor(() => expect(api.linkPhotoPlace).toHaveBeenCalledWith('trip-jeju', 'p1', { place_id: 'place-beach' }));
  expect(await screen.findByText('함덕해수욕장 (직접 연결)')).toBeOnTheScreen();
});

test('연결을 해제하면 촬영 날짜로만 분류된다', async () => {
  const api = render({ photos: { 'trip-jeju': [photo({ id: 'p1', place: market, link_type: 'manual' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '민지님 사진 크게 보기' }));
  fireEvent.press(await screen.findByRole('button', { name: '장소 연결 해제' }));

  await waitFor(() => expect(api.linkPhotoPlace).toHaveBeenCalledWith('trip-jeju', 'p1', {}));
  expect(await screen.findByText('장소에 연결되지 않은 사진이에요. 촬영 날짜로만 분류돼요.')).toBeOnTheScreen();
});

test('일정에 없던 곳은 검색해서 연결한다', async () => {
  const api = render({ photos: { 'trip-jeju': [photo({ id: 'p1' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '민지님 사진 크게 보기' }));
  fireEvent.changeText(await screen.findByLabelText('사진 장소 검색'), '성산');
  fireEvent.press(screen.getByRole('button', { name: '사진 장소 검색하기' }));
  fireEvent.press(await screen.findByRole('button', { name: '성산일출봉로 연결' }));

  await waitFor(() => expect(api.linkPhotoPlace).toHaveBeenCalledWith('trip-jeju', 'p1', { source_place: { source_place_id: '333', name: '성산일출봉' } }));
  expect(await screen.findByText('성산일출봉 (직접 연결)')).toBeOnTheScreen();
});

test('타임라인의 일정 항목에 그날 연결된 사진 수가 보인다', async () => {
  render({ photos: { 'trip-jeju': [
    photo({ id: 'p1', place: market, taken_at: '2026-11-12T04:00:00Z' }),
    photo({ id: 'p2', place: market, taken_at: '2026-11-12T05:00:00Z' }),
    photo({ id: 'p3', place: market, taken_at: '2026-11-13T05:00:00Z' }),
  ] } }, '/trips/trip-jeju');

  expect(await screen.findByText('사진 2장')).toBeOnTheScreen();
});

test('지도에서 사진이 연결된 장소는 들른 곳이다', async () => {
  render({ photos: { 'trip-jeju': [photo({ id: 'p1', place: market }), photo({ id: 'p2' })] } }, '/trips/trip-jeju/map');

  fireEvent.press(await screen.findByRole('tab', { name: '● 들른 곳' }));

  expect(await screen.findByText('1곳')).toBeOnTheScreen();
  // 미연결 사진 줄은 지도 정보창에서 뺐다(앨범에서 연결한다).
  expect(screen.queryByText(/미연결 사진/)).toBeNull();
});
