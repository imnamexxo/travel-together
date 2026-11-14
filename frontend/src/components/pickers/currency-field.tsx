import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { CURRENCIES, CURRENCY_CODES, currencyName, type CurrencyCode } from '@/lib/money';
import PickerField from './picker-field';

/** 여행 통화(ADR 0004): 누르면 통화 목록이 아래에서 올라온다. */
export default function CurrencyField({ value, onChange, hint }: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Text style={s.label}>통화</Text>
    <PickerField label="통화" value={`${currencyName(value)} · ${value}`} placeholder="통화 고르기" onPress={() => setOpen(true)} />
    {!!hint && <Text style={s.hint}>{hint}</Text>}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={s.backdrop}>
        <Pressable accessibilityLabel="닫기" style={s.dim} onPress={() => setOpen(false)} />
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <Text style={s.title}>통화</Text>
          <Text style={s.sub}>지출과 정산을 모두 이 통화로 적어요.</Text>
          <ScrollView style={s.list}>
            {CURRENCY_CODES.map((code) => <Pressable key={code} accessibilityRole="button" accessibilityLabel={currencyName(code)} accessibilityState={{ selected: code === value }}
              onPress={() => { onChange(code); setOpen(false); }} style={[s.row, code === value && s.rowOn]}>
              <Text style={s.symbol}>{CURRENCIES[code].symbol}</Text>
              <Text style={[s.name, code === value && s.nameOn]}>{currencyName(code)}</Text>
              <Text style={s.code}>{code}</Text>
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 10, marginTop: 18 },
  hint: { fontSize: 12, lineHeight: 18, color: C.textMuted, marginTop: 7 },
  backdrop: { flex: 1, justifyContent: 'flex-end' }, dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '75%' },
  title: { fontSize: 17, fontWeight: '700', color: C.text }, sub: { fontSize: 12, color: C.textMuted, marginTop: 4, marginBottom: 10 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 12, borderRadius: 12, gap: 12 }, rowOn: { backgroundColor: C.surface },
  symbol: { width: 40, fontSize: 15, color: C.primary, fontWeight: '600' }, name: { flex: 1, fontSize: 15, color: C.text }, nameOn: { fontWeight: '700' },
  code: { fontSize: 12, color: C.textMuted },
});
