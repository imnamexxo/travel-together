import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, type Suggestion, type SuggestionAsk } from '@/api/client';
import { useAdoptSuggestions, useAskSuggestions, usePlanItems } from '@/api/queries';
import { Type, type TravelPalette } from '@/constants/theme';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';
import MetaLine from '@/components/meta-line';
import { goBack } from '@/navigation';
import { useCurrentTrip } from './current-trip';

const PRESETS = ['맛집 위주', '여유로운 일정', '자연·풍경', '실내 위주', '아이와 함께'];
const PACES: { value: SuggestionAsk['pace'] & string; label: string }[] = [
  { value: 'relaxed', label: '여유롭게' }, { value: 'normal', label: '보통' }, { value: 'packed', label: '빡빡하게' },
];
/** 앞 장소와 직선으로 이만큼(km) 넘게 떨어져 있으면 이동이 길다고 알린다. */
export const FAR_KM = 25;

/** "9:00"·"0930"처럼 써도 "09:00"으로. 시각이 아니면 null. */
export function normalizeTime(value: string): string | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour < 24 && minute < 60 ? `${String(hour).padStart(2, '0')}:${match[2]}` : null;
}

/** 날짜 칩을 누를 때 구간 바꾸기: 한 날만 골라져 있으면 그 날부터 누른 날까지, 아니면 누른 날 하루. */
export function nextRange([start, end]: [number, number], tapped: number): [number, number] {
  if (start === end && tapped !== start) return tapped > start ? [start, tapped] : [tapped, start];
  return [tapped, tapped];
}

