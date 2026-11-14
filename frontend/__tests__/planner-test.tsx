import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl, type AlertButton } from 'react-native';

import { ApiError } from '@/api/client';
import { todayInKorea } from '@/features/trip/home-screen';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, member, place, planItem, tripDetail } from './support/fakes';
import { pickTime } from './support/pickers';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const candidates = [
  { source_place_id: '111', name: '동문시장', address: '제주시 일도일동', road_address: '제주시 관덕로14길 20', latitude: 33.511, longitude: 126.526, category: null },
  { source_place_id: '222', name: '함덕해수욕장', address: '제주시 조천읍', road_address: null, latitude: 33.543, longitude: 126.669, category: null },
];
const organizerTrip = tripDetail({ me: { member_id: 'm1', join_order: 1, is_organizer: true } });
const memberTrip = tripDetail({ me: { member_id: 'm2', join_order: 2, is_organizer: false } });

function render(options: Parameters<typeof fakeApi>[1] = {}, initialUrl = '/trips/trip-jeju') {
  const api = fakeApi({}, { trips: [organizerTrip], placeCandidates: candidates, members: { 'trip-jeju': [member({ member_id: 'm1' })] }, ...options });
  renderApp({ auth: signedIn(), api, initialUrl });
  return api;
}

afterEach(() => jest.restoreAllMocks());

test('장소를 검색해 고르면 이름이 채워지고, 저장하면 타임라인에 보인다', async () => {
  const api = render();

  fireEvent.press(await screen.findByRole('button', { name: '＋ 일정 추가' }));
  fireEvent.changeText(await screen.findByLabelText('장소 검색'), '시장');
  fireEvent.press(screen.getByRole('button', { name: '검색' }));
  fireEvent.press(await screen.findByRole('button', { name: '동문시장 선택' }));
  expect(screen.getByLabelText('장소 또는 일정 이름')).toHaveDisplayValue('동문시장');
  await pickTime('시간', '13:00');
  fireEvent.changeText(screen.getByLabelText('예상 비용'), '45000');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('button', { name: '13:00 동문시장, 일정 수정' })).toBeOnTheScreen();
  expect(screen.getByText('예상 45,000원')).toBeOnTheScreen();
  expect(api.createPlanItem).toHaveBeenCalledWith('trip-jeju', {
    date: '2026-11-12', time: '13:00', title: '동문시장', memo: '', estimated_cost: 45000,
    place: { source_place_id: '111', name: '동문시장' },
  });
});

test('장소 없는 일정 항목도 만들 수 있다', async () => {
  const api = render();

  fireEvent.press(await screen.findByRole('button', { name: '＋ 일정 추가' }));
  fireEvent.changeText(await screen.findByLabelText('장소 또는 일정 이름'), '자유시간');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('button', { name: '자유시간, 일정 수정' })).toBeOnTheScreen();
  expect(api.createPlanItem.mock.calls[0][1]).toMatchObject({ title: '자유시간', time: null, place: null });
});

