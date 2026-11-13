import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthError } from '@/auth/auth-service';
import { TravelColors as C } from '@/constants/theme';
import { validateAuth } from './validation';

function message(e: unknown) {
  return e instanceof AuthError ? e.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="로그인 화면으로 돌아가기" onPress={() => router.replace('/login')} style={s.back}><Text style={s.backText}>‹ 로그인</Text></Pressable>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

/** 비밀번호 찾기: 가입한 이메일로 재설정 링크를 보낸다. */
export function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const invalid = validateAuth({ email, password: 'x', name: '', confirmation: '' }, false).email;
    setError(invalid ?? null);
    if (invalid) return;
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return <Frame title="비밀번호 찾기" subtitle="가입한 이메일로 비밀번호를 다시 정하는 링크를 보내드려요.">
    <Text style={s.label}>이메일</Text>
    <TextInput accessibilityLabel="이메일" value={email} onChangeText={(v) => { setEmail(v); setSent(false); }} placeholder="example@email.com" placeholderTextColor={C.textMuted}
      autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" maxLength={254} style={[s.input, !!error && s.invalid]} returnKeyType="send" onSubmitEditing={submit} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {sent && <Text style={s.notice}>메일을 보냈어요. 이 휴대폰에서 메일을 열고 링크를 누르면 새 비밀번호를 정할 수 있어요. 메일이 안 보이면 스팸함도 확인해주세요.</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={submit} style={({ pressed }) => [s.primary, (pressed || busy) && s.pressed]}>
      <Text style={s.primaryText}>{sent ? '다시 보내기' : '재설정 링크 보내기'}</Text>
    </Pressable>
  </Frame>;
}

/** 메일의 링크로 열린다(traveltogether://reset-password?code=…). 새 비밀번호를 정하면 로그인된다. */
export function ResetPasswordScreen({ code, linkError }: { code: string | null; linkError: string | null }) {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [error, setError] = useState<string | null>(linkError || (code ? null : '재설정 링크가 올바르지 않아요. 비밀번호 찾기를 다시 해주세요.'));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !code) return;
    const next = validateAuth({ email: 'a@b.co', password, name: 'x', confirmation }, true);
    setErrors({ password: next.password, confirmation: next.confirmation });
    if (next.password || next.confirmation) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(code, password);
      router.replace('/');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return <Frame title="새 비밀번호" subtitle="앞으로 로그인할 때 쓸 비밀번호를 정해주세요.">
    <Text style={s.label}>새 비밀번호</Text>
    <TextInput accessibilityLabel="새 비밀번호" value={password} onChangeText={setPassword} placeholder="8자 이상 입력해주세요" placeholderTextColor={C.textMuted}
      secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={[s.input, !!errors.password && s.invalid]} />
    {!!errors.password && <Text accessibilityRole="alert" style={s.error}>{errors.password}</Text>}
    <Text style={s.label}>새 비밀번호 확인</Text>
    <TextInput accessibilityLabel="새 비밀번호 확인" value={confirmation} onChangeText={setConfirmation} placeholder="한 번 더 입력해주세요" placeholderTextColor={C.textMuted}
      secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={[s.input, !!errors.confirmation && s.invalid]} returnKeyType="go" onSubmitEditing={submit} />
    {!!errors.confirmation && <Text accessibilityRole="alert" style={s.error}>{errors.confirmation}</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !code, busy }} disabled={busy || !code} onPress={submit} style={({ pressed }) => [s.primary, (pressed || busy || !code) && s.pressed]}>
      <Text style={s.primaryText}>비밀번호 바꾸기</Text>
    </Pressable>
    {!code && <Pressable accessibilityRole="button" onPress={() => router.replace('/forgot-password')} style={s.linkButton}><Text style={s.link}>비밀번호 찾기 다시 하기</Text></Pressable>}
  </Frame>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 24, width: '100%', maxWidth: 480, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -1, color: C.primary, marginTop: 16 }, subtitle: { fontSize: 14, lineHeight: 22, color: C.textSecondary, marginTop: 10, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 18 },
  input: { minHeight: 54, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: 'transparent' },
  invalid: { borderColor: C.error }, error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 7 }, notice: { fontSize: 13, lineHeight: 20, color: C.textSecondary, marginTop: 10 },
  primary: { minHeight: 54, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 22 }, primaryText: { fontSize: 16, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.65 },
  linkButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'center', marginTop: 8 }, link: { fontSize: 13, fontWeight: '600', color: C.accent },
});
