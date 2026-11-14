import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

import { ApiError } from '@/api/client';
import { AuthError } from '@/auth/auth-service';

import { openTripMenu, pressAlertButton } from './support/alerts';
import { FakeAuthService, fakeApi, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

async function fillSignIn(email: string, password: string) {
  fireEvent.changeText(await screen.findByLabelText('이메일'), email);
  fireEvent.changeText(screen.getByLabelText('비밀번호'), password);
}

afterEach(() => jest.restoreAllMocks());

test('로그인하면 내 여행 목록이 열리고, 서버에서 받은 내 표시 이름이 보인다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'secret123');
  renderApp({ auth, api: fakeApi() });

  await fillSignIn('minji@example.com', 'secret123');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
  expect(await screen.findByText('민지님, 함께 떠날 여행을 골라요.')).toBeOnTheScreen();
});

test('비밀번호가 틀리면 이유가 보이고 로그인 화면에 남는다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'secret123');
  renderApp({ auth, api: fakeApi() });

  await fillSignIn('minji@example.com', 'wrong');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('이메일 또는 비밀번호가 맞지 않습니다.')).toBeOnTheScreen();
  expect(screen.getByLabelText('이메일')).toBeOnTheScreen();
});

test('입력 형식이 틀리면 서버에 보내지 않고 이유를 보여준다', async () => {
  const auth = new FakeAuthService();
  const signIn = jest.spyOn(auth, 'signIn');
  renderApp({ auth, api: fakeApi() });

  await fillSignIn('not-an-email', 'secret123');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('이메일 주소를 확인해주세요.')).toBeOnTheScreen();
  expect(signIn).not.toHaveBeenCalled();
});

test('회원가입할 때 입력한 이름이 가입 요청에 실린다', async () => {
  const auth = new FakeAuthService();
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '회원가입' }));
  fireEvent.changeText(await screen.findByLabelText('이름'), '  민지 ');
  await fillSignIn('minji@example.com', 'secret123');
  fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), 'secret123');
  fireEvent.press(screen.getByRole('button', { name: '회원가입' }));

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
  expect(auth.signUps).toEqual([{ email: 'minji@example.com', displayName: '민지' }]);
});

test('카카오로 계속하기를 누르면 소셜 로그인을 부르고, 로그인되면 내 여행 목록이 열린다', async () => {
  const auth = new FakeAuthService();
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '카카오로 계속하기' }));

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
  expect(auth.socialSignIns).toEqual(['kakao']);
});

test('Google로 계속하기도 같은 흐름이다', async () => {
  const auth = new FakeAuthService();
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: 'Google로 계속하기' }));

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
  expect(auth.socialSignIns).toEqual(['google']);
});

test('외부 로그인 페이지를 닫으면 오류 없이 로그인 화면에 남고 다시 누를 수 있다', async () => {
  const auth = new FakeAuthService();
  auth.socialResult = 'cancelled';
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '카카오로 계속하기' }));
  await waitFor(() => expect(auth.socialSignIns).toEqual(['kakao']));

  expect(screen.queryByRole('alert')).toBeNull();
  auth.socialResult = 'signed_in';
  fireEvent.press(screen.getByRole('button', { name: '카카오로 계속하기' }));
  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
});

test('소셜 로그인이 실패하면 이유가 보인다', async () => {
  const auth = new FakeAuthService();
  auth.socialResult = new AuthError('로그인 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: 'Google로 계속하기' }));

  expect(await screen.findByText('로그인 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeOnTheScreen();
  expect(auth.isSignedIn()).toBe(false);
});

test('소셜 로그인 세션도 서버가 401을 돌려주면 로그아웃된다', async () => {
  const auth = new FakeAuthService();
  const api = fakeApi({
    getMe: jest.fn(async () => {
      throw new ApiError(401, 'unauthorized', '로그인이 만료되었거나 올바르지 않습니다.');
    }),
  });
  renderApp({ auth, api });

  fireEvent.press(await screen.findByRole('button', { name: '카카오로 계속하기' }));

  await waitFor(() => expect(auth.socialSignIns).toEqual(['kakao']));
  await waitFor(() => expect(auth.isSignedIn()).toBe(false));
  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
});

test('이미 로그인되어 있으면 바로 내 여행 목록이 열린다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi() });

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
});

test('서버가 401을 돌려주면 로그아웃되고 로그인 화면으로 돌아간다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  const api = fakeApi({
    getMe: jest.fn(async () => {
      throw new ApiError(401, 'unauthorized', '로그인이 만료되었거나 올바르지 않습니다.');
    }),
  });
  renderApp({ auth, api });

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  await waitFor(() => expect(auth.isSignedIn()).toBe(false));
});

