import GoogleWebMap from './google-web-map';
import KakaoWebMap from './kakao-web-map';
import type { PlaceMapProps } from './map-types';

/**
 * 웹 지도. 국내 여행은 카카오맵, 해외 여행은 Google 지도.
 * 장소 검색기가 다르기 때문이다: 국내 장소는 카카오, 해외 장소는 Google에서 왔고, Google 장소는 Google 지도에만 그릴 수 있다(ADR 0006).
 */
export default function PlaceMap(props: PlaceMapProps) {
  return props.provider === 'google' ? <GoogleWebMap {...props} /> : <KakaoWebMap {...props} />;
}
