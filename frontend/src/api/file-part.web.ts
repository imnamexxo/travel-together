/**
 * 웹 버전의 업로드 파일. 브라우저에는 expo-file-system이 없고, 사진 선택·줄이기 결과는 blob:·data: 주소다.
 * 주소에서 Blob을 받아 파일 이름과 함께 폼에 붙인다.
 */
export type FilePart = { name: string; type: string; bytes: () => Promise<Uint8Array> };

export function filePart(uri: string, name: string, type: string): FilePart {
  return { name, type, bytes: async () => new Uint8Array(await (await fetch(uri)).arrayBuffer()) };
}

export async function appendFile(form: FormData, field: string, uri: string, name: string, type: string): Promise<void> {
  const blob = await (await fetch(uri)).blob();
  form.append(field, new Blob([blob], { type }), name);
}
