import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';

import { openTripMenu, pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { pickPeriod } from './support/pickers';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const organizerTrip = tripDetail({ member_count: 2 });
const memberTrip = tripDetail({ member_count: 2, me: { member_id: 'member-2', join_order: 2, is_organizer: false } });
const twoMembers = [
  member({ member_id: 'member-1', display_name: '민지', join_order: 1, is_organizer: true, is_me: true }),
  member({ member_id: 'member-2', display_name: '준호', join_order: 2, is_organizer: false, is_me: false }),
];

function lastAlertButtons(alert: jest.SpyInstance) {
  return alert.mock.calls.at(-1)![2] as AlertButton[];
}

afterEach(() => jest.restoreAllMocks());

test('총무는 여행 메뉴에서 설정을 열어 이름과 기간을 바꾼다', async () => {
  const api = fakeApi({}, { trips: [organizerTrip] });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju' });

  const { choose } = await openTripMenu();
  await choose('여행 설정');
  fireEvent.changeText(await screen.findByLabelText('여행 이름'), '제주 3박');
  await pickPeriod('2026-11-12', '2026-11-15');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('저장했어요.')).toBeOnTheScreen();
  expect(api.updateTrip).toHaveBeenCalledWith('trip-jeju', { name: '제주 3박', start_date: '2026-11-12', end_date: '2026-11-15', currency: 'KRW', is_overseas: false });
  fireEvent.press(screen.getByRole('button', { name: '플래너로 돌아가기' }));
  expect(await screen.findByText('2026. 11. 12 – 11. 15  ·  2명')).toBeOnTheScreen();
});

test('기간을 줄였다가 서버가 거절하면 어느 날짜 때문인지 보인다', async () => {
  const api = fakeApi({
    updateTrip: jest.fn(async () => {
      throw new ApiError(409, 'plan_items_outside_period', '일정 항목이 있는 날짜가 기간에서 빠집니다. 그 날짜의 일정을 먼저 옮기거나 지워 주세요.', [
        { field: 'dates', message: '2026-11-14' },
      ]);
    }),
  }, { trips: [organizerTrip] });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settings' });

  await pickPeriod('2026-11-12', '2026-11-13');
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('일정 항목이 있는 날짜가 기간에서 빠집니다. 그 날짜의 일정을 먼저 옮기거나 지워 주세요.\n2026-11-14')).toBeOnTheScreen();
});

test('달력은 지금 기간을 보여 주고, 취소하면 기간이 그대로다', async () => {
  const api = fakeApi({}, { trips: [organizerTrip] });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settings' });

  fireEvent.press(await screen.findByRole('button', { name: '여행 기간' }));
  // 칸과 달력 아래 요약 둘 다 지금 기간을 보여 준다
  expect(screen.getAllByText('11월 12일 (목) – 11월 14일 (토) · 3일')).toHaveLength(2);
  fireEvent.press(screen.getByRole('button', { name: '11월 20일' }));
  fireEvent.press(screen.getByRole('button', { name: '취소' }));
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(api.updateTrip).toHaveBeenCalledWith('trip-jeju', { name: '제주 여행', start_date: '2026-11-12', end_date: '2026-11-14', currency: 'KRW', is_overseas: false }));
});

test('총무는 여행 목록에서 여행을 왼쪽으로 밀어 확인 창을 거쳐 삭제한다', async () => {
  const api = fakeApi({}, { trips: [organizerTrip] });
  renderApp({ auth: signedIn(), api });
  const alert = spyOnAlerts();

  fireEvent.press(await screen.findByRole('button', { name: '제주 여행 삭제' }));
  expect(api.deleteTrip).not.toHaveBeenCalled();
  await pressAlertButton(lastAlertButtons(alert), '삭제');

  expect(await screen.findByText('아직 여행이 없어요')).toBeOnTheScreen();
  expect(api.deleteTrip).toHaveBeenCalledWith('trip-jeju');
  expect(screen.queryByText('여행을 왼쪽으로 밀면 삭제하거나 나갈 수 있어요')).toBeNull();
});

test('총무에게는 삭제, 일반 멤버에게는 나가기가 나오고, 여행 설정에는 둘 다 없다', async () => {
  const organizer = renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [organizerTrip] }) });
  expect(await screen.findByRole('button', { name: '제주 여행 삭제' })).toBeOnTheScreen();
  expect(screen.getByText('여행을 왼쪽으로 밀면 삭제하거나 나갈 수 있어요')).toBeOnTheScreen();
  organizer.unmount();

  const member = renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [memberTrip] }) });
  expect(await screen.findByRole('button', { name: '제주 여행 나가기' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '제주 여행 삭제' })).toBeNull();
  member.unmount();

  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [memberTrip] }), initialUrl: '/trips/trip-jeju/settings' });
  expect(await screen.findByText(/여행에서 나가려면 내 여행 목록에서/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '여행에서 나가기' })).toBeNull();
  expect(screen.queryByLabelText('여행 이름')).toBeNull();
});

test('멤버는 여행 목록에서 밀어 확인 창을 거쳐 여행에서 나간다', async () => {
  const api = fakeApi({}, { trips: [memberTrip] });
  renderApp({ auth: signedIn(), api });
  const alert = spyOnAlerts();

  fireEvent.press(await screen.findByRole('button', { name: '제주 여행 나가기' }));
  await pressAlertButton(lastAlertButtons(alert), '나가기');

  expect(await screen.findByText('아직 여행이 없어요')).toBeOnTheScreen();
  expect(api.leaveTrip).toHaveBeenCalledWith('trip-jeju');
});

test('나갈 수 없으면 서버가 준 이유가 보인다', async () => {
  const api = fakeApi({
    leaveTrip: jest.fn(async () => {
      throw new ApiError(409, 'member_has_expenses', '결제자나 분담 대상으로 지정된 적이 있어 나갈 수 없습니다.');
    }),
  }, { trips: [memberTrip] });
  renderApp({ auth: signedIn(), api });
  const alert = spyOnAlerts();

  fireEvent.press(await screen.findByRole('button', { name: '제주 여행 나가기' }));
  await pressAlertButton(lastAlertButtons(alert), '나가기');

  await waitFor(() => expect(alert).toHaveBeenLastCalledWith('나가지 못했어요', '결제자나 분담 대상으로 지정된 적이 있어 나갈 수 없습니다.'));
});

test('총무는 멤버 화면에서 확인 창을 거쳐 멤버를 내보낸다', async () => {
  const api = fakeApi({}, { trips: [organizerTrip], members: { 'trip-jeju': twoMembers } });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/members' });
  expect(await screen.findByText('준호')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '민지 내보내기' })).toBeNull();
  const alert = spyOnAlerts();

  fireEvent.press(screen.getByRole('button', { name: '준호 내보내기' }));
  await pressAlertButton(lastAlertButtons(alert), '내보내기');

  expect(api.removeMember).toHaveBeenCalledWith('trip-jeju', 'member-2');
  await waitFor(() => expect(screen.queryByText('준호')).toBeNull());
});

test('일반 멤버에게는 내보내기 버튼이 없다', async () => {
  const members = twoMembers.map((m) => ({ ...m, is_me: !m.is_organizer }));
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [memberTrip], members: { 'trip-jeju': members } }), initialUrl: '/trips/trip-jeju/members' });

  expect(await screen.findByText('준호 (나)')).toBeOnTheScreen();
  expect(screen.queryByText('내보내기')).toBeNull();
});