test('검색에 실패하면 이유가 보인다', async () => {
  const api = render();
  api.searchPlaces.mockRejectedValueOnce(new ApiError(502, 'place_search_unavailable', '장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'));

  fireEvent.press(await screen.findByRole('button', { name: '＋ 일정 추가' }));
  fireEvent.changeText(await screen.findByLabelText('장소 검색'), '시장');
  fireEvent.press(screen.getByRole('button', { name: '검색' }));

  expect(await screen.findByText('장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeOnTheScreen();
});

test('날짜별로 일정 항목이 순서대로 보인다', async () => {
  render({ planItems: { 'trip-jeju': [
    planItem({ id: 'b', title: '점심', position: 1, time: '13:00:00' }),
    planItem({ id: 'a', title: '아침', position: 0, time: '09:00:00' }),
    planItem({ id: 'c', title: '둘째 날 일정', date: '2026-11-13' }),
  ] } });

  const rows = await screen.findAllByRole('button', { name: /일정 수정$/ });
  expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(['09:00 아침, 일정 수정', '13:00 점심, 일정 수정']);
  fireEvent.press(screen.getByRole('tab', { name: '2일 차 11.13' }));
  expect(await screen.findByRole('button', { name: '둘째 날 일정, 일정 수정' })).toBeOnTheScreen();
});

test('여행 중이면 오늘이 먼저 열리고 강조된다', async () => {
  const today = todayInKorea();
  const shift = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const ongoing = tripDetail({ start_date: shift(-1), end_date: shift(1), me: organizerTrip.me });
  render({ trips: [ongoing], planItems: { 'trip-jeju': [planItem({ title: '오늘 일정', date: today })] } });

  const tab = await screen.findByRole('tab', { name: new RegExp(`^2일 차 .* 오늘$`) });
  expect(tab).toBeSelected();
  expect(await screen.findByRole('button', { name: '오늘 일정, 일정 수정' })).toBeOnTheScreen();
});

test('당겨서 새로고침하면 다른 멤버가 추가한 일정이 보인다', async () => {
  const api = render({ planItems: { 'trip-jeju': [planItem({ title: '아침' })] } });
  await screen.findByRole('button', { name: '아침, 일정 수정' });
  await api.createPlanItem('trip-jeju', { date: '2026-11-12', title: '준호가 추가한 일정', memo: '' });

  await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());

  expect(await screen.findByRole('button', { name: '준호가 추가한 일정, 일정 수정' })).toBeOnTheScreen();
});

test('내가 만든 일정은 확인 창을 거쳐 지울 수 있다', async () => {
  const api = render({ trips: [memberTrip], planItems: { 'trip-jeju': [planItem({ id: 'mine', title: '내 일정', created_by_member_id: 'm2' })] } });
  const alert = spyOnAlerts();

  fireEvent.press(await screen.findByRole('button', { name: '내 일정, 일정 수정' }));
  fireEvent.press(await screen.findByRole('button', { name: '일정 지우기' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '지우기');

  expect(api.deletePlanItem).toHaveBeenCalledWith('trip-jeju', 'mine');
  await waitFor(() => expect(screen.queryByRole('button', { name: '내 일정, 일정 수정' })).toBeNull());
});

test('다른 멤버가 만든 일정은 고칠 수 있지만 지우기 버튼은 없다', async () => {
  const api = render({ trips: [memberTrip], planItems: { 'trip-jeju': [planItem({ id: 'theirs', title: '민지 일정', created_by_member_id: 'm1' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '민지 일정, 일정 수정' }));
  expect(await screen.findByText('다른 멤버가 만든 일정은 고칠 수 있지만, 지우기는 만든 사람과 총무만 할 수 있어요.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '일정 지우기' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('메모'), '준호가 덧붙임');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.updatePlanItem).toHaveBeenCalledWith('trip-jeju', 'theirs', expect.objectContaining({ memo: '준호가 덧붙임' })));
});

test('총무는 다른 멤버의 일정도 지울 수 있다', async () => {
  render({ planItems: { 'trip-jeju': [planItem({ id: 'theirs', title: '준호 일정', created_by_member_id: 'm2' })] } });

  fireEvent.press(await screen.findByRole('button', { name: '준호 일정, 일정 수정' }));

  expect(await screen.findByRole('button', { name: '일정 지우기' })).toBeOnTheScreen();
});

test('하루 안에서 순서를 바꾼다(끌기와 같은 접근성 동작)', async () => {
  const api = render({ planItems: { 'trip-jeju': [planItem({ id: 'a', title: '가', position: 0 }), planItem({ id: 'b', title: '나', position: 1 })] } });

  await screen.findByRole('button', { name: '나, 일정 수정' });
  // 끄는 줄에는 "위로/아래로 옮기기" 동작이 붙어 있다(화면 읽기 사용자용, 끌기와 같은 결과).
  const draggable = screen.getByTestId('draggable-b');
  expect(draggable.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(['나 위로 옮기기', '나 아래로 옮기기']);
  fireEvent(draggable, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });

  await waitFor(() => expect(api.reorderPlanItems).toHaveBeenCalledWith('trip-jeju', '2026-11-12', ['b', 'a']));
  // 바뀐 순서로 보인다.
  await waitFor(() => {
    const titles = screen.getAllByRole('button', { name: /, 일정 수정$/ }).map((b) => b.props.accessibilityLabel);
    expect(titles).toEqual(['나, 일정 수정', '가, 일정 수정']);
  });
  expect(screen.getByText('일정을 꾹 눌러 위아래로 끌면 순서를 바꿀 수 있어요')).toBeOnTheScreen();
});

test('편집 화면에는 위로/아래로 버튼이 없다', async () => {
  render({ planItems: { 'trip-jeju': [planItem({ id: 'a', title: '가', position: 0 }), planItem({ id: 'b', title: '나', position: 1 })] } });

  fireEvent.press(await screen.findByRole('button', { name: '나, 일정 수정' }));

  expect(await screen.findByRole('button', { name: '저장' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '위로' })).toBeNull();
});

test('시간은 시·분을 눌러 고르고, 시간 없음으로 비울 수 있다', async () => {
  const api = render();

  fireEvent.press(await screen.findByRole('button', { name: '＋ 일정 추가' }));
  fireEvent.changeText(await screen.findByLabelText('장소 또는 일정 이름'), '점심');
  await pickTime('시간', '12:30');
  expect(screen.getByText('12:30')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '시간' }));
  fireEvent.press(screen.getByRole('button', { name: '시간 없음' }));
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.createPlanItem).toHaveBeenCalledTimes(1));
  expect(api.createPlanItem.mock.calls[0][1].time).toBeNull();
});

test('지도에는 일정에 넣은 장소가 핀으로 보인다', async () => {
  render({ planItems: { 'trip-jeju': [planItem({ title: '점심', place: place({ name: '동문시장' }) }), planItem({ id: 'free', title: '자유시간' })] } }, '/trips/trip-jeju/map');

  expect(await screen.findByText('1곳')).toBeOnTheScreen();
  expect(screen.getAllByText('동문시장').length).toBeGreaterThan(0);
  expect(screen.getByText('일정 1개 · 사진 0장')).toBeOnTheScreen();
});
