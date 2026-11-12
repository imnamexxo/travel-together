import { createContext, useContext, useState, type ReactNode } from 'react';

type PreviewSession = { isPreview: boolean; startPreview: () => void; endPreview: () => void };
const PreviewSessionContext = createContext<PreviewSession | null>(null);

// This is a demo navigation gate, NOT a Supabase session or an authentication check.
export function PreviewSessionProvider({ children }: { children: ReactNode }) {
  const [isPreview, setIsPreview] = useState(false);
  return <PreviewSessionContext.Provider value={{ isPreview, startPreview: () => setIsPreview(true), endPreview: () => setIsPreview(false) }}>{children}</PreviewSessionContext.Provider>;
}

export function usePreviewSession() {
  const session = useContext(PreviewSessionContext);
  if (!session) throw new Error('PreviewSessionProvider is required');
  return session;
}
