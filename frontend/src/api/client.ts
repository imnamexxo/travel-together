/**
 * API 클라이언트. 화면은 이 모듈을 통해서만 서버와 통신한다.
 * 타입은 서버 OpenAPI 명세에서 생성한 schema.d.ts만 쓴다(`npm run gen:api`).
 */

import { filePart } from '@/api/file-part';
import type { components } from '@/api/schema';

export type Profile = components['schemas']['Profile'];
export type DeletionPreview = components['schemas']['DeletionPreview'];
export type Friends = components['schemas']['FriendsOut'];
export type Person = components['schemas']['Person'];
export type TripInvite = components['schemas']['TripInviteOut'];
export type FriendSuggestion = components['schemas']['Suggestion'];
export type InvitableTrip = components['schemas']['InvitableTrip'];
export type MapData = components['schemas']['MapData'];
export type MapPlace = components['schemas']['MapPlace'];
/** 지도 필터. date는 YYYY-MM-DD. */
export type MapFilter = { date?: string | null; memberId?: string | null };
export type TripSummary = components['schemas']['TripSummary'];
export type TripDetail = components['schemas']['TripDetail'];
export type TripCreate = components['schemas']['TripCreate'];
export type TripUpdate = components['schemas']['TripUpdate'];
export type Member = components['schemas']['MemberOut'];
export type InviteCode = components['schemas']['InviteCode'];
export type ExpenseSummary = components['schemas']['ExpenseSummary'];
export type Expense = components['schemas']['ExpenseOut'];
export type ExpenseInput = components['schemas']['ExpenseIn'];
export type ExpenseStatus = Expense['status'];
export type Settlement = components['schemas']['SettlementOut'];
export type Transfer = components['schemas']['TransferOut'];
export type TransferCreate = components['schemas']['TransferCreate'];
export type Place = components['schemas']['PlaceOut'];
export type PlaceCandidate = components['schemas']['PlaceCandidateOut'];
export type PlanItem = components['schemas']['PlanItemOut'];
export type PlanItemInput = components['schemas']['PlanItemIn'];
export type Suggestion = components['schemas']['SuggestionOut'];
export type SuggestedItem = components['schemas']['SuggestedItemOut'];
export type SuggestionAsk = components['schemas']['SuggestionAsk'];
export type Photo = components['schemas']['PhotoOut'];
export type PhotoList = components['schemas']['PhotoList'];
/** 올릴 사진: 기기 안의 JPEG 파일과 촬영 시각. 위치 좌표는 넣지 않는다(ADR-0003). */
export type PhotoUpload = { uri: string; takenAt: string | null; placeId?: string | null };
export type PhotoPlaceLink = components['schemas']['PhotoPlaceLink'];
export type ReceiptUpload = components['schemas']['ReceiptUploadOut'];
export type ExpensePlaceCandidate = components['schemas']['ExpensePlaceCandidate'];
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

