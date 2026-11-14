import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  visible: boolean;
  title: string;
  /** 'HH:MM' 또는 빈 값 */
  value: string;
  onConfirm: (time: string) => void;
  /** 있으면 "시간 없음" 버튼이 생긴다(시간을 비울 수 있는 칸). */
  onClear?: () => void;
  onClose: () => void;
};

/** 아래에서 올라오는 시간 고르기: 시(0~23)와 분(5분 단위)을 누른다. */
export default function TimePicker(props: Props) {
  return <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
    {props.visible && <Sheet {...props} />}
  </Modal>;
}

function Sheet({ title, value, onConfirm, onClear, onClose }: Props) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  const [hour, setHour] = useState<number | null>(match ? Number(match[1]) : null);
  const [minute, setMinute] = useState<number>(match ? Number(match[2]) : 0);
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);

  return <View style={s.backdrop}>
    <Pressable accessibilityLabel="닫기" style={s.dim} onPress={onClose} />
    <SafeAreaView edges={['bottom']} style={s.sheet}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.preview}>{hour === null ? '시를 눌러 주세요' : `${hour < 12 ? '오전' : '오후'} ${pad(hour)}:${pad(minute)}`}</Text>
      <Text style={s.section}>시</Text>
      <View style={s.grid}>{HOURS.map((h) => <Pressable key={h} accessibilityRole="button" accessibilityLabel={`${h}시`} accessibilityState={{ selected: hour === h }} onPress={() => setHour(h)} style={[s.chip, hour === h && s.chipOn]}>
        <Text style={[s.chipText, hour === h && s.chipTextOn]}>{pad(h)}</Text>
      </Pressable>)}</View>
      <Text style={s.section}>분</Text>
      <View style={s.grid}>{minutes.map((m) => <Pressable key={m} accessibilityRole="button" accessibilityLabel={`${m}분`} accessibilityState={{ selected: minute === m }} onPress={() => setMinute(m)} style={[s.chip, minute === m && s.chipOn]}>
        <Text style={[s.chipText, minute === m && s.chipTextOn]}>{pad(m)}</Text>
      </Pressable>)}</View>
      <View style={s.actions}>
        {onClear ? <Pressable accessibilityRole="button" onPress={onClear} style={[s.button, s.cancel]}><Text style={s.cancelText}>시간 없음</Text></Pressable>
          : <Pressable accessibilityRole="button" onPress={onClose} style={[s.button, s.cancel]}><Text style={s.cancelText}>취소</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: hour === null }} disabled={hour === null} onPress={() => hour !== null && onConfirm(`${pad(hour)}:${pad(minute)}`)} style={[s.button, s.ok, hour === null && s.disabled]}><Text style={s.okText}>확인</Text></Pressable>
      </View>
    </SafeAreaView>
  </View>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' }, dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: C.text }, preview: { fontSize: 26, fontWeight: '700', color: C.primary, marginTop: 8, fontVariant: ['tabular-nums'] },
  section: { fontSize: 12, color: C.textMuted, marginTop: 14, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { width: '15%', flexGrow: 1, minHeight: 40, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.primary }, chipText: { fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] }, chipTextOn: { color: C.onPrimary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: C.surface }, cancelText: { fontSize: 15, color: C.text },
  ok: { backgroundColor: C.primary }, okText: { fontSize: 15, fontWeight: '600', color: C.onPrimary }, disabled: { opacity: 0.4 },
});
