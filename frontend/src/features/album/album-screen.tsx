import { useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { showAlert } from '@/components/dialog';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Photo, PhotoPlaceLink, Place } from '@/api/client';
import { useDeletePhoto, useLinkPhotoPlace, usePhotos, usePlaceSearch, usePlanItems } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { toKstParts } from '@/features/expenses/expense-form';
import { useCurrentTrip } from '@/features/trip/current-trip';
import type { TripDay } from '@/features/trip/trip-dates';
import { autoPlaceId } from './photo-location';
import { pickPhotos } from './photo-prep';
import { usePhotoUploads } from './use-photo-uploads';

type Mode = 'all' | 'date' | 'place' | 'uploader';
type AlbumRow = { kind: 'heading'; id: string; title: string; count: number } | { kind: 'photos'; id: string; photos: Photo[] };
const DEFAULT_LIMIT = 200;

/** 사진의 여행 날짜(촬영 시각 기준, 한국 시간). 촬영 시각이 없거나 여행 기간 밖이면 -1. */
export function photoDayIndex(photo: Photo, days: TripDay[]): number {
  return photo.taken_at ? days.findIndex((d) => d.iso === toKstParts(photo.taken_at!).date) : -1;
}

function makeRows(photos: Photo[], mode: Mode, days: TripDay[]): AlbumRow[] {
  const groups = new Map<string, Photo[]>();
  const ordered = mode === 'date' ? [...photos].sort((a, b) => {
    const [da, db] = [photoDayIndex(a, days), photoDayIndex(b, days)];
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
  }) : photos;
  for (const photo of ordered) {
    const index = photoDayIndex(photo, days);
    const key = mode === 'date' ? (index < 0 ? '날짜 미지정' : `${index + 1}일 차 · ${days[index].title}`)
      : mode === 'place' ? (photo.place?.name ?? '장소 미연결')
      : mode === 'uploader' ? `${photo.uploader_name}님이 올린 사진` : '모든 사진';
    groups.set(key, [...(groups.get(key) ?? []), photo]);
  }
  return [...groups.entries()].flatMap(([title, group]) => {
    const rows: AlbumRow[] = [{ kind: 'heading', id: `heading-${title}`, title, count: group.length }];
    for (let index = 0; index < group.length; index += 3) rows.push({ kind: 'photos', id: `${title}-${index}`, photos: group.slice(index, index + 3) });
    return rows;
  });
}

