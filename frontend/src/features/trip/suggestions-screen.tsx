import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, type Suggestion } from '@/api/client';
import { useAdoptSuggestions, useAskSuggestions } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { goBack } from '@/navigation';
import { useCurrentTrip } from './current-trip';

const PRESETS = ['맛집 위주', '여유로운 일정', '자연·풍경', '실내 위주', '아이와 함께'];

export default function SuggestionsScreen() {
  const { trip, days } = useCurrentTrip();
  const ask = useAskSuggestions(trip.id);
  const adopt = useAdoptSuggestions(trip.id);
  const [destination, setDestination] = useState('');
  const [preferences, setPreferences] = useState('');
  const [result, setResult] = useState<Suggestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; aiFailed: boolean } | null>(null);
  const planner = `/trips/${trip.id}` as const;

  function togglePreset(preset: string) {
    const parts = preferences.split(',').map((p) => p.trim()).filter(Boolean);
    setPreferences((parts.includes(preset) ? parts.filter((p) => p !== preset) : [...parts, preset]).join(', '));
  }

  async function request() {
    setFormError(null);
    setFailure(null);
    if (!destination.trim()) { setFormError('여행지를 입력해주세요.'); return; }
    try {
      const suggestion = await ask.mutateAsync({ destination: destination.trim(), preferences: preferences.trim() });
      setResult(suggestion);
      setSelected([]);
    } catch (e) {
      setFailure({
        message: e instanceof Error ? e.message : '추천을 받지 못했어요.',
        aiFailed: e instanceof ApiError && e.status === 502,
      });
    }
  }

  async function addToPlanner() {
    if (!result || !selected.length) return;
    setFailure(null);
    try {
      await adopt.mutateAsync({ requestId: result.id, itemIds: selected });
      goBack(planner);
    } catch (e) {
      setFailure({ message: e instanceof Error ? e.message : '플래너에 추가하지 못했어요.', aiFailed: false });
    }
  }

  const byDate = (result?.items ?? []).reduce<Record<string, Suggestion['items']>>((groups, item) => {
    (groups[item.date] ??= []).push(item);
    return groups;
  }, {});

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="플래너로 돌아가기" onPress={() => goBack(planner)} style={s.back}><Text style={s.backText}>‹ 플래너</Text></Pressable>
        <Text style={s.title}>✧ 추천 일정</Text>
        <Text style={s.caption}>여행 기간({days.length}일)에 맞춰 날짜별 일정을 추천해요. 마음에 드는 것만 골라 플래너에 넣으세요.</Text>

        <Text style={s.label}>여행지</Text>
        <TextInput accessibilityLabel="여행지" style={s.input} value={destination} onChangeText={setDestination} placeholder="예: 제주 동쪽" maxLength={60} />
        <Text style={s.label}>취향 (선택)</Text>
        <View style={s.chips}>{PRESETS.map((preset) => {
          const on = preferences.split(',').map((p) => p.trim()).includes(preset);
          return <Pressable key={preset} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => togglePreset(preset)} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && s.chipTextOn]}>{preset}</Text></Pressable>;
        })}</View>
        <TextInput accessibilityLabel="취향" style={[s.input, s.spaced]} value={preferences} onChangeText={setPreferences} placeholder="직접 적어도 돼요" maxLength={200} />
        {!!formError && <Text accessibilityRole="alert" style={s.error}>{formError}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: ask.isPending, busy: ask.isPending }} disabled={ask.isPending} onPress={request} style={({ pressed }) => [s.primary, (pressed || ask.isPending) && s.pressed]}>
          <Text style={s.primaryText}>{result ? '다시 추천받기' : '추천받기'}</Text>
        </Pressable>

        {ask.isPending && <View style={s.progress}>
          <ActivityIndicator color={C.primary} />
          <Text style={s.caption}>추천 일정을 만드는 중이에요. 30초쯤 걸릴 수 있어요.</Text>
        </View>}

        {failure && <View style={s.failure}>
          <Text accessibilityRole="alert" style={s.error}>{failure.message}</Text>
          {failure.aiFailed && <Pressable accessibilityRole="button" onPress={() => goBack(planner)} style={s.textButton}><Text style={s.link}>플래너에서 직접 일정 쓰기 ›</Text></Pressable>}
        </View>}

        {result && !ask.isPending && <>
          {result.reused && <Text style={s.caption}>같은 조건으로 받은 추천을 다시 보여드려요.</Text>}
          {Object.entries(byDate).map(([date, items]) => {
            const dayNumber = days.findIndex((d) => d.iso === date) + 1;
            return <View key={date} style={s.day}>
              <Text style={s.dayTitle}>{dayNumber > 0 ? `${dayNumber}일 차 · ` : ''}{days[dayNumber - 1]?.title ?? date}</Text>
              {items.map((item) => {
                const on = selected.includes(item.id);
                return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={`${item.place_name} 선택`} accessibilityState={{ checked: on || item.adopted, disabled: item.adopted }} disabled={item.adopted}
                  onPress={() => setSelected((current) => on ? current.filter((id) => id !== item.id) : [...current, item.id])} style={[s.card, on && s.cardOn, item.adopted && s.cardDone]}>
                  <View style={s.between}>
                    <Text style={s.cardTitle}>{on ? '✓ ' : ''}{item.order}. {item.place_name}</Text>
                    {item.adopted ? <Text style={s.badgeDone}>추가됨</Text> : item.status === 'needs_check' && <Text style={s.badgeWarn}>확인 필요</Text>}
                  </View>
                  <Text style={s.caption}>{item.place ? (item.place.road_address ?? item.place.address) : `${item.region} · 지도에서 찾지 못했어요`} · 약 {item.stay_minutes}분</Text>
                  {!!item.description && <Text style={s.desc}>{item.description}</Text>}
                </Pressable>;
              })}
            </View>;
          })}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selected.length || adopt.isPending }} disabled={!selected.length || adopt.isPending} onPress={addToPlanner} style={[s.primary, (!selected.length || adopt.isPending) && s.pressed]}>
            <Text style={s.primaryText}>플래너에 추가 ({selected.length})</Text>
          </Pressable>
          <Text style={s.caption}>&quot;확인 필요&quot;는 지도에서 찾지 못한 곳이에요. 넣으면 장소 없이 들어가니 플래너에서 장소를 직접 골라 주세요.</Text>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 28, letterSpacing: -1, fontWeight: '700', color: C.primary, marginTop: 8 },
  caption: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginTop: 22, marginBottom: 10 },
  input: { minHeight: 52, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, fontSize: 16, color: C.text },
  spaced: { marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.surface, justifyContent: 'center' }, chipOn: { backgroundColor: C.primary },
  chipText: { fontSize: 13, color: C.textSecondary }, chipTextOn: { color: C.onPrimary, fontWeight: '600' },
  error: { fontSize: 13, color: C.error, marginTop: 12, lineHeight: 19 },
  primary: { minHeight: 52, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 22 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.5 },
  progress: { alignItems: 'center', paddingVertical: 28 },
  failure: { marginTop: 8 }, textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 14, fontWeight: '600', color: C.accent },
  day: { marginTop: 28 }, dayTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  card: { marginTop: 10, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.divider }, cardOn: { borderColor: C.primary, backgroundColor: C.banner }, cardDone: { opacity: 0.55 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.text },
  desc: { fontSize: 13, color: C.textSecondary, marginTop: 6, lineHeight: 19 },
  badgeWarn: { fontSize: 11, fontWeight: '600', color: C.error, backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeDone: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
});
