import { takenAtFromExif } from '@/features/album/exif-time';
import { readJpegExifTimes } from '@/features/album/jpeg-exif';

/** 리틀 엔디언 TIFF로 EXIF를 만든다. IFD0(DateTime, Exif·GPS 포인터) → Exif IFD(촬영 시각) → GPS IFD(위도 기준). */
function jpegWithExif(): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  const dateTime = ascii('2026:11:12 10:00:00');
  const original = ascii('2026:11:12 09:30:15');
  const offset = ascii('+09:00');
  // 배치: 헤더(8) | IFD0(2+3*12+4=42) | Exif IFD(2+2*12+4=30) | GPS IFD(2+1*12+4=18) | 값들
  const ifd0 = 8, exifIfd = ifd0 + 42, gpsIfd = exifIfd + 30, values = gpsIfd + 18;
  const dateTimeAt = values, originalAt = dateTimeAt + dateTime.length, offsetAt = originalAt + original.length;
  tiff.push(0x49, 0x49, ...u16(42), ...u32(ifd0));
  tiff.push(...u16(3),
    ...u16(0x0132), ...u16(2), ...u32(dateTime.length), ...u32(dateTimeAt),
    ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd),
    ...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsIfd),
    ...u32(0));
  tiff.push(...u16(2),
    ...u16(0x9003), ...u16(2), ...u32(original.length), ...u32(originalAt),
    ...u16(0x9011), ...u16(2), ...u32(offset.length), ...u32(offsetAt),
    ...u32(0));
  tiff.push(...u16(1), ...u16(0x0001), ...u16(2), ...u32(2), 0x4e, 0, 0, 0, ...u32(0)); // GPSLatitudeRef 'N'
  tiff.push(...dateTime, ...original, ...offset);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 0xff, size & 0xff, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

test('JPEG에서 촬영 시각 태그만 읽고 위치(GPS)는 읽지 않는다', () => {
  const tags = readJpegExifTimes(jpegWithExif());

  expect(tags).toEqual({ DateTime: '2026:11:12 10:00:00', DateTimeOriginal: '2026:11:12 09:30:15', OffsetTimeOriginal: '+09:00' });
  expect(takenAtFromExif(tags)).toBe('2026-11-12T09:30:15+09:00');
});

test('JPEG가 아니거나 EXIF가 없으면 null', () => {
  expect(readJpegExifTimes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  expect(readJpegExifTimes(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
  expect(readJpegExifTimes(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0]))).toBeNull();
});
