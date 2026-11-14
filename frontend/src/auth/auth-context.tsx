import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AuthService, AuthSession, SignUpResult, SocialProvider, SocialSignInResult } from '@/auth/auth-service';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  signInWithProvider(provider: SocialProvider): Promise<SocialSignInResult>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(code: string, newPassword: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = service.onSessionChange((next) => {
      if (!active) return;
      setSession(next);
      setLoaded(true);
    });
    service.getSession().then((initial) => {
      if (!active) return;
      setSession(initial);
      setLoaded(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const signIn = useCallback((email: string, password: string) => service.signIn(email, password), [service]);
  const signUp = useCallback(
    (email: string, password: string, displayName: string) => service.signUp(email, password, displayName),
    [service],
  );
  const signInWithProvider = useCallback((provider: SocialProvider) => service.signInWithProvider(provider), [service]);
  const requestPasswordReset = useCallback((email: string) => service.requestPasswordReset(email), [service]);
  const resetPassword = useCallback((code: string, newPassword: string) => service.resetPassword(code, newPassword), [service]);
  const changePassword = useCallback((current: string, next: string) => service.changePassword(current, next), [service]);
  const signOut = useCallback(() => service.signOut(), [service]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: !loaded ? 'loading' : session ? 'signedIn' : 'signedOut',
      session,
      signIn,
      signUp,
      signInWithProvider,
      requestPasswordReset,
      resetPassword,
      changePassword,
      signOut,
    }),
    [loaded, session, signIn, signUp, signInWithProvider, requestPasswordReset, resetPassword, changePassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.');
  return value;
}
