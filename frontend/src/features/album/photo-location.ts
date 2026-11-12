/**
 * 사진 자동 연결(휴대폰 안에서만). 촬영 GPS로 같은 날 일정 항목의 장소 중 300m 안의 가장 가까운 곳을 찾는다.
 * 좌표는 이 계산에만 쓰고 버린다. 서버에는 찾은 장소 id만 보낸다(ADR-0003).
 */

import type { PlanItem } from '@/api/client';
import { toKstParts } from '@/features/expenses/expense-form';

export type Gps = { latitude: number; longitude: number };

export const AUTO_LINK_METERS = 300;

/** "33/1,30/1,1234/100"(도/분/초 유리수) 또는 숫자 → 도 단위 숫자. */
function toDegrees(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((part) => {
    const [n, d = '1'] = part.trim().split('/');
    return Number(n) / Number(d);
  });
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  const [deg, min = 0, sec = 0] = parts;
  return deg + min / 60 + sec / 3600;
}

function signed(value: number | null, ref: unknown, negative: string): number | null {
  if (value === null) return null;
  return typeof ref === 'string' && ref.toUpperCase().startsWith(negative) ? -Math.abs(value) : value;
}

/** EXIF에서 촬영 위치. 안드로이드(평평한 GPSLatitude…)와 iOS({GPS} 묶음) 모양을 모두 읽는다. 없으면 null. */
export function gpsFromExif(exif: Record<string, unknown> | null | undefined): Gps | null {
  if (!exif) return null;
  const ios = exif['{GPS}'] as Record<string, unknown> | undefined;
  const latitude = signed(toDegrees(ios?.Latitude ?? exif.GPSLatitude), ios?.LatitudeRef ?? exif.GPSLatitudeRef, 'S');
  const longitude = signed(toDegrees(ios?.Longitude ?? exif.GPSLongitude), ios?.LongitudeRef ?? exif.GPSLongitudeRef, 'W');
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude };
}

export function distanceMeters(a: Gps, b: Gps): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** 촬영 날짜(한국 시간)의 일정 항목 장소 중 300m 안에서 가장 가까운 장소 id. 위치·시각이 없거나 없으면 null. */
export function autoPlaceId(gps: Gps | null, takenAt: string | null, planItems: PlanItem[]): string | null {
  if (!gps || !takenAt) return null;
  const day = toKstParts(takenAt).date;
  let best: { id: string; meters: number } | null = null;
  for (const item of planItems) {
    if (item.date !== day || !item.place) continue;
    const meters = distanceMeters(gps, item.place);
    if (meters <= AUTO_LINK_METERS && (!best || meters < best.meters)) best = { id: item.place.id, meters };
  }
  return best?.id ?? null;
}
