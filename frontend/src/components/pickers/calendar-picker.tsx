import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { WEEKDAY_HEADERS, dayLabel, formatDay, inRange, isIso, monthGrid, monthOf, nights, pickRange, shiftMonth, todayIso, type Range } from './calendar-logic';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
} & (
  | { mode: 'range'; start: string | null; end: string | null; onConfirm: (start: string, end: string) => void }
  | { mode: 'single'; date: string | null; onConfirm: (date: string) => void }
);

/** 아래에서 올라오는 달력. 기간이면 시작일과 종료일을 차례로 누른다. */
export default function CalendarPicker(props: Props) {
  return <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
    {props.visible && <Sheet {...props} />}
  </Modal>;
}

function Sheet(props: Props) {
  const today = todayIso();
  const initial: Range = props.mode === 'range'
    ? { start: isIso(props.start) ? props.start : null, end: isIso(props.end) ? props.end : null }
    : { start: isIso(props.date) ? props.date : null, end: null };
  const [range, setRange] = useState<Range>(initial);
  const [view, setView] = useState(monthOf(initial.start ?? today));
  const weeks = monthGrid(view.year, view.month);
  const complete = props.mode === 'range' ? !!range.start && !!range.end : !!range.start;

  const tap = (iso: string) => setRange(props.mode === 'range' ? pickRange(range, iso) : { start: iso, end: null });
  const confirm = () => {
    if (!range.start) return;
    if (props.mode === 'range') { if (range.end) props.onConfirm(range.start, range.end); } else props.onConfirm(range.start);
  };
  const summary = props.mode === 'range'
    ? range.start && range.end ? `${formatDay(range.start, today)} – ${formatDay(range.end, today)} · ${nights({ start: range.start, end: range.end })}일`
      : range.start ? `${formatDay(range.start, today)}부터 · 끝나는 날을 눌러 주세요` : '시작하는 날을 눌러 주세요'
    : range.start ? formatDay(range.start, today) : '날짜를 눌러 주세요';

  return <View style={s.backdrop}>
    <Pressable accessibilityLabel="닫기" style={s.dim} onPress={props.onClose} />
    <SafeAreaView edges={['bottom']} style={s.sheet}>
      <Text style={s.title}>{props.title}</Text>
      <View style={s.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => setView(shiftMonth(view.year, view.month, -1))} style={s.nav}><Text style={s.navText}>‹</Text></Pressable>
        <Text style={s.month}>{view.year}년 {view.month}월</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => setView(shiftMonth(view.year, view.month, 1))} style={s.nav}><Text style={s.navText}>›</Text></Pressable>
      </View>
      <View style={s.week}>{WEEKDAY_HEADERS.map((w, i) => <Text key={w} style={[s.weekday, i === 0 && s.sunday, i === 6 && s.saturday]}>{w}</Text>)}</View>
      {weeks.map((week, w) => <View key={w} style={s.week}>
        {week.map((iso, i) => {
          if (!iso) return <View key={i} style={s.cell} />;
          const edge = iso === range.start || iso === range.end;
          const between = !edge && inRange(iso, range);
          return <Pressable key={iso} accessibilityRole="button" accessibilityLabel={dayLabel(iso)} accessibilityState={{ selected: edge || between }} onPress={() => tap(iso)} style={[s.cell, between && s.between]}>
            <View style={[s.day, edge && s.edge, iso === today && !edge && s.today]}>
              <Text style={[s.dayText, i === 0 && s.sunday, i === 6 && s.saturday, edge && s.edgeText]}>{Number(iso.slice(8))}</Text>
            </View>
          </Pressable>;
        })}
      </View>)}
      <Text style={s.summary}>{summary}</Text>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={props.onClose} style={[s.button, s.cancel]}><Text style={s.cancelText}>취소</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !complete }} disabled={!complete} onPress={confirm} style={[s.button, s.ok, !complete && s.disabled]}><Text style={s.okText}>확인</Text></Pressable>
      </View>
    </SafeAreaView>
  </View>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' }, dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  nav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, navText: { fontSize: 26, color: C.primary },
  month: { fontSize: 15, fontWeight: '600', color: C.primary },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: C.textMuted, paddingVertical: 6 },
  cell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }, between: { backgroundColor: C.banner },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  edge: { backgroundColor: C.primary }, today: { borderWidth: 1, borderColor: C.accent },
  dayText: { fontSize: 15, color: C.text }, edgeText: { color: C.onPrimary, fontWeight: '700' },
  sunday: { color: '#C2410C' }, saturday: { color: C.accent },
  summary: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: C.surface }, cancelText: { fontSize: 15, color: C.text },
  ok: { backgroundColor: C.primary }, okText: { fontSize: 15, fontWeight: '600', color: C.onPrimary }, disabled: { opacity: 0.4 },
});
