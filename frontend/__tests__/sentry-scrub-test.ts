import { scrubBreadcrumb } from '@/monitoring/sentry';

test('콘솔 로그는 오류 보고에 넣지 않는다', () => {
  expect(scrubBreadcrumb({ category: 'console', message: 'secret' })).toBeNull();
});

test('요청 주소의 검색어(쿼리 문자열)는 지운다', () => {
  const crumb = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://api.test/trips/t1/places/search?query=%EC%84%B1%EC%82%B0', status_code: 200 } });
  expect(crumb?.data).toEqual({ url: 'https://api.test/trips/t1/places/search', status_code: 200 });
});

test('주소 없는 기록(화면 이동 등)은 그대로 둔다', () => {
  const crumb = { category: 'navigation', data: { from: '/a', to: '/b' } };
  expect(scrubBreadcrumb(crumb)).toEqual(crumb);
});
