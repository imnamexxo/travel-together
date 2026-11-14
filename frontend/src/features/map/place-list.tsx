import { StyleSheet, Text, View } from 'react-native';
import Pressable from '@/components/pressable';
import { TravelColors as C } from '@/constants/theme';
import type { PlaceMapProps } from './map-types';

/** 지도를 그릴 수 없을 때(웹, 지도 키가 없는 빌드) 핀 대신 보여 주는 장소 목록. */
export default function PlaceList({ pins, selectedId, onSelect, hint }: PlaceMapProps & { hint: string }) {
  return <View style={s.container}><Text style={s.hint}>{hint}</Text>
    {pins.map((pin) => <Pressable key={pin.id} accessibilityRole="button" onPress={() => onSelect(pin.id)} style={[s.row, selectedId === pin.id && s.selected]}>
      <Text style={s.name}>{pin.visited ? '●' : '○'} {pin.name}</Text>
    </Pressable>)}
    {!pins.length && <Text style={s.hint}>선택한 조건에 해당하는 장소가 없어요.</Text>}
  </View>;
}
const s = StyleSheet.create({ container: { flex: 1, padding: 20, backgroundColor: C.surface }, hint: { fontSize: 13, lineHeight: 22, color: C.textSecondary, marginBottom: 16 }, row: { padding: 16, borderRadius: 12, marginBottom: 8 }, selected: { backgroundColor: C.banner }, name: { color: C.primary, fontSize: 15 } });
