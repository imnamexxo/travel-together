import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { showAlert } from '@/components/dialog';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { useDeleteTrip, useHandOverOrganizer, useLeaveTrip, useMembers, useUpdateTrip } from '@/api/queries';
import CurrencyField from '@/components/pickers/currency-field';
import OverseasField from '@/components/pickers/overseas-field';
import TripPeriodField from '@/components/pickers/trip-period-field';
import { TravelColors as C } from '@/constants/theme';
import { goBack } from '@/navigation';
import { useCurrentTrip } from './current-trip';
import { validateNewTrip, type NewTripErrors } from './new-trip-validation';

function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError ? [e.message, ...e.details.map((detail) => detail.message)].join('\n') : fallback;
}

export default function TripSettingsScreen() {
  const { trip, isOrganizer } = useCurrentTrip();

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="플래너로 돌아가기" onPress={() => goBack(`/trips/${trip.id}`)} style={s.back}><Text style={s.backText}>‹ 플래너</Text></Pressable>
        <Text style={s.eyebrow}>{trip.name}</Text>
        <Text style={s.title}>여행 설정</Text>
        {isOrganizer ? <>
          <EditTripForm />
          <HandOverOrganizer />
          <DeleteTrip />
        </> : <LeaveTrip />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function EditTripForm() {
  const { trip, money } = useCurrentTrip();
  const update = useUpdateTrip(trip.id);
  const [name, setName] = useState(trip.name);
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const [currency, setCurrency] = useState(money.code);
  const [overseas, setOverseas] = useState(trip.is_overseas);
  const [errors, setErrors] = useState<NewTripErrors>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function save() {
    if (update.isPending) return;
    const nextErrors = validateNewTrip({ name, startDate, endDate });
    setErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length) return;
    try {
      await update.mutateAsync({ name: name.trim(), start_date: startDate.trim(), end_date: endDate.trim(), currency, is_overseas: overseas });
      setMessage({ text: '저장했어요.', error: false });
    } catch (e) {
      setMessage({ text: errorText(e, '저장하지 못했어요. 잠시 후 다시 시도해주세요.'), error: true });
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, error: string | undefined, placeholder: string) => <>
    <Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.textMuted} style={[s.input, !!error && s.invalid]} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </>;

  return <View style={s.section}>
    <Text style={s.heading}>여행 정보</Text>
    {field('여행 이름', name, setName, errors.name, '여행 이름')}
    <TripPeriodField start={startDate} end={endDate} onChange={(a, b) => { setStartDate(a); setEndDate(b); }} error={errors.startDate ?? errors.endDate} />
    <Text style={s.hint}>일정이 있는 날짜가 기간에서 빠지면 저장되지 않아요.</Text>
    <CurrencyField value={currency} onChange={setCurrency} hint="지출이나 송금 기록이 있으면 통화를 바꿀 수 없어요." />
    <OverseasField value={overseas} onChange={setOverseas} hint="장소를 하나라도 고른 뒤에는 바꿀 수 없어요." warning={!overseas && currency !== 'KRW'} />
    {!!message && <Text accessibilityRole={message.error ? 'alert' : undefined} style={message.error ? s.error : s.notice}>{message.text}</Text>}
    <Pressable haptic accessibilityRole="button" accessibilityState={{ disabled: update.isPending, busy: update.isPending }} disabled={update.isPending} onPress={save} style={({ pressed }) => [s.primaryButton, (pressed || update.isPending) && s.pressed]}>
      <Text style={s.primaryText}>저장</Text>
    </Pressable>
  </View>;
}

function HandOverOrganizer() {
  const { trip } = useCurrentTrip();
  const members = useMembers(trip.id);
  const handOver = useHandOverOrganizer(trip.id);
  const [error, setError] = useState<string | null>(null);
  const others = (members.data ?? []).filter((m) => !m.is_me);

  function confirm(memberId: string, name: string) {
    showAlert(`${name}님에게 총무를 넘길까요?`, '넘기면 지출·송금 관리, 초대 코드, 여행 설정은 새 총무만 할 수 있어요. 되돌리려면 새 총무가 다시 넘겨줘야 해요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '넘기기', onPress: async () => {
          setError(null);
          try {
            await handOver.mutateAsync(memberId);
          } catch (e) {
            setError(errorText(e, '총무를 넘기지 못했어요. 잠시 후 다시 시도해주세요.'));
          }
        },
      },
    ]);
  }

  return <View style={s.section}>
    <Text style={s.heading}>총무 넘기기</Text>
    <Text style={s.hint}>{others.length ? '다른 멤버에게 총무를 넘길 수 있어요. 넘긴 뒤에는 일반 멤버가 돼요.' : '함께하는 멤버가 들어오면 총무를 넘길 수 있어요.'}</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {others.map((m) => <Pressable key={m.member_id} accessibilityRole="button" accessibilityLabel={`${m.display_name}에게 총무 넘기기`} disabled={handOver.isPending} onPress={() => confirm(m.member_id, m.display_name)} style={({ pressed }) => [s.rowButton, (pressed || handOver.isPending) && s.pressed]}>
      <Text style={s.rowText}>{m.display_name}</Text><Text style={s.rowAction}>넘기기 ›</Text>
    </Pressable>)}
  </View>;
}

