import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { useTravelTheme } from '@/theme/theme-context';
import { AppProviders } from '@/app-providers';
import { RootNavigator } from '@/components/root-navigator';
import { apiClient, authService } from '@/dependencies';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders authService={authService} api={apiClient}>
        <ThemedNavigation />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

function ThemedNavigation() {
  const { scheme, colors, ready } = useTravelTheme();
  useEffect(() => { void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {}); }, [colors.background]);
  if (!ready) return null;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return <ThemeProvider value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text, primary: colors.accent, border: colors.divider } }}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <RootNavigator />
  </ThemeProvider>;
}