export default function AlbumScreen() {
  const { trip, days, isOrganizer } = useCurrentTrip();
  const photoList = usePhotos(trip.id);
  const planItems = usePlanItems(trip.id);
  const remove = useDeletePhoto(trip.id);
  const uploader = usePhotoUploads(trip.id);
  const [mode, setMode] = useState<Mode>('all');
  const [day, setDay] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.min(width, 600);
  const tile = (contentWidth - 48 - 8) / 3;
  const photos = photoList.data?.photos ?? [];
  const limit = photoList.data?.limit ?? DEFAULT_LIMIT;
  const remaining = Math.max(limit - photos.length, 0);
  const filtered = photos.filter((photo) => day === null || photoDayIndex(photo, days) === day);
  const rows = makeRows(filtered, mode, days);
  const selected = photos.find((photo) => photo.id === selectedId);
  const selectedIndex = filtered.findIndex((photo) => photo.id === selectedId);
  const canDelete = (photo: Photo) => isOrganizer || photo.uploader_member_id === trip.me.member_id;
  const failed = uploader.uploads.filter((u) => u.status === 'failed');
  const doneCount = uploader.uploads.filter((u) => u.status === 'done').length;
  const unlinked = photos.filter((photo) => !photo.place).length;

  async function addPhotos() {
    if (pickingRef.current || uploader.busy) return;
    if (remaining <= 0) { showAlert('사진이 가득 찼어요', `이 여행에는 사진을 최대 ${limit}장까지 담을 수 있어요.`); return; }
    pickingRef.current = true; setPicking(true);
    try {
      const picked = await pickPhotos(remaining);
      if (!picked?.length) return;
      // 일정을 아직 못 받았으면 받아 온 뒤 장소를 찾는다.
      const items = planItems.data ?? (await planItems.refetch()).data ?? [];
      // 촬영 위치는 여기서 장소를 찾는 데만 쓰고 버린다. 서버에는 장소 id만 간다.
      uploader.start(picked, (p) => autoPlaceId(p.gps, p.takenAt, items));
    } catch {
      showAlert('사진을 불러오지 못했어요', '사진 선택 권한과 기기의 사진 상태를 확인하고 다시 시도해주세요.');
    } finally { pickingRef.current = false; setPicking(false); }
  }

  function removeSelected() {
    if (!selected) return;
    const id = selected.id;
    showAlert('사진을 지울까요?', '모든 멤버의 앨범에서 지워져요. 기기의 원본 사진은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => remove.mutate(id, {
        onSuccess: () => setSelectedId(null),
        onError: (e) => showAlert('지우지 못했어요', e.message),
      }) },
    ]);
  }

  const busy = picking || uploader.busy;
  const header = <>
    <View style={s.titleRow}>
      <View style={s.titleCopy}><Text style={s.eyebrow}>{trip.name}</Text><Text style={s.title}>여행의 순간</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="사진 추가" disabled={busy} onPress={addPhotos} style={({ pressed }) => [s.plus, pressed && s.pressed]}>
        {busy ? <ActivityIndicator color={C.onPrimary} /> : <Text style={s.plusText}>＋</Text>}
      </Pressable>
    </View>
    <Text style={s.subtitle}>{photos.length}장의 사진 · {remaining <= 20 ? `남은 장수 ${remaining}장` : `${limit}장까지 담을 수 있어요`}{unlinked > 0 ? ` · 장소 미연결 ${unlinked}장` : ''}</Text>
    {uploader.uploads.length > 0 && <View style={s.uploadBox}>
      <Text style={s.uploadTitle}>{uploader.busy ? `사진 올리는 중 · ${doneCount + failed.length + 1}/${uploader.uploads.length}` : `${uploader.uploads.length}장 중 ${doneCount}장 올렸어요${failed.length ? ` · ${failed.length}장 실패` : ''}`}</Text>
      {failed.map((u) => <Text key={u.key} style={s.uploadError}>사진 {uploader.uploads.indexOf(u) + 1}: {u.error}</Text>)}
      <View style={s.uploadActions}>
        {!uploader.busy && failed.length > 0 && <Pressable accessibilityRole="button" onPress={uploader.retryFailed} style={s.uploadButton}><Text style={s.uploadButtonText}>실패한 사진 다시 올리기</Text></Pressable>}
        {!uploader.busy && <Pressable accessibilityRole="button" accessibilityLabel="업로드 결과 닫기" onPress={uploader.clear} style={s.navButton}><Text style={s.navText}>닫기</Text></Pressable>}
      </View>
    </View>}
    <View style={s.modes}>{([{ key: 'all', title: '전체' }, { key: 'date', title: '날짜별' }, { key: 'place', title: '장소별' }, { key: 'uploader', title: '올린 사람' }] as const).map((entry) => (
      <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: mode === entry.key }} onPress={() => setMode(entry.key)} style={[s.mode, mode === entry.key && s.modeSelected]}>
        <Text style={[s.modeText, mode === entry.key && s.modeTextSelected]}>{entry.title}</Text>
      </Pressable>
    ))}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: day === null }} onPress={() => setDay(null)} style={[s.chip, day === null && s.chipSelected]}><Text style={[s.chipText, day === null && s.chipTextSelected]}>모든 날짜</Text></Pressable>
      {days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="button" accessibilityState={{ selected: day === index }} onPress={() => setDay(index)} style={[s.chip, day === index && s.chipSelected]}><Text style={[s.chipText, day === index && s.chipTextSelected]}>{index + 1}일 차 · {entry.date}</Text></Pressable>)}
    </ScrollView>
  </>;

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <FlatList data={rows} keyExtractor={(row) => row.id} showsVerticalScrollIndicator={false}
      contentContainerStyle={s.content} ListHeaderComponent={header}
      refreshing={photoList.isRefetching} onRefresh={() => photoList.refetch()}
      ListEmptyComponent={photoList.isPending ? <ActivityIndicator style={s.empty} color={C.primary} />
        : photoList.isError ? <View style={s.empty}><Text style={s.emptyText}>{photoList.error.message}</Text><Pressable accessibilityRole="button" onPress={() => photoList.refetch()} style={s.emptyButton}><Text style={s.emptyButtonText}>다시 시도</Text></Pressable></View>
        : <View style={s.empty}>
          <View style={s.emptyIcon}><SymbolView name={{ ios: 'photo.on.rectangle.angled', android: 'photo_library', web: 'photo_library' }} size={34} tintColor={C.accent} /></View>
          <Text style={s.emptyTitle}>{photos.length ? '이날의 사진은 아직 없어요' : '우리의 첫 사진을 담아볼까요?'}</Text>
          <Text style={s.emptyText}>바다도, 함께 먹은 한 끼도.{ '\n' }여행의 순간을 차곡차곡 모아보세요.</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={addPhotos} style={s.emptyButton}><Text style={s.emptyButtonText}>{busy ? '사진 올리는 중…' : '사진 추가'}</Text></Pressable>
        </View>}
      ListFooterComponent={<Text style={s.footer}>{photos.length}/{limit}장 · 사진은 줄여서 올리고 위치 정보는 지워서 보내요.{ '\n' }촬영 위치는 서버에 저장되지 않아요.</Text>}
      renderItem={({ item: row }) => row.kind === 'heading' ? <View style={s.groupHeading}><Text style={s.groupTitle}>{row.title}</Text><Text style={s.count}>{row.count}장</Text></View> : <View style={s.photoRow}>
        {row.photos.map((photo) => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`${photo.uploader_name}님 사진 크게 보기`} onPress={() => setSelectedId(photo.id)} style={[s.tile, { width: tile, height: tile }]}>
          <Image source={{ uri: photo.url }} style={s.thumbnail} resizeMode="cover" onError={() => setFailedImages((current) => current.includes(photo.id) ? current : [...current, photo.id])} />
          {failedImages.includes(photo.id) && <View style={s.imageError}><Text style={s.imageErrorText}>사진 확인 필요</Text></View>}
        </Pressable>)}
      </View>}
    />
    <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
      <SafeAreaView style={s.screen}>
        {selected && <ScrollView contentContainerStyle={s.detail}>
          <View style={s.detailNav}>
            <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={s.navButton}><Text style={s.navText}>닫기</Text></Pressable>
            <Text style={s.detailTitle}>사진 기록</Text>
            {canDelete(selected) ? <Pressable accessibilityRole="button" accessibilityLabel="사진 지우기" disabled={remove.isPending} onPress={removeSelected} style={s.navButton}><Text style={s.deleteText}>지우기</Text></Pressable> : <View style={s.navButton} />}
          </View>
          <ScrollView maximumZoomScale={3} minimumZoomScale={1} centerContent style={{ height: Math.min(height * 0.45, 440), backgroundColor: C.surface }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <Image source={{ uri: selected.url }} style={{ width: contentWidth, height: Math.min(height * 0.45, 440) }} resizeMode="contain" />
          </ScrollView>
          <View style={s.detailsBody}>
            <View style={s.detailNav}>
              <Pressable accessibilityRole="button" accessibilityLabel="이전 사진" disabled={selectedIndex <= 0} onPress={() => setSelectedId(filtered[selectedIndex - 1].id)} style={s.navButton}><Text style={[s.navText, selectedIndex <= 0 && s.disabled]}>‹ 이전</Text></Pressable>
              <Text style={s.count}>{selectedIndex + 1} / {filtered.length}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="다음 사진" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onPress={() => setSelectedId(filtered[selectedIndex + 1].id)} style={s.navButton}><Text style={[s.navText, selectedIndex >= filtered.length - 1 && s.disabled]}>다음 ›</Text></Pressable>
            </View>
            <Text style={s.fieldTitle}>올린 사람</Text><Text style={s.helper}>{selected.uploader_name}</Text>
            <Text style={s.fieldTitle}>촬영 시각</Text>
            <Text style={s.helper}>{selected.taken_at ? (() => { const t = toKstParts(selected.taken_at); const index = photoDayIndex(selected, days); return `${index >= 0 ? `${index + 1}일 차 · ` : ''}${t.date} ${t.time}`; })() : '촬영 시각 정보가 없는 사진이에요.'}</Text>
            <PlaceSection photo={selected} />
            {!canDelete(selected) && <Text style={s.helper}>사진은 올린 사람과 총무만 지울 수 있어요.</Text>}
          </View>
        </ScrollView>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

/** 사진 상세의 장소: 연결된 장소와 그날 그 장소의 일정, 연결 바꾸기·해제, 일정에 없던 곳 검색해 연결. */
function PlaceSection({ photo }: { photo: Photo }) {
  const { trip, days } = useCurrentTrip();
  const planItems = usePlanItems(trip.id);
  const link = useLinkPhotoPlace(trip.id);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const search = usePlaceSearch(trip.id, submitted);
  const [error, setError] = useState<string | null>(null);
  const tripPlaces = [...new Map((planItems.data ?? []).filter((i) => i.place).map((i) => [i.place!.id, i.place as Place])).values()];
  const dayIso = photo.taken_at ? toKstParts(photo.taken_at).date : null;
  const plansHere = (planItems.data ?? []).filter((i) => photo.place && i.place?.id === photo.place.id && (!dayIso || i.date === dayIso));
  const dayNumber = (iso: string) => days.findIndex((d) => d.iso === iso) + 1;

  function change(body: PhotoPlaceLink) {
    setError(null);
    link.mutate({ photoId: photo.id, link: body }, {
      onSuccess: () => { setQuery(''); setSubmitted(''); },
      onError: (e) => setError(e.message),
    });
  }

  return <>
    <Text style={s.fieldTitle}>연결된 장소</Text>
    <Text style={s.helper}>{photo.place ? `${photo.place.name}${photo.link_type === 'auto' ? ' · 촬영 위치로 자동 연결' : ' · 직접 연결'}` : '장소에 연결되지 않은 사진이에요. 촬영 날짜로만 분류돼요.'}</Text>
    {plansHere.map((i) => <Text key={i.id} style={s.helper}>📅 {dayNumber(i.date)}일 차 {i.time?.slice(0, 5) ?? ''} {i.title}</Text>)}
    <View style={s.detailChips}>
      {tripPlaces.map((p) => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name}에 연결`} accessibilityState={{ selected: photo.place?.id === p.id, disabled: link.isPending }} disabled={link.isPending} onPress={() => change({ place_id: p.id })} style={[s.chip, photo.place?.id === p.id && s.chipSelected]}><Text style={[s.chipText, photo.place?.id === p.id && s.chipTextSelected]}>{p.name}</Text></Pressable>)}
      {!!photo.place && <Pressable accessibilityRole="button" accessibilityLabel="장소 연결 해제" disabled={link.isPending} onPress={() => change({})} style={s.chip}><Text style={s.chipText}>연결 해제</Text></Pressable>}
    </View>
    <Text style={s.helper}>일정에 없던 곳이면 검색해서 연결하세요. 지도에 들른 곳으로 남아요.</Text>
    <View style={s.searchRow}>
      <TextInput placeholderTextColor={C.textMuted} accessibilityLabel="사진 장소 검색" value={query} onChangeText={setQuery} placeholder="예: 성산일출봉" returnKeyType="search" onSubmitEditing={() => setSubmitted(query.trim())} style={s.searchInput} maxLength={100} />
      <Pressable accessibilityRole="button" accessibilityLabel="사진 장소 검색하기" onPress={() => setSubmitted(query.trim())} style={s.searchButton}><Text style={s.searchButtonText}>검색</Text></Pressable>
    </View>
    {!!submitted && (search.isPending ? <ActivityIndicator color={C.primary} /> : search.isError ? <Text style={s.errorText}>{search.error.message}</Text>
      : !search.data.length ? <Text style={s.helper}>검색 결과가 없어요.</Text>
      : search.data.map((c) => <Pressable key={c.source_place_id} accessibilityRole="button" accessibilityLabel={`${c.name}로 연결`} disabled={link.isPending} onPress={() => change({ source_place: { source_place_id: c.source_place_id, name: c.name } })} style={s.result}>
        <Text style={s.resultName}>{c.name}</Text><Text style={s.helper}>{c.road_address ?? c.address}</Text>
      </Pressable>))}
    {!!error && <Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}
  </>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  titleCopy: { flex: 1 }, eyebrow: { fontSize: 12, color: C.textMuted, marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '700', color: C.primary, letterSpacing: -1 },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 26, lineHeight: 30, color: C.onPrimary }, pressed: { opacity: 0.6 },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 13 },
  uploadBox: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: C.banner, gap: 6 },
  uploadTitle: { fontSize: 13, fontWeight: '600', color: C.primary }, uploadError: { fontSize: 12, color: C.error, lineHeight: 18 },
  uploadActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  uploadButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.background }, uploadButtonText: { fontSize: 13, fontWeight: '600', color: C.accent },
  modes: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, marginTop: 24 },
  mode: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  modeSelected: { borderBottomColor: C.primary }, modeText: { fontSize: 14, color: C.textMuted }, modeTextSelected: { color: C.primary, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, paddingTop: 18, paddingBottom: 6 },
  chip: { borderRadius: 18, paddingHorizontal: 13, minHeight: 36, justifyContent: 'center', backgroundColor: C.surface },
  chipSelected: { backgroundColor: C.banner }, chipText: { fontSize: 12, color: C.textSecondary }, chipTextSelected: { color: C.primary, fontWeight: '600' },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 12 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: C.text }, count: { fontSize: 12, color: C.textMuted },
  photoRow: { flexDirection: 'row', gap: 4, marginBottom: 4 }, tile: { backgroundColor: C.surface, borderRadius: 4, overflow: 'hidden' }, thumbnail: { width: '100%', height: '100%' },
  imageError: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, imageErrorText: { fontSize: 11, color: C.textMuted },
  empty: { paddingVertical: 60, alignItems: 'center' }, emptyIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: C.banner, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.text, textAlign: 'center' }, emptyText: { fontSize: 13, lineHeight: 22, color: C.textMuted, textAlign: 'center', marginTop: 12 },
  emptyButton: { minHeight: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', marginTop: 24 }, emptyButtonText: { fontSize: 14, fontWeight: '500', color: C.onPrimary },
  footer: { marginTop: 24, fontSize: 11, lineHeight: 18, color: C.textMuted, textAlign: 'center' },
  detail: { maxWidth: 600, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  detailNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, gap: 12 },
  navButton: { minWidth: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, navText: { fontSize: 14, color: C.accent }, deleteText: { fontSize: 14, color: C.error }, detailTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  detailsBody: { paddingHorizontal: 24 }, disabled: { color: C.inactive }, fieldTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginTop: 24 },
  helper: { fontSize: 12, color: C.textMuted, lineHeight: 20, marginTop: 8 },
  detailChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, searchInput: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 14, fontSize: 15, color: C.text },
  searchButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.primary, justifyContent: 'center' }, searchButtonText: { color: C.onPrimary, fontWeight: '600' },
  result: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, resultName: { fontSize: 14, fontWeight: '600', color: C.text },
  errorText: { fontSize: 12, color: C.error, marginTop: 8 },
});
