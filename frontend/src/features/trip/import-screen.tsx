import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, type PlanItem, type Suggestion, type TripSummary } from '@/api/client';
import { useCopyPlanItems, useImportPlanText, usePlanItems, useTrips } from '@/api/queries';
import { showAlert } from '@/components/dialog';
import Pressable from '@/components/pressable';
import { Type, type TravelPalette } from '@/constants/theme';
import { goBack } from '@/navigation';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';
import { useCurrentTrip } from './current-trip';
import SuggestionResult from './suggestion-result';
import { formatPeriod, parseIsoDate } from './trip-dates';

const MAX_TEXT = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXAMPLE = '예)\n1일차\n10:00 김포공항 출발\n12:30 동문시장 점심 (고기국수)\n15:00 숙소 체크인\n\n2일차\n성산일출봉 → 우도';

/** 원래 여행의 그날이 몇 번째 날인지(0부터). */
export function dayOffset(sourceStart: string, date: string): number {
  return Math.round(((parseIsoDate(date) ?? 0) - (parseIsoDate(sourceStart) ?? 0)) / DAY_MS);
}

type Mode = 'text' | 'trip';

/** 일정 가져오기: 써 둔 계획 글을 붙여 넣거나(Gemini가 일정으로 나눔), 다른 여행의 일정을 복사한다. */
export default function ImportScreen() {
  const s = useThemedStyles(sStyles);
  const { trip } = useCurrentTrip();
  const [mode, setMode] = useState<Mode>('text');
  const planner = `/trips/${trip.id}` as const;

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="플래너로 돌아가기" onPress={() => goBack(planner)} style={s.back}><Text style={s.backText}>‹ 플래너</Text></Pressable>
        <Text style={s.title}>일정 가져오기</Text>
        <Text style={s.caption}>이미 세워 둔 계획을 한 번에 옮겨요. 마음에 드는 것만 골라 플래너에 넣을 수 있어요.</Text>
        <View style={s.tabs}>{([{ key: 'text', title: '글로 붙여넣기' }, { key: 'trip', title: '다른 여행에서' }] as const).map((tab) => (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: mode === tab.key }} onPress={() => setMode(tab.key)} style={[s.tab, mode === tab.key && s.tabOn]}>
            <Text style={[s.tabText, mode === tab.key && s.tabTextOn]}>{tab.title}</Text>
          </Pressable>
        ))}</View>
        {mode === 'text' ? <FromText onDone={() => goBack(planner)} /> : <FromTrip onDone={() => goBack(planner)} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function FromText({ onDone }: { onDone: () => void }) {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { trip } = useCurrentTrip();
  const convert = useImportPlanText(trip.id);
  const [text, setText] = useState('');
  const [result, setResult] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    if (!text.trim()) { setError('계획을 붙여 넣어 주세요.'); return; }
    try {
      setResult(await convert.mutateAsync(text.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '일정으로 바꾸지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  return <>
    <Text style={s.caption}>메모나 카톡에 써 둔 계획을 붙여 넣으면 AI가 날짜·시각·장소로 나눠요. 날짜(1일차, 12/10)가 있으면 그 날로, 없으면 첫날부터 순서대로 넣어요.</Text>
    <TextInput accessibilityLabel="붙여 넣을 계획" value={text} onChangeText={setText} multiline textAlignVertical="top" maxLength={MAX_TEXT}
      placeholder={EXAMPLE} placeholderTextColor={C.textMuted} style={[s.input, s.textArea]} />
    <Text style={s.counter}>{text.length} / {MAX_TEXT}</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: convert.isPending, busy: convert.isPending }} disabled={convert.isPending} onPress={run} style={({ pressed }) => [s.primary, (pressed || convert.isPending) && s.pressed]}>
      <Text style={s.primaryText}>{result ? '다시 나누기' : '일정으로 나누기'}</Text>
    </Pressable>
    {convert.isPending && <View style={s.progress}><ActivityIndicator color={C.primary} /><Text style={s.caption}>계획을 일정으로 나누는 중이에요.</Text></View>}
    {result && !convert.isPending && <SuggestionResult key={result.id} result={result} onAdopted={onDone}
      note={'글에 적힌 시각이 있으면 그 시각으로 들어가요. "장소 없는 일정"(체크인 등)과 "확인 필요"(지도에서 못 찾은 곳)는 장소 없이 들어가니 플래너에서 골라 주세요. AI 추천 횟수(하루 10회)를 함께 써요.'} />}
  </>;
}

function FromTrip({ onDone }: { onDone: () => void }) {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { trip, days } = useCurrentTrip();
  const trips = useTrips();
  const copy = useCopyPlanItems(trip.id);
  const [source, setSource] = useState<TripSummary | null>(null);
  const [firstDay, setFirstDay] = useState(0);
  const [excluded, setExcluded] = useState<string[]>([]);
  const others = (trips.data ?? []).filter((t) => t.id !== trip.id);

  function pick(next: TripSummary) {
    setSource(next);
    setExcluded([]);
    setFirstDay(0);
  }

  if (trips.isPending) return <ActivityIndicator style={s.progress} color={C.primary} />;
  if (trips.isError) return <Text style={s.error}>{trips.error.message}</Text>;
  if (!others.length) return <Text style={s.caption}>가져올 다른 여행이 없어요. 내가 참여한 여행의 일정만 가져올 수 있어요.</Text>;

  return <>
    <Text style={s.label}>어느 여행에서 가져올까요?</Text>
    {others.map((t) => <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ checked: source?.id === t.id }} onPress={() => pick(t)} style={[s.tripRow, source?.id === t.id && s.tripRowOn]}>
      <Text style={s.tripName}>{t.name}</Text>
      <Text style={s.caption}>{formatPeriod(t.start_date, t.end_date)}{t.is_overseas ? ' · 해외' : ''}</Text>
    </Pressable>)}
    {source && <SourcePlan key={source.id} source={source} firstDay={firstDay} setFirstDay={setFirstDay} excluded={excluded} setExcluded={setExcluded}
      busy={copy.isPending} onCopy={(items) => copy.mutate({ source_trip_id: source.id, item_ids: items.map((i) => i.id), first_date: days[firstDay].iso }, {
        onSuccess: (done) => {
          const notes = [done.skipped && `${done.skipped}개는 이 여행 기간을 넘어서 빠졌어요.`, done.places_dropped && `${done.places_dropped}개는 국내·해외가 달라 장소 없이 들어갔어요.`].filter(Boolean);
          showAlert(`일정 ${done.items.length}개를 가져왔어요`, notes.join('\n') || undefined);
          onDone();
        },
        onError: (e) => showAlert('가져오지 못했어요', e.message),
      })} />}
  </>;
}

