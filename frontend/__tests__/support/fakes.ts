import { ApiError, type ApiClient, type Expense, type ExpensePlaceCandidate, type ExpenseSummary, type Member, type Photo, type Place, type PlaceCandidate, type PlanItem, type Settlement, type Suggestion, type Transfer, type Profile, type TripDetail, type TripSummary } from '@/api/client';
import { AuthError, type AuthService, type AuthSession, type SignUpResult, type SocialProvider, type SocialSignInResult } from '@/auth/auth-service';
import { toKstParts } from '@/features/expenses/expense-form';

type FakeUser = { password: string; displayName: string };

/** 메모리 안에서 동작하는 인증 서비스. */
export class FakeAuthService implements AuthService {
  readonly signUps: { email: string; displayName: string }[] = [];
  private session: AuthSession | null = null;
  private readonly users = new Map<string, FakeUser>();
  private readonly listeners = new Set<(session: AuthSession | null) => void>();

  addUser(email: string, password: string, displayName = '민지') {
    this.users.set(email, { password, displayName });
  }

  signInAs(email: string) {
    this.session = { userId: email, email };
  }

  isSignedIn() {
    return this.session !== null;
  }

  async getSession() {
    return this.session;
  }

  onSessionChange(listener: (session: AuthSession | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getAccessToken() {
    return this.session ? 'fake-token' : null;
  }

  async signIn(email: string, password: string) {
    if (this.users.get(email)?.password !== password) {
      throw new AuthError('이메일 또는 비밀번호가 맞지 않습니다.');
    }
    this.setSession({ userId: email, email });
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    this.signUps.push({ email, displayName });
    this.users.set(email, { password, displayName });
    this.setSession({ userId: email, email });
    return { needsEmailConfirmation: false };
  }

  readonly socialSignIns: SocialProvider[] = [];
  /** 다음 소셜 로그인 결과. 'signed_in'이면 그 공급자 계정으로 로그인된다. */
  socialResult: SocialSignInResult | AuthError = 'signed_in';

  async signInWithProvider(provider: SocialProvider): Promise<SocialSignInResult> {
    this.socialSignIns.push(provider);
    if (this.socialResult instanceof AuthError) throw this.socialResult;
    if (this.socialResult === 'signed_in') this.setSession({ userId: `${provider}-user`, email: null });
    return this.socialResult;
  }

  async signOut() {
    this.setSession(null);
  }

  private setSession(session: AuthSession | null) {
    this.session = session;
    this.listeners.forEach((listener) => listener(session));
  }
}

export function tripDetail(overrides: Partial<TripDetail> = {}): TripDetail {
  return {
    id: 'trip-jeju',
    name: '제주 여행',
    start_date: '2026-11-12',
    end_date: '2026-11-14',
    member_count: 1,
    me: { member_id: 'member-1', join_order: 1, is_organizer: true },
    ...overrides,
  };
}

export function member(overrides: Partial<Member> = {}): Member {
  return { member_id: 'member-1', display_name: '민지', join_order: 1, is_organizer: true, is_me: true, ...overrides };
}

type FakeApiOptions = {
  /** 내가 멤버인 여행 */
  trips?: TripDetail[];
  /** 여행 id → 멤버 목록. 없으면 나 혼자다. */
  members?: Record<string, Member[]>;
  /** 초대 코드 → 들어갈 수 있는(아직 멤버가 아닌) 여행 */
  joinable?: Record<string, TripDetail>;
  /** 여행 id → 지출 */
  expenses?: Record<string, Expense[]>;
  /** 여행 id → 서버가 계산했다고 치는 정산 결과. 없으면 지출이 없는 정산이다. */
  settlements?: Record<string, Settlement>;
  /** 여행 id → 기록된 송금 */
  transfers?: Record<string, Transfer[]>;
  /** 여행 id → 일정 항목 */
  planItems?: Record<string, PlanItem[]>;
  /** 카카오 장소 검색 결과로 쓸 후보. 이름에 검색어가 들어간 것만 돌려준다. */
  placeCandidates?: PlaceCandidate[];
  /** 추천 일정 요청에 돌려줄 결과 */
  suggestion?: Suggestion;
  /** 여행 id → 사진 */
  photos?: Record<string, Photo[]>;
  photoLimit?: number;
  /** 지출 장소 후보(검색어가 이름에 들어간 것만) */
  expensePlaceCandidates?: ExpensePlaceCandidate[];
  /** 영수증 분석 결과로 돌려줄 지출 초안 내용과 분석 상태 */
  receipt?: { expense: Partial<Expense>; analysis: 'read' | 'reused' | 'failed' };
};

export function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1', url: 'https://storage.test/photo-1.jpg', taken_at: '2026-11-12T06:30:00Z', uploaded_at: '2026-11-12T07:00:00Z',
    uploader_member_id: 'member-1', uploader_name: '민지', place: null, link_type: null, ...overrides,
  };
}

