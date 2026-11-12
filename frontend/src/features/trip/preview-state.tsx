import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export type PreviewPhoto = { id: string; uri: string; assetId: string | null; day: number | null; place: string | null };
type PreviewState = { photos: PreviewPhoto[]; setPhotos: Dispatch<SetStateAction<PreviewPhoto[]>> };
const PreviewContext = createContext<PreviewState | null>(null);

// 앨범 미리보기 전용(기기 안 메모리). 사진은 #9에서 서버로 옮긴다.
export function PreviewTripProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  return <PreviewContext.Provider value={{ photos, setPhotos }}>{children}</PreviewContext.Provider>;
}
export function usePreviewTrip() {
  const context = useContext(PreviewContext);
  if (!context) throw new Error('PreviewTripProvider is required');
  return context;
}
