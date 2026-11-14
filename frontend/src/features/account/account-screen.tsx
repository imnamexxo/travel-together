import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, type TripSummary } from '@/api/client';
import { useDeleteAnyTrip, useMe, useTrips, useUpdateMe } from '@/api/queries';
import { useAuth } from '@/auth/auth-context';
import { TravelColors as C } from '@/constants/theme';
import { formatPeriod } from '@/features/trip/trip-dates';
import { goBack } from '@/navigation';

const PROVIDER_LABEL: Record<string, string> = { email: '이메일', kakao: '카카오', google: 'Google' };

function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError ? [e.message, ...e.details.map((d) => d.message)].join('\n') : e instanceof Error ? e.message : fallback;
}

/** 계정 관리: 표시 이름, 로그인 정보·비밀번호, 내가 만든 여행, 로그아웃·회원 탈퇴. */
export default function AccountScreen() {
  const { signOut } = useAuth();
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="내 여행으로 돌아가기" onPress={() => goBack('/')} style={s.back}><Text style={s.backText}>‹ 내 여행</Text></Pressable>
        <Text style={s.title}>계정 관리</Text>
        <DisplayName />
        <LoginInfo />
        <View style={s.section}>
          <Text style={s.heading}>친구</Text>
          <Text style={s.hint}>친구를 맺어 두면 여행에 버튼 한 번으로 초대할 수 있어요.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="친구 관리" onPress={() => router.push('/friends')} style={({ pressed }) => [s.outlineButton, pressed && s.pressed]}><Text style={s.outlineText}>친구 관리 ›</Text></Pressable>
        </View>
        <MyTrips />
        <View style={s.section}>
          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [s.outlineButton, pressed && s.pressed]}><Text style={s.outlineText}>로그아웃</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/account-delete')} style={s.textButton}><Text style={s.mutedLink}>회원 탈퇴</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function DisplayName() {
  const me = useMe();
  const update = useUpdateMe();
  const [name, setName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const value = name ?? me.data?.display_name ?? '';

  async function save() {
    if (!value.trim()) { setMessage({ text: '이름을 입력해 주세요.', error: true }); return; }
    setMessage(null);
    try {
      await update.mutateAsync(value.trim());
      setName(null);
      setMessage({ text: '이름을 바꿨어요.', error: false });
    } catch (e) {
      setMessage({ text: errorText(e, '이름을 바꾸지 못했어요.'), error: true });
    }
  }

  return <View style={s.section}>
    <Text style={s.heading}>표시 이름</Text>
    <Text style={s.hint}>모든 여행의 멤버 목록과 정산에 이 이름이 보여요.</Text>
    <TextInput accessibilityLabel="표시 이름" value={value} onChangeText={setName} maxLength={30} placeholder="이름" placeholderTextColor={C.textMuted} style={s.input} />
    {!!message && <Text accessibilityRole={message.error ? 'alert' : undefined} style={message.error ? s.error : s.notice}>{message.text}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="이름 저장" disabled={update.isPending} onPress={save} style={({ pressed }) => [s.primaryButton, (pressed || update.isPending) && s.pressed]}><Text style={s.primaryText}>저장</Text></Pressable>
  </View>;
}

function LoginInfo() {
  const { session, changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const provider = session?.provider ?? 'email';
  const isEmail = provider === 'email';

  async function submit() {
    if (next.length < 6) { setMessage({ text: '새 비밀번호는 6자 이상으로 정해 주세요.', error: true }); return; }
    if (next !== again) { setMessage({ text: '새 비밀번호가 서로 달라요.', error: true }); return; }
    setBusy(true);
    setMessage(null);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setAgain(''); setOpen(false);
      setMessage({ text: '비밀번호를 바꿨어요.', error: false });
    } catch (e) {
      setMessage({ text: errorText(e, '비밀번호를 바꾸지 못했어요.'), error: true });
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void) =>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" placeholder={label} placeholderTextColor={C.textMuted} style={[s.input, s.stacked]} />;

  return <View style={s.section}>
    <Text style={s.heading}>로그인 정보</Text>
    <View style={s.infoRow}><Text style={s.infoLabel}>가입 방법</Text><Text style={s.infoValue}>{PROVIDER_LABEL[provider] ?? provider}</Text></View>
    {!!session?.email && <View style={s.infoRow}><Text style={s.infoLabel}>이메일</Text><Text style={s.infoValue}>{session.email}</Text></View>}
    {!isEmail && <Text style={s.hint}>{PROVIDER_LABEL[provider] ?? provider} 계정으로 로그인해요. 비밀번호는 {PROVIDER_LABEL[provider] ?? provider}에서 관리해요.</Text>}
    {isEmail && !open && <Pressable accessibilityRole="button" onPress={() => { setOpen(true); setMessage(null); }} style={({ pressed }) => [s.outlineButton, pressed && s.pressed]}><Text style={s.outlineText}>비밀번호 변경</Text></Pressable>}
    {isEmail && open && <>
      {field('현재 비밀번호', current, setCurrent)}
      {field('새 비밀번호', next, setNext)}
      {field('새 비밀번호 확인', again, setAgain)}
      <Pressable accessibilityRole="button" accessibilityLabel="비밀번호 바꾸기" disabled={busy} onPress={submit} style={({ pressed }) => [s.primaryButton, (pressed || busy) && s.pressed]}><Text style={s.primaryText}>바꾸기</Text></Pressable>
    </>}
    {!!message && <Text accessibilityRole={message.error ? 'alert' : undefined} style={message.error ? s.error : s.notice}>{message.text}</Text>}
  </View>;
}

function MyTrips() {
  const trips = useTrips();
  const remove = useDeleteAnyTrip();
  const [error, setError] = useState<string | null>(null);
  const mine = (trips.data ?? []).filter((t) => t.is_organizer);

  function confirm(trip: TripSummary) {
    Alert.alert(`"${trip.name}"을(를) 삭제할까요?`, '모든 멤버의 일정·사진·지출·송금 기록이 함께 지워지고 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          setError(null);
          try {
            await remove.mutateAsync(trip.id);
          } catch (e) {
            setError(errorText(e, '삭제하지 못했어요. 잠시 후 다시 시도해주세요.'));
          }
        },
      },
    ]);
  }

  return <View style={s.section}>
    <Text style={s.heading}>내가 만든 여행</Text>
    <Text style={s.hint}>{mine.length ? '총무인 여행이에요. 삭제하면 모든 멤버에게서 사라져요.' : '내가 총무인 여행이 없어요.'}</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {mine.map((t) => <View key={t.id} style={s.tripRow}>
      <View style={s.tripCopy}><Text style={s.tripName}>{t.name}</Text><Text style={s.tripMeta}>{formatPeriod(t.start_date, t.end_date)} · {t.member_count}명</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t.name} 삭제`} disabled={remove.isPending} onPress={() => confirm(t)} style={({ pressed }) => [s.deleteChip, pressed && s.pressed]}><Text style={s.deleteText}>삭제</Text></Pressable>
    </View>)}
  </View>;
}

export const accountStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 40, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.primary, marginTop: 12 },
  section: { marginTop: 28, paddingTop: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider },
  heading: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 18 },
  input: { minHeight: 52, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, fontSize: 16, color: C.text, marginTop: 14 },
  stacked: { marginTop: 10 },
  error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 8 }, notice: { fontSize: 12, lineHeight: 19, color: C.textSecondary, marginTop: 8 },
  primaryButton: { minHeight: 50, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
  outlineButton: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: C.divider, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  outlineText: { fontSize: 15, color: C.text },
  dangerButton: { minHeight: 52, borderRadius: 13, backgroundColor: C.error, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  dangerText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  textButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 18 }, mutedLink: { fontSize: 13, color: C.textMuted, textDecorationLine: 'underline' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }, infoLabel: { fontSize: 13, color: C.textSecondary }, infoValue: { fontSize: 14, color: C.text, flexShrink: 1, textAlign: 'right' },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.surface, marginTop: 10 },
  tripCopy: { flex: 1, paddingVertical: 10 }, tripName: { fontSize: 15, fontWeight: '600', color: C.text }, tripMeta: { fontSize: 12, color: C.textMuted, marginTop: 3 },
  deleteChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.error, justifyContent: 'center' }, deleteText: { fontSize: 13, color: C.error, fontWeight: '600' },
  listItem: { fontSize: 14, color: C.text, lineHeight: 22, marginTop: 4 },
  acceptChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.primary, justifyContent: 'center' }, acceptText: { fontSize: 13, color: C.onPrimary, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
const s = accountStyles;
