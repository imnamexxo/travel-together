/**
 * JPEG 파일에서 촬영 시각 태그만 읽는다(웹 버전용: 브라우저의 사진 선택은 EXIF를 주지 않는다).
 *
 * IFD0의 DateTime과 Exif IFD의 DateTimeOriginal·OffsetTimeOriginal·OffsetTime만 본다.
 * 위치(GPS IFD, 0x8825)는 따라가지 않는다(위치정보법, ADR-0003).
 */
const TAGS: Record<number, string> = {
  0x0132: 'DateTime',
  0x9003: 'DateTimeOriginal',
  0x9010: 'OffsetTime',
  0x9011: 'OffsetTimeOriginal',
};
const EXIF_IFD = 0x8769;
const ASCII = 2;

export function readJpegExifTimes(bytes: Uint8Array): Record<string, string> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= bytes.length && String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'Exif') {
      return readTiff(view, offset + 10, Math.min(offset + 2 + size, bytes.length));
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // 이미지 데이터 시작 전에 없으면 없다
    offset += 2 + size;
  }
  return null;
}

function readTiff(view: DataView, start: number, end: number): Record<string, string> | null {
  if (start + 8 > end) return null;
  const little = view.getUint16(start) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const found: Record<string, string> = {};

  function readIfd(ifdOffset: number, followExif: boolean) {
    const at = start + ifdOffset;
    if (at + 2 > end) return;
    const count = u16(at);
    for (let n = 0; n < count; n++) {
      const entry = at + 2 + n * 12;
      if (entry + 12 > end) return;
      const tag = u16(entry);
      if (tag === EXIF_IFD && followExif) { readIfd(u32(entry + 8), false); continue; }
      const name = TAGS[tag];
      if (!name || u16(entry + 2) !== ASCII) continue;
      const length = u32(entry + 4);
      const valueAt = length > 4 ? start + u32(entry + 8) : entry + 8;
      if (valueAt + length > end) continue;
      let text = '';
      for (let i = 0; i < length; i++) {
        const code = view.getUint8(valueAt + i);
        if (code === 0) break;
        text += String.fromCharCode(code);
      }
      found[name] = text;
    }
  }

  readIfd(u32(start + 4), true);
  return Object.keys(found).length ? found : null;
}
