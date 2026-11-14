import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Pressable from '@/components/pressable';
import { TravelColors as C } from '@/constants/theme';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);
const pad = (n: number) => String(n).padStart(2, '0');
// 휠 한 칸의 높이와 보이는 칸 수(가운데 칸이 고른 값)
const ITEM = 52;
const VISIBLE = 5;
const DEFAULT = { hour: 9, minute: 0 };

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

/** 아래에서 올라오는 시간 고르기: 시와 분을 위아래로 굴려 가운데에 맞춘다(숫자를 눌러도 된다). */
export default function TimePicker(props: Props) {
  return <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
    {props.visible && <Sheet {...props} />}
  </Modal>;
}

function Sheet({ title, value, onConfirm, onClear, onClose }: Props) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  const [hour, setHour] = useState(match ? Number(match[1]) : DEFAULT.hour);
  const [minute, setMinute] = useState(match ? Number(match[2]) : DEFAULT.minute);

  return <View style={s.backdrop}>
    <Pressable accessibilityLabel="닫기" style={s.dim} onPress={onClose} />
    <SafeAreaView edges={['bottom']} style={s.sheet}>
      <Text style={s.title}>{title}</Text>
      <View style={s.wheels}>
        <View pointerEvents="none" style={s.band} />
        <Wheel values={HOURS} selected={hour} onChange={setHour} unit="시" />
        <Text style={s.colon}>:</Text>
        <Wheel values={MINUTES} selected={minute} onChange={setMinute} unit="분" />
      </View>
      <Text style={s.preview}>{hour < 12 ? '오전' : '오후'} {pad(hour === 0 || hour === 12 ? 12 : hour % 12)}:{pad(minute)}</Text>
      <View style={s.actions}>
        {onClear ? <Pressable accessibilityRole="button" onPress={onClear} style={[s.button, s.cancel]}><Text style={s.cancelText}>시간 없음</Text></Pressable>
          : <Pressable accessibilityRole="button" onPress={onClose} style={[s.button, s.cancel]}><Text style={s.cancelText}>취소</Text></Pressable>}
        <Pressable haptic accessibilityRole="button" onPress={() => onConfirm(`${pad(hour)}:${pad(minute)}`)} style={[s.button, s.ok]}><Text style={s.okText}>확인</Text></Pressable>
      </View>
    </SafeAreaView>
  </View>;
}

/** 굴려서 고르는 숫자 휠. 멈추면 가장 가까운 칸에 맞춘다. 숫자를 누르면 그 칸으로 간다. */
function Wheel({ values, selected, onChange, unit }: { values: number[]; selected: number; onChange: (v: number) => void; unit: string }) {
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, values.indexOf(selected));
  // 처음 열 때 고른 값을 가운데에 둔다.
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM, animated: false }), 0);
    return () => clearTimeout(id);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(values.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    if (values[i] !== selected) onChange(values[i]);
  };

  return <ScrollView ref={ref} style={s.wheel} showsVerticalScrollIndicator={false} snapToInterval={ITEM} decelerationRate="fast"
    nestedScrollEnabled contentContainerStyle={{ paddingVertical: ITEM * Math.floor(VISIBLE / 2) }}
    onMomentumScrollEnd={settle} onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity?.y) settle(e); }}>
    {values.map((v, i) => {
      const distance = Math.abs(i - index);
      return <Pressable key={v} accessibilityRole="button" accessibilityLabel={`${v}${unit}`} accessibilityState={{ selected: v === selected }}
        onPress={() => { onChange(v); ref.current?.scrollTo({ y: i * ITEM, animated: true }); }} style={s.item}>
        <Text style={[s.itemText, distance === 0 ? s.itemOn : distance === 1 ? s.itemNear : s.itemFar]}>{pad(v)}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' }, dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: C.text },
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: ITEM * VISIBLE, marginTop: 8 },
  band: { position: 'absolute', left: 0, right: 0, top: ITEM * Math.floor(VISIBLE / 2), height: ITEM, borderRadius: 14, backgroundColor: C.surface },
  wheel: { width: 96, height: ITEM * VISIBLE, flexGrow: 0 },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  itemOn: { fontSize: 34, color: C.text }, itemNear: { fontSize: 26, color: C.textMuted }, itemFar: { fontSize: 22, color: C.divider },
  colon: { fontSize: 32, fontWeight: '700', color: C.text, marginHorizontal: 18, marginBottom: 4 },
  preview: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: C.surface }, cancelText: { fontSize: 15, color: C.text },
  ok: { backgroundColor: C.primary }, okText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
});
