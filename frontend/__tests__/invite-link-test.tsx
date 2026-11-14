import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { FakeAuthService, fakeApi, member, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const busan = tripDetail({ id: 'trip-busan', name: '부산 여행', me: { member_id: 'm2', join_order: 2, is_organizer: false } });

test('초대 링크로 열리면 로그인돼 있을 때 바로 그 여행에 들어간다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  const api = fakeApi({}, { joinable: { ABCD2345: busan } });
  renderApp({ auth, api, initialUrl: '/join?code=abcd2345' });

  expect(await screen.findByText('부산 여행')).toBeOnTheScreen();
  expect(api.joinTrip).toHaveBeenCalledWith('ABCD2345');
});

test('로그인 전에 초대 링크를 누르면, 로그인한 뒤 이어서 들어간다', async () => {
  const auth = new FakeAuthService();
  auth.addUser('minji@example.com', 'pw123456');
  const api = fakeApi({}, { joinable: { ABCD2345: busan } });
  renderApp({ auth, api, initialUrl: '/join?code=ABCD2345' });

  fireEvent.changeText(await screen.findByLabelText('이메일'), 'minji@example.com');
  fireEvent.changeText(screen.getByLabelText('비밀번호'), 'pw123456');
  fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  await waitFor(() => expect(api.joinTrip).toHaveBeenCalledWith('ABCD2345'));
  expect(await screen.findByText('부산 여행')).toBeOnTheScreen();
});

test('총무는 초대 링크를 공유한다', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  const api = fakeApi({}, { trips: [tripDetail()], members: { 'trip-jeju': [member()] } });
  renderApp({ auth, api, initialUrl: '/trips/trip-jeju/members' });

  fireEvent.press(await screen.findByRole('button', { name: '링크 보내기' }));

  const message = share.mock.calls[0][0].message!;
  expect(message).toContain('"제주 여행" 여행에 함께해요!');
  expect(message).toMatch(/\/join\/[A-Z0-9]+/);
});
