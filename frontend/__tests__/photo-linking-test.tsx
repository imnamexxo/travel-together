import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { autoPlaceId, distanceMeters, gpsFromExif } from '@/features/album/photo-location';
import { pickPhotos, type PickedPhoto } from '@/features/album/photo-prep';

import { FakeAuthService, fakeApi, photo, place, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('@/features/album/photo-prep', () => ({
  pickPhotos: jest.fn(),
  preparePhoto: jest.fn(async (p: { key: string }) => `file:///resized/${p.key}.jpg`),
}));
const mockPick = pickPhotos as jest.MockedFunction<typeof pickPhotos>;

const market = place({ id: 'place-market', name: '동문시장', latitude: 33.5116, longitude: 126.5258 });
const beach = place({ id: 'place-beach', kakao_place_id: '222', name: '함덕해수욕장', latitude: 33.5431, longitude: 126.6697 });
const plans = [
  planItem({ id: 'lunch', date: '2026-11-12', title: '점심', time: '12:00:00', place: market }),
  planItem({ id: 'swim', date: '2026-11-13', title: '바다', place: beach }),
];

describe('자동 연결 계산(휴대폰 안)', () => {
  // 동문시장에서 북쪽으로 약 100m, 약 500m
  const near = { latitude: 33.5125, longitude: 126.5258 };
  const far = { latitude: 33.5161, longitude: 126.5258 };

  test('같은 날 일정 장소 중 300m 안의 가장 가까운 곳에 연결한다', () => {
    expect(distanceMeters(near, market)).toBeLessThan(120);
    expect(autoPlaceId(near, '2026-11-12T13:00:00+09:00', plans)).toBe('place-market');
  });

  test('300m 밖이거나, 다른 날의 장소이거나, 위치·시각이 없으면 연결하지 않는다', () => {
    expect(distanceMeters(far, market)).toBeGreaterThan(300);
    expect(autoPlaceId(far, '2026-11-12T13:00:00+09:00', plans)).toBeNull();
    expect(autoPlaceId(near, '2026-11-13T13:00:00+09:00', plans)).toBeNull();
    expect(autoPlaceId(null, '2026-11-12T13:00:00+09:00', plans)).toBeNull();
    expect(autoPlaceId(near, null, plans)).toBeNull();
  });

  test('날짜는 한국 시간으로 판단한다', () => {
    // UTC로는 11일이지만 한국 시간으로는 12일 오전 1시
    expect(autoPlaceId(near, '2026-11-11T16:00:00Z', plans)).toBe('place-market');
  });

  test('가까운 장소가 여럿이면 가장 가까운 곳', () => {
    const cafe = place({ id: 'place-cafe', name: '시장 옆 카페', latitude: 33.5127, longitude: 126.5258 });
    const withCafe = [...plans, planItem({ id: 'coffee', date: '2026-11-12', title: '커피', place: cafe })];

    expect(autoPlaceId({ latitude: 33.5126, longitude: 126.5258 }, '2026-11-12T13:00:00+09:00', withCafe)).toBe('place-cafe');
  });

  test('안드로이드·iOS EXIF의 GPS를 모두 읽는다', () => {
    expect(gpsFromExif({ GPSLatitude: 33.5, GPSLatitudeRef: 'N', GPSLongitude: 126.5, GPSLongitudeRef: 'E' })).toEqual({ latitude: 33.5, longitude: 126.5 });
    expect(gpsFromExif({ GPSLatitude: '33/1,30/1,0/1', GPSLatitudeRef: 'N', GPSLongitude: '126/1,30/1,0/1', GPSLongitudeRef: 'E' })).toEqual({ latitude: 33.5, longitude: 126.5 });
    expect(gpsFromExif({ '{GPS}': { Latitude: 33.5, LatitudeRef: 'S', Longitude: 126.5, LongitudeRef: 'W' } })).toEqual({ latitude: -33.5, longitude: -126.5 });
    expect(gpsFromExif({ DateTimeOriginal: '2026:11:12 10:00:00' })).toBeNull();
    expect(gpsFromExif({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
  });
});

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const candidates = [{ kakao_place_id: '333', name: '성산일출봉', address: '서귀포시 성산읍', road_address: null, latitude: 33.458, longitude: 126.942, category: null }];

function render(options: Parameters<typeof fakeApi>[1] = {}, initialUrl = '/trips/trip-jeju/album') {
  const api = fakeApi({}, { trips: [tripDetail()], planItems: { 'trip-jeju': plans }, placeCandidates: candidates, ...options });
  renderApp({ auth: signedIn(), api, initialUrl });
  return api;
}

afterEach(() => mockPick.mockReset());

test('올릴 때 촬영 위치로 찾은 장소 id만 보내고, 좌표는 보내지 않는다', async () => {
  const api = render();
  const nearMarket: PickedPhoto = { key: 'a', uri: 'file:///a.heic', width: 100, height: 100, takenAt: '2026-11-12T13:00:00+09:00', gps: { latitude: 33.5125, longitude: 126.5258 } };
  const noGps: PickedPhoto = { ...nearMarket, key: 'b', gps: null };
  mockPick.mockResolvedValueOnce([nearMarket, noGps]);

  fireEvent.press(await screen.findByRole('button', { name: '사진 추가' }));

  await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledTimes(2));
  expect(api.uploadPhoto.mock.calls[0][1]).toEqual({ uri: 'file:///resized/a.jpg', takenAt: '2026-11-12T13:00:00+09:00', placeId: 'place-market' });
  expect(api.uploadPhoto.mock.calls[1][1]).toEqual({ uri: 'file:///resized/b.jpg', takenAt: '2026-11-12T13:00:00+09:00', placeId: null });
  expect(JSON.stringify(api.uploadPhoto.mock.calls)).not.toMatch(/33\.51|126\.52/);
});

test('장소별로 보고, 장소 미연결 사진 수가 보인다', async () => {
  render({ photos: { 'trip-jeju': [photo({ id: 'p1', place: market, link_type: 'auto' }), photo({ id: 'p2' })] } });

  expect(await screen.findByText('2장의 사진 · 200장까지 담을 수 있어요 · 장소 미연결 1장')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('tab', { name: '장소별' }));
  expect(screen.getByText('동문시장')).toBeOnTheScreen();
  expect(screen.getByText('장소 미연결')).toBeOnTheScreen();
});

test('사진 상세에서 연결된 장소와 그날의 일정이 보이고, 다른 장소로 바꿀 수 있다', async () => {
  const api = render({ photos: { 'trip-jeju': [photo({ id: 'p1', place: market, link_type: 'auto', taken_at: '2026-11-12T04:00:00Z' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '민지님 사진 크게 보기' }));
  expect(await screen.findByText('동문시장 · 촬영 위치로 자동 연결')).toBeOnTheScreen();
  expect(screen.getByText(/1일 차 12:00 점심/)).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '함덕해수욕장에 연결' }));

  await waitFor(() => expect(api.linkPhotoPlace).toHaveBeenCalledWith('trip-jeju', 'p1', { place_id: 'place-beach' }));
  expect(await screen.findByText('함덕해수욕장 · 직접 연결')).toBeOnTheScreen();
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

  await waitFor(() => expect(api.linkPhotoPlace).toHaveBeenCalledWith('trip-jeju', 'p1', { kakao_place: { kakao_place_id: '333', name: '성산일출봉' } }));
  expect(await screen.findByText('성산일출봉 · 직접 연결')).toBeOnTheScreen();
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
  expect(screen.getByText('장소 미연결 사진 1장')).toBeOnTheScreen();
});
