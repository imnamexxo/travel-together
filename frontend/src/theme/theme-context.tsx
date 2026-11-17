import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTravelColors, TravelColors, type TravelPalette } from '@/constants/theme';

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'travel-together:theme-mode';
export function resolveTheme(mode: ThemeMode, system: string | null | undefined) {
  return mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
}
const ThemeContext = createContext({ mode: 'system' as ThemeMode, scheme: 'light' as 'light' | 'dark', ready: true, colors: TravelColors as TravelPalette, setMode: async (_mode: ThemeMode): Promise<void> => {} });

export function TravelThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((value) => {
      if (active && (value === 'light' || value === 'dark' || value === 'system')) setModeState(value);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const scheme = resolveTheme(mode, system);
  const value = useMemo(() => ({ mode, scheme, ready, colors: scheme === 'dark' ? DarkTravelColors : TravelColors,
    setMode: async (next: ThemeMode) => {
      // Queue writes so quick selections persist in the same order as the UI.
      writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(THEME_STORAGE_KEY, next));
      await writes.current;
      setModeState(next);
    },
  }), [mode, scheme, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTravelTheme = () => useContext(ThemeContext);
export const useTravelColors = () => useTravelTheme().colors;
export function useThemedStyles<T>(factory: (colors: TravelPalette) => T): T {
  const colors = useTravelColors();
  return useMemo(() => factory(colors), [factory, colors]);
}
