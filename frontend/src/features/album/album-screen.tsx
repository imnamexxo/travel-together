import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';
import type { TripDay } from '@/features/trip/trip-dates';
import { usePreviewTrip, type PreviewPhoto as Photo } from '@/features/trip/preview-state';
import { previewPlaces } from '@/features/trip/places';

type Mode = 'all' | 'date' | 'place';
type AlbumRow = { kind: 'heading'; id: string; title: string; count: number } | { kind: 'photos'; id: string; photos: Photo[] };
const places = previewPlaces.map((place) => place.name);
const limit = 200;

function makeRows(photos: Photo[], mode: Mode, days: TripDay[]): AlbumRow[] {
  const groups = new Map<string, Photo[]>();
  const ordered = mode === 'date' ? [...photos].sort((a, b) => (a.day ?? 99) - (b.day ?? 99)) : photos;
  for (const photo of ordered) {
    const key = mode === 'date' ? (photo.day === null ? '날짜 미지정' : `${photo.day + 1}일 차 · ${days[photo.day]?.title ?? ''}`)
      : mode === 'place' ? (photo.place ?? '장소 미연결') : '모든 사진';
    groups.set(key, [...(groups.get(key) ?? []), photo]);
  }
  return [...groups.entries()].flatMap(([title, group]) => {
    const rows: AlbumRow[] = [{ kind: 'heading', id: `heading-${title}`, title, count: group.length }];
    for (let index = 0; index < group.length; index += 3) rows.push({ kind: 'photos', id: `${title}-${index}`, photos: group.slice(index, index + 3) });
    return rows;
  });
}

