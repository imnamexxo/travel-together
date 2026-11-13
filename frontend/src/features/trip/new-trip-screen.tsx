import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { useCreateTrip } from '@/api/queries';
import TripPeriodField from '@/components/pickers/trip-period-field';
import { TravelColors as C } from '@/constants/theme';
import { validateNewTrip, type NewTripErrors } from './new-trip-validation';

export default function NewTripScreen() {
  const createTrip = useCreateTrip();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<NewTripErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    if (createTrip.isPending) return;
    const fields = { name, startDate, endDate };
    const nextErrors = validateNewTrip(fields);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;
    try {
      const trip = await createTrip.mutateAsync({ name: name.trim(), start_date: startDate.trim(), end_date: endDate.trim() });
      router.replace(`/trips/${trip.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError
        ? [e.message, ...e.details.map((detail) => detail.message)].join('\n')
        : '여행을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, error: string | undefined, props: Partial<ComponentProps<typeof TextInput>>) => <>
    <Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholderTextColor={C.textMuted} style={[s.input, error && s.invalid]} {...props} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </>;

  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="내 여행 목록으로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.back}><Text style={s.backText}>‹ 내 여행</Text></Pressable>
        <Text style={s.title}>새 여행</Text>
        <Text style={s.subtitle}>여행을 만들면 내가 총무가 돼요. 지출과 송금은 총무가 관리해요.</Text>
        {field('여행 이름', name, setName, errors.name, { placeholder: '예: 우리의 제주 여행', maxLength: 50, returnKeyType: 'next' })}
        <TripPeriodField start={startDate} end={endDate} onChange={(a, b) => { setStartDate(a); setEndDate(b); }} error={errors.startDate ?? errors.endDate} />
        {!!formError && <Text accessibilityRole="alert" style={s.error}>{formError}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: createTrip.isPending, busy: createTrip.isPending }} disabled={createTrip.isPending} onPress={submit} style={({ pressed }) => [s.primaryButton, (pressed || createTrip.isPending) && s.pressed]}>
          <Text style={s.primaryText}>여행 만들기</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.primary, marginTop: 12 },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 10, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 22 },
  input: { minHeight: 54, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text, borderWidth: 1, borderColor: 'transparent' },
  invalid: { borderColor: C.error }, error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 7 },

  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  primaryText: { fontSize: 16, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.65 },
});
