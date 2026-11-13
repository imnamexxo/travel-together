import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError, type Suggestion } from '@/api/client';

import { FakeAuthService, fakeApi, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const suggestion: Suggestion = {
  id: 'req-1',
  destination: '제주',
  preferences: '맛집 위주',
  reused: false,
  items: [
    { id: 's1', date: '2026-11-12', order: 1, place_name: '동문시장', region: '제주시', stay_minutes: 90, description: '먹거리 구경', status: 'verified', adopted: false,
      place: { source_place_id: '111', name: '동문재래시장', address: '제주시 일도일동', road_address: '제주시 관덕로14길 20', latitude: 33.5, longitude: 126.5, category: null } },
    { id: 's2', date: '2026-11-12', order: 2, place_name: '지어낸 가게', region: '제주시', stay_minutes: 60, description: '???', status: 'needs_check', adopted: false, place: null },
    { id: 's3', date: '2026-11-13', order: 1, place_name: '함덕해수욕장', region: '제주시', stay_minutes: 120, description: '바다 산책', status: 'verified', adopted: false,
      place: { source_place_id: '222', name: '함덕해수욕장', address: '제주시 조천읍', road_address: null, latitude: 33.5, longitude: 126.6, category: null } },
  ],
};

function render(options: Parameters<typeof fakeApi>[1] = {}) {
  const api = fakeApi({}, { trips: [tripDetail()], suggestion, ...options });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju' });
  return api;
}

async function openAndAsk(destination = '제주') {
  fireEvent.press(await screen.findByRole('button', { name: '✧ 추천 일정' }));
  fireEvent.changeText(await screen.findByLabelText('여행지'), destination);
}

afterEach(() => jest.restoreAllMocks());

test('추천을 받는 동안 진행 표시가 보이고, 날짜별 카드와 확인 필요가 보인다', async () => {
  const api = render();
  let finish!: (value: Suggestion) => void;
  api.askSuggestions.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

  await openAndAsk();
  fireEvent.press(screen.getByRole('checkbox', { name: '맛집 위주' }));
  fireEvent.press(screen.getByRole('button', { name: '추천받기' }));

  expect(await screen.findByText('추천 일정을 만드는 중이에요. 30초쯤 걸릴 수 있어요.')).toBeOnTheScreen();
  expect(api.askSuggestions).toHaveBeenCalledWith('trip-jeju', { destination: '제주', preferences: '맛집 위주' });
  finish(suggestion);

  expect(await screen.findByText('1일 차 · 11월 12일 목요일')).toBeOnTheScreen();
  expect(screen.getByText('2일 차 · 11월 13일 금요일')).toBeOnTheScreen();
  expect(screen.getAllByText('확인 필요')).toHaveLength(1);
  expect(screen.queryByText('추천 일정을 만드는 중이에요. 30초쯤 걸릴 수 있어요.')).toBeNull();
});

test('고른 카드만 플래너에 추가되고 플래너로 돌아간다', async () => {
  const api = render({ planItems: { 'trip-jeju': [planItem({ id: 'old', title: '원래 일정' })] } });

  await openAndAsk();
  fireEvent.press(screen.getByRole('button', { name: '추천받기' }));
  fireEvent.press(await screen.findByRole('checkbox', { name: '동문시장 선택' }));
  fireEvent.press(screen.getByRole('checkbox', { name: '지어낸 가게 선택' }));
  fireEvent.press(screen.getByRole('button', { name: '플래너에 추가 (2)' }));

  await waitFor(() => expect(api.adoptSuggestions).toHaveBeenCalledWith('trip-jeju', 'req-1', ['s1', 's2']));
  expect(await screen.findByRole('button', { name: '동문시장, 일정 수정' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '원래 일정, 일정 수정' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '함덕해수욕장, 일정 수정' })).toBeNull();
});

test('아무것도 고르지 않으면 추가할 수 없다', async () => {
  render();

  await openAndAsk();
  fireEvent.press(screen.getByRole('button', { name: '추천받기' }));

  expect(await screen.findByRole('button', { name: '플래너에 추가 (0)' })).toBeDisabled();
});

test('하루 추천 횟수를 다 쓰면 안내가 보인다', async () => {
  const api = render();
  api.askSuggestions.mockRejectedValueOnce(new ApiError(429, 'suggestion_limit', '이 여행의 오늘 추천 횟수(10회)를 모두 썼습니다. 내일 0시(한국 시간)부터 다시 요청할 수 있습니다.'));

  await openAndAsk();
  fireEvent.press(screen.getByRole('button', { name: '추천받기' }));

  expect(await screen.findByText('이 여행의 오늘 추천 횟수(10회)를 모두 썼습니다. 내일 0시(한국 시간)부터 다시 요청할 수 있습니다.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '플래너에서 직접 일정 쓰기 ›' })).toBeNull();
});

test('추천에 실패하면 직접 일정을 쓰도록 안내한다', async () => {
  const api = render();
  api.askSuggestions.mockRejectedValueOnce(new ApiError(502, 'ai_bad_response', '추천 일정을 만들지 못했습니다. 직접 일정을 써 주세요.'));

  await openAndAsk();
  fireEvent.press(screen.getByRole('button', { name: '추천받기' }));

  expect(await screen.findByText('추천 일정을 만들지 못했습니다. 직접 일정을 써 주세요.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '플래너에서 직접 일정 쓰기 ›' }));
  expect(await screen.findByRole('button', { name: '＋ 일정 추가' })).toBeOnTheScreen();
});

test('여행지가 비어 있으면 요청하지 않는다', async () => {
  const api = render();

  fireEvent.press(await screen.findByRole('button', { name: '✧ 추천 일정' }));
  fireEvent.press(await screen.findByRole('button', { name: '추천받기' }));

  expect(await screen.findByText('여행지를 입력해주세요.')).toBeOnTheScreen();
  expect(api.askSuggestions).not.toHaveBeenCalled();
});

test('같은 조건이면 저장된 추천이라고 알려 주고, 이미 추가한 카드는 고를 수 없다', async () => {
  render({ suggestion: { ...suggestion, reused: true, items: suggestion.items.map((i) => ({ ...i, adopted: i.id === 's1' })) } });

  await openAndAsk();
  fireEvent.press(screen.getByRole('button', { name: '추천받기' }));

  expect(await screen.findByText('같은 조건으로 받은 추천을 다시 보여드려요.')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: '동문시장 선택' })).toBeDisabled();
  expect(screen.getByText('추가됨')).toBeOnTheScreen();
});
