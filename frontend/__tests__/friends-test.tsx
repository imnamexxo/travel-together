import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, Share, type AlertButton } from 'react-native';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

const members = [
  member({ member_id: 'm1', display_name: '민지', is_organizer: true, is_me: true }),
  member({ member_id: 'm2', display_name: '준호', join_order: 2, is_organizer: false, is_me: false }),
  member({ member_id: 'm3', display_name: '수빈', join_order: 3, is_organizer: false, is_me: false, friend_status: 'incoming', friend_request_id: 'req-subin' }),
];

test('멤버 목록에서 친구 추가를 누르면 요청되고, 받은 요청은 수락한다', async () => {
  const api = fakeApi({}, {
    trips: [tripDetail({ member_count: 3, me: { member_id: 'm1', join_order: 1, is_organizer: true } })],
    members: { 'trip-jeju': members },
    friends: { friends: [], incoming: [{ id: 'req-subin', person: { user_id: 'u3', display_name: '수빈' } }], outgoing: [] },
  });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/members' });

  fireEvent.press(await screen.findByRole('button', { name: '준호 친구 추가' }));
  await waitFor(() => expect(api.requestFriend).toHaveBeenCalledWith('trip-jeju', 'm2'));
  expect(await screen.findByText('요청됨')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: '수빈 친구 요청 수락' }));
  await waitFor(() => expect(api.acceptFriend).toHaveBeenCalledWith('req-subin'));
});

test('친구 화면에서 친구를 내가 총무인 여행에 초대한다', async () => {
  const api = fakeApi({}, {
    trips: [tripDetail({ me: { member_id: 'm1', join_order: 1, is_organizer: true } }), tripDetail({ id: 'trip-other', name: '남의 여행', me: { member_id: 'x', join_order: 2, is_organizer: false } })],
    friends: { friends: [{ user_id: 'u9', display_name: '하늘' }], incoming: [], outgoing: [] },
  });
  renderApp({ auth: signedIn(), api, initialUrl: '/friends' });

  fireEvent.press(await screen.findByRole('button', { name: '하늘 여행에 초대' }));
  expect(await screen.findByText('제주 여행')).toBeOnTheScreen();
  expect(screen.queryByText('남의 여행')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '제주 여행에 하늘 초대' }));

  await waitFor(() => expect(api.inviteFriend).toHaveBeenCalledWith('trip-jeju', 'u9'));
  expect(await screen.findByText('초대함')).toBeOnTheScreen();
});

test('받은 여행 초대는 친구 화면에 있고, 수락하면 그 여행이 열린다', async () => {
  const api = fakeApi({}, { tripInvites: [{ id: 'inv1', trip: { id: 'trip-osaka', name: '오사카 여행', start_date: '2026-12-01', end_date: '2026-12-03' }, inviter_name: '준호' }] });
  renderApp({ auth: signedIn(), api });

  // 여행 목록에는 초대 카드가 없고, 계정 아이콘에 빨간 표시만 있다.
  expect(await screen.findByRole('button', { name: '계정 관리, 받은 친구 요청·초대 1개' })).toBeOnTheScreen();
  expect(screen.queryByText('준호님이 초대했어요 · 2026. 12. 1 – 12. 3')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '계정 관리, 받은 친구 요청·초대 1개' }));
  fireEvent.press(await screen.findByRole('button', { name: '친구 관리' }));
  expect(await screen.findByText('준호님이 초대했어요 · 2026. 12. 1 – 12. 3')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '오사카 여행 초대 수락' }));

  await waitFor(() => expect(api.acceptTripInvite).toHaveBeenCalledWith('inv1'));
  expect(await screen.findByText('오사카 여행')).toBeOnTheScreen();
});

test('친구 화면에서 친구 링크를 보내고, 친구를 끊는다', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  const alert = spyOnAlerts();
  const api = fakeApi({}, { friends: { friends: [{ user_id: 'u2', display_name: '준호' }], incoming: [], outgoing: [] } });
  renderApp({ auth: signedIn(), api, initialUrl: '/account' });

  fireEvent.press(await screen.findByRole('button', { name: '친구 관리' }));
  expect(await screen.findByText('내 친구 1명')).toBeOnTheScreen();
  await waitFor(() => expect(screen.getByRole('button', { name: '친구 링크 보내기' })).toBeEnabled());
  fireEvent.press(screen.getByRole('button', { name: '친구 링크 보내기' }));
  expect(share.mock.calls[0][0].message).toMatch(/\/friend\/FRND2345$/);

  fireEvent.press(screen.getByRole('button', { name: '준호 더보기' }));
  fireEvent.press(await screen.findByRole('button', { name: '친구 끊기' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '끊기');
  await waitFor(() => expect(api.removeFriend).toHaveBeenCalledWith('u2'));
  expect(await screen.findByText('내 친구 0명')).toBeOnTheScreen();
});

test('친구 링크로 열리면 친구가 되고 알려 준다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/friend?code=junh2345' });

  await waitFor(() => expect(api.befriendByCode).toHaveBeenCalledWith('JUNH2345'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('친구가 됐어요', '준호님과 친구가 됐어요. 이제 여행에 바로 초대할 수 있어요.'));
});

test('플래너의 친구 아이콘에 받은 요청 수가 뜨고, 누르면 친구 화면이 열린다', async () => {
  const api = fakeApi({}, {
    trips: [tripDetail()],
    friends: { friends: [], incoming: [{ id: 'r1', person: { user_id: 'u2', display_name: '준호' } }], outgoing: [] },
  });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju' });

  fireEvent.press(await screen.findByRole('button', { name: '친구, 받은 요청 1개' }));

  expect(await screen.findByText('받은 친구 요청')).toBeOnTheScreen();
});

test('참여자도 친구 화면의 함께 여행한 사람에서 친구를 추가한다', async () => {
  const api = fakeApi({}, {
    trips: [tripDetail({ me: { member_id: 'm2', join_order: 2, is_organizer: false } })],
    friendSuggestions: [{ display_name: '민지', trip_id: 'trip-jeju', trip_name: '제주 여행', member_id: 'm1' }],
  });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju' });

  fireEvent.press(await screen.findByRole('button', { name: '친구' }));
  fireEvent.press(await screen.findByRole('button', { name: '민지 친구 추가' }));

  await waitFor(() => expect(api.requestFriend).toHaveBeenCalledWith('trip-jeju', 'm1'));
  expect(await screen.findByText('보낸 요청')).toBeOnTheScreen();
});
