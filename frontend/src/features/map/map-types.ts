export type MapPin = { id: string; name: string; latitude: number; longitude: number; visited: boolean };
export type PlaceMapProps = { pins: MapPin[]; selectedId: string | null; onSelect: (id: string) => void };
