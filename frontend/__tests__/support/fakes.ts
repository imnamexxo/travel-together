import { ApiError, type ApiClient, type Profile, type TripDetail, type TripSummary } from '@/api/client';
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

/** 메모리 안의 여행 목록으로 동작하는 API 클라이언트. 여행은 내가 멤버인 것만 넣는다. */
export function fakeApi(
  overrides: Partial<ApiClient> = {},
  { trips = [] as TripDetail[] } = {},
): jest.Mocked<ApiClient> {
  const profile: Profile = { id: '00000000-0000-0000-0000-000000000001', display_name: '민지' };
  const store = [...trips];
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
    ...overrides,
  } as jest.Mocked<ApiClient>;
}
