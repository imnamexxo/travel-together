import { StyleSheet, Switch, Text, View } from 'react-native';

import { TravelColors as C } from '@/constants/theme';

/** 국내/해외 여행(ADR 0004). 해외 여행이면 장소를 Google 지도에서 찾는다. */
/** warning: 원이 아닌 통화인데 국내 여행이면 켜 둔다(해외 장소가 검색되지 않는다는 안내). */
export default function OverseasField({ value, onChange, hint, warning }: { value: boolean; onChange: (overseas: boolean) => void; hint?: string; warning?: boolean }) {
  return <>
    <View style={s.row}>
      <View style={s.copy}>
        <Text style={s.label}>해외 여행</Text>
        <Text style={s.sub}>{value ? '장소를 Google 지도에서 찾아요.' : '국내 여행이에요. 장소를 카카오맵에서 찾아요.'}</Text>
      </View>
      <Switch accessibilityLabel="해외 여행" value={value} onValueChange={onChange} trackColor={{ true: C.primary, false: C.surface }} />
    </View>
    {warning && <Text accessibilityRole="alert" style={s.warning}>국내 여행은 장소를 카카오맵(국내)에서만 찾아요. 해외로 가면 해외 여행을 켜 주세요.</Text>}
    {!!hint && <Text style={s.hint}>{hint}</Text>}
  </>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, minHeight: 52 },
  copy: { flex: 1 }, label: { fontSize: 13, fontWeight: '500', color: C.text }, sub: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 18, color: C.textMuted, marginTop: 4 },
  warning: { fontSize: 12, lineHeight: 18, color: C.error, marginTop: 4 },
});
