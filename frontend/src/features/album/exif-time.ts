/**
 * EXIF 촬영 시각 → 시간대 포함 ISO 시각. 위치(GPS) 값은 읽지 않는다.
 * EXIF 시각에는 보통 시간대가 없어서, OffsetTimeOriginal이 없으면 한국 시간으로 본다.
 */
export function takenAtFromExif(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const offsetRaw = exif?.OffsetTimeOriginal ?? exif?.OffsetTime;
  const offset = typeof offsetRaw === 'string' && /^[+-]\d{2}:\d{2}$/.test(offsetRaw) ? offsetRaw : '+09:00';
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
