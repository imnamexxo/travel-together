import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { ApiError } from '@/api/client';

import { FakeAuthService, fakeApi } from './support/fakes';
import { renderApp } from './support/render-app';

async function fillSignIn(email: string, password: string) {
  fireEvent.changeText(await screen.findByLabelText('이메일'), email);
  fireEvent.changeText(screen.getByLabelText('비밀번호'), password);
}

/** "•••" 여행 메뉴를 열고, 뜬 알림창의 제목·내용·버튼을 돌려준다. */
async function openTripMenu() {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  fireEvent.press(await screen.findByRole('button', { name: '여행 메뉴' }));
  const [title, message, buttons] = alert.mock.calls.at(-1)!;
  return { alert, title, message, buttons: buttons as AlertButton[] };
}

function pressAlertButton(buttons: AlertButton[], text: string) {
  buttons.find((button) => button.text === text)!.onPress!();
}

afterEach(() => jest.restoreAllMocks());

test('로그인하면 여행 홈이 열리고, 메뉴에 서버에서 받은 내 표시 이름이 보인다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'secret123');
  renderApp({ auth, api: fakeApi() });

  await fillSignIn('minji@example.com', 'secret123');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('여행 일정')).toBeOnTheScreen();
  await waitFor(async () => {
    const { message } = await openTripMenu();
    expect(message).toContain('민지님으로 로그인했어요.');
  });
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

  expect(await screen.findByText('여행 일정')).toBeOnTheScreen();
  expect(auth.signUps).toEqual([{ email: 'minji@example.com', displayName: '민지' }]);
});

test('소셜 로그인 버튼은 #23 전까지 보이지 않는다', async () => {
  renderApp({ auth: new FakeAuthService(), api: fakeApi() });

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  expect(screen.queryByText('카카오로 계속하기')).toBeNull();
  expect(screen.queryByText('Google로 계속하기')).toBeNull();
});

test('이미 로그인되어 있으면 바로 탭 화면이 열린다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi() });

  expect(await screen.findByText('여행 일정')).toBeOnTheScreen();
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

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  await waitFor(() => expect(auth.isSignedIn()).toBe(false));
});

test('메뉴에서 로그아웃하면 로그인 화면으로 돌아간다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi() });

  const { alert, buttons } = await openTripMenu();
  pressAlertButton(buttons, '로그아웃');
  pressAlertButton(alert.mock.calls.at(-1)![2] as AlertButton[], '로그아웃');

  expect(await screen.findByLabelText('이메일')).toBeOnTheScreen();
  expect(auth.isSignedIn()).toBe(false);
});