function DeleteTrip() {
  const { trip } = useCurrentTrip();
  const remove = useDeleteTrip(trip.id);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    showAlert(`"${trip.name}"을(를) 삭제할까요?`, '모든 멤버의 일정·사진·지출·송금 기록이 함께 지워지고 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          setError(null);
          try {
            await remove.mutateAsync();
            router.replace('/');
          } catch (e) {
            setError(errorText(e, '삭제하지 못했어요. 잠시 후 다시 시도해주세요.'));
          }
        },
      },
    ]);
  }

  return <View style={s.section}>
    <Text style={s.heading}>여행 삭제</Text>
    <Text style={s.hint}>총무는 여행에서 나갈 수 없어요. 총무를 넘긴 뒤 나가거나, 여행이 필요 없어지면 삭제해 주세요.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: remove.isPending }} disabled={remove.isPending} onPress={confirm} style={({ pressed }) => [s.dangerButton, (pressed || remove.isPending) && s.pressed]}>
      <Text style={s.dangerText}>여행 삭제</Text>
    </Pressable>
  </View>;
}

function LeaveTrip() {
  const { trip } = useCurrentTrip();
  const leave = useLeaveTrip(trip.id);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    showAlert('여행에서 나갈까요?', '다시 들어오려면 총무에게 초대 코드를 받아야 해요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기', style: 'destructive', onPress: async () => {
          setError(null);
          try {
            await leave.mutateAsync();
            router.replace('/');
          } catch (e) {
            setError(errorText(e, '나가지 못했어요. 잠시 후 다시 시도해주세요.'));
          }
        },
      },
    ]);
  }

  return <View style={s.section}>
    <Text style={s.heading}>여행에서 나가기</Text>
    <Text style={s.hint}>이름과 기간은 총무가 바꿀 수 있어요.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: leave.isPending }} disabled={leave.isPending} onPress={confirm} style={({ pressed }) => [s.dangerButton, (pressed || leave.isPending) && s.pressed]}>
      <Text style={s.dangerText}>여행에서 나가기</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 40, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  eyebrow: { fontSize: 12, color: C.textMuted, marginTop: 8 },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.primary, marginTop: 6 },
  section: { marginTop: 32, paddingTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider },
  heading: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 18 },
  input: { minHeight: 54, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: 'transparent' },
  invalid: { borderColor: C.error }, error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 8 },
  notice: { fontSize: 12, lineHeight: 19, color: C.textSecondary, marginTop: 8 },

  hint: { fontSize: 12, color: C.textMuted, marginTop: 10, lineHeight: 18 },
  primaryButton: { minHeight: 52, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
  dangerButton: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: C.error, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  dangerText: { fontSize: 15, fontWeight: '600', color: C.error },
  rowButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.surface, marginTop: 10 },
  rowText: { fontSize: 15, color: C.text }, rowAction: { fontSize: 13, color: C.accent },
  pressed: { opacity: 0.6 },
});
