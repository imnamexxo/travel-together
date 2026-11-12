/**
 * 기기에서 사진을 고르고 올릴 준비를 한다(네이티브 모듈은 이 파일에만 둔다. 테스트에서는 통째로 가짜로 바꾼다).
 *
 * 줄이기 전에 원본 EXIF에서 촬영 시각만 읽는다. 긴 변 1600px JPEG로 다시 저장하면 EXIF가 모두 빠진다.
 * 촬영 위치(GPS)는 서버로 보내지 않는다(ADR-0003).
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { takenAtFromExif } from './exif-time';

export type PickedPhoto = {
  /** 기기 안에서 사진을 구분하는 값(같은 사진을 두 번 고르지 않게) */
  key: string;
  uri: string;
  width: number;
  height: number;
  takenAt: string | null;
};

const LONG_EDGE = 1600;

/** 앨범에서 여러 장을 고른다. 취소하면 null. */
export async function pickPhotos(limit: number): Promise<PickedPhoto[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, orderedSelection: true, quality: 1, exif: true,
  });
  if (result.canceled) return null;
  return result.assets.slice(0, limit).map((asset) => ({
    key: asset.assetId ?? asset.uri,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    takenAt: takenAtFromExif(asset.exif),
  }));
}

/** 긴 변 1600px JPEG로 줄인 새 파일. 메타데이터(EXIF)는 남지 않는다. */
export async function preparePhoto(photo: PickedPhoto): Promise<string> {
  const context = ImageManipulator.ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > LONG_EDGE) {
    context.resize(photo.width >= photo.height ? { width: LONG_EDGE, height: null } : { width: null, height: LONG_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}