export default function SuggestionsScreen() {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { trip, days } = useCurrentTrip();
  const ask = useAskSuggestions(trip.id);
  const adopt = useAdoptSuggestions(trip.id);
  const planItems = usePlanItems(trip.id);
  const [range, setRange] = useState<[number, number]>([0, Math.max(days.length - 1, 0)]);
  const [destination, setDestination] = useState('');
  const [preferences, setPreferences] = useState('');
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('21:00');
  const [lodging, setLodging] = useState('');
  const [pace, setPace] = useState<(typeof PACES)[number]['value']>('normal');
  const [result, setResult] = useState<Suggestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; aiFailed: boolean } | null>(null);
  const planner = `/trips/${trip.id}` as const;
  const [from, to] = [days[range[0]], days[range[1]]];
  const whole = range[0] === 0 && range[1] === days.length - 1;
  const fixedCount = (planItems.data ?? []).filter((i) => from && to && i.date >= from.iso && i.date <= to.iso).length;
  const rangeLabel = range[0] === range[1] ? `${range[0] + 1}일 차` : `${range[0] + 1}~${range[1] + 1}일 차`;

  function togglePreset(preset: string) {
    const parts = preferences.split(',').map((p) => p.trim()).filter(Boolean);
    setPreferences((parts.includes(preset) ? parts.filter((p) => p !== preset) : [...parts, preset]).join(', '));
  }

  async function request() {
    setFormError(null);
    setFailure(null);
    const [startTime, endTime] = [normalizeTime(dayStart), normalizeTime(dayEnd)];
    if (!destination.trim()) { setFormError('여행지를 입력해주세요.'); return; }
    if (!startTime || !endTime) { setFormError('하루 일정 시간을 09:00처럼 입력해주세요.'); return; }
    if (endTime <= startTime) { setFormError('끝나는 시각은 시작 시각보다 늦어야 해요.'); return; }
    try {
      const suggestion = await ask.mutateAsync({
        destination: destination.trim(), preferences: preferences.trim(), start_date: from.iso, end_date: to.iso,
        day_start: startTime, day_end: endTime, lodging: lodging.trim(), pace,
      });
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
        <Text style={s.caption}>이미 잡힌 일정은 그대로 두고, 빈 시간에 맞춰 시간표로 추천해요. 여러 도시를 돈다면 구간마다 따로 추천받으세요.</Text>

        <Text style={s.label}>날짜 구간</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {days.map((day, index) => {
            const on = index >= range[0] && index <= range[1];
            return <Pressable key={day.iso} accessibilityRole="checkbox" accessibilityLabel={`${index + 1}일 차`} accessibilityState={{ checked: on }} onPress={() => setRange((current) => nextRange(current, index))} style={[s.chip, on && s.chipOn]}>
              <Text style={[s.chipText, on && s.chipTextOn]}>{index + 1}일 차 {day.date}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <View style={s.between}>
          <Text style={s.caption}>{whole ? `여행 전체(${days.length}일)` : rangeLabel}{fixedCount ? `, 이미 잡힌 일정 ${fixedCount}개를 피해서 추천해요` : ''}</Text>
          {!whole && <Pressable accessibilityRole="button" onPress={() => setRange([0, days.length - 1])} style={s.textButton}><Text style={s.smallLink}>전체 기간</Text></Pressable>}
        </View>

        <Text style={s.label}>여행지</Text>
        <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="여행지" style={s.input} value={destination} onChangeText={setDestination} placeholder="예: 제주 동쪽, 오사카" maxLength={60} />

        <Text style={s.label}>하루 일정 시간</Text>
        <View style={s.timeRow}>
          <TextInput accessibilityLabel="하루 시작 시각" style={[s.input, s.timeInput]} value={dayStart} onChangeText={setDayStart} placeholder="09:00" placeholderTextColor={C.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} />
          <Text style={s.tilde}>~</Text>
          <TextInput accessibilityLabel="하루 끝 시각" style={[s.input, s.timeInput]} value={dayEnd} onChangeText={setDayEnd} placeholder="21:00" placeholderTextColor={C.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>

        <Text style={s.label}>숙소 (선택)</Text>
        <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="숙소" style={s.input} value={lodging} onChangeText={setLodging} placeholder="예: 함덕 OO호텔. 여기서 출발해 돌아와요" maxLength={60} />

        <Text style={s.label}>일정 밀도</Text>
        <View style={s.chips}>{PACES.map((entry) => <Pressable key={entry.value} accessibilityRole="radio" accessibilityState={{ checked: pace === entry.value }} onPress={() => setPace(entry.value)} style={[s.chip, pace === entry.value && s.chipOn]}>
          <Text style={[s.chipText, pace === entry.value && s.chipTextOn]}>{entry.label}</Text>
        </Pressable>)}</View>

        <Text style={s.label}>취향 (선택)</Text>
        <View style={s.chips}>{PRESETS.map((preset) => {
          const on = preferences.split(',').map((p) => p.trim()).includes(preset);
          return <Pressable key={preset} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => togglePreset(preset)} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && s.chipTextOn]}>{preset}</Text></Pressable>;
        })}</View>
        <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="취향" style={[s.input, s.spaced]} value={preferences} onChangeText={setPreferences} placeholder="직접 적어도 돼요" maxLength={200} />
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
          <Text style={s.resultTitle}>{result.destination}</Text>
          {result.reused && <Text style={s.caption}>같은 조건으로 받은 추천을 다시 보여드려요.</Text>}
          {Object.entries(byDate).map(([date, items]) => {
            const dayNumber = days.findIndex((d) => d.iso === date) + 1;
            return <View key={date} style={s.day}>
              <Text style={s.dayTitle}>{dayNumber > 0 ? `${dayNumber}일 차  ` : ''}{days[dayNumber - 1]?.title ?? date}</Text>
              {items.map((item) => {
                const on = selected.includes(item.id);
                const far = item.distance_km != null && item.distance_km >= FAR_KM;
                return <View key={item.id}>
                  {(item.travel_minutes != null || far) && <Text style={[s.travel, far && s.travelFar]}>
                    ↓ {[item.transport, item.travel_minutes != null && `${item.travel_minutes}분`].filter(Boolean).join(' ')}{far ? `  앞 장소와 ${item.distance_km}km, 이동이 길어요` : ''}
                  </Text>}
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`${item.place_name} 선택`} accessibilityState={{ checked: on || item.adopted, disabled: item.adopted }} disabled={item.adopted}
                    onPress={() => setSelected((current) => on ? current.filter((id) => id !== item.id) : [...current, item.id])} style={[s.card, on && s.cardOn, item.adopted && s.cardDone]}>
                    <View style={s.between}>
                      <Text style={s.cardTitle}>{on ? '✓ ' : ''}{item.start_time ? `${item.start_time.slice(0, 5)}  ` : `${item.order}. `}{item.place_name}</Text>
                      {item.adopted ? <Text style={s.badgeDone}>추가됨</Text> : item.status === 'needs_check' && <Text style={s.badgeWarn}>확인 필요</Text>}
                    </View>
                    <MetaLine textStyle={s.caption} parts={[item.place ? (item.place.road_address ?? item.place.address) : item.status === 'verified' ? item.region : `${item.region}, 지도에서 찾지 못했어요`, `약 ${item.stay_minutes}분`]} />
                    {!!item.description && <Text style={s.desc}>{item.description}</Text>}
                  </Pressable>
                </View>;
              })}
            </View>;
          })}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selected.length || adopt.isPending }} disabled={!selected.length || adopt.isPending} onPress={addToPlanner} style={[s.primary, (!selected.length || adopt.isPending) && s.pressed]}>
            <Text style={s.primaryText}>플래너에 추가 ({selected.length})</Text>
          </Pressable>
          <Text style={s.caption}>추천 시각까지 함께 들어가요. &quot;확인 필요&quot;는 지도에서 찾지 못한 곳이라 장소 없이 들어가니, 플래너에서 장소를 직접 골라 주세요. 이동 시간은 AI가 어림한 값이에요.</Text>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 28, letterSpacing: -0.5, fontFamily: Type.display, color: C.primary, marginTop: 8 },
  caption: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 19, flexShrink: 1 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginTop: 22, marginBottom: 10 },
  input: { minHeight: 52, borderRadius: 14, backgroundColor: C.surface, paddingHorizontal: 16, fontSize: 16, color: C.text },
  spaced: { marginTop: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, timeInput: { flex: 1, textAlign: 'center' }, tilde: { fontSize: 16, color: C.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chipRow: { flexDirection: 'row', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.surface, justifyContent: 'center' }, chipOn: { backgroundColor: C.primary },
  chipText: { fontSize: 13, color: C.textSecondary }, chipTextOn: { color: C.onPrimary, fontWeight: '600' },
  error: { fontSize: 13, color: C.error, marginTop: 12, lineHeight: 19 },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 22 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.5 },
  progress: { alignItems: 'center', paddingVertical: 28 },
  failure: { marginTop: 8 }, textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 14, fontWeight: '600', color: C.accent }, smallLink: { fontSize: 12, fontWeight: '600', color: C.accent },
  resultTitle: { fontSize: 18, fontFamily: Type.heading, color: C.text, marginTop: 30 },
  day: { marginTop: 22 }, dayTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  travel: { fontSize: 12, color: C.textMuted, marginTop: 8, marginLeft: 12 }, travelFar: { color: C.error },
  card: { marginTop: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.divider }, cardOn: { borderColor: C.primary, backgroundColor: C.banner }, cardDone: { opacity: 0.55 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.text },
  desc: { fontSize: 13, color: C.textSecondary, marginTop: 6, lineHeight: 19 },
  badgeWarn: { fontSize: 11, fontWeight: '600', color: C.error, backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeDone: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
});
