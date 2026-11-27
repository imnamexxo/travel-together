import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Photo, PlanItem } from '@/api/client';
import { useLinkPhotosPlace, usePlanItems } from '@/api/queries';
import { showAlert } from '@/components/dialog';
import Pressable from '@/components/pressable';
import type { TravelPalette } from '@/constants/theme';
import { toKstParts } from '@/features/expenses/expense-form';
import { placeLabel } from '@/features/places/google-places';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';

type Choice = { placeId: string; label: string; plans: PlanItem[]; sameDay: boolean };

/**
 * 일정 장소 목록을 고를 후보로 만든다. 고른 사진의 촬영 날짜에 잡힌 일정의 장소가 앞에 온다.
 * 이름은 받아 오지 않고 저장된 이름이나 일정 제목을 쓴다(ADR 0006).
 */
export function placeChoices(planItems: PlanItem[], photos: Photo[]): Choice[] {
  const photoDays = new Set(photos.flatMap((p) => p.taken_at ? [toKstParts(p.taken_at).date] : []));
  const byPlace = new Map<string, Choice>();
  const sorted = [...planItems].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  for (const item of sorted) {
    if (!item.place) continue;
    const choice = byPlace.get(item.place.id) ?? { placeId: item.place.id, label: placeLabel(item.place, item.title), plans: [], sameDay: false };
    choice.plans.push(item);
    choice.sameDay ||= photoDays.has(item.date);
    byPlace.set(item.place.id, choice);
  }
  const all = [...byPlace.values()];
  return [...all.filter((c) => c.sameDay), ...all.filter((c) => !c.sameDay)];
}

/** 앨범에서 고른 여러 사진을 일정 장소 하나에 한 번에 연결하거나 연결을 푼다. */
export default function BatchPlaceSheet({ photos, onClose, onDone }: { photos: Photo[]; onClose: () => void; onDone: () => void }) {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { trip, days } = useCurrentTrip();
  const planItems = usePlanItems(trip.id);
  const link = useLinkPhotosPlace(trip.id);
  const choices = placeChoices(planItems.data ?? [], photos);
  const dayNumber = (iso: string) => days.findIndex((d) => d.iso === iso) + 1;

  function apply(placeId: string | null) {
    link.mutate({ photoIds: photos.map((p) => p.id), link: placeId ? { place_id: placeId } : {} }, {
      onSuccess: ({ failed, total }) => {
        if (failed) showAlert('일부 사진을 연결하지 못했어요', `${total}장 중 ${failed}장이 실패했어요. 다시 시도해주세요.`);
        else onDone();
      },
      onError: (e) => showAlert('연결하지 못했어요', e.message),
    });
  }

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={s.screen}>
      <View style={s.nav}>
        <Pressable accessibilityRole="button" disabled={link.isPending} onPress={onClose} style={s.navButton}><Text style={s.navText}>닫기</Text></Pressable>
        <Text style={s.title}>사진 {photos.length}장 장소 연결</Text>
        <View style={s.navButton} />
      </View>
      {link.isPending ? <View style={s.busy}><ActivityIndicator color={C.primary} /><Text style={s.helper}>사진 {photos.length}장을 연결하는 중이에요…</Text></View>
        : <ScrollView contentContainerStyle={s.content}>
          <Text style={s.helper}>고른 사진을 모두 같은 장소에 연결해요. 사진 촬영 날짜의 일정 장소가 위에 나와요.</Text>
          {planItems.isPending ? <ActivityIndicator style={s.busy} color={C.primary} />
            : planItems.isError ? <Text style={s.error}>{planItems.error.message}</Text>
            : !choices.length ? <Text style={s.helper}>장소가 있는 일정이 아직 없어요. 일정에 장소를 넣거나, 사진을 하나씩 열어 검색해서 연결하세요.</Text>
            : choices.map((c, index) => <View key={c.placeId}>
              {(index === 0 || choices[index - 1].sameDay !== c.sameDay) && <Text style={s.section}>{c.sameDay ? '사진 찍은 날의 일정' : '다른 날의 일정'}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={`${c.label}에 연결`} onPress={() => apply(c.placeId)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                <Text style={s.rowTitle}>{c.label}</Text>
                <Text style={s.helper}>{c.plans.map((p) => `${dayNumber(p.date) > 0 ? `${dayNumber(p.date)}일 차` : p.date} ${p.time?.slice(0, 5) ?? ''} ${p.title}`.replace(/\s+/g, ' ').trim()).join(' · ')}</Text>
              </Pressable>
            </View>)}
          <Pressable accessibilityRole="button" accessibilityLabel="고른 사진의 장소 연결 해제" onPress={() => apply(null)} style={({ pressed }) => [s.row, s.unlink, pressed && s.pressed]}>
            <Text style={s.unlinkText}>장소 연결 해제</Text>
          </Pressable>
        </ScrollView>}
    </SafeAreaView>
  </Modal>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, maxWidth: 600, width: '100%', alignSelf: 'center' },
  navButton: { minWidth: 52, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, navText: { fontSize: 14, color: C.accent },
  title: { fontSize: 16, fontWeight: '600', color: C.text },
  content: { paddingHorizontal: 24, paddingBottom: 32, maxWidth: 600, width: '100%', alignSelf: 'center' },
  busy: { paddingVertical: 48, alignItems: 'center', gap: 12 },
  helper: { fontSize: 12, color: C.textMuted, lineHeight: 19, marginTop: 6 },
  section: { fontSize: 13, fontWeight: '600', color: C.primary, marginTop: 22, marginBottom: 4 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider, minHeight: 52, justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.text }, pressed: { opacity: 0.6 },
  unlink: { marginTop: 18, borderBottomWidth: 0 }, unlinkText: { fontSize: 14, color: C.error },
  error: { fontSize: 12, color: C.error, marginTop: 12 },
});
