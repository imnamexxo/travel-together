import { fireEvent, screen } from '@testing-library/react-native';

import { ApiError } from '@/api/client';

import { openTripMenu } from './support/alerts';
import { FakeAuthService, fakeApi, place, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

function signedIn() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  return auth;
}

async function fillNewTrip({ name, start, end }: { name: string; start: string; end: string }) {
  fireEvent.changeText(await screen.findByLabelText('여행 이름'), name);
  fireEvent.changeText(screen.getByLabelText('시작일'), start);
  fireEvent.changeText(screen.getByLabelText('종료일'), end);
  fireEvent.press(screen.getByRole('button', { name: '여행 만들기' }));
}

afterEach(() => jest.restoreAllMocks());

test('여행이 없으면 안내가 보이고, 여행을 만들면 그 여행 홈이 열린다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api });

  expect(await screen.findByText('아직 여행이 없어요')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '여행 만들기' }));
  await fillNewTrip({ name: ' 부산 여행 ', start: '2026-12-01', end: '2026-12-03' });

  expect(await screen.findByText('부산 여행')).toBeOnTheScreen();
  expect(screen.getByText('2026. 12. 1 – 12. 3  ·  1명')).toBeOnTheScreen();
  expect(api.createTrip).toHaveBeenCalledWith({ name: '부산 여행', start_date: '2026-12-01', end_date: '2026-12-03' });
  for (const tab of ['플래너', '앨범', '지도', '정산']) {
    expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
  }
});

test('시작일이 종료일보다 늦으면 서버에 보내지 않고 이유를 보여준다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/new' });

  await fillNewTrip({ name: '부산 여행', start: '2026-12-03', end: '2026-12-01' });

  expect(await screen.findByText('종료일은 시작일과 같거나 뒤여야 해요.')).toBeOnTheScreen();
  expect(api.createTrip).not.toHaveBeenCalled();
});

test('날짜 형식이 틀리거나 없는 날짜면 서버에 보내지 않는다', async () => {
  const api = fakeApi();
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/new' });

  await fillNewTrip({ name: '부산 여행', start: '2026/12/01', end: '2026-02-30' });

  expect(await screen.findByText('2026-11-12처럼 입력해주세요.')).toBeOnTheScreen();
  expect(screen.getByText('2026-11-14처럼 입력해주세요.')).toBeOnTheScreen();
  expect(api.createTrip).not.toHaveBeenCalled();
});

test('서버가 거절하면 서버가 준 이유를 보여준다', async () => {
  const api = fakeApi({
    createTrip: jest.fn(async () => {
      throw new ApiError(422, 'validation_failed', '입력값을 확인해 주세요.', [
        { field: 'end_date', message: '종료일은 시작일과 같거나 뒤여야 합니다.' },
      ]);
    }),
  });
  renderApp({ auth: signedIn(), api, initialUrl: '/trips/new' });

  await fillNewTrip({ name: '부산 여행', start: '2026-12-01', end: '2026-12-03' });

  expect(await screen.findByText('입력값을 확인해 주세요.\n종료일은 시작일과 같거나 뒤여야 합니다.')).toBeOnTheScreen();
});

test('여행 목록에서 여행을 열면 그 여행 홈으로 간다', async () => {
  const trips = [
    tripDetail({ id: 'trip-jeju', name: '제주 여행' }),
    tripDetail({ id: 'trip-gangneung', name: '강릉 여행', start_date: '2026-08-01', end_date: '2026-08-02', member_count: 4, me: { member_id: 'm', join_order: 2, is_organizer: false } }),
  ];
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips }) });

  expect(await screen.findByText('2026. 8. 1 – 8. 2  ·  멤버 4명')).toBeOnTheScreen();
  expect(screen.getAllByText('총무')).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: '강릉 여행 열기' }));

  expect(await screen.findByText('2026. 8. 1 – 8. 2  ·  4명')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: '1일 차 08.01' })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: '2일 차 08.02' })).toBeOnTheScreen();
});

test('총무 여부를 여행 화면에서 알 수 있다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [tripDetail()] }), initialUrl: '/trips/trip-jeju' });

  const { message } = await openTripMenu();
  expect(message).toContain('이 여행의 총무예요.');
});

test('총무가 아닌 여행에서는 총무라고 나오지 않는다', async () => {
  const trip = tripDetail({ me: { member_id: 'm', join_order: 2, is_organizer: false } });
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [trip] }), initialUrl: '/trips/trip-jeju' });

  const { message } = await openTripMenu();
  expect(message).not.toContain('총무');
});

test('지도의 앨범 바로가기는 같은 여행의 앨범을 연다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [tripDetail()], planItems: { 'trip-jeju': [planItem({ title: '점심', place: place() })] } }), initialUrl: '/trips/trip-jeju/map' });

  fireEvent.press(await screen.findByRole('button', { name: '앨범 보기 ›' }));

  expect(await screen.findByText('여행의 순간')).toBeOnTheScreen();
});

test('지도의 플래너 바로가기는 내 여행 목록이 아니라 같은 여행의 플래너를 연다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi({}, { trips: [tripDetail()], planItems: { 'trip-jeju': [planItem({ title: '점심', place: place() })] } }), initialUrl: '/trips/trip-jeju/map' });

  fireEvent.press(await screen.findByRole('button', { name: '플래너 보기' }));

  expect(await screen.findByText('여행 일정')).toBeOnTheScreen();
  expect(screen.queryByText('내 여행')).toBeNull();
});

test('없거나 내가 멤버가 아닌 여행이면 안내와 함께 목록으로 돌아갈 수 있다', async () => {
  renderApp({ auth: signedIn(), api: fakeApi(), initialUrl: '/trips/someone-elses' });

  expect(await screen.findByText('여행을 찾을 수 없어요')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '내 여행 목록으로' }));

  expect(await screen.findByText('내 여행')).toBeOnTheScreen();
});
