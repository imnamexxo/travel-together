import { googleMapsUrl, isGoogleMap } from '@/features/map/map-screen';

test('Google 장소를 그릴 수 있는 지도: 안드로이드 앱, 그리고 웹 키가 있을 때 웹의 해외 여행', () => {
  expect(isGoogleMap(false, 'android', undefined)).toBe(true);
  expect(isGoogleMap(true, 'ios', 'key')).toBe(false);
  expect(isGoogleMap(true, 'web', 'key')).toBe(true);
  expect(isGoogleMap(true, 'web', undefined)).toBe(false);
  expect(isGoogleMap(false, 'web', 'key')).toBe(false);
});

test('Google 지도 링크는 장소 id로 연다', () => {
  expect(googleMapsUrl('ChIJ abc', '오사카성')).toBe('https://www.google.com/maps/search/?api=1&query=%EC%98%A4%EC%82%AC%EC%B9%B4%EC%84%B1&query_place_id=ChIJ%20abc');
});
