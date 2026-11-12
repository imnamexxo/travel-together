"""테스트용 작은 JPEG 바이트(실제 그림은 아니지만 JPEG 마커 구조는 맞다)."""


def segment(marker: int, payload: bytes) -> bytes:
    return bytes([0xFF, marker]) + (len(payload) + 2).to_bytes(2, "big") + payload


JFIF = segment(0xE0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
# 위도·경도가 들어 있다고 치는 EXIF(APP1)
EXIF_WITH_GPS = segment(0xE1, b"Exif\x00\x00GPSLatitude=33.5;GPSLongitude=126.5")
XMP = segment(0xE1, b"http://ns.adobe.com/xap/1.0/\x00<x:xmpmeta>gps</x:xmpmeta>")
COMMENT = segment(0xFE, b"taken at home")
ICC = segment(0xE2, b"ICC_PROFILE\x00\x01\x01profile")
QUANT = segment(0xDB, b"\x00" + bytes(64))
SCAN = segment(0xDA, b"\x01\x01\x00\x00\x3f\x00") + b"\x12\x34\xff\x00\x56" + b"\xff\xd9"


def jpeg(*, with_metadata: bool = True) -> bytes:
    middle = [JFIF, EXIF_WITH_GPS, XMP, COMMENT, ICC, QUANT] if with_metadata else [JFIF, ICC, QUANT]
    return b"\xff\xd8" + b"".join(middle) + SCAN
