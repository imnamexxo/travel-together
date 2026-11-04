import type { ApiClient, Profile } from '@/api/client';
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

export function fakeApi(overrides: Partial<ApiClient> = {}): jest.Mocked<ApiClient> {
  const profile: Profile = { id: '00000000-0000-0000-0000-000000000001', display_name: '민지' };
  return {
    getMe: jest.fn(async () => profile),
    ...overrides,
  } as jest.Mocked<ApiClient>;
}
