import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/client';

import { FakeAuthService, fakeApi } from './support/fakes';
import { renderApp } from './support/render-app';

async function fillSignIn(email: string, password: string) {
  fireEvent.changeText(await screen.findByPlaceholderText('이메일'), email);
  fireEvent.changeText(screen.getByPlaceholderText('비밀번호'), password);
}

test('로그인하면 서버에서 받은 내 표시 이름이 보인다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'secret123');
  renderApp({ auth, api: fakeApi() });

  await fillSignIn('minji@example.com', 'secret123');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('안녕하세요, 민지님')).toBeOnTheScreen();
});

test('비밀번호가 틀리면 이유가 보이고 로그인 화면에 남는다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'secret123');
  renderApp({ auth, api: fakeApi() });

  await fillSignIn('minji@example.com', 'wrong');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('이메일 또는 비밀번호가 맞지 않습니다.')).toBeOnTheScreen();
  expect(screen.getByPlaceholderText('이메일')).toBeOnTheScreen();
});

test('가입할 때 정한 표시 이름이 가입 요청에 실린다', async () => {
  const auth = new FakeAuthService();
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '계정이 없나요? 가입하기' }));
  fireEvent.changeText(screen.getByPlaceholderText('표시 이름'), '  민지 ');
  await fillSignIn('minji@example.com', 'secret123');
  fireEvent.press(screen.getByRole('button', { name: '가입하기' }));

  expect(await screen.findByText('안녕하세요, 민지님')).toBeOnTheScreen();
  expect(auth.signUps).toEqual([{ email: 'minji@example.com', displayName: '민지' }]);
});

test('이미 로그인되어 있으면 바로 탭 화면이 열린다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi() });

  expect(await screen.findByText('안녕하세요, 민지님')).toBeOnTheScreen();
  for (const tab of ['플래너', '앨범', '지도', '정산']) {
    expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
  }
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

  expect(await screen.findByPlaceholderText('이메일')).toBeOnTheScreen();
  await waitFor(() => expect(auth.isSignedIn()).toBe(false));
});

test('로그아웃하면 로그인 화면으로 돌아간다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi() });

  fireEvent.press(await screen.findByRole('button', { name: '로그아웃' }));

  expect(await screen.findByPlaceholderText('이메일')).toBeOnTheScreen();
  expect(auth.isSignedIn()).toBe(false);
});
