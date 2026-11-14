import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/lib/use-keyboard-height';

import { ApiError, type PlaceCandidate, type PlanItem } from '@/api/client';
import { useDeletePlanItem, usePlaceSearch, useSavePlanItem } from '@/api/queries';
import PickerField from '@/components/pickers/picker-field';
import TimePicker from '@/components/pickers/time-picker';
import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from './current-trip';
import type { TripDay } from './trip-dates';

type ChosenPlace = { source_place_id: string; name: string; address: string };

type Props = {
  /** 고칠 일정 항목. 없으면 새로 만든다. */
  item?: PlanItem;
  day: TripDay;
  dayNumber: number;
  /** 그날의 일정 항목(순서대로). 순서 바꾸기에 쓴다. */
  onClose: () => void;
};

function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError ? [e.message, ...e.details.map((d) => d.message)].join('\n') : fallback;
}

export default function PlanItemEditor({ item, day, dayNumber, onClose }: Props) {
  const { trip, isOrganizer, money } = useCurrentTrip();
  const save = useSavePlanItem(trip.id);
  const remove = useDeletePlanItem(trip.id);
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(item?.title ?? '');
  const [time, setTime] = useState(item?.time?.slice(0, 5) ?? '');
  const [timeOpen, setTimeOpen] = useState(false);
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [cost, setCost] = useState(item?.estimated_cost == null ? '' : money.toText(item.estimated_cost));
  const [place, setPlace] = useState<ChosenPlace | null>(item?.place ? { source_place_id: item.place.source_place_id, name: item.place.name, address: item.place.address } : null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const search = usePlaceSearch(trip.id, submittedQuery);
  const busy = save.isPending || remove.isPending;
  const canDelete = !!item && (isOrganizer || item.created_by_member_id === trip.me.member_id);

  function runSearch() {
    const q = query.trim();
    if (q && q === submittedQuery) void search.refetch();
    else setSubmittedQuery(q);
  }

  function choose(candidate: PlaceCandidate) {
    // 이름을 비워 뒀거나 이전에 고른 장소 이름 그대로면 새 장소 이름으로 채운다.
    if (!title.trim() || title === place?.name) setTitle(candidate.name);
    setPlace({ source_place_id: candidate.source_place_id, name: candidate.name, address: candidate.road_address ?? candidate.address });
    setSubmittedQuery('');
    setQuery('');
  }

  async function submit() {
    setError(null);
    if (!title.trim()) { setError('장소 또는 일정 이름을 입력해주세요.'); return; }
    if (time.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) { setError('시간을 10:00처럼 입력하거나 비워 두세요.'); return; }
    const estimated = money.parse(cost);
    if (estimated === undefined) { setError('비용은 0 이상의 숫자로 입력해주세요.'); return; }
    try {
      await save.mutateAsync({
        itemId: item?.id,
        input: {
          date: day.iso,
          time: time.trim() || null,
          title: title.trim(),
          memo: memo.trim(),
          estimated_cost: estimated,
          place: place ? { source_place_id: place.source_place_id, name: place.name } : null,
        },
      });
      onClose();
    } catch (e) {
      setError(errorText(e, '저장하지 못했어요. 잠시 후 다시 시도해주세요.'));
    }
  }

  function confirmDelete() {
    if (!item) return;
    Alert.alert('일정 항목을 지울까요?', item.title, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => remove.mutate(item.id, { onSuccess: onClose, onError: (e) => setError(errorText(e, '지우지 못했어요.')) }) },
    ]);
  }

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" style={s.action} onPress={onClose}><Text style={s.muted}>취소</Text></Pressable>
        <Text style={s.title}>{item ? '일정 수정' : '일정 추가'}</Text>
        <View style={s.action} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Text style={s.caption}>{dayNumber}일 차 · {day.title}</Text>

        <Text style={s.label}>장소</Text>
        {place ? <View style={s.placeChip}>
          <View style={s.flex}><Text style={s.placeName}>{place.name}</Text><Text style={s.caption}>{place.address}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="장소 빼기" onPress={() => setPlace(null)} style={s.action}><Text style={s.muted}>빼기</Text></Pressable>
        </View> : <>
          <View style={s.searchRow}>
            <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="장소 검색" style={[s.input, s.flex]} value={query} onChangeText={setQuery} placeholder="예: 동문시장" returnKeyType="search" onSubmitEditing={runSearch} maxLength={100} />
            <Pressable accessibilityRole="button" accessibilityLabel="검색" onPress={runSearch} style={s.searchButton}><Text style={s.searchText}>검색</Text></Pressable>
          </View>
          {!!submittedQuery && (search.isPending ? <ActivityIndicator style={s.loading} color={C.primary} />
            : search.isError ? <Text accessibilityRole="alert" style={s.error}>{search.error.message}</Text>
            : !search.data.length ? <Text style={s.caption}>검색 결과가 없어요. 다른 이름으로 찾아보세요.</Text>
            : search.data.map((c) => <Pressable key={c.source_place_id} accessibilityRole="button" accessibilityLabel={`${c.name} 선택`} onPress={() => choose(c)} style={s.result}>
              <Text style={s.placeName}>{c.name}</Text><Text style={s.caption}>{c.road_address ?? c.address}</Text>
            </Pressable>))}
          <Text style={s.caption}>장소 없이 &quot;자유시간&quot; 같은 일정도 만들 수 있어요.</Text>
        </>}

        <Text style={s.label}>장소 또는 일정 이름</Text>
        <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="장소 또는 일정 이름" style={s.input} value={title} onChangeText={setTitle} placeholder="어디로 떠날까요?" maxLength={80} />
        <Text style={s.label}>시간 (선택)</Text>
        <PickerField label="시간" value={time || null} placeholder="시간 정하기" onPress={() => setTimeOpen(true)} />
        <TimePicker visible={timeOpen} title="시간" value={time} onClose={() => setTimeOpen(false)}
          onConfirm={(t) => { setTime(t); setTimeOpen(false); }} onClear={() => { setTime(''); setTimeOpen(false); }} />
        <Text style={s.label}>메모</Text>
        <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="메모" style={[s.input, s.memo]} value={memo} onChangeText={setMemo} placeholder="함께 기억할 내용을 남겨요" multiline maxLength={300} />
        <Text style={s.label}>예상 비용 ({money.unit})</Text>
        <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="예상 비용" style={s.input} value={cost} onChangeText={setCost} placeholder="0" keyboardType={money.decimals ? 'decimal-pad' : 'number-pad'} maxLength={12} />

        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}

        {canDelete && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={confirmDelete} style={s.deleteButton}><Text style={s.error}>일정 지우기</Text></Pressable>}
        {item && !canDelete && <Text style={s.caption}>다른 멤버가 만든 일정은 고칠 수 있지만, 지우기는 만든 사람과 총무만 할 수 있어요.</Text>}
      </ScrollView>
      {/* 저장은 아래에 고정한다. 키보드가 올라오면 그 위로 따라 올라온다. */}
      <View style={[s.saveBar, { marginBottom: Math.max(0, keyboard - insets.bottom) }]}>
        <Pressable haptic accessibilityRole="button" accessibilityLabel="저장" accessibilityState={{ disabled: busy }} disabled={busy} onPress={submit} style={({ pressed }) => [s.saveButton, (pressed || busy) && s.pressedSave]}><Text style={s.saveText}>저장</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { padding: 24, paddingTop: 12, paddingBottom: 40, width: '100%', maxWidth: 600, alignSelf: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8, width: '100%', maxWidth: 600, alignSelf: 'center' },
  saveBar: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider, backgroundColor: C.background },
  saveButton: { minHeight: 52, borderRadius: 13, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 552, alignSelf: 'center' },
  saveText: { fontSize: 16, fontWeight: '600', color: C.onPrimary }, pressedSave: { opacity: 0.6 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  title: { color: C.text, fontSize: 16, fontWeight: '600' },
  muted: { fontSize: 13, color: C.textSecondary }, link: { fontSize: 14, color: C.accent, fontWeight: '500' },
  caption: { fontSize: 12, color: C.textMuted, marginTop: 7, lineHeight: 19 },
  label: { fontSize: 13, color: C.textSecondary, marginTop: 25, marginBottom: 10 },
  input: { backgroundColor: C.surface, borderRadius: 12, padding: 16, fontSize: 16, color: C.text, minHeight: 52 },
  memo: { minHeight: 100, textAlignVertical: 'top' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchButton: { minHeight: 52, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.primary, justifyContent: 'center' }, searchText: { color: C.onPrimary, fontWeight: '600' },
  result: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  placeChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: C.banner },
  placeName: { fontSize: 15, fontWeight: '600', color: C.text },
  loading: { marginTop: 12 },
  error: { fontSize: 13, color: C.error, marginTop: 16, lineHeight: 19 },
  deleteButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
});
