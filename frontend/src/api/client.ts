/**
 * API 클라이언트. 화면은 이 모듈을 통해서만 서버와 통신한다.
 * 타입은 서버 OpenAPI 명세에서 생성한 schema.d.ts만 쓴다(`npm run gen:api`).
 */

import type { components } from '@/api/schema';

export type Profile = components['schemas']['Profile'];
export type ErrorDetail = components['schemas']['ErrorDetail'];
type ErrorResponse = components['schemas']['ErrorResponse'];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export interface ApiClient {
  getMe(): Promise<Profile>;
}

type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
};

function isErrorResponse(body: unknown): body is ErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ErrorResponse).code === 'string' &&
    typeof (body as ErrorResponse).message === 'string'
  );
}

export function createApiClient({ baseUrl, getAccessToken, fetchFn = fetch }: ApiClientOptions): ApiClient {
  async function request<T>(method: string, path: string): Promise<T> {
    const token = await getAccessToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl.replace(/\/$/, '')}${path}`, { method, headers });
    } catch {
      throw new ApiError(0, 'network_error', '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isErrorResponse(body)) {
        throw new ApiError(response.status, body.code, body.message, body.details ?? []);
      }
      throw new ApiError(response.status, 'unknown_error', '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return body as T;
  }

  return {
    getMe: () => request<Profile>('GET', '/me'),
  };
}
