import { parseRedirect } from '@/auth/oauth-redirect';

test('돌아온 앱 주소에서 code를 읽는다', () => {
  expect(parseRedirect('traveltogether://auth-callback?code=abc-123')).toEqual({ code: 'abc-123' });
});

test('오류와 설명(인코딩된 한글·공백)을 읽는다', () => {
  expect(parseRedirect('traveltogether://auth-callback?error=server_error&error_description=%EC%8B%A4%ED%8C%A8+%ED%96%88%EC%96%B4%EC%9A%94')).toEqual({
    error: 'server_error', error_description: '실패 했어요',
  });
});

test('# 뒤에 온 값도 읽는다', () => {
  expect(parseRedirect('traveltogether://auth-callback#error=access_denied')).toEqual({ error: 'access_denied' });
});
