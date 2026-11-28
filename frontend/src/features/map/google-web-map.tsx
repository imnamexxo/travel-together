import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import Pressable from '@/components/pressable';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';
import { GOOGLE_MAPS_WEB_KEY } from './google-web-key';
import type { PlaceMapProps } from './map-types';
import { pinElement, webMapStyles } from './web-pin';

/* Maps JavaScript API 중 여기서 쓰는 부분만 적는다. */
type LatLngLiteral = { lat: number; lng: number };
type GMap = {
  setCenter(at: LatLngLiteral): void; setZoom(zoom: number): void;
  fitBounds(bounds: LatLngBounds, padding?: { top: number; right: number; bottom: number; left: number }): void;
};
type LatLngBounds = { extend(at: LatLngLiteral): void };
type MapPanes = { overlayMouseTarget: HTMLElement };
type Projection = { fromLatLngToDivPixel(at: unknown): { x: number; y: number } | null };
type OverlayViewBase = {
  setMap(map: GMap | null): void; getPanes(): MapPanes | null; getProjection(): Projection;
  onAdd?(): void; draw?(): void; onRemove?(): void;
};
type GoogleMaps = {
  Map: new (node: HTMLElement, options: object) => GMap;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new () => LatLngBounds;
  OverlayView: new () => OverlayViewBase;
};
type GoogleWindow = Window & { google?: { maps: GoogleMaps }; __travelTogetherMapsReady?: () => void };

let loading: Promise<GoogleMaps> | null = null;

/** Maps JavaScript API를 한 번만 불러온다. 키가 없거나, 주소 제한·하루 한도에 걸리면 실패한다. */
function loadGoogleMaps(): Promise<GoogleMaps> {
  if (loading) return loading;
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    const w = window as GoogleWindow;
    if (w.google?.maps?.Map) { resolve(w.google.maps); return; }
    if (!GOOGLE_MAPS_WEB_KEY) { reject(new Error('no key')); return; }
    w.__travelTogetherMapsReady = () => (w.google?.maps ? resolve(w.google.maps) : reject(new Error('sdk')));
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_WEB_KEY)}&v=weekly&language=ko&loading=async&callback=__travelTogetherMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(script);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

/** 지도 위에 HTML 핀 하나를 올린다(Advanced Marker는 지도 ID가 필요해 쓰지 않는다). */
function htmlOverlay(maps: GoogleMaps, at: LatLngLiteral, node: HTMLElement, zIndex: number): OverlayViewBase {
  const overlay = new maps.OverlayView();
  const position = new maps.LatLng(at.lat, at.lng);
  node.style.position = 'absolute';
  node.style.transform = 'translate(-50%, -50%)';
  node.style.zIndex = String(zIndex);
  overlay.onAdd = () => overlay.getPanes()?.overlayMouseTarget.appendChild(node);
  overlay.draw = () => {
    const point = overlay.getProjection().fromLatLngToDivPixel(position);
    if (point) { node.style.left = `${point.x}px`; node.style.top = `${point.y}px`; }
  };
  overlay.onRemove = () => node.remove();
  return overlay;
}

/**
 * 해외 여행의 웹 지도: Google Maps JavaScript API. 해외 장소는 Google에서 온 것이라 Google 지도에만 그린다(ADR 0006).
 * 폰 앱과 같은 핀·고르기·전체 맞추기를 한다. 키가 없거나 하루 한도가 다 차면 안내를 보여 주고, 아래 장소 목록은 그대로 쓴다.
 */
export default function GoogleWebMap({ pins, selectedId, onSelect }: PlaceMapProps) {
  const s = useThemedStyles(webMapStyles);
  const C = useTravelColors();
  const holder = useRef<View>(null);
  const [map, setMap] = useState<{ maps: GoogleMaps; map: GMap } | null>(null);
  const [failed, setFailed] = useState(false);
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let alive = true;
    loadGoogleMaps().then((maps) => {
      const node = holder.current as unknown as HTMLElement | null;
      if (!alive || !node) return;
      const created = new maps.Map(node, {
        center: pins[0] ? { lat: pins[0].latitude, lng: pins[0].longitude } : { lat: 35.68, lng: 139.76 }, zoom: 11,
        streetViewControl: false, mapTypeControl: false, fullscreenControl: false, clickableIcons: false,
      });
      setMap({ maps, map: created });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // 지도는 한 번만 만든다. 처음 중심은 그때의 첫 핀이고, 이후에는 fit이 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
    const overlays = pins.map((pin, index) => {
      const selected = pin.id === selectedId;
      const overlay = htmlOverlay(map.maps, { lat: pin.latitude, lng: pin.longitude }, pinElement(pin, index, selected, C, () => select.current(pin.id)), selected ? 10 : 1);
      overlay.setMap(map.map);
      return overlay;
    });
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [map, pins, selectedId, C]);

  function fit() {
    if (!map || !pins.length) return;
    if (pins.length === 1) {
      map.map.setCenter({ lat: pins[0].latitude, lng: pins[0].longitude });
      map.map.setZoom(15);
      return;
    }
    const bounds = new map.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.map.fitBounds(bounds, { top: 60, right: 50, bottom: 80, left: 50 });
  }
  useEffect(fit, [map, pins]);

  return <View style={s.container}>
    <View ref={holder} style={s.map} />
    {!failed && <Pressable accessibilityRole="button" accessibilityLabel="모든 장소가 보이도록 지도 맞추기" onPress={fit} style={s.fit}><Text style={s.fitText}>⊡</Text></Pressable>}
    {failed ? <View style={s.empty}><Text style={s.emptyText}>지도를 불러오지 못했어요. 아래 장소 목록은 그대로 볼 수 있어요.</Text></View>
      : !pins.length && <View style={s.empty}><Text style={s.emptyText}>선택한 조건에 해당하는 장소가 없어요</Text></View>}
  </View>;
}
