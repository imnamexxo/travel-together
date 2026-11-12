/**
 * API 클라이언트. 화면은 이 모듈을 통해서만 서버와 통신한다.
 * 타입은 서버 OpenAPI 명세에서 생성한 schema.d.ts만 쓴다(`npm run gen:api`).
 */

import type { components } from '@/api/schema';

export type Profile = components['schemas']['Profile'];
export type TripSummary = components['schemas']['TripSummary'];
export type TripDetail = components['schemas']['TripDetail'];
export type TripCreate = components['schemas']['TripCreate'];
export type TripUpdate = components['schemas']['TripUpdate'];
export type Member = components['schemas']['MemberOut'];
export type InviteCode = components['schemas']['InviteCode'];
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

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export interface ApiClient {
  getMe(): Promise<Profile>;
  listTrips(): Promise<TripSummary[]>;
  createTrip(trip: TripCreate): Promise<TripDetail>;
  getTrip(tripId: string): Promise<TripDetail>;
  listMembers(tripId: string): Promise<Member[]>;
  getInviteCode(tripId: string): Promise<InviteCode>;
  reissueInviteCode(tripId: string): Promise<InviteCode>;
  joinTrip(code: string): Promise<TripDetail>;
  updateTrip(tripId: string, changes: TripUpdate): Promise<TripDetail>;
  deleteTrip(tripId: string): Promise<void>;
  leaveTrip(tripId: string): Promise<void>;
  removeMember(tripId: string, memberId: string): Promise<void>;
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
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getAccessToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network_error', '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }

    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isErrorResponse(data)) {
        throw new ApiError(response.status, data.code, data.message, data.details ?? []);
      }
      throw new ApiError(response.status, 'unknown_error', '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return data as T;
  }

  const trip = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;

  return {
    getMe: () => request<Profile>('GET', '/me'),
    listTrips: () => request<TripSummary[]>('GET', '/trips'),
    createTrip: (trip) => request<TripDetail>('POST', '/trips', trip),
    getTrip: (tripId) => request<TripDetail>('GET', trip(tripId)),
    listMembers: (tripId) => request<Member[]>('GET', `${trip(tripId)}/members`),
    getInviteCode: (tripId) => request<InviteCode>('GET', `${trip(tripId)}/invite-code`),
    reissueInviteCode: (tripId) => request<InviteCode>('POST', `${trip(tripId)}/invite-code`),
    joinTrip: (code) => request<TripDetail>('POST', '/trips/join', { code }),
    updateTrip: (tripId, changes) => request<TripDetail>('PATCH', trip(tripId), changes),
    deleteTrip: (tripId) => request<void>('DELETE', trip(tripId)),
    leaveTrip: (tripId) => request<void>('DELETE', `${trip(tripId)}/members/me`),
    removeMember: (tripId, memberId) => request<void>('DELETE', `${trip(tripId)}/members/${encodeURIComponent(memberId)}`),
  };
}
