import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';
import { takenAtFromExif } from '@/features/album/exif-time';
import { pickPhotos, preparePhoto, type PickedPhoto } from '@/features/album/photo-prep';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, photo, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('@/features/album/photo-prep', () => ({
  pickPhotos: jest.fn(),
  preparePhoto: jest.fn(async (p: { key: string }) => `file:///resized/${p.key}.jpg`),
}));

const mockPick = pickPhotos as jest.MockedFunction<typeof pickPhotos>;
const mockPrepare = preparePhoto as jest.MockedFunction<typeof preparePhoto>;

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const picked = (key: string, takenAt: string | null = '2026-11-12T15:30:00+09:00'): PickedPhoto => ({ key, uri: `file:///original/${key}.heic`, width: 4000, height: 3000, takenAt });
const organizerTrip = tripDetail({ me: { member_id: 'm1', join_order: 1, is_organizer: true } });
const memberTrip = tripDetail({ me: { member_id: 'm2', join_order: 2, is_organizer: false } });

function render(options: Parameters<typeof fakeApi>[1] = {}) {
  const api = fakeApi({}, { trips: [organizerTrip], ...options });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/album' });
  return api;
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPick.mockReset();
  mockPrepare.mockClear();
});

test('고른 사진을 줄여서 촬영 시각과 함께 한 장씩 올린다', async () => {
  const api = render();
  mockPick.mockResolvedValueOnce([picked('a'), picked('b', null)]);

  fireEvent.press(await screen.findByRole('button', { name: '사진 추가' }));

  expect(await screen.findByText('2장 중 2장 올렸어요')).toBeOnTheScreen();
  expect(api.uploadPhoto.mock.calls).toEqual([
    ['trip-jeju', { uri: 'file:///resized/a.jpg', takenAt: '2026-11-12T15:30:00+09:00' }],
    ['trip-jeju', { uri: 'file:///resized/b.jpg', takenAt: null }],
  ]);
  expect(mockPick).toHaveBeenCalledWith(200);
  expect(await screen.findByText('2장의 사진 · 200장까지 담을 수 있어요')).toBeOnTheScreen();
});

test('일부가 실패하면 장별 결과가 보이고, 실패한 사진만 다시 올린다', async () => {
  const api = render();
  const upload = api.uploadPhoto.getMockImplementation()!;
  api.uploadPhoto.mockImplementation(async (tripId, p) => {
    if (p.uri.includes('/b.jpg') && api.uploadPhoto.mock.calls.filter(([, q]) => q.uri.includes('/b.jpg')).length === 1) {
      throw new ApiError(0, 'network_error', '서버에 연결하지 못했습니다.');
    }
    return upload(tripId, p);
  });
  mockPick.mockResolvedValueOnce([picked('a'), picked('b'), picked('c')]);

  fireEvent.press(await screen.findByRole('button', { name: '사진 추가' }));
  expect(await screen.findByText('3장 중 2장 올렸어요 · 1장 실패')).toBeOnTheScreen();
  expect(screen.getByText('사진 2: 서버에 연결하지 못했습니다.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '실패한 사진 다시 올리기' }));

  expect(await screen.findByText('3장 중 3장 올렸어요')).toBeOnTheScreen();
  const uploadedUris = api.uploadPhoto.mock.calls.map(([, p]) => p.uri);
  expect(uploadedUris).toEqual(['file:///resized/a.jpg', 'file:///resized/b.jpg', 'file:///resized/c.jpg', 'file:///resized/b.jpg']);
});

test('날짜별·올린 사람별로 모아 본다', async () => {
  render({ photos: { 'trip-jeju': [
    photo({ id: 'p1', taken_at: '2026-11-12T03:00:00Z', uploader_name: '민지' }),
    photo({ id: 'p2', taken_at: '2026-11-13T03:00:00Z', uploader_name: '준호', uploader_member_id: 'm2' }),
    photo({ id: 'p3', taken_at: null, uploader_name: '준호', uploader_member_id: 'm2' }),
  ] } });

  fireEvent.press(await screen.findByRole('tab', { name: '날짜별' }));
  expect(screen.getByText('1일 차 · 11월 12일 목요일')).toBeOnTheScreen();
  expect(screen.getByText('2일 차 · 11월 13일 금요일')).toBeOnTheScreen();
  expect(screen.getByText('날짜 미지정')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('tab', { name: '올린 사람' }));
  expect(screen.getByText('민지님이 올린 사진')).toBeOnTheScreen();
  expect(screen.getByText('준호님이 올린 사진')).toBeOnTheScreen();
});

test('200장에 가까워지면 남은 장수가 보이고, 가득 차면 고르지 않는다', async () => {
  const alert = spyOnAlerts();
  render({ photoLimit: 2, photos: { 'trip-jeju': [photo({ id: 'p1' }), photo({ id: 'p2' })] } });

  expect(await screen.findByText('2장의 사진 · 남은 장수 0장')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '사진 추가' }));

  expect(alert).toHaveBeenCalledWith('사진이 가득 찼어요', '이 여행에는 사진을 최대 2장까지 담을 수 있어요.');
  expect(mockPick).not.toHaveBeenCalled();
});

test('내 사진은 확인 창을 거쳐 지울 수 있다', async () => {
  const api = render({ trips: [memberTrip], photos: { 'trip-jeju': [photo({ id: 'mine', uploader_member_id: 'm2', uploader_name: '준호' })] } });
  const alert = spyOnAlerts();

  fireEvent.press(await screen.findByRole('button', { name: '준호님 사진 크게 보기' }));
  fireEvent.press(await screen.findByRole('button', { name: '사진 지우기' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '지우기');

  await waitFor(() => expect(api.deletePhoto).toHaveBeenCalledWith('trip-jeju', 'mine'));
});

test('다른 멤버의 사진은 일반 멤버가 지울 수 없다', async () => {
  render({ trips: [memberTrip], photos: { 'trip-jeju': [photo({ id: 'theirs', uploader_member_id: 'm1', uploader_name: '민지' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '민지님 사진 크게 보기' }));

  expect(await screen.findByText('사진은 올린 사람과 총무만 지울 수 있어요.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '사진 지우기' })).toBeNull();
});

test('총무는 다른 멤버의 사진도 지울 수 있다', async () => {
  render({ photos: { 'trip-jeju': [photo({ id: 'theirs', uploader_member_id: 'm2', uploader_name: '준호' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '준호님 사진 크게 보기' }));

  expect(await screen.findByRole('button', { name: '사진 지우기' })).toBeOnTheScreen();
});

test('위치 정보를 서버로 보내지 않는다는 안내가 보인다', async () => {
  render();

  expect(await screen.findByText(/촬영 위치는 서버에 저장되지 않아요/)).toBeOnTheScreen();
});

test('EXIF 촬영 시각을 시간대 포함 시각으로 읽는다(위치는 읽지 않는다)', () => {
  expect(takenAtFromExif({ DateTimeOriginal: '2026:11:12 15:30:05', GPSLatitude: 33.5 })).toBe('2026-11-12T15:30:05+09:00');
  expect(takenAtFromExif({ DateTimeOriginal: '2026:11:12 15:30:05', OffsetTimeOriginal: '+01:00' })).toBe('2026-11-12T15:30:05+01:00');
  expect(takenAtFromExif({ DateTime: '2026:11:12 08:00:00' })).toBe('2026-11-12T08:00:00+09:00');
  expect(takenAtFromExif({})).toBeNull();
  expect(takenAtFromExif(null)).toBeNull();
  expect(takenAtFromExif({ DateTimeOriginal: '0000:00:00 00:00:00' })).toBeNull();
});
