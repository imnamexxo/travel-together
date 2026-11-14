import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean; hint?: string };

/** 아래에서 올라오는 메뉴. 기본 알림창 대신 쓴다. 항목을 누르면 닫고 그 동작을 한다. */
export default function ActionSheet({ visible, title, info, actions, onClose }: {
  visible: boolean;
  title: string;
  /** 제목 아래 작은 안내 줄들 */
  info?: string[];
  actions: SheetAction[];
  onClose: () => void;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.backdrop}>
      <Pressable accessibilityLabel="닫기" style={s.dim} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.grabber} />
        <Text style={s.title}>{title}</Text>
        {!!info?.length && <Text testID="action-sheet-info" style={s.info}>{info.join('\n')}</Text>}
        <View style={s.list}>
          {actions.map((a) => <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => { onClose(); a.onPress(); }} style={({ pressed }) => [s.row, pressed && s.pressed]}>
            <Text style={[s.rowText, a.destructive && s.danger]}>{a.label}</Text>
            {!!a.hint && <Text style={s.hint}>{a.hint}</Text>}
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={onClose} style={({ pressed }) => [s.close, pressed && s.pressed]}><Text style={s.closeText}>닫기</Text></Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' }, dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.divider, marginTop: 10, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  info: { fontSize: 13, lineHeight: 20, color: C.textSecondary, marginTop: 6 },
  list: { marginTop: 14, borderRadius: 14, backgroundColor: C.surface, overflow: 'hidden' },
  row: { minHeight: 54, paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowText: { fontSize: 16, color: C.text }, danger: { color: C.error }, hint: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  close: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10, backgroundColor: C.surface },
  closeText: { fontSize: 16, fontWeight: '600', color: C.text },
  pressed: { opacity: 0.6 },
});
