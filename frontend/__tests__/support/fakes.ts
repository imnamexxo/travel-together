import { ApiError, type ApiClient, type Member, type Profile, type TripDetail, type TripSummary } from '@/api/client';
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
};

/** 메모리 안의 여행 목록으로 동작하는 API 클라이언트. */
export function fakeApi(
  overrides: Partial<ApiClient> = {},
  { trips = [], members = {}, joinable = {} }: FakeApiOptions = {},
): jest.Mocked<ApiClient> {
  const profile: Profile = { id: '00000000-0000-0000-0000-000000000001', display_name: '민지' };
  const store = [...trips];
  const memberStore: Record<string, Member[]> = Object.fromEntries(Object.entries(members).map(([id, list]) => [id, [...list]]));
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
    listMembers: jest.fn(async (tripId) => memberStore[tripId] ?? [member()]),
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
    ...overrides,
  } as jest.Mocked<ApiClient>;
}
