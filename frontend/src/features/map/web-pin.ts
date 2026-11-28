import { StyleSheet } from 'react-native';

import type { TravelPalette } from '@/constants/theme';
import type { MapPin } from './map-types';

/** 웹 지도(카카오·Google) 핀 하나의 그림(번호 동그라미). 앱 지도와 같은 모양: 들른 곳은 채움, 고른 곳은 테두리를 굵게. */
export function pinElement(pin: MapPin, index: number, selected: boolean, C: TravelPalette, onPress: () => void): HTMLElement {
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

/** 웹 지도 둘이 함께 쓰는 모양(지도 영역, 전체 맞추기 버튼, 안내 상자). */
export const webMapStyles = (C: TravelPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  map: { width: '100%', height: '100%', zIndex: 0 },
  fit: { position: 'absolute', left: 16, top: 16, width: 44, height: 44, borderRadius: 14, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 }, fitText: { fontSize: 27, color: C.primary },
  empty: { position: 'absolute', left: 20, right: 20, top: 76, padding: 16, borderRadius: 14, backgroundColor: C.background, zIndex: 1000 }, emptyText: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});
