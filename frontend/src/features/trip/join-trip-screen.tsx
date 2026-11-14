import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useJoinTrip } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';

/** 대소문자와 공백은 무시한다. 0/O, 1/I는 코드에 없으므로 바꿔 끼우지 않고 서버 판정을 따른다. */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export default function JoinTripScreen() {
  const join = useJoinTrip();
  // 초대 링크로 왔으면 코드가 채워져 있고 바로 참여한다.
  const params = useLocalSearchParams<{ code?: string }>();
  const linked = normalizeInviteCode(params.code ?? '');
  const [code, setCode] = useState(linked);
  const [error, setError] = useState<string | null>(null);
  const triedLink = useRef(false);
  useEffect(() => {
    if (linked && !triedLink.current) { triedLink.current = true; void submit(linked); }
    // 링크 코드로 한 번만 시도한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  async function submit(value = code) {
    if (join.isPending) return;
    const normalized = normalizeInviteCode(value);
    setError(null);
    if (!normalized) { setError('초대 코드를 입력해주세요.'); return; }
    try {
      const trip = await join.mutateAsync(normalized);
      router.replace(`/trips/${trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '여행에 들어가지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="내 여행 목록으로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.back}><Text style={s.backText}>‹ 내 여행</Text></Pressable>
        <Text style={s.title}>초대 코드로 들어가기</Text>
        <Text style={s.subtitle}>{linked ? '초대 링크로 여행에 들어가는 중이에요.' : '총무에게 받은 8자리 코드를 입력하세요.'}</Text>
        <Text style={s.label}>초대 코드</Text>
        <TextInput accessibilityLabel="초대 코드" value={code} onChangeText={setCode} placeholder="예: ABCD2345" placeholderTextColor={C.textMuted}
          autoCapitalize="characters" autoCorrect={false} autoComplete="off" maxLength={16} returnKeyType="go" onSubmitEditing={() => submit()}
          style={[s.input, !!error && s.invalid]} />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: join.isPending, busy: join.isPending }} disabled={join.isPending} onPress={() => submit()} style={({ pressed }) => [s.primaryButton, (pressed || join.isPending) && s.pressed]}>
          <Text style={s.primaryText}>들어가기</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 28, letterSpacing: -1, fontWeight: '700', color: C.primary, marginTop: 12 },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 10, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 28 },
  input: { minHeight: 58, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, fontSize: 22, letterSpacing: 3, fontWeight: '600', color: C.text, borderWidth: 1, borderColor: 'transparent' },
  invalid: { borderColor: C.error }, error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 7 },
  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  primaryText: { fontSize: 16, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.65 },
});
