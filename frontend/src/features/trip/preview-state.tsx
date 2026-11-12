import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { demoPlanItems, type PlanItem } from './demo';

export type PreviewPhoto = { id: string; uri: string; assetId: string | null; day: number | null; place: string | null };
type PreviewState = {
  items: PlanItem[]; setItems: Dispatch<SetStateAction<PlanItem[]>>;
  photos: PreviewPhoto[]; setPhotos: Dispatch<SetStateAction<PreviewPhoto[]>>;
};
const PreviewContext = createContext<PreviewState | null>(null);

// Shared in-memory preview only. Replace with authenticated API data later.
export function PreviewTripProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState(demoPlanItems);
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  return <PreviewContext.Provider value={{ items, setItems, photos, setPhotos }}>{children}</PreviewContext.Provider>;
}
export function usePreviewTrip() {
  const context = useContext(PreviewContext);
  if (!context) throw new Error('PreviewTripProvider is required');
  return context;
}
