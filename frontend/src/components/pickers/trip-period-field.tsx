import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { TravelColors as C } from '@/constants/theme';
import CalendarPicker from './calendar-picker';
import { formatDay, isIso, nights } from './calendar-logic';
import PickerField from './picker-field';

/** 여행 기간: 누르면 달력이 열리고 시작일·종료일을 차례로 누른다. */
export default function TripPeriodField({ start, end, onChange, error }: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const value = isIso(start) && isIso(end) ? `${formatDay(start)} – ${formatDay(end)} · ${nights({ start, end })}일` : null;
  return <>
    <Text style={s.label}>여행 기간</Text>
    <PickerField label="여행 기간" value={value} placeholder="날짜를 골라 주세요" onPress={() => setOpen(true)} invalid={!!error} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <CalendarPicker visible={open} mode="range" title="여행 기간" start={start || null} end={end || null}
      onClose={() => setOpen(false)} onConfirm={(a, b) => { onChange(a, b); setOpen(false); }} />
  </>;
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 18 },
  error: { fontSize: 12, lineHeight: 19, color: C.error, marginTop: 7 },
});
