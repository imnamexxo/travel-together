import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Pressable from '@/components/pressable';
import type { TravelPalette } from '@/constants/theme';
import { useThemedStyles } from '@/theme/theme-context';

export type SuggestedGroup = { placeId: string; label: string; count: number };

type Props = {
  visible: boolean;
  groups: SuggestedGroup[];
  /** 추천 장소가 없어 장소 없이 올라갈 사진 수 */
  unmatched: number;
  accepted: Set<string>;
  onToggle: (placeId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 올리기 전 장소 확인. 사진 위치(GPS)는 휴대폰 안에서 장소를 "추천"하는 데만 쓰고,
 * 서버에는 사용자가 여기서 확인한 장소만 보낸다(직접 연결과 같은 경로). docs/research/location-info-act.md, ADR-0003.
 */
export default function PlaceConfirmSheet({ visible, groups, unmatched, accepted, onToggle, onConfirm, onCancel }: Props) {
  const s = useThemedStyles(sStyles);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
    <View style={s.backdrop}>
      <Pressable accessibilityLabel="닫기" style={s.dim} onPress={onCancel} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.grabber} />
        <Text style={s.title}>사진을 이 장소에 연결할까요?</Text>
        <Text style={s.info}>사진을 찍은 곳 근처의 일정 장소를 골라 두었어요. 체크한 장소만 연결돼요. 사진의 위치는 추천에만 쓰고 저장하지 않아요.</Text>
        <ScrollView style={s.list}>
          {groups.map((g) => {
            const on = accepted.has(g.placeId);
            return <Pressable key={g.placeId} accessibilityRole="checkbox" accessibilityLabel={`${g.label}에 사진 ${g.count}장 연결`} accessibilityState={{ checked: on }} onPress={() => onToggle(g.placeId)} style={s.row}>
              <View style={[s.box, on && s.boxOn]}><Text style={s.check}>{on ? '✓' : ''}</Text></View>
              <Text style={s.label} numberOfLines={1}>{g.label}</Text>
              <Text style={s.count}>{g.count}장</Text>
            </Pressable>;
          })}
          {unmatched > 0 && <Text style={s.unmatched}>근처 일정 장소가 없는 사진 {unmatched}장은 장소 없이 올라가요. 나중에 앨범에서 연결할 수 있어요.</Text>}
        </ScrollView>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="사진 올리기 취소" onPress={onCancel} style={s.cancel}><Text style={s.cancelText}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="사진 올리기" onPress={onConfirm} style={s.confirm}><Text style={s.confirmText}>올리기</Text></Pressable>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' }, dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 24, paddingBottom: 12, maxHeight: '80%', width: '100%', maxWidth: 600, alignSelf: 'center' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 10, marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '600', color: C.text }, info: { fontSize: 12, lineHeight: 18, color: C.textMuted, marginTop: 8 },
  list: { marginTop: 14, flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }, boxOn: { backgroundColor: C.primary, borderColor: C.primary },
  check: { color: C.onPrimary, fontSize: 14, fontWeight: '700' },
  label: { flex: 1, fontSize: 15, color: C.text }, count: { fontSize: 13, color: C.textSecondary },
  unmatched: { fontSize: 12, lineHeight: 18, color: C.textMuted, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, cancelText: { fontSize: 15, color: C.textSecondary },
  confirm: { flex: 2, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }, confirmText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
});