function SourcePlan({ source, firstDay, setFirstDay, excluded, setExcluded, busy, onCopy }: {
  source: TripSummary; firstDay: number; setFirstDay: (n: number) => void; excluded: string[]; setExcluded: (ids: string[]) => void;
  busy: boolean; onCopy: (items: PlanItem[]) => void;
}) {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { trip, days } = useCurrentTrip();
  const plan = usePlanItems(source.id);
  const items = plan.data ?? [];
  const chosen = items.filter((i) => !excluded.includes(i.id));
  const fits = (i: PlanItem) => dayOffset(source.start_date, i.date) + firstDay < days.length;
  const willCopy = chosen.filter(fits);
  const byDay = items.reduce<Record<number, PlanItem[]>>((groups, item) => {
    (groups[dayOffset(source.start_date, item.date)] ??= []).push(item);
    return groups;
  }, {});

  if (plan.isPending) return <ActivityIndicator style={s.progress} color={C.primary} />;
  if (plan.isError) return <Text style={s.error}>{plan.error.message}</Text>;
  if (!items.length) return <Text style={s.caption}>이 여행에는 일정이 없어요.</Text>;

  return <>
    <Text style={s.label}>{source.name}의 1일 차를 이 여행의 며칠 차에 넣을까요?</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
      {days.map((day, index) => <Pressable key={day.iso} accessibilityRole="radio" accessibilityLabel={`${index + 1}일 차부터`} accessibilityState={{ checked: firstDay === index }} onPress={() => setFirstDay(index)} style={[s.chip, firstDay === index && s.chipOn]}>
        <Text style={[s.chipText, firstDay === index && s.chipTextOn]}>{index + 1}일 차 {day.date}</Text>
      </Pressable>)}
    </ScrollView>
    {source.is_overseas !== trip.is_overseas && <Text style={s.warn}>{trip.is_overseas ? '해외' : '국내'} 여행이라 {source.is_overseas ? '해외' : '국내'} 장소는 쓸 수 없어요. 장소는 빼고 제목·시각·메모만 가져와요.</Text>}
    <Text style={s.label}>가져올 일정</Text>
    {Object.entries(byDay).map(([offset, group]) => {
      const target = Number(offset) + firstDay;
      return <View key={offset} style={s.day}>
        <Text style={s.dayTitle}>{Number(offset) + 1}일 차 → {target < days.length ? `${target + 1}일 차 ${days[target].date}` : '기간 밖(빠져요)'}</Text>
        {group.map((item) => {
          const on = !excluded.includes(item.id);
          return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={`${item.title} 가져오기`} accessibilityState={{ checked: on }}
            onPress={() => setExcluded(on ? [...excluded, item.id] : excluded.filter((id) => id !== item.id))} style={[s.itemRow, !fits(item) && s.faded]}>
            <View style={[s.check, on && s.checkOn]}>{on && <Text style={s.checkMark}>✓</Text>}</View>
            <Text style={s.itemText}>{item.time ? `${item.time.slice(0, 5)}  ` : ''}{item.title}</Text>
          </Pressable>;
        })}
      </View>;
    })}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !willCopy.length || busy, busy }} disabled={!willCopy.length || busy} onPress={() => onCopy(willCopy)} style={[s.primary, (!willCopy.length || busy) && s.pressed]}>
      <Text style={s.primaryText}>일정 {willCopy.length}개 가져오기</Text>
    </Pressable>
    <Text style={s.caption}>원래 여행의 일정은 그대로 남아요. 지금 있는 일정도 지우지 않고 그 사이에 시각 순으로 들어가요.</Text>
  </>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  title: { fontSize: 28, letterSpacing: -0.5, fontFamily: Type.display, color: C.primary, marginTop: 8 },
  caption: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 19 },
  warn: { fontSize: 12, color: C.error, marginTop: 10, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginTop: 22, marginBottom: 10 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, marginTop: 20, marginBottom: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: C.primary }, tabText: { fontSize: 14, color: C.textMuted }, tabTextOn: { color: C.primary, fontWeight: '600' },
  input: { borderRadius: 14, backgroundColor: C.surface, paddingHorizontal: 16, fontSize: 15, color: C.text },
  textArea: { minHeight: 200, paddingTop: 14, paddingBottom: 14, marginTop: 14, lineHeight: 22 },
  counter: { fontSize: 11, color: C.textMuted, textAlign: 'right', marginTop: 6 },
  error: { fontSize: 13, color: C.error, marginTop: 12, lineHeight: 19 },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 22 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.5 },
  progress: { alignItems: 'center', paddingVertical: 28 },
  tripRow: { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.divider, marginBottom: 8 }, tripRowOn: { borderColor: C.primary, backgroundColor: C.banner },
  tripName: { fontSize: 15, fontWeight: '600', color: C.text },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.surface, justifyContent: 'center' }, chipOn: { backgroundColor: C.primary },
  chipText: { fontSize: 13, color: C.textSecondary }, chipTextOn: { color: C.onPrimary, fontWeight: '600' },
  day: { marginTop: 14 }, dayTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }, faded: { opacity: 0.4 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary }, checkMark: { fontSize: 13, fontWeight: '700', color: C.onPrimary, lineHeight: 15 },
  itemText: { flex: 1, fontSize: 14, color: C.text },
});
