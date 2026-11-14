import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/pressable';

import { useExpensePlaceCandidates } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';

type Chosen = { source_place_id: string; name: string } | null;

type Props = {
  tripId: string;
  /** 기본 검색어로 쓰는 상호 */
  merchant: string;
  value: Chosen;
  onChange: (place: Chosen) => void;
  editable: boolean;
};

/** 지출의 장소: 상호(또는 고친 검색어)로 후보를 받아 고르거나 비워 둔다. 자동으로 붙이지 않는다. */
export default function ExpensePlacePicker({ tripId, merchant, value, onChange, editable }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const candidates = useExpensePlaceCandidates(tripId, submitted);

  function openCandidates() {
    const q = merchant.trim();
    setQuery(q);
    setSubmitted(q);
    setOpen(true);
  }

  function search() {
    const q = query.trim();
    if (q && q === submitted) void candidates.refetch();
    else setSubmitted(q);
  }

  if (!editable) {
    return <Text style={s.value}>{value ? `📍 ${value.name}` : '장소 없음'}</Text>;
  }
  if (value) {
    return <View style={s.chosen}>
      <Text style={s.chosenName}>📍 {value.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="지출 장소 빼기" onPress={() => onChange(null)} style={s.textButton}><Text style={s.muted}>빼기</Text></Pressable>
    </View>;
  }
  if (!open) {
    return <Pressable accessibilityRole="button" onPress={openCandidates} style={s.openButton}><Text style={s.link}>장소 후보 보기</Text></Pressable>;
  }
  return <View>
    <View style={s.searchRow}>
      <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="장소 검색어" value={query} onChangeText={setQuery} placeholder="상호나 장소 이름" returnKeyType="search" onSubmitEditing={search} style={s.input} maxLength={100} />
      <Pressable accessibilityRole="button" accessibilityLabel="장소 후보 다시 찾기" onPress={search} style={s.searchButton}><Text style={s.searchText}>찾기</Text></Pressable>
    </View>
    {!submitted ? <Text style={s.muted}>상호를 입력하고 찾기를 눌러 주세요.</Text>
      : candidates.isPending ? <ActivityIndicator style={s.loading} color={C.primary} />
      : candidates.isError ? <Text accessibilityRole="alert" style={s.error}>{candidates.error.message}</Text>
      : !candidates.data.length ? <Text style={s.muted}>후보가 없어요. 검색어를 바꿔 보세요.</Text>
      : candidates.data.map((c) => <Pressable key={c.source_place_id} accessibilityRole="button" accessibilityLabel={`${c.name} 장소로 지정`} onPress={() => { onChange({ source_place_id: c.source_place_id, name: c.name }); setOpen(false); }} style={s.candidate}>
        <View style={s.candidateHead}><Text style={s.candidateName}>{c.name}</Text>{c.in_trip && <Text style={s.badge}>이 여행의 장소</Text>}</View>
        <Text style={s.muted}>{c.road_address ?? c.address}</Text>
      </Pressable>)}
    <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={s.textButton}><Text style={s.muted}>장소 없이 두기</Text></Pressable>
  </View>;
}

const s = StyleSheet.create({
  value: { fontSize: 15, color: C.text, marginTop: 6 },
  chosen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: 12, borderRadius: 12, backgroundColor: C.banner },
  chosenName: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.text },
  openButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, link: { fontSize: 14, fontWeight: '600', color: C.accent },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  input: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 14, fontSize: 15, color: C.text },
  searchButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.primary, justifyContent: 'center' }, searchText: { color: C.onPrimary, fontWeight: '600' },
  candidate: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  candidateHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, candidateName: { fontSize: 14, fontWeight: '600', color: C.text },
  badge: { fontSize: 10, fontWeight: '600', color: C.primary, backgroundColor: C.banner, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  muted: { fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 18 }, error: { fontSize: 12, color: C.error, marginTop: 8 },
  textButton: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }, loading: { marginTop: 10 },
});
