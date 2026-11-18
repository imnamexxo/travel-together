import 'leaflet/dist/leaflet.css';

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type * as Leaflet from 'leaflet';

import Pressable from '@/components/pressable';
import type { TravelPalette } from '@/constants/theme';
import { useThemedStyles, useTravelColors, useTravelTheme } from '@/theme/theme-context';
import type { MapPin, PlaceMapProps } from './map-types';

// 처음 보이는 곳(제주). 핀이 생기면 핀에 맞춘다.
const START: [number, number] = [33.523, 126.581];

/** 핀 하나의 그림(번호 동그라미). 앱 지도와 같은 모양: 들른 곳은 채움, 고른 곳은 테두리를 굵게. */
function pinHtml(pin: MapPin, index: number, selected: boolean, C: TravelPalette) {
  const fill = pin.visited ? C.primary : C.background;
  const ink = pin.visited ? C.onPrimary : C.primary;
  const border = selected ? `4px solid ${C.accent}` : `2px solid ${C.primary}`;
  return `<div style="width:34px;height:34px;box-sizing:border-box;border-radius:17px;border:${border};background:${fill};color:${ink};display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25)">${index + 1}</div>`;
}

/**
 * 웹 지도: OpenStreetMap 타일 + Leaflet. 폰 앱(react-native-maps)과 같은 핀·고르기·전체 맞추기를 한다.
 * Leaflet은 브라우저에서만 돌기 때문에(정적 렌더링 때는 window가 없다) 화면에 붙은 뒤에 불러온다.
 */
export default function PlaceMap({ pins, selectedId, onSelect }: PlaceMapProps) {
  const s = useThemedStyles(sStyles);
  const C = useTravelColors();
  const { scheme } = useTravelTheme();
  const holder = useRef<View>(null);
  const [map, setMap] = useState<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);
  // 누를 때 부를 함수는 늘 최신 것을 쓴다(지도를 다시 만들지 않으려고).
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let alive = true;
    let created: Leaflet.Map | null = null;
    void import('leaflet').then((mod) => {
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as typeof Leaflet);
      const node = holder.current as unknown as HTMLElement | null;
      if (!alive || !node) return;
      created = L.map(node, { zoomControl: true, attributionControl: true }).setView(START, 10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(created);
      setMap({ L, map: created, layer: L.layerGroup().addTo(created) });
    });
    return () => { alive = false; created?.remove(); };
  }, []);

  // 화면 크기가 바뀌면(아래 장소 정보를 펼치고 접을 때) 지도 크기를 다시 잰다.
  useEffect(() => {
    const node = holder.current as unknown as HTMLElement | null;
    if (!map || !node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.map.invalidateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [map]);

  // 핀 그리기. 고른 핀이나 색(다크 모드)이 바뀌어도 다시 그린다.
  useEffect(() => {
    if (!map) return;
    map.layer.clearLayers();
    pins.forEach((pin, index) => {
      const selected = pin.id === selectedId;
      map.L.marker([pin.latitude, pin.longitude], {
        title: pin.name,
        alt: `${index + 1}. ${pin.name}`,
        zIndexOffset: selected ? 1000 : 0,
        icon: map.L.divIcon({ html: pinHtml(pin, index, selected, C), className: '', iconSize: [34, 34], iconAnchor: [17, 17] }),
      }).on('click', () => select.current(pin.id)).addTo(map.layer);
    });
  }, [map, pins, selectedId, C]);

  // OpenStreetMap 타일은 밝은 그림뿐이라 다크 모드에서는 지도 그림만 살짝 어둡게 한다(핀은 그대로).
  useEffect(() => {
    const pane = map?.map.getPane('tilePane');
    if (pane) pane.style.filter = scheme === 'dark' ? 'brightness(0.75) contrast(1.05)' : '';
  }, [map, scheme]);

  function fit() {
    if (!map || !pins.length) return;
    if (pins.length === 1) map.map.setView([pins[0].latitude, pins[0].longitude], 14, { animate: true });
    else map.map.fitBounds(pins.map((p) => [p.latitude, p.longitude] as [number, number]), { paddingTopLeft: [50, 60], paddingBottomRight: [50, 80], animate: true });
  }
  // 핀 목록이 바뀌면(날짜·멤버·종류 필터) 모든 핀이 보이게 맞춘다.
  useEffect(fit, [map, pins]);

  return <View style={s.container}>
    <View ref={holder} style={s.map} />
    <Pressable accessibilityRole="button" accessibilityLabel="모든 장소가 보이도록 지도 맞추기" onPress={fit} style={s.fit}><Text style={s.fitText}>⊡</Text></Pressable>
    {!pins.length && <View style={s.empty}><Text style={s.emptyText}>선택한 조건에 해당하는 장소가 없어요</Text></View>}
  </View>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  map: { width: '100%', height: '100%', zIndex: 0 },
  fit: { position: 'absolute', right: 16, top: 16, width: 44, height: 44, borderRadius: 14, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 }, fitText: { fontSize: 27, color: C.primary },
  empty: { position: 'absolute', left: 20, right: 20, top: 76, padding: 16, borderRadius: 14, backgroundColor: C.background, zIndex: 1000 }, emptyText: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});
