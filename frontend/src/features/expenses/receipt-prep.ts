/**
 * 영수증 사진 고르기·찍기와 올릴 준비(네이티브 모듈은 이 파일에만 둔다. 테스트에서는 통째로 가짜로 바꾼다).
 * 글자가 읽히도록 긴 변 2000px JPEG로 줄인다. 다시 저장하면서 EXIF는 빠진다.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const LONG_EDGE = 2000;

export type ReceiptSource = 'camera' | 'library';

/** 영수증 한 장을 찍거나 고른다. 취소하면 null. 카메라 권한이 없으면 오류. */
export async function pickReceipt(source: ReceiptSource): Promise<{ uri: string; width: number; height: number } | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('카메라 권한이 없어요. 설정에서 카메라를 허용하거나 앨범에서 골라 주세요.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

export async function prepareReceipt(image: { uri: string; width: number; height: number }): Promise<string> {
  const context = ImageManipulator.ImageManipulator.manipulate(image.uri);
  if (Math.max(image.width, image.height) > LONG_EDGE) {
    context.resize(image.width >= image.height ? { width: LONG_EDGE, height: null } : { width: null, height: LONG_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });
  return saved.uri;
}
