import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { AuthError, type SocialProvider } from '@/auth/auth-service';
import { TravelColors as C } from '@/constants/theme';

const LABELS: Record<SocialProvider, string> = { kakao: '카카오로 계속하기', google: 'Google로 계속하기' };

/**
 * 카카오·Google 로그인. 외부 로그인 페이지를 열고, 돌아오면 세션이 생겨 루트 내비게이터가 화면을 바꾼다.
 * 사용자가 페이지를 닫으면 아무 말 없이 그대로 두고 다시 누를 수 있다.
 */
export default function SocialLoginButtons() {
  const { signInWithProvider } = useAuth();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: SocialProvider) {
    if (busy) return;
    setBusy(provider);
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch (e) {
      setError(e instanceof AuthError ? e.message : '소셜 로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(null);
    }
  }

  return <View style={s.container}>
    <View style={s.dividerRow}><View style={s.line} /><Text style={s.dividerText}>또는</Text><View style={s.line} /></View>
    {(['kakao', 'google'] as const).map((provider) => <Pressable key={provider} accessibilityRole="button" accessibilityLabel={LABELS[provider]}
      accessibilityState={{ disabled: !!busy, busy: busy === provider }} disabled={!!busy} onPress={() => start(provider)}
      style={({ pressed }) => [s.button, provider === 'kakao' ? s.kakao : s.google, (pressed || (!!busy && busy !== provider)) && s.pressed]}>
      {busy === provider ? <ActivityIndicator color={provider === 'kakao' ? '#191919' : C.text} /> : <Text style={provider === 'kakao' ? s.kakaoText : s.googleText}>{LABELS[provider]}</Text>}
    </Pressable>)}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}

const s = StyleSheet.create({
  container: { gap: 10, marginTop: 18 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }, line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border }, dividerText: { fontSize: 12, color: C.textMuted },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  google: { backgroundColor: C.background, borderWidth: 1, borderColor: C.border },
  googleText: { fontSize: 14, fontWeight: '500', color: C.text },
  kakao: { backgroundColor: '#FEE500' },
  kakaoText: { fontSize: 14, fontWeight: '600', color: '#191919' },
  pressed: { opacity: 0.65 },
  error: { fontSize: 12, lineHeight: 19, color: C.error },
});
