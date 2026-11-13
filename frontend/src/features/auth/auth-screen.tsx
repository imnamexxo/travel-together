import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthError } from '@/auth/auth-service';
import { TravelColors as C } from '@/constants/theme';
import SocialLoginButtons from './social-login-buttons';
import { validateAuth, type AuthErrors } from './validation';


export default function AuthScreen({ signup = false }: { signup?: boolean }) {
  const { signIn, signUp } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);

  async function submit() {
    if (submitting) return;
    const nextErrors = validateAuth({ email, password, name, confirmation }, signup);
    setErrors(nextErrors);
    setFormError(null);
    setNotice(null);
    if (Object.keys(nextErrors).length) {
      if (signup && nextErrors.name) nameRef.current?.focus();
      else if (nextErrors.email) emailRef.current?.focus();
      else if (nextErrors.password) passwordRef.current?.focus();
      else confirmationRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      // 성공하면 세션이 생기고, 루트 내비게이터가 탭 화면으로 바꾼다.
      if (signup) {
        const result = await signUp(email.trim(), password, name.trim());
        if (result.needsEmailConfirmation) {
          setPassword(''); setConfirmation('');
          setNotice('인증 메일을 보냈어요. 메일함에서 인증한 뒤 로그인해주세요.');
        }
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  const eye = (visible: boolean) => ({ ios: visible ? 'eye.slash' as const : 'eye' as const, android: visible ? 'visibility_off' as const : 'visibility' as const, web: visible ? 'visibility_off' as const : 'visibility' as const });

  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {signup && <Pressable accessibilityRole="button" accessibilityLabel="로그인 화면으로 돌아가기" onPress={() => router.replace('/login')} style={s.back}><Text style={s.backText}>‹ 로그인</Text></Pressable>}
        <View style={[s.hero, signup && s.signupHero]}>
          <View style={s.icon}><SymbolView name={{ ios: 'suitcase.rolling', android: 'luggage', web: 'luggage' }} tintColor={C.primary} size={30} /></View>
          <Text style={s.brand}>TRAVEL TOGETHER</Text>
          <Text style={s.title}>{signup ? '회원가입' : '로그인'}</Text>
          <Text style={s.subtitle}>{signup ? '함께 떠날 여행을 준비해요.' : '함께 계획하고, 함께 기록하는 여행.'}</Text>
        </View>
        <View style={s.form}>
          {signup && <>
            <Text style={s.label}>이름</Text>
            <TextInput ref={nameRef} accessibilityLabel="이름" autoComplete="name" textContentType="name" value={name} onChangeText={setName} placeholder="여행에서 사용할 이름" placeholderTextColor={C.textMuted} style={[s.input, errors.name && s.invalid]} maxLength={30} returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
            {!!errors.name && <Text accessibilityRole="alert" style={s.error}>{errors.name}</Text>}
          </>}
          <Text style={s.label}>이메일</Text>
          <TextInput ref={emailRef} accessibilityLabel="이메일" value={email} onChangeText={setEmail} placeholder="example@email.com" placeholderTextColor={C.textMuted}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254}
            style={[s.input, errors.email && s.invalid]} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
          {!!errors.email && <Text accessibilityRole="alert" style={s.error}>{errors.email}</Text>}
          <Text style={s.label}>비밀번호</Text>
          <View style={[s.passwordField, errors.password && s.invalid]}>
            <TextInput ref={passwordRef} accessibilityLabel="비밀번호" value={password} onChangeText={setPassword} placeholder={signup ? '8자 이상 입력해주세요' : '비밀번호를 입력해주세요'} placeholderTextColor={C.textMuted}
              secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={signup ? 'new-password' : 'current-password'} textContentType={signup ? 'newPassword' : 'password'}
              style={s.passwordInput} returnKeyType={signup ? 'next' : 'go'} onSubmitEditing={() => signup ? confirmationRef.current?.focus() : submit()} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onPress={() => setShowPassword((current) => !current)} style={s.eye}><SymbolView name={eye(showPassword)} tintColor={C.textMuted} size={19} /></Pressable>
          </View>
          {!!errors.password && <Text accessibilityRole="alert" style={s.error}>{errors.password}</Text>}
          {signup && <>
            <Text style={s.label}>비밀번호 확인</Text>
            <View style={[s.passwordField, errors.confirmation && s.invalid]}>
              <TextInput ref={confirmationRef} accessibilityLabel="비밀번호 확인" value={confirmation} onChangeText={setConfirmation} placeholder="비밀번호를 한 번 더 입력해주세요" placeholderTextColor={C.textMuted}
                secureTextEntry={!showConfirmation} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" style={s.passwordInput} returnKeyType="go" onSubmitEditing={submit} />
              <Pressable accessibilityRole="button" accessibilityLabel={showConfirmation ? '확인 비밀번호 숨기기' : '확인 비밀번호 보기'} onPress={() => setShowConfirmation((current) => !current)} style={s.eye}><SymbolView name={eye(showConfirmation)} tintColor={C.textMuted} size={19} /></Pressable>
            </View>
            {!!errors.confirmation && <Text accessibilityRole="alert" style={s.error}>{errors.confirmation}</Text>}
          </>}
          {!signup && <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={s.forgot}><Text style={s.smallLink}>비밀번호를 잊으셨나요?</Text></Pressable>}
          {!!formError && <Text accessibilityRole="alert" style={s.error}>{formError}</Text>}
          {!!notice && <Text style={s.noticeText}>{notice}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting, busy: submitting }} disabled={submitting} onPress={submit} style={({ pressed }) => [s.primaryButton, (pressed || submitting) && s.pressed]}><Text style={s.primaryText}>{signup ? '회원가입' : '로그인'}</Text></Pressable>
          <SocialLoginButtons />
          <View style={s.switchRow}><Text style={s.switchText}>{signup ? '이미 계정이 있나요?' : '아직 계정이 없나요?'}</Text><Pressable accessibilityRole="button" onPress={() => signup ? router.replace('/login') : router.push('/signup')} style={s.linkButton}><Text style={s.link}>{signup ? '로그인' : '회원가입'}</Text></Pressable></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 24, width: '100%', maxWidth: 480, alignSelf: 'center' },
  hero: { paddingTop: 40, marginBottom: 28 }, signupHero: { paddingTop: 10, marginBottom: 18 },
  icon: { width: 60, height: 60, borderRadius: 20, backgroundColor: C.banner, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  brand: { fontSize: 10, fontWeight: '600', letterSpacing: 2.3, color: C.textMuted, marginBottom: 12 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1, color: C.primary }, subtitle: { fontSize: 14, lineHeight: 22, color: C.textSecondary, marginTop: 12 },
  form: { gap: 0 }, label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 18 },
  input: { minHeight: 54, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: 'transparent' },
  passwordField: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, minHeight: 54, borderWidth: 1, borderColor: 'transparent' },
  passwordInput: { flex: 1, minWidth: 0, paddingLeft: 16, paddingVertical: 14, minHeight: 52, fontSize: 16, color: C.text }, eye: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  invalid: { borderColor: C.error }, error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 7 },
  forgot: { alignSelf: 'flex-end', justifyContent: 'center', minHeight: 44 }, smallLink: { fontSize: 12, color: C.textSecondary },
  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 20 }, primaryText: { fontSize: 16, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.65 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }, switchText: { fontSize: 13, color: C.textSecondary }, linkButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 13, fontWeight: '600', color: C.accent },
  noticeText: { fontSize: 13, lineHeight: 20, color: C.textSecondary, marginTop: 7 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
});
