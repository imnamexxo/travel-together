import { File } from 'expo-file-system';

/** FormData에 넣는 파일 조각. Expo의 fetch는 bytes()로 내용을 읽고, name·type으로 머리글을 만든다. */
export type FilePart = { name: string; type: string; bytes: () => Promise<Uint8Array> };

/**
 * 기기 파일을 업로드용 조각으로 만든다.
 *
 * Expo SDK 57은 기본 fetch를 expo/fetch로 바꾸는데, 이 fetch는 React Native식 `{ uri, name, type }` 첨부를
 * 지원하지 않아 요청을 보내기 전에 실패한다(앱에는 "서버에 연결하지 못했습니다"로 보였다).
 * 그래서 파일 내용을 직접 읽는 조각을 넘긴다. 네이티브 모듈은 이 파일에만 둔다(테스트에서 가짜로 바꾼다).
 */
export function filePart(uri: string, name: string, type: string): FilePart {
  const file = new File(uri);
  return { name, type, bytes: () => file.bytes() };
}
