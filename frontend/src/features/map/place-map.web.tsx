import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Pressable from '@/components/pressable';
import type { TravelPalette } from '@/constants/theme';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';
import type { MapPin, PlaceMapProps } from './map-types';

// 처음 보이는 곳(제주). 핀이 생기면 핀에 맞춘다.
const START = { lat: 33.523, lng: 126.581 };
const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY;

/* 카카오맵 JS SDK 중 여기서 쓰는 부분만 적는다. */
type LatLng = object;
type KakaoMap = {
  setCenter(at: LatLng): void; setLevel(level: number, options?: { animate?: boolean }): void;
  setBounds(bounds: LatLngBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  relayout(): void; addControl(control: object, position: number): void;
};
type LatLngBounds = { extend(at: LatLng): void };
type Overlay = { setMap(map: KakaoMap | null): void };
type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => LatLngBounds;
  Map: new (node: HTMLElement, options: { center: LatLng; level: number }) => KakaoMap;
  CustomOverlay: new (options: { position: LatLng; content: HTMLElement; yAnchor?: number; xAnchor?: number; zIndex?: number; clickable?: boolean }) => Overlay;
  ZoomControl: new () => object;
  ControlPosition: { RIGHT: number };
};
type KakaoWindow = Window & { kakao?: { maps: KakaoMaps } };

let loading: Promise<KakaoMaps> | null = null;

/** 카카오맵 SDK를 한 번만 불러온다. 키가 없거나 도메인이 등록되지 않았으면 실패한다. */
function loadKakaoMaps(): Promise<KakaoMaps> {
  if (loading) return loading;
  loading = new Promise<KakaoMaps>((resolve, reject) => {
    const w = window as KakaoWindow;
    if (w.kakao?.maps) { w.kakao.maps.load(() => resolve(w.kakao!.maps)); return; }
    if (!KAKAO_JS_KEY) { reject(new Error('no key')); return; }
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&autoload=false`;
    script.async = true;
    script.onload = () => (w.kakao?.maps ? w.kakao.maps.load(() => resolve(w.kakao!.maps)) : reject(new Error('sdk')));
    script.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(script);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

/** 핀 하나의 그림(번호 동그라미). 앱 지도와 같은 모양: 들른 곳은 채움, 고른 곳은 테두리를 굵게. */
function pinElement(pin: MapPin, index: number, selected: boolean, C: TravelPalette, onPress: () => void): HTMLElement {
  const fill = pin.visited ? C.primary : C.background;
  const ink = pin.visited ? C.onPrimary : C.primary;
  const node = document.createElement('button');
  node.type = 'button';
  node.title = pin.name;
  node.setAttribute('aria-label', `${index + 1}. ${pin.name}`);
  node.textContent = String(index + 1);
  node.style.cssText = `width:34px;height:34px;box-sizing:border-box;border-radius:17px;border:${selected ? `4px solid ${C.accent}` : `2px solid ${C.primary}`};`
    + `background:${fill};color:${ink};display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif;`
    + 'box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:pointer;padding:0';
  node.addEventListener('click', (event) => { event.stopPropagation(); onPress(); });
  return node;
}

/**
 * 웹 지도: 카카오맵 JS SDK. 폰 앱(react-native-maps)과 같은 핀·고르기·전체 맞추기를 한다.
 * 국내 여행의 장소는 카카오 장소 검색에서 온 것이라 카카오 지도에 그린다. 해외 여행(Google 장소)은
 * Google 지도가 아닌 곳에 그릴 수 없어(ADR 0006) 지도 화면이 따로 안내한다.
 * SDK는 브라우저에서만 돌기 때문에(정적 렌더링 때는 window가 없다) 화면에 붙은 뒤에 불러온다.
 */
export default function PlaceMap({ pins, selectedId, onSelect }: PlaceMapProps) {
  const s = useThemedStyles(sStyles);
  const C = useTravelColors();
  const holder = useRef<View>(null);
  const [map, setMap] = useState<{ kakao: KakaoMaps; map: KakaoMap } | null>(null);
  const [failed, setFailed] = useState(false);
  // 누를 때 부를 함수는 늘 최신 것을 쓴다(지도를 다시 만들지 않으려고).
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let alive = true;
    loadKakaoMaps().then((kakao) => {
      const node = holder.current as unknown as HTMLElement | null;
      if (!alive || !node) return;
      const created = new kakao.Map(node, { center: new kakao.LatLng(START.lat, START.lng), level: 9 });
      created.addControl(new kakao.ZoomControl(), kakao.ControlPosition.RIGHT);
      setMap({ kakao, map: created });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // 화면 크기가 바뀌면(아래 장소 정보를 펼치고 접을 때) 지도 크기를 다시 잰다.
  useEffect(() => {
    const node = holder.current as unknown as HTMLElement | null;
    if (!map || !node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.map.relayout());
    observer.observe(node);
    return () => observer.disconnect();
  }, [map]);

  // 핀 그리기. 고른 핀이나 색(다크 모드)이 바뀌어도 다시 그린다.
  useEffect(() => {
    if (!map) return;
    const overlays = pins.map((pin, index) => {
      const selected = pin.id === selectedId;
      const overlay = new map.kakao.CustomOverlay({
        position: new map.kakao.LatLng(pin.latitude, pin.longitude),
        content: pinElement(pin, index, selected, C, () => select.current(pin.id)),
        xAnchor: 0.5, yAnchor: 0.5, zIndex: selected ? 10 : 1, clickable: true,
      });
      overlay.setMap(map.map);
      return overlay;
    });
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [map, pins, selectedId, C]);

  function fit() {
    if (!map || !pins.length) return;
    if (pins.length === 1) {
      map.map.setCenter(new map.kakao.LatLng(pins[0].latitude, pins[0].longitude));
      map.map.setLevel(4, { animate: true });
      return;
    }
    const bounds = new map.kakao.LatLngBounds();
    pins.forEach((p) => bounds.extend(new map.kakao.LatLng(p.latitude, p.longitude)));
    map.map.setBounds(bounds, 60, 50, 80, 50);
  }
  // 핀 목록이 바뀌면(날짜·멤버·종류 필터) 모든 핀이 보이게 맞춘다.
  useEffect(fit, [map, pins]);

  return <View style={s.container}>
    <View ref={holder} style={s.map} />
    {!failed && <Pressable accessibilityRole="button" accessibilityLabel="모든 장소가 보이도록 지도 맞추기" onPress={fit} style={s.fit}><Text style={s.fitText}>⊡</Text></Pressable>}
    {failed ? <View style={s.empty}><Text style={s.emptyText}>지도를 불러오지 못했어요. 아래 장소 목록은 그대로 볼 수 있어요.</Text></View>
      : !pins.length && <View style={s.empty}><Text style={s.emptyText}>선택한 조건에 해당하는 장소가 없어요</Text></View>}
  </View>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  map: { width: '100%', height: '100%', zIndex: 0 },
  fit: { position: 'absolute', left: 16, top: 16, width: 44, height: 44, borderRadius: 14, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 }, fitText: { fontSize: 27, color: C.primary },
  empty: { position: 'absolute', left: 20, right: 20, top: 76, padding: 16, borderRadius: 14, backgroundColor: C.background, zIndex: 1000 }, emptyText: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});
