import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import Pressable from '@/components/pressable';
import type { TravelPalette } from '@/constants/theme';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';

/**
 * 소셜 로그인 후 돌아오는 주소.
 * - 앱(traveltogether://auth-callback): 세션 처리는 소셜 로그인 버튼이 이미 했다. 원래 화면으로 돌려보낸다.
 * - 웹(https://…/auth-callback?code=…): 로그인 페이지에서 이 창으로 돌아왔다. code를 세션으로 바꾼 뒤 내 여행 목록으로 간다.
 */
export default function AuthCallback() {
  if (Platform.OS === 'web') return <WebCallback />;
  return <AppCallback />;
}

function AppCallback() {
  const { status } = useAuth();
  return <Redirect href={status === 'signedIn' ? '/' : '/login'} />;
}

function WebCallback() {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { status, completeSocialSignIn } = useAuth();
  const { code, error, error_description: description } = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [failure, setFailure] = useState<string | null>(error && error !== 'access_denied' ? (description || '소셜 로그인에 실패했습니다.') : null);
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current || status === 'loading') return;
    started.current = true;
    completeSocialSignIn(code).catch((e: Error) => setFailure(e.message));
  }, [code, status, completeSocialSignIn]);

  if (status === 'signedIn') return <Redirect href="/" />;
  // 동의 화면에서 취소했거나 code 없이 열렸으면 로그인 화면으로 돌아간다.
  if (!failure && (!code || error)) return <Redirect href="/login" />;
  return <View style={s.center}>
    {failure ? <>
      <Text accessibilityRole="alert" style={s.error}>{failure}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/login')} style={s.button}><Text style={s.link}>로그인 화면으로</Text></Pressable>
    </> : <><ActivityIndicator color={C.primary} /><Text style={s.text}>로그인하는 중이에요…</Text></>}
  </View>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: C.background },
  text: { fontSize: 14, color: C.textSecondary },
  error: { fontSize: 14, color: C.error, textAlign: 'center', lineHeight: 21 },
  button: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 14, fontWeight: '600', color: C.accent },
});
