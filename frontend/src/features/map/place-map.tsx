import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { TravelColors as C } from '@/constants/theme';
import type { PlaceMapProps } from './map-types';
import PlaceList from './place-list';

/** Android는 구글 지도 키 없이 지도를 그리면 화면이 열리지 않는다(#16에서 키를 넣으면 지도가 나온다). */
export function hasMapKey(platform = Platform.OS, config = Constants.expoConfig): boolean {
  // 키 값은 실행 중인 앱 설정에서 빠지므로 app.config.js가 넣는 표시를 본다.
  return platform !== 'android' || config?.extra?.hasGoogleMapsKey === true;
}

export default function PlaceMap(props: PlaceMapProps) {
  if (!hasMapKey()) return <PlaceList {...props} hint="지도 키가 아직 없어 장소를 목록으로 보여 드려요." />;
  return <NativeMap {...props} />;
}

function NativeMap({ pins, selectedId, onSelect }: PlaceMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  // Android 구글 지도는 직접 그린 핀을 그림으로 찍어 쓴다. 숫자가 다 그려지기 전에 찍히면 숫자가 빠지므로,
  // 핀이 바뀌면 잠깐 동안 다시 그리게 두었다가(tracksViewChanges) 멈춘다(계속 켜 두면 느려진다).
  const changeKey = useMemo(() => `${pins.map((p) => `${p.id}:${p.visited}`).join('|')}#${selectedId}#${ready}`, [pins, selectedId, ready]);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettledKey(changeKey), 800);
    return () => clearTimeout(timer);
  }, [changeKey]);
  const redrawing = settledKey !== changeKey;
  const fit = useCallback(() => {
    if (!ready || !pins.length) return;
    if (pins.length === 1) {
      map.current?.animateToRegion({ ...pins[0], latitudeDelta: 0.035, longitudeDelta: 0.035 }, 350);
    } else {
      map.current?.fitToCoordinates(pins, { edgePadding: { top: 60, left: 50, right: 50, bottom: 80 }, animated: true });
    }
  }, [pins, ready]);
  useEffect(() => { fit(); }, [fit]);

  return <View style={s.container}>
    <MapView ref={map} style={s.map} onMapReady={() => setReady(true)}
      initialRegion={{ latitude: 33.523, longitude: 126.581, latitudeDelta: 0.12, longitudeDelta: 0.25 }}
      showsUserLocation={false} showsMyLocationButton={false} showsCompass={false} showsPointsOfInterests={false} toolbarEnabled={false}>
      {pins.map((pin, index) => <Marker key={`${pin.id}-${pin.visited}-${pin.id === selectedId}`} coordinate={pin}
        title={pin.name} description={pin.visited ? '들른 곳 · 사진 연결됨' : '계획만 한 곳'} onPress={() => onSelect(pin.id)} tracksViewChanges={redrawing}>
        <View collapsable={false} style={[s.pin, pin.visited && s.visited, pin.id === selectedId && s.selected]}>
          <Text style={[s.pinText, pin.visited && s.visitedText]}>{index + 1}</Text>
        </View>
      </Marker>)}
    </MapView>
    <Pressable accessibilityRole="button" accessibilityLabel="모든 장소가 보이도록 지도 맞추기" onPress={fit} style={s.fit}><Text style={s.fitText}>⊡</Text></Pressable>
    {!pins.length && <View style={s.empty}><Text style={s.emptyText}>선택한 조건에 해당하는 장소가 없어요</Text></View>}
  </View>;
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface }, map: { width: '100%', height: '100%' },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: C.primary, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
  visited: { backgroundColor: C.primary }, selected: { borderColor: C.accent, borderWidth: 4 },
  pinText: { fontSize: 13, fontWeight: '700', color: C.primary }, visitedText: { color: C.onPrimary },
  fit: { position: 'absolute', right: 16, top: 16, width: 44, height: 44, borderRadius: 14, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }, fitText: { fontSize: 27, color: C.primary },
  empty: { position: 'absolute', left: 20, right: 20, top: 76, padding: 16, borderRadius: 12, backgroundColor: C.background }, emptyText: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});