/** 지출 생성 재시도를 구분하는 키. 보안용이 아니라 겹치지만 않으면 된다. */
export function newIdempotencyKey(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random()}-${random()}`;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export interface ApiClient {
  getMe(): Promise<Profile>;
  updateMe(displayName: string): Promise<Profile>;
  /** 탈퇴하면 내 여행들이 어떻게 되는지(ADR 0005). 아무것도 바꾸지 않는다. */
  getDeletionPreview(): Promise<DeletionPreview>;
  /** 회원 탈퇴. 성공하면 로그인 계정도 지워진다. */
  deleteMe(): Promise<void>;
  listFriends(): Promise<Friends>;
  /** 함께 여행한 사람 중 아직 친구가 아닌 사람 */
  listFriendSuggestions(): Promise<FriendSuggestion[]>;
  /** 함께 여행한 멤버에게 친구 요청 */
  requestFriend(tripId: string, memberId: string): Promise<Friends>;
  acceptFriend(requestId: string): Promise<Friends>;
  /** 받은 요청 거절 또는 보낸 요청 취소 */
  declineFriend(requestId: string): Promise<Friends>;
  removeFriend(userId: string): Promise<Friends>;
  getFriendCode(): Promise<{ code: string }>;
  /** 친구 링크를 눌러 링크 주인과 바로 친구가 된다. */
  befriendByCode(code: string): Promise<Person>;
  inviteFriend(tripId: string, userId: string): Promise<Person>;
  /** 친구를 초대할 수 있는 내 여행(내가 총무)과 그 친구의 상태 */
  listTripsForFriend(userId: string): Promise<InvitableTrip[]>;
  listTripInvites(): Promise<TripInvite[]>;
  acceptTripInvite(inviteId: string): Promise<TripDetail>;
  declineTripInvite(inviteId: string): Promise<void>;
  /** 총무를 다른 멤버에게 넘긴다. */
  handOverOrganizer(tripId: string, memberId: string): Promise<TripDetail>;
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
  listExpenses(tripId: string): Promise<ExpenseSummary[]>;
  getExpense(tripId: string, expenseId: string): Promise<Expense>;
  /** 같은 idempotencyKey로 다시 보내면 서버가 처음 만든 지출을 돌려준다. 키는 newIdempotencyKey()로 만든다. */
  createExpense(tripId: string, input: ExpenseInput, idempotencyKey: string): Promise<Expense>;
  updateExpense(tripId: string, expenseId: string, input: ExpenseInput): Promise<Expense>;
  /** 확정 조건이 깨지면 422 ApiError(details에 깨진 조건)를 던진다. */
  confirmExpense(tripId: string, expenseId: string): Promise<Expense>;
  deleteExpense(tripId: string, expenseId: string): Promise<void>;
  /** 서버가 계산한 정산 결과. 앱은 이 값을 그대로 보여주고 다시 계산하지 않는다. */
  getSettlement(tripId: string): Promise<Settlement>;
  listTransfers(tripId: string): Promise<Transfer[]>;
  recordTransfer(tripId: string, transfer: TransferCreate): Promise<Transfer>;
  deleteTransfer(tripId: string, transferId: string): Promise<void>;
  /** 장소 검색(국내 여행은 카카오, 해외 여행은 Google). 사람의 위치는 보내지 않는다(ADR-0003). */
  searchPlaces(tripId: string, query: string): Promise<PlaceCandidate[]>;
  listPlanItems(tripId: string): Promise<PlanItem[]>;
  createPlanItem(tripId: string, input: PlanItemInput): Promise<PlanItem>;
  updatePlanItem(tripId: string, itemId: string, input: PlanItemInput): Promise<PlanItem>;
  deletePlanItem(tripId: string, itemId: string): Promise<void>;
  /** 그날의 일정 항목 id를 빠짐없이 새 순서대로 보낸다. */
  reorderPlanItems(tripId: string, date: string, itemIds: string[]): Promise<PlanItem[]>;
  /** Gemini 추천 일정. 하루 한도를 넘으면 429, AI가 실패하면 502 ApiError. */
  askSuggestions(tripId: string, ask: SuggestionAsk): Promise<Suggestion>;
  /** 고른 추천 일정만 일정 항목으로 만든다. 만든 일정 항목을 돌려준다. */
  adoptSuggestions(tripId: string, requestId: string, itemIds: string[]): Promise<PlanItem[]>;
  listPhotos(tripId: string): Promise<PhotoList>;
  uploadPhoto(tripId: string, photo: PhotoUpload): Promise<Photo>;
  deletePhoto(tripId: string, photoId: string): Promise<void>;
  /** 사진의 장소를 바꾼다(수동). 둘 다 비우면 해제. */
  linkPhotoPlace(tripId: string, photoId: string, link: PhotoPlaceLink): Promise<Photo>;
  /** 총무가 영수증을 올려 지출 초안을 만든다. 같은 키면 처음 초안을 돌려준다. */
  uploadReceipt(tripId: string, receipt: { uri: string }, idempotencyKey: string): Promise<ReceiptUpload>;
  /** 지출에 붙일 장소 후보(총무만). 이 여행의 장소가 앞에 온다. */
  getExpensePlaceCandidates(tripId: string, query: string): Promise<ExpensePlaceCandidate[]>;
  /** 지도: 장소별 들른 곳 여부·일정·사진·지출 요약. 날짜·멤버로 거른다. */
  getMapData(tripId: string, filter?: MapFilter): Promise<MapData>;
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
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    // FormData는 fetch가 경계 문자열과 함께 Content-Type을 정한다.
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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
  const expense = (tripId: string, expenseId: string) => `${trip(tripId)}/expenses/${encodeURIComponent(expenseId)}`;

  return {
    getMe: () => request<Profile>('GET', '/me'),
    updateMe: (displayName) => request<Profile>('PATCH', '/me', { display_name: displayName }),
    getDeletionPreview: () => request<DeletionPreview>('GET', '/me/deletion-preview'),
    deleteMe: () => request<void>('DELETE', '/me'),
    listFriends: () => request<Friends>('GET', '/friends'),
    listFriendSuggestions: () => request<FriendSuggestion[]>('GET', '/friends/suggestions'),
    requestFriend: (tripId, memberId) => request<Friends>('POST', '/friends/requests', { trip_id: tripId, member_id: memberId }),
    acceptFriend: (id) => request<Friends>('POST', `/friends/requests/${encodeURIComponent(id)}/accept`),
    declineFriend: (id) => request<Friends>('POST', `/friends/requests/${encodeURIComponent(id)}/decline`),
    removeFriend: (userId) => request<Friends>('DELETE', `/friends/${encodeURIComponent(userId)}`),
    getFriendCode: () => request<{ code: string }>('GET', '/me/friend-code'),
    befriendByCode: (code) => request<Person>('POST', '/friends/by-code', { code }),
    inviteFriend: (tripId, userId) => request<Person>('POST', `${trip(tripId)}/invites`, { user_id: userId }),
    listTripsForFriend: (userId) => request<InvitableTrip[]>('GET', `/friends/${encodeURIComponent(userId)}/trips`),
    listTripInvites: () => request<TripInvite[]>('GET', '/me/trip-invites'),
    acceptTripInvite: (id) => request<TripDetail>('POST', `/me/trip-invites/${encodeURIComponent(id)}/accept`),
    declineTripInvite: (id) => request<void>('POST', `/me/trip-invites/${encodeURIComponent(id)}/decline`),
    handOverOrganizer: (tripId, memberId) => request<TripDetail>('POST', `${trip(tripId)}/organizer`, { member_id: memberId }),
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
    listExpenses: (tripId) => request<ExpenseSummary[]>('GET', `${trip(tripId)}/expenses`),
    getExpense: (tripId, expenseId) => request<Expense>('GET', expense(tripId, expenseId)),
    createExpense: (tripId, input, idempotencyKey) => request<Expense>('POST', `${trip(tripId)}/expenses`, { ...input, idempotency_key: idempotencyKey }),
    updateExpense: (tripId, expenseId, input) => request<Expense>('PUT', expense(tripId, expenseId), input),
    confirmExpense: (tripId, expenseId) => request<Expense>('POST', `${expense(tripId, expenseId)}/confirm`),
    deleteExpense: (tripId, expenseId) => request<void>('DELETE', expense(tripId, expenseId)),
    getSettlement: (tripId) => request<Settlement>('GET', `${trip(tripId)}/settlement`),
    listTransfers: (tripId) => request<Transfer[]>('GET', `${trip(tripId)}/transfers`),
    recordTransfer: (tripId, transfer) => request<Transfer>('POST', `${trip(tripId)}/transfers`, transfer),
    deleteTransfer: (tripId, transferId) => request<void>('DELETE', `${trip(tripId)}/transfers/${encodeURIComponent(transferId)}`),
    searchPlaces: (tripId, query) => request<PlaceCandidate[]>('GET', `${trip(tripId)}/places/search?query=${encodeURIComponent(query)}`),
    listPlanItems: (tripId) => request<PlanItem[]>('GET', `${trip(tripId)}/plan-items`),
    createPlanItem: (tripId, input) => request<PlanItem>('POST', `${trip(tripId)}/plan-items`, input),
    updatePlanItem: (tripId, itemId, input) => request<PlanItem>('PUT', `${trip(tripId)}/plan-items/${encodeURIComponent(itemId)}`, input),
    deletePlanItem: (tripId, itemId) => request<void>('DELETE', `${trip(tripId)}/plan-items/${encodeURIComponent(itemId)}`),
    reorderPlanItems: (tripId, date, itemIds) => request<PlanItem[]>('PUT', `${trip(tripId)}/plan-items/order`, { date, item_ids: itemIds }),
    askSuggestions: (tripId, ask) => request<Suggestion>('POST', `${trip(tripId)}/suggestions`, ask),
    adoptSuggestions: (tripId, requestId, itemIds) => request<PlanItem[]>('POST', `${trip(tripId)}/suggestions/${encodeURIComponent(requestId)}/adopt`, { item_ids: itemIds }),
    listPhotos: (tripId) => request<PhotoList>('GET', `${trip(tripId)}/photos`),
    uploadPhoto: (tripId, photo) => {
      const form = new FormData();
      form.append('file', filePart(photo.uri, 'photo.jpg', 'image/jpeg') as unknown as Blob);
      if (photo.takenAt) form.append('taken_at', photo.takenAt);
      if (photo.placeId) form.append('place_id', photo.placeId);
      return request<Photo>('POST', `${trip(tripId)}/photos`, form);
    },
    deletePhoto: (tripId, photoId) => request<void>('DELETE', `${trip(tripId)}/photos/${encodeURIComponent(photoId)}`),
    linkPhotoPlace: (tripId, photoId, link) => request<Photo>('PUT', `${trip(tripId)}/photos/${encodeURIComponent(photoId)}/place`, link),
    getExpensePlaceCandidates: (tripId, query) => request<ExpensePlaceCandidate[]>('GET', `${trip(tripId)}/expenses/place-candidates?query=${encodeURIComponent(query)}`),
    getMapData: (tripId, { date, memberId } = {}) => {
      const params = [date && `date=${encodeURIComponent(date)}`, memberId && `member_id=${encodeURIComponent(memberId)}`].filter(Boolean).join('&');
      return request<MapData>('GET', `${trip(tripId)}/map${params ? `?${params}` : ''}`);
    },
    uploadReceipt: (tripId, receipt, idempotencyKey) => {
      const form = new FormData();
      form.append('file', filePart(receipt.uri, 'receipt.jpg', 'image/jpeg') as unknown as Blob);
      form.append('idempotency_key', idempotencyKey);
      return request<ReceiptUpload>('POST', `${trip(tripId)}/receipts`, form);
    },
  };
}
