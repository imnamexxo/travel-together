import type { AuthError as SupabaseAuthError, Session, SupabaseClient } from '@supabase/supabase-js';

import { AuthError, type AuthService, type AuthSession } from '@/auth/auth-service';
import { openLoginPage, parseRedirect, passwordResetUrl, redirectUrl } from '@/auth/oauth-redirect';

const MESSAGES: Record<string, string> = {
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
  user_already_exists: '이미 가입된 이메일입니다.',
  email_exists: '이미 가입된 이메일입니다.',
  weak_password: '비밀번호가 너무 짧거나 쉽습니다. 6자 이상으로 정해 주세요.',
  email_not_confirmed: '메일함에서 가입 인증을 먼저 완료해 주세요.',
  validation_failed: '이메일 형식을 확인해 주세요.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  over_email_send_rate_limit: '메일을 너무 자주 보냈습니다. 잠시 후 다시 시도해 주세요.',
  same_password: '이전과 다른 비밀번호를 정해 주세요.',
};

function toAuthError(error: SupabaseAuthError): AuthError {
  const message = (error.code && MESSAGES[error.code]) ?? '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  return new AuthError(message);
}

function toSession(session: Session | null): AuthSession | null {
  return session ? { userId: session.user.id, email: session.user.email ?? null, provider: session.user.app_metadata?.provider ?? 'email' } : null;
}

export function createSupabaseAuthService(supabase: SupabaseClient): AuthService {
  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },

    onSessionChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    async getAccessToken() {
      // getSession은 만료가 가까우면 토큰을 갱신해서 돌려준다.
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw toAuthError(error);
    },

    async signUp(email, password, displayName) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // 서버가 첫 프로필을 만들 때 이 값을 표시 이름으로 쓴다.
        options: { data: { display_name: displayName } },
      });
      if (error) throw toAuthError(error);
      return { needsEmailConfirmation: data.session === null };
    },

    async signInWithProvider(provider) {
      const returnUrl = redirectUrl();
      // 브라우저는 앱이 직접 연다(skipBrowserRedirect). PKCE라 돌아온 주소에는 일회용 code만 온다.
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl, skipBrowserRedirect: true } });
      if (error || !data.url) throw new AuthError('로그인 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
      const result = await openLoginPage(data.url, returnUrl);
      if (result.type === 'cancel') return 'cancelled';
      const params = parseRedirect(result.url);
      if (params.error) {
        // 동의 화면에서 취소해도 error=access_denied로 돌아온다. 오류로 보이지 않게 취소로 처리한다.
        if (params.error === 'access_denied') return 'cancelled';
        throw new AuthError(params.error_description || '소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      if (!params.code) throw new AuthError('소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      const exchanged = await supabase.auth.exchangeCodeForSession(params.code);
      if (exchanged.error) throw toAuthError(exchanged.error);
      return 'signed_in';
    },

    async requestPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: passwordResetUrl() });
      if (error) throw toAuthError(error);
    },

    async resetPassword(code, newPassword) {
      // PKCE라 재설정을 요청한 이 휴대폰에서만 code를 세션으로 바꿀 수 있다.
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw new AuthError('재설정 링크가 만료되었거나 이미 사용되었어요. 비밀번호를 요청한 휴대폰에서 비밀번호 찾기를 다시 해 주세요.');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw toAuthError(error);
    },

    async changePassword(currentPassword, newPassword) {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new AuthError('이메일로 가입한 계정만 비밀번호를 바꿀 수 있어요.');
      // 다른 사람이 열어 둔 휴대폰으로 비밀번호를 바꾸지 못하게 현재 비밀번호를 먼저 확인한다.
      const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (check.error) throw new AuthError('현재 비밀번호가 맞지 않습니다.');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw toAuthError(error);
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      // 탈퇴로 계정이 이미 지워졌으면 서버 로그아웃은 실패한다. 이 휴대폰의 세션만이라도 지운다.
      if (error) await supabase.auth.signOut({ scope: 'local' });
    },
  };
}
