import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';
import { normalizeInviteCode } from '@/features/trip/join-trip-screen';

import { openTripMenu, pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const organizerTrip = tripDetail({ member_count: 3 });
const memberTrip = tripDetail({ member_count: 3, me: { member_id: 'member-2', join_order: 2, is_organizer: false } });
const threeMembers = [
  member({ member_id: 'member-1', display_name: '민지', join_order: 1, is_organizer: true, is_me: true }),
  member({ member_id: 'member-2', display_name: '준호', join_order: 2, is_organizer: false, is_me: false }),
  member({ member_id: 'member-3', display_name: '수빈', join_order: 3, is_organizer: false, is_me: false }),
];

afterEach(() => jest.restoreAllMocks());

test('여행 메뉴에서 멤버 화면을 열면 가입 순서대로 멤버와 총무가 보인다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [organizerTrip], members: { 'trip-jeju': threeMembers } }), initialUrl: '/trips/trip-jeju' });

  const { choose } = await openTripMenu();
  await choose('멤버·초대 코드');

  expect(await screen.findByText('민지 (나)')).toBeOnTheScreen();
  const names = screen.getAllByText(/^(민지 \(나\)|준호|수빈)$/).map((node) => node.props.children.join?.('') ?? node.props.children);
  expect(names).toEqual(['민지 (나)', '준호', '수빈']);
  expect(screen.getAllByText('총무')).toHaveLength(1);
  expect(screen.getByText('3 / 10명')).toBeOnTheScreen();
});

test('총무는 초대 코드를 보고 복사할 수 있다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [organizerTrip] }), initialUrl: '/trips/trip-jeju/members' });

  expect(await screen.findByText('CODE2221')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '복사' }));

  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('CODE2221'));
  expect(await screen.findByText('초대 코드를 복사했어요.')).toBeOnTheScreen();
});

test('총무가 확인 창을 거쳐 재발급하면 새 코드가 보인다', async () => {
  const api = fakeApi({}, { trips: [organizerTrip] });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/members' });
  expect(await screen.findByText('CODE2221')).toBeOnTheScreen();
  const alert = spyOnAlerts();

  fireEvent.press(screen.getByRole('button', { name: '재발급' }));
  expect(api.reissueInviteCode).not.toHaveBeenCalled();
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '새로 만들기');

  expect(await screen.findByText('CODE2222')).toBeOnTheScreen();
  expect(api.reissueInviteCode).toHaveBeenCalledWith('trip-jeju');
  expect(screen.queryByText('CODE2221')).toBeNull();
});

test('일반 멤버에게는 초대 코드가 보이지 않고, 코드를 요청하지도 않는다', async () => {
  const api = fakeApi({}, { trips: [memberTrip], members: { 'trip-jeju': threeMembers.map((m) => ({ ...m, is_me: m.join_order === 2 })) } });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/members' });

  expect(await screen.findByText('준호 (나)')).toBeOnTheScreen();
  expect(screen.queryByText('초대 코드')).toBeNull();
  expect(screen.queryByRole('button', { name: '재발급' })).toBeNull();
  expect(api.getInviteCode).not.toHaveBeenCalled();
});

test('초대 코드는 대문자로 바꾸고 공백을 지워서 보낸다', () => {
  expect(normalizeInviteCode(' abcd efgh\n')).toBe('ABCDEFGH');
  expect(normalizeInviteCode('o0i1')).toBe('O0I1');
});

test('초대 코드를 입력하면 그 여행에 들어가 여행 홈이 열린다', async () => {
  const busan = tripDetail({ id: 'trip-busan', name: '부산 여행', member_count: 2, me: { member_id: 'm', join_order: 2, is_organizer: false } });
  const api = fakeApi({}, { joinable: { ABCD2345: busan } });
  renderApp({ auth: signedIn(), api });

  fireEvent.press(await screen.findByRole('button', { name: '초대 코드로 들어가기 ›' }));
  fireEvent.changeText(await screen.findByLabelText('초대 코드'), ' abcd 2345 ');
  fireEvent.press(screen.getByRole('button', { name: '들어가기' }));

  expect(await screen.findByText('부산 여행')).toBeOnTheScreen();
  expect(api.joinTrip).toHaveBeenCalledWith('ABCD2345');
});

test('틀린 코드는 이유와 함께 거절된다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi(), initialUrl: '/trips/join' });

  fireEvent.changeText(await screen.findByLabelText('초대 코드'), 'WRONG234');
  fireEvent.press(screen.getByRole('button', { name: '들어가기' }));

  expect(await screen.findByText('초대 코드가 맞지 않습니다. 총무에게 새 코드를 받아 주세요.')).toBeOnTheScreen();
});

test('멤버가 10명인 여행에는 들어갈 수 없다는 이유가 보인다', async () => {
  const api = fakeApi({
    joinTrip: jest.fn(async () => {
      throw new ApiError(409, 'trip_full', '이 여행은 멤버가 10명이라 더 들어갈 수 없습니다.');
    }),
  });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/join' });

  fireEvent.changeText(await screen.findByLabelText('초대 코드'), 'ABCD2345');
  fireEvent.press(screen.getByRole('button', { name: '들어가기' }));

  expect(await screen.findByText('이 여행은 멤버가 10명이라 더 들어갈 수 없습니다.')).toBeOnTheScreen();
});

test('빈 코드는 보내지 않는다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/join' });

  fireEvent.press(await screen.findByRole('button', { name: '들어가기' }));

  expect(await screen.findByText('초대 코드를 입력해주세요.')).toBeOnTheScreen();
  expect(api.joinTrip).not.toHaveBeenCalled();
});