export default function AlbumScreen() {
  const { photos, setPhotos } = usePreviewTrip();
  const { trip, days } = useCurrentTrip();
  const [mode, setMode] = useState<Mode>('all');
  const [day, setDay] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const picking = useRef(false);
  const sequence = useRef(0);
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.min(width, 600);
  const tile = (contentWidth - 48 - 8) / 3;
  const filtered = photos.filter((photo) => day === null || photo.day === day);
  const rows = makeRows(filtered, mode, days);
  const selected = photos.find((photo) => photo.id === selectedId);
  const selectedIndex = filtered.findIndex((photo) => photo.id === selectedId);
  const unlinked = photos.filter((photo) => photo.place === null).length;

  async function addPhotos() {
    if (picking.current) return;
    const remaining = limit - photos.length;
    if (remaining <= 0) { Alert.alert('사진이 가득 찼어요', '이 여행에는 사진을 최대 200장까지 담을 수 있어요.'); return; }
    picking.current = true; setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining,
        orderedSelection: true, quality: 0.8, exif: false,
      });
      if (result.canceled) return;
      const additions: Photo[] = result.assets.slice(0, remaining).map((asset) => ({
        id: `photo-${Date.now()}-${sequence.current++}`, uri: asset.uri,
        assetId: asset.assetId ?? null, day, place: null,
      }));
      setPhotos((current) => {
        const known = new Set(current.map((photo) => photo.assetId ?? photo.uri));
        const unique = additions.filter((photo) => {
          const key = photo.assetId ?? photo.uri;
          if (known.has(key)) return false;
          known.add(key); return true;
        });
        return [...unique, ...current].slice(0, limit);
      });
    } catch {
      Alert.alert('사진을 불러오지 못했어요', '사진 선택 권한과 기기의 사진 상태를 확인하고 다시 시도해주세요.');
    } finally { picking.current = false; setBusy(false); }
  }

  function updateSelected(change: Partial<Pick<Photo, 'day' | 'place'>>) {
    setPhotos((current) => current.map((photo) => photo.id === selectedId ? { ...photo, ...change } : photo));
    if (change.day !== undefined && day !== null && change.day !== day) setDay(null);
  }

  function removeSelected() {
    if (!selected) return;
    const id = selected.id;
    Alert.alert('앨범에서 삭제할까요?', '기기의 원본 사진은 삭제되지 않아요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        setSelectedId(null); setPhotos((current) => current.filter((photo) => photo.id !== id));
        setFailedImages((current) => current.filter((entry) => entry !== id));
      } },
    ]);
  }

  const header = <>
    <View style={s.titleRow}>
      <View style={s.titleCopy}><Text style={s.eyebrow}>{trip.name}</Text><Text style={s.title}>여행의 순간</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="사진 추가" disabled={busy} onPress={addPhotos} style={({ pressed }) => [s.plus, pressed && s.pressed]}>
        {busy ? <ActivityIndicator color={C.onPrimary} /> : <Text style={s.plusText}>＋</Text>}
      </Pressable>
    </View>
    <Text style={s.subtitle}>{photos.length}장의 사진{unlinked > 0 ? ` · 장소 미연결 ${unlinked}장` : ''}</Text>
    <View style={s.modes}>{([{ key: 'all', title: '전체' }, { key: 'date', title: '날짜별' }, { key: 'place', title: '장소별' }] as const).map((entry) => (
      <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: mode === entry.key }} onPress={() => setMode(entry.key)} style={[s.mode, mode === entry.key && s.modeSelected]}>
        <Text style={[s.modeText, mode === entry.key && s.modeTextSelected]}>{entry.title}</Text>
      </Pressable>
    ))}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: day === null }} onPress={() => setDay(null)} style={[s.chip, day === null && s.chipSelected]}><Text style={[s.chipText, day === null && s.chipTextSelected]}>모든 날짜</Text></Pressable>
      {days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="button" accessibilityState={{ selected: day === index }} onPress={() => setDay(index)} style={[s.chip, day === index && s.chipSelected]}><Text style={[s.chipText, day === index && s.chipTextSelected]}>{index + 1}일 차 · {entry.date}</Text></Pressable>)}
    </ScrollView>
    {day !== null && <Text style={s.filterHint}>추가하는 사진은 {day + 1}일 차로 분류돼요.</Text>}
  </>;

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <FlatList data={rows} keyExtractor={(row) => row.id} showsVerticalScrollIndicator={false}
      contentContainerStyle={s.content} ListHeaderComponent={header}
      ListEmptyComponent={<View style={s.empty}>
        <View style={s.emptyIcon}><SymbolView name={{ ios: 'photo.on.rectangle.angled', android: 'photo_library', web: 'photo_library' }} size={34} tintColor={C.accent} /></View>
        <Text style={s.emptyTitle}>{photos.length ? '이날의 사진은 아직 없어요' : '우리의 첫 사진을 담아볼까요?'}</Text>
        <Text style={s.emptyText}>바다도, 함께 먹은 한 끼도.{ '\n' }여행의 순간을 차곡차곡 모아보세요.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={addPhotos} style={s.emptyButton}><Text style={s.emptyButtonText}>{busy ? '사진 선택 중…' : '사진 추가'}</Text></Pressable>
      </View>}
      ListFooterComponent={<Text style={s.footer}>기기 내 미리보기 · 앱 재시작 시 초기화돼요{ '\n' }{photos.length}/200장 · 서버 공유는 아직 연결되지 않았어요</Text>}
      renderItem={({ item: row }) => row.kind === 'heading' ? <View style={s.groupHeading}><Text style={s.groupTitle}>{row.title}</Text><Text style={s.count}>{row.count}장</Text></View> : <View style={s.photoRow}>
        {row.photos.map((photo) => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`${photo.place ?? '장소 미연결'} 사진 크게 보기`} onPress={() => setSelectedId(photo.id)} style={[s.tile, { width: tile, height: tile }]}>
          <Image source={{ uri: photo.uri }} style={s.thumbnail} resizeMode="cover" onError={() => setFailedImages((current) => current.includes(photo.id) ? current : [...current, photo.id])} />
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
            <Pressable accessibilityRole="button" onPress={removeSelected} style={s.navButton}><Text style={s.deleteText}>삭제</Text></Pressable>
          </View>
          <ScrollView maximumZoomScale={3} minimumZoomScale={1} centerContent style={{ height: Math.min(height * 0.45, 440), backgroundColor: C.surface }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <Image source={{ uri: selected.uri }} style={{ width: contentWidth, height: Math.min(height * 0.45, 440) }} resizeMode="contain" />
          </ScrollView>
          <View style={s.detailsBody}>
            <View style={s.detailNav}>
              <Pressable accessibilityRole="button" accessibilityLabel="이전 사진" disabled={selectedIndex <= 0} onPress={() => setSelectedId(filtered[selectedIndex - 1].id)} style={s.navButton}><Text style={[s.navText, selectedIndex <= 0 && s.disabled]}>‹ 이전</Text></Pressable>
              <Text style={s.count}>{selectedIndex + 1} / {filtered.length}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="다음 사진" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onPress={() => setSelectedId(filtered[selectedIndex + 1].id)} style={s.navButton}><Text style={[s.navText, selectedIndex >= filtered.length - 1 && s.disabled]}>다음 ›</Text></Pressable>
            </View>
            <Text style={s.fieldTitle}>여행 날짜</Text><Text style={s.helper}>촬영일 자동 인식 전에는 직접 선택해주세요.</Text>
            <View style={s.detailChips}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: selected.day === null }} onPress={() => updateSelected({ day: null })} style={[s.chip, selected.day === null && s.chipSelected]}><Text style={[s.chipText, selected.day === null && s.chipTextSelected]}>미지정</Text></Pressable>
              {days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="button" accessibilityState={{ selected: selected.day === index }} onPress={() => updateSelected({ day: index })} style={[s.chip, selected.day === index && s.chipSelected]}><Text style={[s.chipText, selected.day === index && s.chipTextSelected]}>{index + 1}일 차</Text></Pressable>)}
            </View>
            <Text style={s.fieldTitle}>연결된 장소</Text><Text style={s.helper}>예시 장소 중 선택할 수 있어요. 자동 연결은 추후 제공돼요.</Text>
            <View style={s.detailChips}>
              {[null, ...places].map((place) => <Pressable key={place ?? 'none'} accessibilityRole="button" accessibilityState={{ selected: selected.place === place }} onPress={() => updateSelected({ place })} style={[s.chip, selected.place === place && s.chipSelected]}><Text style={[s.chipText, selected.place === place && s.chipTextSelected]}>{place ?? '미연결'}</Text></Pressable>)}
            </View>
            <Text style={s.helper}>변경 사항은 현재 미리보기에 바로 반영됩니다.</Text>
          </View>
        </ScrollView>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
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
  modes: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, marginTop: 24 },
  mode: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  modeSelected: { borderBottomColor: C.primary }, modeText: { fontSize: 14, color: C.textMuted }, modeTextSelected: { color: C.primary, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, paddingTop: 18, paddingBottom: 6 },
  chip: { borderRadius: 18, paddingHorizontal: 13, minHeight: 36, justifyContent: 'center', backgroundColor: C.surface },
  chipSelected: { backgroundColor: C.banner }, chipText: { fontSize: 12, color: C.textSecondary }, chipTextSelected: { color: C.primary, fontWeight: '600' },
  filterHint: { fontSize: 11, color: C.textMuted, marginTop: 8 },
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
  helper: { fontSize: 12, color: C.textMuted, lineHeight: 20, marginTop: 8 }, detailChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
