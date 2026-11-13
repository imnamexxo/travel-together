/**
 * 로그인·가입·세션 유지. 앱은 Supabase를 이 용도로만 쓴다(ADR-0002).
 * 화면은 이 인터페이스만 알고, 테스트에서는 가짜로 바꾼다.
 */

export type AuthSession = {
  userId: string;
  email: string | null;
};

export type SignUpResult = {
  /** Supabase에서 메일 인증을 켜 둔 경우, 인증 전까지 세션이 없다. */
  needsEmailConfirmation: boolean;
};

export type SocialProvider = 'kakao' | 'google';

/** signed_in: 세션이 생김 / cancelled: 사용자가 외부 로그인 페이지를 닫음(오류 아님). */
export type SocialSignInResult = 'signed_in' | 'cancelled';

/** 화면에 그대로 보여줄 수 있는 문구를 가진 인증 오류. */
export class AuthError extends Error {}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  /** 서버 호출에 붙일 최신 로그인 토큰. 로그인하지 않았으면 null. */
  getAccessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  /** 카카오·Google 계정으로 가입·로그인(Supabase OAuth, PKCE). 처음이면 서버가 공급자의 이름으로 프로필을 만든다. */
  signInWithProvider(provider: SocialProvider): Promise<SocialSignInResult>;
  signOut(): Promise<void>;
}
