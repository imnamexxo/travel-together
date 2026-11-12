import { ApiError, type ApiClient, type Expense, type ExpenseSummary, type Member, type PlaceCandidate, type PlanItem, type Settlement, type Transfer, type Profile, type TripDetail, type TripSummary } from '@/api/client';
import { AuthError, type AuthService, type AuthSession, type SignUpResult } from '@/auth/auth-service';

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
};

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
    total_amount: 30000, default_sharer_ids: ['member-1'], items: [], ...overrides,
  };
}

/** 메모리 안의 여행 목록으로 동작하는 API 클라이언트. */
export function fakeApi(
  overrides: Partial<ApiClient> = {},
  { trips = [], members = {}, joinable = {}, expenses = {}, settlements = {}, transfers = {}, planItems = {}, placeCandidates = [] }: FakeApiOptions = {},
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
  });
  const keys = new Map<string, string>();
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
      const updated = fromInput(expenseId, input);
      list[list.findIndex((e) => e.id === expenseId)] = updated;
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
    reorderPlanItems: jest.fn(async (tripId, date, itemIds) => {
      for (const item of plansOf(tripId)) if (item.date === date) item.position = itemIds.indexOf(item.id);
      return plansOf(tripId).filter((i) => i.date === date).sort((a, b) => a.position - b.position);
    }),
    ...overrides,
  } as jest.Mocked<ApiClient>;
}
