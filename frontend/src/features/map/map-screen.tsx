import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image, LayoutAnimation, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { useMapData, useMembers } from '@/api/queries';
import type { MapPlace } from '@/api/client';
import PlaceMap from './place-map';

type Filter = 'all' | 'visited' | 'planned';
const NO_PLACES: MapPlace[] = [];

export default function MapScreen() {
  const { trip, days } = useCurrentTrip();
  const [day, setDay] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const members = useMembers(trip.id).data ?? [];
  // 날짜·멤버 필터는 서버가 건다(그날 계획했거나 들른 곳, 그 멤버가 사진을 올렸거나 결제한 곳).
  const mapData = useMapData(trip.id, { date: day === null ? null : days[day]?.iso, memberId });
  const { refetch } = mapData;
  // 사진·지출·일정은 다른 탭에서 바뀐다. 지도 탭에 올 때마다 다시 받는다.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const all = mapData.data?.places ?? NO_PLACES;
  const places = useMemo(() => all.filter((p) => filter === 'all' || (filter === 'visited' ? p.visited : !p.visited)), [all, filter]);
  const pins = useMemo(() => places.map(({ place, visited }) => ({ id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, visited })), [places]);
  const selected = places.find((p) => p.place.id === selectedId) ?? places[0];
  const dayLabel = (iso: string) => { const index = days.findIndex((d) => d.iso === iso); return index < 0 ? '' : `${index + 1}일 차`; };
  const unlinkedPhotos = mapData.data?.unlinked_photo_count ?? 0;
  const pick = (change: () => void) => { change(); setSelectedId(null); };
  // 아래 장소 정보는 손잡이를 끌어 올리거나 내려서 펼치고 접는다(누르면 바뀜). 접으면 이름과 요약만 남고 지도가 넓어진다.
  const [expanded, setExpanded] = useState(true);
  const setSheet = useCallback((next: boolean) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded(next); }, []);
  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy < -20) setSheet(true); else if (g.dy > 20) setSheet(false); },
  }), [setSheet]);

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <View style={s.heading}>
      <Text style={s.title}>여행 지도</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dates}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: day === null }} onPress={() => pick(() => setDay(null))} style={[s.chip, day === null && s.chipActive]}><Text style={[s.chipText, day === null && s.chipActiveText]}>전체 일정</Text></Pressable>
        {days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="button" accessibilityState={{ selected: day === index }} onPress={() => pick(() => setDay(index))} style={[s.chip, day === index && s.chipActive]}><Text style={[s.chipText, day === index && s.chipActiveText]}>{index + 1}일 차 · {entry.date}</Text></Pressable>)}
      </ScrollView>
      {members.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.memberScroll} contentContainerStyle={s.members}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: memberId === null }} onPress={() => pick(() => setMemberId(null))} style={[s.memberChip, memberId === null && s.memberActive]}><Text style={[s.memberText, memberId === null && s.memberActiveText]}>모든 멤버</Text></Pressable>
        {members.map((m) => <Pressable key={m.member_id} accessibilityRole="button" accessibilityLabel={`${m.display_name}의 장소만 보기`} accessibilityState={{ selected: memberId === m.member_id }} onPress={() => pick(() => setMemberId(m.member_id))} style={[s.memberChip, memberId === m.member_id && s.memberActive]}><Text style={[s.memberText, memberId === m.member_id && s.memberActiveText]}>{m.display_name}</Text></Pressable>)}
      </ScrollView>}
      <View style={s.filters}>{([{ key: 'all', title: '전체' }, { key: 'visited', title: '● 들른 곳' }, { key: 'planned', title: '○ 계획만 한 곳' }] as const).map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: filter === entry.key }} onPress={() => pick(() => setFilter(entry.key))} style={s.filterButton}><Text style={[s.filterText, filter === entry.key && s.activeText]}>{entry.title}</Text></Pressable>)}<Text style={s.placeCount}>{places.length}곳</Text></View>
    </View>
    <View style={s.mapArea}><PlaceMap pins={pins} selectedId={selected?.place.id ?? null} onSelect={setSelectedId} /></View>
    <View style={s.bottom}>
      {selected ? <View>
        <View {...drag.panHandlers} style={s.sheetHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '장소 정보 접기' : '장소 정보 펼치기'} onPress={() => setSheet(!expanded)} style={s.handleArea}><View style={s.handle} /></Pressable>
        <View style={s.placeHeading}><View style={s.placeTitleGroup}><Text style={s.placeName}>{selected.place.name}</Text><Text style={s.area}>{selected.place.road_address ?? selected.place.address}</Text></View><Text style={s.badge}>{selected.visited ? '들른 곳' : '계획'}</Text></View>
        <Text style={s.counts}>일정 {selected.plan_items.length}개 · 사진 {selected.photos.length}장{selected.expense_count ? ` · 지출 ${selected.expense_total.toLocaleString('ko-KR')}원` : ''}</Text>
        </View>
        {expanded && <ScrollView style={s.sheet} contentContainerStyle={s.sheetContent}>
        {!!selected.visited_dates.length && <Text style={s.visitedOn}>들른 날 {selected.visited_dates.map(dayLabel).filter(Boolean).join(', ')}</Text>}
        {selected.plan_items.map((item) => <View key={item.id} style={s.planRow}><Text style={s.time}>{dayLabel(item.date)} {item.time?.slice(0, 5) ?? ''}</Text><Text style={s.memo}>{item.memo || item.title}</Text></View>)}
        {!!selected.photos.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbnails}>{selected.photos.slice(0, 8).map((photo) => <Image key={photo.id} source={{ uri: photo.url }} style={s.thumbnail} />)}</ScrollView>}
        <View style={s.actions}><Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}`)} style={s.action}><Text style={s.link}>플래너 보기</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}/album`)} style={s.action}><Text style={s.link}>앨범 보기 ›</Text></Pressable></View>
        <Text style={s.hint}>사진이나 확정된 지출이 있는 곳이 들른 곳이에요</Text>
        </ScrollView>}
      </View> : <View style={s.noSelection}><Text style={s.emptyTitle}>{mapData.isError ? '지도 정보를 불러오지 못했어요' : '아직 표시할 장소가 없어요'}</Text><Text style={s.hint}>{mapData.isError ? '잠시 후 다시 열어 주세요.' : '플래너에서 일정에 장소를 넣으면 지도에 핀이 생겨요.'}</Text></View>}
      {unlinkedPhotos > 0 && <Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}/album`)} style={s.unlinked}><Text style={s.unlinkedText}>장소 미연결 사진 {unlinkedPhotos}장</Text><Text style={s.link}>앨범에서 연결 ›</Text></Pressable>}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, heading: { paddingHorizontal: 24, paddingTop: 20 },
  title: { fontSize: 30, fontWeight: '800', color: C.primary, letterSpacing: -1 },
  dates: { paddingTop: 20, gap: 8, paddingBottom: 5 }, chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 13, justifyContent: 'center', backgroundColor: C.surface }, chipActive: { backgroundColor: C.primary }, chipText: { fontSize: 12, color: C.textSecondary }, chipActiveText: { color: C.onPrimary, fontWeight: '500' },
  memberScroll: { flexGrow: 0 }, members: { paddingTop: 8, paddingBottom: 6, gap: 6, alignItems: 'center' }, memberChip: { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }, memberActive: { borderColor: C.primary, backgroundColor: C.banner }, memberText: { fontSize: 12, color: C.textSecondary }, memberActiveText: { color: C.primary, fontWeight: '600' },
  visitedOn: { fontSize: 12, color: C.accent, marginTop: 6 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }, filterButton: { minHeight: 44, justifyContent: 'center' }, filterText: { fontSize: 12, color: C.textMuted }, activeText: { color: C.primary, fontWeight: '600' }, placeCount: { fontSize: 11, color: C.textMuted, marginLeft: 'auto' },
  mapArea: { flex: 1, minHeight: 160 }, bottom: { backgroundColor: C.background }, sheet: { maxHeight: 230 }, sheetContent: { paddingHorizontal: 24, paddingBottom: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
  sheetHeader: { paddingHorizontal: 24, paddingBottom: 6, width: '100%', maxWidth: 600, alignSelf: 'center' }, handleArea: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 30 }, handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border },
  placeHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, placeTitleGroup: { flex: 1 }, placeName: { fontSize: 19, fontWeight: '600', color: C.text, letterSpacing: -0.4 }, area: { fontSize: 12, color: C.textMuted, marginTop: 5 }, badge: { fontSize: 11, color: C.primary, backgroundColor: C.banner, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }, counts: { fontSize: 12, color: C.textSecondary, marginTop: 14 },
  planRow: { flexDirection: 'row', gap: 12, paddingTop: 12 }, time: { fontSize: 12, color: C.accent, fontVariant: ['tabular-nums'] }, memo: { flex: 1, fontSize: 12, lineHeight: 18, color: C.textSecondary }, thumbnails: { gap: 6, paddingTop: 14 }, thumbnail: { width: 62, height: 62, borderRadius: 6, backgroundColor: C.surface },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 }, action: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 12, color: C.accent, fontWeight: '500' }, hint: { fontSize: 11, lineHeight: 18, color: C.textMuted },
  noSelection: { paddingHorizontal: 24, paddingVertical: 22, gap: 8 }, emptyTitle: { fontSize: 15, fontWeight: '600', color: C.text }, unlinked: { paddingHorizontal: 24, minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider }, unlinkedText: { fontSize: 12, color: C.textSecondary },
});