export function place(overrides: Partial<NonNullable<PlanItem['place']>> = {}): NonNullable<PlanItem['place']> {
  return { id: 'place-1', kakao_place_id: '111', name: '동문시장', address: '제주시 일도일동', road_address: '제주시 관덕로14길 20', latitude: 33.511, longitude: 126.526, category: null, ...overrides };
}

export function planItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'plan-1', date: '2026-11-12', position: 0, time: null, title: '일정', memo: '', estimated_cost: null, place: null,
    created_by_member_id: 'member-1', created_by_name: '민지', ...overrides,
  };
}

export function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1', status: 'draft', payer_member_id: 'member-1', paid_at: '2026-11-12T06:30:00Z', merchant_name: '편의점',
    total_amount: 30000, default_sharer_ids: ['member-1'], items: [], receipt_url: null, has_receipt: false, place: null, ...overrides,
  };
}

/** 메모리 안의 여행 목록으로 동작하는 API 클라이언트. */
export function fakeApi(
  overrides: Partial<ApiClient> = {},
  { trips = [], members = {}, joinable = {}, expenses = {}, settlements = {}, transfers = {}, planItems = {}, placeCandidates = [], suggestion, photos = {}, photoLimit = 200, receipt, expensePlaceCandidates = [] }: FakeApiOptions = {},
): jest.Mocked<ApiClient> {
  const profile: Profile = { id: '00000000-0000-0000-0000-000000000001', display_name: '민지' };
  const store = [...trips];
  const memberStore: Record<string, Member[]> = Object.fromEntries(Object.entries(members).map(([id, list]) => [id, [...list]]));
  const membersOf = (tripId: string) => memberStore[tripId] ?? [member()];
  const expenseStore: Record<string, Expense[]> = Object.fromEntries(Object.entries(expenses).map(([id, list]) => [id, [...list]]));
  const expensesOf = (tripId: string) => (expenseStore[tripId] ??= []);
  const findExpense = (tripId: string, expenseId: string) => {
    const found = expensesOf(tripId).find((e) => e.id === expenseId);
    if (!found) throw new ApiError(404, 'expense_not_found', '지출을 찾을 수 없습니다.');
    return found;
  };
  const summaryOf = (tripId: string, e: Expense): ExpenseSummary => ({
    id: e.id, status: e.status, merchant_name: e.merchant_name, paid_at: e.paid_at, total_amount: e.total_amount,
    payer_name: membersOf(tripId).find((m) => m.member_id === e.payer_member_id)?.display_name ?? null, item_count: e.items.length,
    place: e.place ?? null,
  });
  const keys = new Map<string, string>();
  const photoStore: Record<string, Photo[]> = Object.fromEntries(Object.entries(photos).map(([id, list]) => [id, [...list]]));
  const photosOf = (tripId: string) => (photoStore[tripId] ??= []);
  const planStore: Record<string, PlanItem[]> = Object.fromEntries(Object.entries(planItems).map(([id, list]) => [id, [...list]]));
  const plansOf = (tripId: string) => (planStore[tripId] ??= []);
  const planFrom = (tripId: string, id: string, input: Parameters<ApiClient['createPlanItem']>[1], base?: PlanItem): PlanItem => {
    const candidate = input.place ? placeCandidates.find((c) => c.kakao_place_id === input.place!.kakao_place_id) : undefined;
    return {
      ...(base ?? planItem({ id, created_by_member_id: trips.find((t) => t.id === tripId)?.me.member_id ?? 'member-1' })),
      id, date: input.date, time: input.time ? `${input.time}:00` : null, title: input.title, memo: input.memo ?? '', estimated_cost: input.estimated_cost ?? null,
      place: input.place ? place({ id: `place-${input.place.kakao_place_id}`, kakao_place_id: input.place.kakao_place_id, name: candidate?.name ?? input.place.name }) : null,
      position: base?.position ?? plansOf(tripId).filter((i) => i.date === input.date).length,
    };
  };
  const transferStore: Record<string, Transfer[]> = Object.fromEntries(Object.entries(transfers).map(([id, list]) => [id, [...list]]));
  const transfersOf = (tripId: string) => (transferStore[tripId] ??= []);
  const fromInput = (id: string, input: Parameters<ApiClient['updateExpense']>[2]): Expense => ({
    id, status: 'draft', payer_member_id: input.payer_member_id ?? null, paid_at: input.paid_at ?? null,
    merchant_name: input.merchant_name ?? null, total_amount: input.total_amount ?? null, default_sharer_ids: input.default_sharer_ids ?? [],
    items: (input.items ?? []).map((item, i) => ({ id: `${id}-item-${i}`, name: item.name, quantity: item.quantity ?? null, amount: item.amount ?? null, sharer_ids: item.sharer_ids ?? [] })),
    receipt_url: null, has_receipt: false,
    place: input.place ? place({ id: `place-${input.place.kakao_place_id}`, kakao_place_id: input.place.kakao_place_id, name: input.place.name }) : null,
  });
  const dropTrip = (tripId: string) => {
    const index = store.findIndex((t) => t.id === tripId);
    if (index >= 0) store.splice(index, 1);
  };
  const codes = new Map<string, string>();
  let issued = 0;
  const codeOf = (tripId: string) => {
    if (!codes.has(tripId)) codes.set(tripId, `CODE${String(++issued).padStart(4, '2')}`);
    return codes.get(tripId)!;
  };
  const summary = (trip: TripDetail): TripSummary => ({
    id: trip.id,
    name: trip.name,
    start_date: trip.start_date,
    end_date: trip.end_date,
    member_count: trip.member_count,
    is_organizer: trip.me.is_organizer,
  });
  return {
    getMe: jest.fn(async () => profile),
    listTrips: jest.fn(async () => store.map(summary)),
    createTrip: jest.fn(async (input) => {
      const trip = tripDetail({ ...input, id: `trip-${store.length + 1}` });
      store.unshift(trip);
      return trip;
    }),
    getTrip: jest.fn(async (tripId) => {
      const trip = store.find((t) => t.id === tripId);
      if (!trip) throw new ApiError(404, 'trip_not_found', '여행을 찾을 수 없습니다.');
      return trip;
    }),
    listMembers: jest.fn(async (tripId) => membersOf(tripId)),
    getInviteCode: jest.fn(async (tripId) => ({ code: codeOf(tripId) })),
    reissueInviteCode: jest.fn(async (tripId) => {
      codes.delete(tripId);
      return { code: codeOf(tripId) };
    }),
    joinTrip: jest.fn(async (code) => {
      const trip = joinable[code];
      if (!trip) throw new ApiError(404, 'invalid_invite_code', '초대 코드가 맞지 않습니다. 총무에게 새 코드를 받아 주세요.');
      if (!store.some((t) => t.id === trip.id)) store.unshift(trip);
      return trip;
    }),
    updateTrip: jest.fn(async (tripId, changes) => {
      const index = store.findIndex((t) => t.id === tripId);
      const updated = { ...store[index], ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v != null)) };
      store[index] = updated;
      return updated;
    }),
    deleteTrip: jest.fn(async (tripId) => dropTrip(tripId)),
    leaveTrip: jest.fn(async (tripId) => dropTrip(tripId)),
    removeMember: jest.fn(async (tripId, memberId) => {
      memberStore[tripId] = (memberStore[tripId] ?? []).filter((m) => m.member_id !== memberId);
    }),
    listExpenses: jest.fn(async (tripId) => expensesOf(tripId).map((e) => summaryOf(tripId, e))),
    getExpense: jest.fn(async (tripId, expenseId) => findExpense(tripId, expenseId)),
    createExpense: jest.fn(async (tripId, input, idempotencyKey) => {
      const existing = keys.get(idempotencyKey);
      if (existing) return findExpense(tripId, existing);
      const created = fromInput(`expense-${expensesOf(tripId).length + 1}`, input);
      expensesOf(tripId).unshift(created);
      keys.set(idempotencyKey, created.id);
      return created;
    }),
    updateExpense: jest.fn(async (tripId, expenseId, input) => {
      const list = expensesOf(tripId);
      const index = list.findIndex((e) => e.id === expenseId);
      // 영수증은 지출을 고쳐도 그대로 남는다.
      const updated = { ...fromInput(expenseId, input), has_receipt: list[index].has_receipt, receipt_url: list[index].receipt_url };
      list[index] = updated;
      return updated;
    }),
    confirmExpense: jest.fn(async (tripId, expenseId) => {
      const found = findExpense(tripId, expenseId);
      found.status = 'confirmed';
      return found;
    }),
    deleteExpense: jest.fn(async (tripId, expenseId) => {
      expenseStore[tripId] = expensesOf(tripId).filter((e) => e.id !== expenseId);
    }),
    getSettlement: jest.fn(async (tripId) => settlements[tripId] ?? {
      confirmed_total: 0, confirmed_count: 0, is_settled: true, suggested_transfers: [], shares: [],
      members: membersOf(tripId).map((m) => ({ member_id: m.member_id, display_name: m.display_name, join_order: m.join_order, paid: 0, owed: 0, sent: 0, received: 0, balance: 0 })),
    }),
    listTransfers: jest.fn(async (tripId) => transfersOf(tripId)),
    recordTransfer: jest.fn(async (tripId, input) => {
      const name = (id: string) => membersOf(tripId).find((m) => m.member_id === id)?.display_name ?? '?';
      const recorded: Transfer = {
        id: `transfer-${transfersOf(tripId).length + 1}`, from_member_id: input.from_member_id, from_name: name(input.from_member_id),
        to_member_id: input.to_member_id, to_name: name(input.to_member_id), amount: input.amount, recorded_at: '2026-11-14T03:00:00Z',
      };
      transfersOf(tripId).unshift(recorded);
      return recorded;
    }),
    deleteTransfer: jest.fn(async (tripId, transferId) => {
      transferStore[tripId] = transfersOf(tripId).filter((t) => t.id !== transferId);
    }),
    searchPlaces: jest.fn(async (_tripId, query) => placeCandidates.filter((c) => c.name.includes(query))),
    listPlanItems: jest.fn(async (tripId) => [...plansOf(tripId)]),
    createPlanItem: jest.fn(async (tripId, input) => {
      const created = planFrom(tripId, `plan-${plansOf(tripId).length + 1}`, input);
      plansOf(tripId).push(created);
      return created;
    }),
    updatePlanItem: jest.fn(async (tripId, itemId, input) => {
      const list = plansOf(tripId);
      const index = list.findIndex((i) => i.id === itemId);
      list[index] = planFrom(tripId, itemId, input, list[index]);
      return list[index];
    }),
    deletePlanItem: jest.fn(async (tripId, itemId) => {
      planStore[tripId] = plansOf(tripId).filter((i) => i.id !== itemId);
    }),
    askSuggestions: jest.fn(async () => {
      if (!suggestion) throw new ApiError(502, 'ai_unavailable', '추천 서버에 연결하지 못했습니다.');
      return suggestion;
    }),
    adoptSuggestions: jest.fn(async (tripId, _requestId, itemIds) => {
      const chosen = (suggestion?.items ?? []).filter((item) => itemIds.includes(item.id));
      const created = chosen.map((item, n) => planItem({
        id: `adopted-${n + 1}`, date: item.date, title: item.place_name, memo: item.description,
        position: plansOf(tripId).filter((i) => i.date === item.date).length + n,
        place: item.place ? place({ id: `place-${item.place.kakao_place_id}`, kakao_place_id: item.place.kakao_place_id, name: item.place.name }) : null,
      }));
      plansOf(tripId).push(...created);
      return created;
    }),
    listPhotos: jest.fn(async (tripId) => ({ photos: [...photosOf(tripId)], count: photosOf(tripId).length, limit: photoLimit })),
    uploadPhoto: jest.fn(async (tripId, upload) => {
      const me = trips.find((t) => t.id === tripId)?.me.member_id ?? 'member-1';
      const linked = upload.placeId ? plansOf(tripId).find((i) => i.place?.id === upload.placeId)?.place ?? null : null;
      const created = photo({ id: `uploaded-${photosOf(tripId).length + 1}`, url: upload.uri, taken_at: upload.takenAt, uploader_member_id: me, uploader_name: profile.display_name, place: linked, link_type: linked ? 'auto' : null });
      photosOf(tripId).push(created);
      return created;
    }),
    deletePhoto: jest.fn(async (tripId, photoId) => {
      photoStore[tripId] = photosOf(tripId).filter((p) => p.id !== photoId);
    }),
    getExpensePlaceCandidates: jest.fn(async (_tripId, query) => expensePlaceCandidates.filter((c) => c.name.includes(query))),
    // 서버의 지도 데이터와 같은 규칙(사진·확정 지출이 있으면 들른 곳, 날짜·멤버 필터).
    getMapData: jest.fn(async (tripId, { date, memberId } = {}) => {
      const day = (iso: string | null | undefined) => (iso ? toKstParts(iso).date : null);
      const plans = plansOf(tripId).filter((i) => !date || i.date === date).sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
      const shots = photosOf(tripId).filter((ph) => (!date || day(ph.taken_at) === date) && (!memberId || ph.uploader_member_id === memberId));
      const spent = expensesOf(tripId).filter((e) => e.status === 'confirmed' && (!date || day(e.paid_at) === date) && (!memberId || e.payer_member_id === memberId));
      const byId = new Map<string, Place>();
      for (const candidate of [...plans.map((i) => i.place), ...shots.map((ph) => ph.place), ...spent.map((e) => e.place)]) {
        if (candidate && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
      }
      const places = [...byId.values()].map((pl) => {
        const photosHere = shots.filter((ph) => ph.place?.id === pl.id);
        const spentHere = spent.filter((e) => e.place?.id === pl.id);
        const dates = [...new Set([...photosHere.map((ph) => day(ph.taken_at)), ...spentHere.map((e) => day(e.paid_at))].filter((d): d is string => !!d))].sort();
        return {
          place: pl, visited: photosHere.length > 0 || spentHere.length > 0, visited_dates: dates,
          plan_items: plans.filter((i) => i.place?.id === pl.id),
          photos: photosHere.map((ph) => ({ id: ph.id, url: ph.url, taken_at: ph.taken_at, uploader_member_id: ph.uploader_member_id })),
          expense_count: spentHere.length, expense_total: spentHere.reduce((n, e) => n + (e.total_amount ?? 0), 0),
        };
      }).filter((entry) => !memberId || entry.photos.length > 0 || entry.expense_count > 0);
      return { places, unlinked_photo_count: shots.filter((ph) => !ph.place).length };
    }),
    uploadReceipt: jest.fn(async (tripId, upload, idempotencyKey) => {
      const existing = keys.get(idempotencyKey);
      if (existing) return { expense: findExpense(tripId, existing), analysis: 'reused' as const };
      const created = expense({ id: `expense-${expensesOf(tripId).length + 1}`, status: 'draft', has_receipt: true, receipt_url: `https://storage.test/receipt-of-${upload.uri}`, ...receipt?.expense });
      expensesOf(tripId).unshift(created);
      keys.set(idempotencyKey, created.id);
      return { expense: created, analysis: receipt?.analysis ?? 'read' };
    }),
    linkPhotoPlace: jest.fn(async (tripId, photoId, link) => {
      const target = photosOf(tripId).find((p) => p.id === photoId)!;
      const known = plansOf(tripId).map((i) => i.place).filter((p) => p !== null);
      const candidate = link.kakao_place ? placeCandidates.find((c) => c.kakao_place_id === link.kakao_place!.kakao_place_id) : undefined;
      target.place = link.place_id ? known.find((p) => p.id === link.place_id) ?? null
        : candidate ? place({ id: `place-${candidate.kakao_place_id}`, kakao_place_id: candidate.kakao_place_id, name: candidate.name }) : null;
      target.link_type = target.place ? 'manual' : null;
      return { ...target };
    }),
    reorderPlanItems: jest.fn(async (tripId, date, itemIds) => {
      for (const item of plansOf(tripId)) if (item.date === date) item.position = itemIds.indexOf(item.id);
      return plansOf(tripId).filter((i) => i.date === date).sort((a, b) => a.position - b.position);
    }),
    ...overrides,
  } as jest.Mocked<ApiClient>;
}
