import { hasMapKey } from '@/features/map/place-map';

test('Android는 구글 지도 키가 있어야 지도를 그린다(없으면 목록으로 보여 준다)', () => {
  expect(hasMapKey('android', { name: 'x', slug: 'x' })).toBe(false);
  expect(hasMapKey('android', { name: 'x', slug: 'x', extra: { hasGoogleMapsKey: true } })).toBe(true);
  expect(hasMapKey('ios', { name: 'x', slug: 'x' })).toBe(true);
});
