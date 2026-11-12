import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TravelColors as C } from '@/constants/theme';
import type { PlaceMapProps } from './map-types';

// Keep native map imports out of the web bundle. Web is not a target platform.
export default function PlaceMap({ pins, selectedId, onSelect }: PlaceMapProps) {
  return <View style={s.container}><Text style={s.hint}>실제 지도는 아이폰·안드로이드 앱에서 확인할 수 있어요.</Text>
    {pins.map((pin) => <Pressable key={pin.id} accessibilityRole="button" onPress={() => onSelect(pin.id)} style={[s.row, selectedId === pin.id && s.selected]}>
      <Text style={s.name}>{pin.visited ? '●' : '○'} {pin.name}</Text>
    </Pressable>)}
    {!pins.length && <Text style={s.hint}>선택한 조건에 해당하는 장소가 없어요.</Text>}
  </View>;
}
const s = StyleSheet.create({ container: { flex: 1, padding: 20, backgroundColor: C.surface }, hint: { fontSize: 13, lineHeight: 22, color: C.textSecondary, marginBottom: 16 }, row: { padding: 16, borderRadius: 12, marginBottom: 8 }, selected: { backgroundColor: C.banner }, name: { color: C.primary, fontSize: 15 } });