test('계정 관리에서 로그아웃하면 로그인 화면으로 돌아간다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '계정 관리' }));
  fireEvent.press(await screen.findByRole('button', { name: '로그아웃' }));

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  expect(auth.isSignedIn()).toBe(false);
});

test('여행 메뉴에서 로그아웃하면 로그인 화면으로 돌아간다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi({}, { trips: [tripDetail()] }), initialUrl: '/trips/trip-jeju' });

  const { alert, choose } = await openTripMenu();
  await choose('로그아웃');
  await pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '로그아웃');

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  expect(auth.isSignedIn()).toBe(false);
});

test('소셜 로그인에서 돌아온 앱 주소(auth-callback)는 없는 화면이 아니라 원래 화면으로 간다', async () => {
  const signedIn = new FakeAuthService();
  signedIn.signInAs('minji@example.com');
  renderApp({ auth: signedIn, api: fakeApi(), initialUrl: '/auth-callback' });
  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
});

test('세션이 아직 없을 때 돌아오면 로그인 화면으로 간다', async () => {
  renderApp({ auth: new FakeAuthService(), api: fakeApi(), initialUrl: '/auth-callback' });
  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
});

test('비밀번호 찾기: 이메일을 넣으면 재설정 메일을 요청하고 안내가 보인다', async () => {
  const auth = new FakeAuthService();
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '비밀번호를 잊으셨나요?' }));
  fireEvent.press(await screen.findByRole('button', { name: '재설정 링크 보내기' }));
  expect(await screen.findByText('이메일을 입력해주세요.')).toBeOnTheScreen();
  expect(auth.resetRequests).toEqual([]);

  fireEvent.changeText(screen.getByLabelText('이메일'), ' minji@example.com ');
  fireEvent.press(screen.getByRole('button', { name: '재설정 링크 보내기' }));

  expect(await screen.findByText(/메일을 보냈어요/)).toBeOnTheScreen();
  expect(auth.resetRequests).toEqual(['minji@example.com']);
});

test('메일 링크로 열린 화면에서 새 비밀번호를 정하면 로그인되어 내 여행 목록이 열린다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'old-secret');
  renderApp({ auth, api: fakeApi(), initialUrl: '/reset-password?code=abc' });

  fireEvent.changeText(await screen.findByLabelText('새 비밀번호'), 'new-secret-1');
  fireEvent.changeText(screen.getByLabelText('새 비밀번호 확인'), 'different');
  fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(await screen.findByText('비밀번호가 일치하지 않아요.')).toBeOnTheScreen();

  fireEvent.changeText(screen.getByLabelText('새 비밀번호 확인'), 'new-secret-1');
  fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
  await act(() => auth.signOut());
  await act(() => expect(auth.signIn('minji@example.com', 'new-secret-1')).resolves.toBeUndefined());
});

test('만료된 링크면 이유가 보인다', async () => {
  renderApp({ auth: new FakeAuthService(), api: fakeApi(), initialUrl: '/reset-password?code=expired' });
  fireEvent.changeText(await screen.findByLabelText('새 비밀번호'), 'new-secret-1');
  fireEvent.changeText(screen.getByLabelText('새 비밀번호 확인'), 'new-secret-1');
  fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(await screen.findByText(/재설정 링크가 만료되었거나/)).toBeOnTheScreen();
});

test('code 없이 재설정 화면이 열리면 비밀번호 찾기를 다시 하도록 안내한다', async () => {
  renderApp({ auth: new FakeAuthService(), api: fakeApi(), initialUrl: '/reset-password' });
  expect(await screen.findByText('재설정 링크가 올바르지 않아요. 비밀번호 찾기를 다시 해주세요.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '비밀번호 찾기 다시 하기' })).toBeOnTheScreen();
});
