import { ApiError, createApiClient } from '@/api/client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function clientWith(fetchFn: jest.Mock, token: string | null = 'token-123') {
  return createApiClient({
    baseUrl: 'https://api.example.com/',
    getAccessToken: async () => token,
    fetchFn,
  });
}

test('로그인 토큰을 붙여 서버를 호출한다', async () => {
  const fetchFn = jest.fn(async () => jsonResponse(200, { id: 'u1', display_name: '민지' }));

  const profile = await clientWith(fetchFn).getMe();

  expect(profile).toEqual({ id: 'u1', display_name: '민지' });
  expect(fetchFn).toHaveBeenCalledWith(
    'https://api.example.com/me',
    expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
    }),
  );
});

test('토큰이 없으면 Authorization 헤더를 붙이지 않는다', async () => {
  const fetchFn = jest.fn(async (_url: string, _init: RequestInit) =>
    jsonResponse(200, { id: 'u1', display_name: '민지' }),
  );

  await clientWith(fetchFn, null).getMe();

  expect(fetchFn.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
});

test('공통 오류 형식을 ApiError로 풀어 준다', async () => {
  const fetchFn = jest.fn(async () =>
    jsonResponse(422, {
      code: 'validation_failed',
      message: '입력값을 확인해 주세요.',
      details: [{ field: 'name', message: '필수 항목입니다.' }],
    }),
  );

  const error = await clientWith(fetchFn).getMe().catch((e) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 422,
    code: 'validation_failed',
    message: '입력값을 확인해 주세요.',
    details: [{ field: 'name', message: '필수 항목입니다.' }],
  });
});

test('공통 형식이 아닌 오류 응답도 ApiError가 된다', async () => {
  const fetchFn = jest.fn(async () => jsonResponse(500, null));

  const error = await clientWith(fetchFn).getMe().catch((e) => e);

  expect(error).toMatchObject({ status: 500, code: 'unknown_error' });
});

test('서버에 닿지 못하면 network_error가 된다', async () => {
  const fetchFn = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });

  const error = await clientWith(fetchFn).getMe().catch((e) => e);

  expect(error).toMatchObject({ status: 0, code: 'network_error' });
});
