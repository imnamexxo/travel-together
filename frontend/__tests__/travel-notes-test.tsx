import { fireEvent, screen } from '@testing-library/react-native';

import { FakeAuthService, fakeApi, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

test('여행 메모: 체크리스트를 적고 아래 저장 버튼으로 저장한다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi({}, { trips: [tripDetail()] }), initialUrl: '/trips/trip-jeju' });

  fireEvent.press(await screen.findByRole('button', { name: '메모 또는 체크리스트 추가' }));
  fireEvent.press(screen.getByRole('radio', { name: '체크리스트' }));
  fireEvent.changeText(screen.getByLabelText('섹션 제목'), '준비물');
  fireEvent.changeText(screen.getByLabelText('1번째 체크 항목'), '여권');
  fireEvent.press(screen.getByRole('button', { name: '＋ 항목 추가' }));
  fireEvent.changeText(screen.getByLabelText('2번째 체크 항목'), '충전기');
  fireEvent.press(screen.getByRole('button', { name: '2번째 항목 삭제' }));
  fireEvent.press(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('준비물')).toBeOnTheScreen();
  expect(screen.getByText('0/1 완료')).toBeOnTheScreen();
});
