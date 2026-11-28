import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Suggestion } from '@/api/client';
import { useAdoptSuggestions } from '@/api/queries';
import MetaLine from '@/components/meta-line';
import Pressable from '@/components/pressable';
import { Type, type TravelPalette } from '@/constants/theme';
import { useThemedStyles } from '@/theme/theme-context';
import { useCurrentTrip } from './current-trip';

/** 앞 장소와 직선으로 이만큼(km) 넘게 떨어져 있으면 이동이 길다고 알린다. */
export const FAR_KM = 25;

type Item = Suggestion['items'][number];

function whereText(item: Item) {
  if (item.place) return item.place.road_address ?? item.place.address;
  if (!item.region) return '장소 없는 일정';
  return item.status === 'verified' ? item.region : `${item.region}, 지도에서 찾지 못했어요`;
}

/**
 * 추천 일정·붙여 넣은 계획의 후보 카드. 날짜별로 묶어 보여 주고, 고른 것만 플래너에 넣는다.
 * 시각·이동 정보가 있으면 함께 보여 준다.
 */
export default function SuggestionResult({ result, onAdopted, note }: { result: Suggestion; onAdopted: () => void; note: string }) {
  const s = useThemedStyles(sStyles);
  const { trip, days } = useCurrentTrip();
  const adopt = useAdoptSuggestions(trip.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pickable = result.items.filter((i) => !i.adopted).map((i) => i.id);
  const allPicked = pickable.length > 0 && pickable.every((id) => selected.includes(id));

  async function addToPlanner() {
    if (!selected.length) return;
    setError(null);
    try {
      await adopt.mutateAsync({ requestId: result.id, itemIds: selected });
      onAdopted();
    } catch (e) {
      setError(e instanceof Error ? e.message : '플래너에 추가하지 못했어요.');
    }
  }

  const byDate = result.items.reduce<Record<string, Item[]>>((groups, item) => {
    (groups[item.date] ??= []).push(item);
    return groups;
  }, {});

  return <>
    <View style={s.between}>
      <Text style={s.resultTitle}>{result.destination}</Text>
      {pickable.length > 1 && <Pressable accessibilityRole="button" onPress={() => setSelected(allPicked ? [] : pickable)} style={s.textButton}>
        <Text style={s.smallLink}>{allPicked ? '모두 해제' : '모두 선택'}</Text>
      </Pressable>}
    </View>
    {result.reused && <Text style={s.caption}>같은 조건으로 받은 결과를 다시 보여드려요.</Text>}
    {Object.entries(byDate).map(([date, items]) => {
      const dayNumber = days.findIndex((d) => d.iso === date) + 1;
      return <View key={date} style={s.day}>
        <Text style={s.dayTitle}>{dayNumber > 0 ? `${dayNumber}일 차  ` : ''}{days[dayNumber - 1]?.title ?? date}</Text>
        {items.map((item) => {
          const on = selected.includes(item.id);
          const far = item.distance_km != null && item.distance_km >= FAR_KM;
          const moving = [item.transport, item.travel_minutes ? `${item.travel_minutes}분` : null].filter(Boolean).join(' ');
          return <View key={item.id}>
            {(!!moving || far) && <Text style={[s.travel, far && s.travelFar]}>↓ {moving}{far ? `  앞 장소와 ${item.distance_km}km, 이동이 길어요` : ''}</Text>}
            <Pressable accessibilityRole="checkbox" accessibilityLabel={`${item.place_name} 선택`} accessibilityState={{ checked: on || item.adopted, disabled: item.adopted }} disabled={item.adopted}
              onPress={() => setSelected((current) => on ? current.filter((id) => id !== item.id) : [...current, item.id])} style={[s.card, on && s.cardOn, item.adopted && s.cardDone]}>
              <View style={s.between}>
                <Text style={s.cardTitle}>{on ? '✓ ' : ''}{item.start_time ? `${item.start_time.slice(0, 5)}  ` : `${item.order}. `}{item.place_name}</Text>
                {item.adopted ? <Text style={s.badgeDone}>추가됨</Text> : item.status === 'needs_check' && !!item.region && <Text style={s.badgeWarn}>확인 필요</Text>}
              </View>
              <MetaLine textStyle={s.caption} parts={[whereText(item), `약 ${item.stay_minutes}분`]} />
              {!!item.description && <Text style={s.desc}>{item.description}</Text>}
            </Pressable>
          </View>;
        })}
      </View>;
    })}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selected.length || adopt.isPending }} disabled={!selected.length || adopt.isPending} onPress={addToPlanner} style={[s.primary, (!selected.length || adopt.isPending) && s.pressed]}>
      <Text style={s.primaryText}>플래너에 추가 ({selected.length})</Text>
    </Pressable>
    <Text style={s.caption}>{note}</Text>
  </>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  caption: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 19, flexShrink: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultTitle: { fontSize: 18, fontFamily: Type.heading, color: C.text, marginTop: 30 },
  textButton: { minHeight: 44, justifyContent: 'center', marginTop: 26 }, smallLink: { fontSize: 12, fontWeight: '600', color: C.accent },
  day: { marginTop: 22 }, dayTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  travel: { fontSize: 12, color: C.textMuted, marginTop: 8, marginLeft: 12 }, travelFar: { color: C.error },
  card: { marginTop: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.divider }, cardOn: { borderColor: C.primary, backgroundColor: C.banner }, cardDone: { opacity: 0.55 },
  cardTitle: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.text },
  desc: { fontSize: 13, color: C.textSecondary, marginTop: 6, lineHeight: 19 },
  badgeWarn: { fontSize: 11, fontWeight: '600', color: C.error, backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeDone: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  error: { fontSize: 13, color: C.error, marginTop: 12, lineHeight: 19 },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 22 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary }, pressed: { opacity: 0.5 },
});
