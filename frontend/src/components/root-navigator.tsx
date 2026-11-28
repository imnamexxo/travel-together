import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useAuth } from '@/auth/auth-context';

/** 로그인 여부에 따라 로그인 화면 또는 탭 화면만 열어 둔다. */
export function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 첫 주소는 로그인 여부와 관계없이 열린다: 로그인 전에는 소개 페이지(웹)나 로그인 화면(앱)을 보여 준다. */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="trips/new" />
        <Stack.Screen name="trips/join" />
        <Stack.Screen name="trips/[tripId]" />
        <Stack.Screen name="account" />
        <Stack.Screen name="account-delete" />
        <Stack.Screen name="friends" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}
