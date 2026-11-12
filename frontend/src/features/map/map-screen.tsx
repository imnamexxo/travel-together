import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { previewPlaces } from '@/features/trip/places';
import { usePreviewTrip } from '@/features/trip/preview-state';
import PlaceMap from './place-map';

type Filter = 'all' | 'visited' | 'planned';
export default function MapScreen() {
  const { photos, items } = usePreviewTrip();
  const { trip, days } = useCurrentTrip();
  const [day, setDay] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const places = useMemo(() => previewPlaces.map((place) => {
    const linkedPhotos = photos.filter((photo) => photo.place === place.name && (day === null || photo.day === day));
    const plans = items.filter((item) => item.name === place.name && (day === null || item.day === day)).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
    return { ...place, photos: linkedPhotos, plans, visited: linkedPhotos.length > 0 };
  }).filter((place) => (place.plans.length > 0 || place.photos.length > 0)
    && (filter === 'all' || (filter === 'visited' ? place.visited : !place.visited))), [photos, items, day, filter]);
  const pins = useMemo(() => places.map(({ id, name, latitude, longitude, visited }) => ({ id, name, latitude, longitude, visited })), [places]);
  const selected = places.find((place) => place.id === selectedId) ?? places[0];
  const unlinkedPhotos = photos.filter((photo) => photo.place === null).length;

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <View style={s.heading}>
      <Text style={s.title}>여행 지도</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dates}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: day === null }} onPress={() => { setDay(null); setSelectedId(null); }} style={[s.chip, day === null && s.chipActive]}><Text style={[s.chipText, day === null && s.chipActiveText]}>전체 일정</Text></Pressable>
        {days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="button" accessibilityState={{ selected: day === index }} onPress={() => { setDay(index); setSelectedId(null); }} style={[s.chip, day === index && s.chipActive]}><Text style={[s.chipText, day === index && s.chipActiveText]}>{index + 1}일 차 · {entry.date}</Text></Pressable>)}
      </ScrollView>
      <View style={s.filters}>{([{ key: 'all', title: '전체' }, { key: 'visited', title: '● 들른 곳' }, { key: 'planned', title: '○ 계획만 한 곳' }] as const).map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: filter === entry.key }} onPress={() => { setFilter(entry.key); setSelectedId(null); }} style={s.filterButton}><Text style={[s.filterText, filter === entry.key && s.activeText]}>{entry.title}</Text></Pressable>)}<Text style={s.placeCount}>{places.length}곳</Text></View>
    </View>
    <View style={s.mapArea}><PlaceMap pins={pins} selectedId={selected?.id ?? null} onSelect={setSelectedId} /></View>
    <View style={s.bottom}>
      {selected ? <ScrollView style={s.sheet} contentContainerStyle={s.sheetContent}>
        <View style={s.handle} />
        <View style={s.placeHeading}><View style={s.placeTitleGroup}><Text style={s.placeName}>{selected.name}</Text><Text style={s.area}>{selected.area}</Text></View><Text style={s.badge}>{selected.visited ? '들른 곳' : '계획'}</Text></View>
        <Text style={s.counts}>일정 {selected.plans.length}개 · 사진 {selected.photos.length}장</Text>
        {selected.plans.map((item) => <View key={item.id} style={s.planRow}><Text style={s.time}>{item.day + 1}일 차 {item.time}</Text><Text style={s.memo}>{item.memo || item.name}</Text></View>)}
        {!!selected.photos.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbnails}>{selected.photos.slice(0, 8).map((photo) => <Image key={photo.id} source={{ uri: photo.uri }} style={s.thumbnail} />)}</ScrollView>}
        <View style={s.actions}><Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}`)} style={s.action}><Text style={s.link}>플래너 보기</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}/album`)} style={s.action}><Text style={s.link}>앨범 보기 ›</Text></Pressable></View>
        <Text style={s.hint}>예시 장소 기준 · 지출 연결은 추후 제공돼요</Text>
      </ScrollView> : <View style={s.noSelection}><Text style={s.emptyTitle}>아직 표시할 장소가 없어요</Text><Text style={s.hint}>다른 날짜를 선택하거나 앨범에서 사진에 장소를 연결해보세요.</Text></View>}
      {unlinkedPhotos > 0 && <Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}/album`)} style={s.unlinked}><Text style={s.unlinkedText}>장소 미연결 사진 {unlinkedPhotos}장</Text><Text style={s.link}>앨범에서 연결 ›</Text></Pressable>}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, heading: { paddingHorizontal: 24, paddingTop: 20 },
  title: { fontSize: 30, fontWeight: '800', color: C.primary, letterSpacing: -1 },
  dates: { paddingTop: 20, gap: 8, paddingBottom: 5 }, chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 13, justifyContent: 'center', backgroundColor: C.surface }, chipActive: { backgroundColor: C.primary }, chipText: { fontSize: 12, color: C.textSecondary }, chipActiveText: { color: C.onPrimary, fontWeight: '500' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }, filterButton: { minHeight: 44, justifyContent: 'center' }, filterText: { fontSize: 12, color: C.textMuted }, activeText: { color: C.primary, fontWeight: '600' }, placeCount: { fontSize: 11, color: C.textMuted, marginLeft: 'auto' },
  mapArea: { flex: 1, minHeight: 160 }, bottom: { backgroundColor: C.background }, sheet: { maxHeight: 280 }, sheetContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, width: '100%', maxWidth: 600, alignSelf: 'center' }, handle: { width: 30, height: 3, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  placeHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, placeTitleGroup: { flex: 1 }, placeName: { fontSize: 19, fontWeight: '600', color: C.text, letterSpacing: -0.4 }, area: { fontSize: 12, color: C.textMuted, marginTop: 5 }, badge: { fontSize: 11, color: C.primary, backgroundColor: C.banner, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }, counts: { fontSize: 12, color: C.textSecondary, marginTop: 14 },
  planRow: { flexDirection: 'row', gap: 12, paddingTop: 12 }, time: { fontSize: 12, color: C.accent, fontVariant: ['tabular-nums'] }, memo: { flex: 1, fontSize: 12, lineHeight: 18, color: C.textSecondary }, thumbnails: { gap: 6, paddingTop: 14 }, thumbnail: { width: 62, height: 62, borderRadius: 6, backgroundColor: C.surface },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 }, action: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 12, color: C.accent, fontWeight: '500' }, hint: { fontSize: 11, lineHeight: 18, color: C.textMuted },
  noSelection: { paddingHorizontal: 24, paddingVertical: 22, gap: 8 }, emptyTitle: { fontSize: 15, fontWeight: '600', color: C.text }, unlinked: { paddingHorizontal: 24, minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider }, unlinkedText: { fontSize: 12, color: C.textSecondary },
});
