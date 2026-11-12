"""JPEG 검사와 메타데이터 제거. 이미지 라이브러리 없이 JPEG 마커만 읽는다.

앱이 사진을 줄이며 EXIF를 지우지만, 서버도 저장 전에 한 번 더 지운다(ADR-0003).
APP1(EXIF·XMP: 촬영 위치가 들어갈 수 있음), APP13(IPTC), 주석(COM)을 없앤다.
색 정보(APP0 JFIF, APP2 ICC, APP14 Adobe)는 그림이 바뀌지 않도록 둔다.
"""

SOI = b"\xff\xd8"
DROP = {0xE1, 0xED, 0xFE}  # APP1, APP13, COM
STANDALONE = {0x01, *range(0xD0, 0xD8)}  # TEM, RST0~7: 길이 없음


class NotJpeg(ValueError):
    pass


def strip_metadata(data: bytes) -> bytes:
    """메타데이터 세그먼트를 뺀 JPEG. JPEG가 아니거나 구조가 깨졌으면 NotJpeg."""
    if not data.startswith(SOI):
        raise NotJpeg("JPEG가 아닙니다.")
    out = bytearray(SOI)
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            raise NotJpeg("마커가 있어야 할 자리에 다른 값이 있습니다.")
        marker = data[i + 1] if i + 1 < len(data) else None
        if marker is None:
            raise NotJpeg("파일이 중간에 끝났습니다.")
        if marker == 0xFF:  # 채움 바이트
            i += 1
            continue
        if marker in STANDALONE:
            out += data[i:i + 2]
            i += 2
            continue
        if marker == 0xD9:  # EOI
            out += data[i:i + 2]
            return bytes(out)
        if i + 4 > len(data):
            raise NotJpeg("파일이 중간에 끝났습니다.")
        length = int.from_bytes(data[i + 2:i + 4], "big")
        end = i + 2 + length
        if length < 2 or end > len(data):
            raise NotJpeg("세그먼트 길이가 잘못됐습니다.")
        if marker == 0xDA:  # SOS: 여기서부터 압축된 그림이다. 끝까지 그대로 둔다.
            out += data[i:]
            return bytes(out)
        if marker not in DROP:
            out += data[i:end]
        i = end
    raise NotJpeg("그림 데이터가 없습니다.")
