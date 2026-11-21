/** name은 저장된 이름(카카오) 또는 일정 제목(Google 장소, ADR 0006). source가 google이면 Google 지도에만 찍는다. */
export type MapPin = { id: string; name: string; latitude: number; longitude: number; visited: boolean; source: 'kakao' | 'google' };
export type PlaceMapProps = { pins: MapPin[]; selectedId: string | null; onSelect: (id: string) => void };
