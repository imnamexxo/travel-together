import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Animated, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { useMapData, useMembers } from '@/api/queries';
import type { MapPlace } from '@/api/client';
import PlaceMap from './place-map';

type Filter = 'all' | 'visited' | 'planned';
// 펼쳤을 때 장소 정보(일정·사진·버튼) 부분의 높이
const SHEET_BODY = 230;
const NO_PLACES: MapPlace[] = [];

type SheetState = { expanded: boolean; full: number; settle: (open: boolean) => void };

/** 장소 정보 시트를 끄는 처리. 한 번 만들고, 상태는 update로 바꿔 넣는다. */
function createSheetDrag(bodyHeight: Animated.Value, onStart: () => void) {
  let state: SheetState = { expanded: true, full: SHEET_BODY, settle: () => {} };
  const follow = (dy: number) => Math.min(state.full, Math.max(0, (state.expanded ? state.full : 0) - dy));
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { bodyHeight.stopAnimation(); onStart(); },
    onPanResponderMove: (_, g) => bodyHeight.setValue(follow(g.dy)),
    onPanResponderRelease: (_, g) => state.settle(g.vy < -0.3 ? true : g.vy > 0.3 ? false : follow(g.dy) > state.full / 2),
    onPanResponderTerminate: () => state.settle(state.expanded),
  });
  return { responder, update: (next: SheetState) => { state = next; } };
}

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
  // 펼친 높이(SHEET_BODY)와 0 사이를 손가락을 따라 움직이고, 놓으면 가까운 쪽(또는 튕긴 방향)으로 부드럽게 간다.
  const [expanded, setExpanded] = useState(true);
  const [moving, setMoving] = useState(false);
  const [bodyHeight] = useState(() => new Animated.Value(SHEET_BODY));
  // 내용이 짧으면 그만큼만 펼친다(최대 SHEET_BODY).
  const [full, setFull] = useState(SHEET_BODY);
  useEffect(() => { if (expanded && !moving) bodyHeight.setValue(full); }, [full, expanded, moving, bodyHeight]);
  const settle = useCallback((open: boolean) => {
    setMoving(true);
    Animated.spring(bodyHeight, { toValue: open ? full : 0, useNativeDriver: false, speed: 18, bounciness: 0, overshootClamping: true }).start(() => {
      setExpanded(open);
      setMoving(false);
    });
  }, [bodyHeight, full]);
  // 끌기 처리는 한 번만 만든다. 다시 만들면 끄는 도중에 움직인 거리를 0부터 다시 세어 시트가 튀어 오른다.
  // 그래서 지금 상태(펼침 여부·펼친 높이·놓았을 때 할 일)는 바뀔 때마다 sheet 상자에 넣어 두고, 끌기 처리가 그걸 읽는다.
  const [sheet] = useState(() => createSheetDrag(bodyHeight, () => setMoving(true)));
  useEffect(() => { sheet.update({ expanded, full, settle }); }, [sheet, expanded, full, settle]);
  const drag = sheet.responder;

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
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '장소 정보 접기' : '장소 정보 펼치기'} onPress={() => settle(!expanded)} style={s.handleArea}><View style={s.handle} /></Pressable>
        <View style={s.placeHeading}><View style={s.placeTitleGroup}><Text style={s.placeName}>{selected.place.name}</Text><Text style={s.area}>{selected.place.road_address ?? selected.place.address}</Text></View><Text style={s.badge}>{selected.visited ? '들른 곳' : '계획'}</Text></View>
        <Text style={s.counts}>일정 {selected.plan_items.length}개 · 사진 {selected.photos.length}장{selected.expense_count ? ` · 지출 ${selected.expense_total.toLocaleString('ko-KR')}원` : ''}</Text>
        </View>
        {(expanded || moving) && <Animated.View style={{ height: bodyHeight, overflow: 'hidden' }}><ScrollView style={s.sheet} contentContainerStyle={s.sheetContent} onContentSizeChange={(_, h) => setFull(Math.min(SHEET_BODY, Math.ceil(h)))}>
        {!!selected.visited_dates.length && <Text style={s.visitedOn}>들른 날 {selected.visited_dates.map(dayLabel).filter(Boolean).join(', ')}</Text>}
        {selected.plan_items.map((item) => <View key={item.id} style={s.planRow}><Text style={s.time}>{dayLabel(item.date)} {item.time?.slice(0, 5) ?? ''}</Text><Text style={s.memo}>{item.memo || item.title}</Text></View>)}
        {!!selected.photos.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbnails}>{selected.photos.slice(0, 8).map((photo) => <Image key={photo.id} source={{ uri: photo.url }} style={s.thumbnail} />)}</ScrollView>}
        <View style={s.actions}><Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}`)} style={s.action}><Text style={s.link}>플래너 보기</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.navigate(`/trips/${trip.id}/album`)} style={s.action}><Text style={s.link}>앨범 보기 ›</Text></Pressable></View>
        <Text style={s.hint}>사진이나 확정된 지출이 있는 곳이 들른 곳이에요</Text>
        </ScrollView></Animated.View>}
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
  mapArea: { flex: 1, minHeight: 160 }, bottom: { backgroundColor: C.background }, sheet: { maxHeight: SHEET_BODY }, sheetContent: { paddingHorizontal: 24, paddingBottom: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
  sheetHeader: { paddingHorizontal: 24, paddingBottom: 6, width: '100%', maxWidth: 600, alignSelf: 'center' }, handleArea: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 30 }, handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border },
  placeHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, placeTitleGroup: { flex: 1 }, placeName: { fontSize: 19, fontWeight: '600', color: C.text, letterSpacing: -0.4 }, area: { fontSize: 12, color: C.textMuted, marginTop: 5 }, badge: { fontSize: 11, color: C.primary, backgroundColor: C.banner, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }, counts: { fontSize: 12, color: C.textSecondary, marginTop: 14 },
  planRow: { flexDirection: 'row', gap: 12, paddingTop: 12 }, time: { fontSize: 12, color: C.accent, fontVariant: ['tabular-nums'] }, memo: { flex: 1, fontSize: 12, lineHeight: 18, color: C.textSecondary }, thumbnails: { gap: 6, paddingTop: 14 }, thumbnail: { width: 62, height: 62, borderRadius: 6, backgroundColor: C.surface },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 }, action: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 12, color: C.accent, fontWeight: '500' }, hint: { fontSize: 11, lineHeight: 18, color: C.textMuted },
  noSelection: { paddingHorizontal: 24, paddingVertical: 22, gap: 8 }, emptyTitle: { fontSize: 15, fontWeight: '600', color: C.text }, unlinked: { paddingHorizontal: 24, minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider }, unlinkedText: { fontSize: 12, color: C.textSecondary },
});
