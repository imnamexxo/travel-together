import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import type { Place } from '@/api/client';
import { usePlaceDetails } from '@/api/queries';
import { useTravelTheme } from '@/theme/theme-context';

/**
 * Google 장소 약관 맞추기(ADR 0006).
 * 해외 장소(source = 'google')는 서버가 이름·주소를 저장하지 않는다. 이름이 꼭 필요한 곳에서만 받아 오고,
 * 받은 값은 앱을 켜 둔 동안 메모리에만 둔다. 지도 핀·목록처럼 많이 보이는 곳은 일정 제목으로 대신한다.
 */

type PlaceLike = Pick<Place, 'id' | 'source' | 'name' | 'address' | 'road_address'>;

/** 받아 오지 않고 쓸 이름: 저장된 이름(카카오), 없으면 대신할 이름(일정 제목 등). */
export function placeLabel(place: Pick<Place, 'name'>, fallback?: string | null): string {
  return place.name ?? (fallback || '해외 장소');
}

/**
 * 장소 이름·주소. 카카오 장소는 저장된 값, Google 장소는 받아 온 값(받는 중이거나 실패하면 대신할 이름).
 * enabled가 false면 받지 않는다(예: 웹 지도 화면, Google 지도가 아닌 지도와 함께 쓰면 안 된다).
 */
export function usePlaceName(tripId: string, place: PlaceLike | null | undefined, fallback?: string | null, enabled = true) {
  const google = place?.source === 'google';
  const details = usePlaceDetails(tripId, google && enabled && place ? place.id : null);
  if (!place) return { name: '', address: '', fromGoogle: false };
  if (!google) return { name: placeLabel(place, fallback), address: place.road_address ?? place.address ?? '', fromGoogle: false };
  if (details.data) return { name: details.data.name, address: details.data.address, fromGoogle: true };
  return { name: placeLabel(place, fallback), address: '', fromGoogle: false };
}

/** 장소 이름 한 줄. Google에서 받은 이름이면 같은 줄 끝에 출처를 단다. */
export function PlaceName({ tripId, place, fallback, style, prefix = '' }: {
  tripId: string; place: PlaceLike; fallback?: string | null; style?: StyleProp<TextStyle>; prefix?: string;
}) {
  const { name, fromGoogle } = usePlaceName(tripId, place, fallback);
  return <Text style={style}>{prefix}{name}{fromGoogle && <GoogleAttribution inline />}</Text>;
}

/**
 * Google 지도가 아닌 화면에 Places 정보를 보여 줄 때 다는 출처. 로고 대신 글자 "Google Maps"를 쓴다
 * (Google 표시 규정: Roboto 12~16sp, #5E5E5E·#1F1F1F·흰색 중 대비 4.5:1, 대소문자·번역 바꾸지 않음, 한 줄).
 */
export function GoogleAttribution({ inline = false }: { inline?: boolean }) {
  const { scheme } = useTravelTheme();
  const color = scheme === 'dark' ? '#FFFFFF' : '#5E5E5E';
  const text = <Text accessibilityLabel="Google Maps" numberOfLines={1} style={[s.text, { color }]}>Google Maps</Text>;
  return inline ? <Text style={[s.text, { color }]}>{'  '}{text}</Text> : <Text style={s.block}>{text}</Text>;
}

const s = StyleSheet.create({
  text: { fontSize: 12, fontWeight: '400', fontStyle: 'normal', fontFamily: Platform.select({ android: 'sans-serif', web: 'Roboto, Arial, sans-serif' }) },
  block: { marginTop: 10, marginBottom: 5 },
});
