import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';

import { pressAlertButton, spyOnAlerts } from './support/alerts';
import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

function signedIn(provider = 'email') {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com', provider);
  return auth;
}

const mine = tripDetail({ id: 'trip-mine', name: '민지의 제주', member_count: 3 });
const theirs = tripDetail({ id: 'trip-theirs', name: '준호의 부산', me: { member_id: 'm9', join_order: 2, is_organizer: false } });

test('여행 목록의 계정 버튼으로 계정 관리를 열고 표시 이름을 바꾼다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api });

  fireEvent.press(await screen.findByRole('button', { name: '계정 관리' }));
  const input = await screen.findByLabelText('표시 이름');
  await waitFor(() => expect(input.props.value).toBe('민지'));
  fireEvent.changeText(input, ' 민지짱 ');
  fireEvent.press(screen.getByRole('button', { name: '이름 저장' }));

  expect(await screen.findByText('이름을 바꿨어요.')).toBeOnTheScreen();
  expect(api.updateMe).toHaveBeenCalledWith('민지짱');
});

test('이메일 계정은 현재 비밀번호를 확인하고 비밀번호를 바꾼다', async () => {
  const auth = signedIn();
  renderApp({ auth, api: fakeApi(), initialUrl: '/account' });

  expect(await screen.findByText('minji@example.com')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '비밀번호 변경' }));
  fireEvent.changeText(screen.getByLabelText('현재 비밀번호'), 'wrong');
  fireEvent.changeText(screen.getByLabelText('새 비밀번호'), 'newpass1');
  fireEvent.changeText(screen.getByLabelText('새 비밀번호 확인'), 'newpass1');
  fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(await screen.findByText('현재 비밀번호가 맞지 않습니다.')).toBeOnTheScreen();

  fireEvent.changeText(screen.getByLabelText('현재 비밀번호'), 'current-pw');
  fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

  expect(await screen.findByText('비밀번호를 바꿨어요.')).toBeOnTheScreen();
  expect(auth.passwordChanges).toEqual(['newpass1']);
});

test('카카오 계정은 가입 방법을 보여 주고 비밀번호 변경이 없다', async () => {
  renderApp({ auth: signedIn('kakao'), api: fakeApi(), initialUrl: '/account' });

  expect(await screen.findByText('카카오')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '비밀번호 변경' })).toBeNull();
});

test('계정 관리에는 여행 삭제가 없다(여행 목록에서 밀어서 지운다)', async () => {
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [mine, theirs] }), initialUrl: '/account' });

  expect(await screen.findByText('표시 이름')).toBeOnTheScreen();
  expect(screen.queryByText('내가 만든 여행')).toBeNull();
});

test('회원 탈퇴는 무엇이 바뀌는지 보여 주고, 확인하면 탈퇴하고 로그아웃된다', async () => {
  const alert = spyOnAlerts();
  const auth = signedIn();
  const api = fakeApi({}, {
    deletionPreview: {
      deleted_trips: [{ id: 't1', name: '민지 혼자' }],
      handed_over: [{ trip: { id: 't2', name: '민지의 제주' }, new_organizer_name: '준호' }],
      kept_records: [{ id: 't3', name: '준호의 부산' }],
    },
  });
  renderApp({ auth, api, initialUrl: '/account' });

  fireEvent.press(await screen.findByRole('button', { name: '회원 탈퇴' }));
  expect(await screen.findByText('• 민지 혼자')).toBeOnTheScreen();
  expect(screen.getByText('• 민지의 제주 → 준호님')).toBeOnTheScreen();
  expect(screen.getByText('• 준호의 부산')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '탈퇴');

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  expect(api.deleteMe).toHaveBeenCalledTimes(1);
  expect(auth.isSignedIn()).toBe(false);
});

test('탈퇴가 실패하면 로그인된 채 이유를 보여 준다', async () => {
  const alert = spyOnAlerts();
  const auth = signedIn();
  const api = fakeApi({ deleteMe: jest.fn(async () => { throw new ApiError(502, 'account_deletion_failed', '탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }) });
  renderApp({ auth, api, initialUrl: '/account-delete' });

  fireEvent.press(await screen.findByRole('button', { name: '탈퇴하기' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '탈퇴');

  expect(await screen.findByText('탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeOnTheScreen();
  expect(auth.isSignedIn()).toBe(true);
});

test('총무는 여행 설정에서 다른 멤버에게 총무를 넘긴다', async () => {
  const alert = spyOnAlerts();
  const members = [
    member({ member_id: 'm1', display_name: '민지', is_organizer: true, is_me: true }),
    member({ member_id: 'm2', display_name: '준호', join_order: 2, is_organizer: false, is_me: false }),
  ];
  const api = fakeApi({}, { trips: [tripDetail({ member_count: 2, me: { member_id: 'm1', join_order: 1, is_organizer: true } })], members: { 'trip-jeju': members } });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/trip-jeju/settings' });

  fireEvent.press(await screen.findByRole('button', { name: '준호에게 총무 넘기기' }));
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '넘기기');

  await waitFor(() => expect(api.handOverOrganizer).toHaveBeenCalledWith('trip-jeju', 'm2'));
  // 이제 일반 멤버라 총무 넘기기가 사라진다.
  await waitFor(() => expect(screen.queryByRole('button', { name: '준호에게 총무 넘기기' })).toBeNull());
});
