/**
 * 기기에서 사진을 고르고 올릴 준비를 한다(네이티브 모듈은 이 파일에만 둔다. 테스트에서는 통째로 가짜로 바꾼다).
 *
 * 줄이기 전에 원본 EXIF에서 촬영 시각만 읽는다. 촬영 위치는 읽지 않는다(위치정보법, ADR-0003).
 * 긴 변 1600px JPEG로 다시 저장하면 EXIF가 모두 빠진다.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { takenAtFromExif } from './exif-time';
import { readJpegExifTimes } from './jpeg-exif';

export type PickedPhoto = {
  /** 기기 안에서 사진을 구분하는 값(같은 사진을 두 번 고르지 않게) */
  key: string;
  uri: string;
  width: number;
  height: number;
  takenAt: string | null;
};

const LONG_EDGE = 1600;
// 목록·지도에서 보여 줄 작은 사진. 원본 대신 이것만 받아 저장소 전송량을 줄인다.
const THUMB_EDGE = 400;

/** 앨범에서 여러 장을 고른다. 취소하면 null. */
export async function pickPhotos(limit: number): Promise<PickedPhoto[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, orderedSelection: true, quality: 1, exif: true,
  });
  if (result.canceled) return null;
  return Promise.all(result.assets.slice(0, limit).map(async (asset) => ({
    key: asset.assetId ?? asset.uri,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    takenAt: takenAtFromExif(asset.exif ?? (Platform.OS === 'web' ? await webExifTimes(asset.uri) : null)),
  })));
}

/** 브라우저는 사진 선택 결과에 EXIF를 주지 않아 파일에서 촬영 시각 태그만 직접 읽는다. 못 읽으면 null. */
async function webExifTimes(uri: string): Promise<Record<string, string> | null> {
  try {
    return readJpegExifTimes(new Uint8Array(await (await fetch(uri)).arrayBuffer()));
  } catch {
    return null;
  }
}

async function resized(photo: PickedPhoto, edge: number, compress: number): Promise<string> {
  const context = ImageManipulator.ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > edge) {
    context.resize(photo.width >= photo.height ? { width: edge, height: null } : { width: null, height: edge });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress });
  return saved.uri;
}

/** 긴 변 1600px JPEG와 긴 변 400px 썸네일. 둘 다 새로 저장한 파일이라 메타데이터(EXIF)는 남지 않는다. */
export async function preparePhoto(photo: PickedPhoto): Promise<{ uri: string; thumbnailUri: string }> {
  const uri = await resized(photo, LONG_EDGE, 0.8);
  const thumbnailUri = await resized(photo, THUMB_EDGE, 0.7);
  return { uri, thumbnailUri };
}
