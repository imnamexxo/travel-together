import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { useDeleteTrip, useLeaveTrip, useUpdateTrip } from '@/api/queries';
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
          <DeleteTrip />
        </> : <LeaveTrip />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function EditTripForm() {
  const { trip } = useCurrentTrip();
  const update = useUpdateTrip(trip.id);
  const [name, setName] = useState(trip.name);
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const [errors, setErrors] = useState<NewTripErrors>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function save() {
    if (update.isPending) return;
    const nextErrors = validateNewTrip({ name, startDate, endDate });
    setErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length) return;
    try {
      await update.mutateAsync({ name: name.trim(), start_date: startDate.trim(), end_date: endDate.trim() });
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
    <Text style={s.heading}>이름과 기간</Text>
    {field('여행 이름', name, setName, errors.name, '여행 이름')}
    <View style={s.dates}>
      <View style={s.dateField}>{field('시작일', startDate, setStartDate, errors.startDate, '2026-11-12')}</View>
      <View style={s.dateField}>{field('종료일', endDate, setEndDate, errors.endDate, '2026-11-14')}</View>
    </View>
    <Text style={s.hint}>일정이 있는 날짜가 기간에서 빠지면 저장되지 않아요.</Text>
    {!!message && <Text accessibilityRole={message.error ? 'alert' : undefined} style={message.error ? s.error : s.notice}>{message.text}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: update.isPending, busy: update.isPending }} disabled={update.isPending} onPress={save} style={({ pressed }) => [s.primaryButton, (pressed || update.isPending) && s.pressed]}>
      <Text style={s.primaryText}>저장</Text>
    </Pressable>
  </View>;
}

function DeleteTrip() {
  const { trip } = useCurrentTrip();
  const remove = useDeleteTrip(trip.id);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    Alert.alert(`"${trip.name}"을(를) 삭제할까요?`, '모든 멤버의 일정·사진·지출·송금 기록이 함께 지워지고 되돌릴 수 없어요.', [
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
    <Text style={s.hint}>총무는 여행에서 나갈 수 없어요. 여행이 필요 없어지면 삭제해 주세요.</Text>
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
    Alert.alert('여행에서 나갈까요?', '다시 들어오려면 총무에게 초대 코드를 받아야 해요.', [
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
  dates: { flexDirection: 'row', gap: 12 }, dateField: { flex: 1 },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 10, lineHeight: 18 },
  primaryButton: { minHeight: 52, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
  dangerButton: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: C.error, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  dangerText: { fontSize: 15, fontWeight: '600', color: C.error },
  pressed: { opacity: 0.6 },
});
