import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { FakeAuthService, expense, fakeApi, member, photo, place, planItem, tripDetail } from './support/fakes';
import { renderApp } from './support/render-app';

const market = place({ id: 'place-1', name: '동문시장' });
const beach = place({ id: 'place-2', kakao_place_id: '222', name: '함덕해수욕장', latitude: 33.54, longitude: 126.67 });
const peak = place({ id: 'place-3', kakao_place_id: '333', name: '성산일출봉', latitude: 33.46, longitude: 126.94 });
const members = [
  member({ member_id: 'm1', display_name: '민지', is_organizer: true, is_me: true }),
  member({ member_id: 'm2', display_name: '준호', join_order: 2 }),
];

function render() {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  const api = fakeApi({}, {
    trips: [tripDetail()],
    members: { 'trip-jeju': members },
    planItems: { 'trip-jeju': [
      planItem({ id: 'a', title: '점심', place: market }),
      planItem({ id: 'b', title: '산책', place: beach, position: 1 }),
      planItem({ id: 'c', title: '일출', place: peak, date: '2026-11-13' }),
    ] },
    photos: { 'trip-jeju': [photo({ id: 'p1', place: market, uploader_member_id: 'm2', uploader_name: '준호' })] },
    expenses: { 'trip-jeju': [expense({ id: 'e1', status: 'confirmed', payer_member_id: 'm1', total_amount: 12000, place: beach })] },
  });
  renderApp({ auth, api, initialUrl: '/trips/trip-jeju/map' });
  return api;
}

test('멤버를 고르면 그 멤버가 사진을 올렸거나 결제한 장소만 보인다', async () => {
  const api = render();
  expect(await screen.findByText('3곳')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: '준호의 장소만 보기' }));

  await waitFor(() => expect(api.getMapData).toHaveBeenLastCalledWith('trip-jeju', { date: null, memberId: 'm2' }));
  expect(await screen.findByText('1곳')).toBeOnTheScreen();
  expect(screen.getByText('동문시장')).toBeOnTheScreen();
});

test('날짜를 고르면 그날 계획했거나 들른 장소만 보이고, 들른 날이 표시된다', async () => {
  const api = render();
  expect(await screen.findByText('3곳')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: /^1일 차/ }));

  await waitFor(() => expect(api.getMapData).toHaveBeenLastCalledWith('trip-jeju', { date: '2026-11-12', memberId: null }));
  expect(await screen.findByText('2곳')).toBeOnTheScreen();
  expect(screen.getByText('들른 날 1일 차')).toBeOnTheScreen();
});
