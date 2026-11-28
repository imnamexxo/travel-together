/** name은 저장된 이름(카카오) 또는 일정 제목(Google 장소, ADR 0006). source가 google이면 Google 지도에만 찍는다. */
export type MapPin = { id: string; name: string; latitude: number; longitude: number; visited: boolean; source: 'kakao' | 'google' };
/** provider: 웹에서 어느 지도를 쓸지(국내 kakao, 해외 google). 앱은 늘 기기 지도(안드로이드 Google, iOS Apple)를 쓴다. */
export type PlaceMapProps = { pins: MapPin[]; selectedId: string | null; onSelect: (id: string) => void; provider?: 'kakao' | 'google' };
