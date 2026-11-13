import { StyleSheet, Switch, Text, View } from 'react-native';

import { TravelColors as C } from '@/constants/theme';

/** 국내/해외 여행(ADR 0004). 해외 여행이면 장소를 Google 지도에서 찾는다. */
export default function OverseasField({ value, onChange, hint }: { value: boolean; onChange: (overseas: boolean) => void; hint?: string }) {
  return <>
    <View style={s.row}>
      <View style={s.copy}>
        <Text style={s.label}>해외 여행</Text>
        <Text style={s.sub}>{value ? '장소를 Google 지도에서 찾아요.' : '국내 여행이에요. 장소를 카카오맵에서 찾아요.'}</Text>
      </View>
      <Switch accessibilityLabel="해외 여행" value={value} onValueChange={onChange} trackColor={{ true: C.primary, false: C.surface }} />
    </View>
    {!!hint && <Text style={s.hint}>{hint}</Text>}
  </>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, minHeight: 52 },
  copy: { flex: 1 }, label: { fontSize: 13, fontWeight: '500', color: C.text }, sub: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 18, color: C.textMuted, marginTop: 4 },
});
