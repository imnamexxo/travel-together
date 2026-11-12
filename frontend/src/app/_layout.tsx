import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { PreviewSessionProvider, usePreviewSession } from '@/features/auth/preview-session';

SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { isPreview } = usePreviewSession();
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!isPreview}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack.Protected>
    <Stack.Protected guard={isPreview}>
      <Stack.Screen name="(tabs)" />
    </Stack.Protected>
  </Stack>;
}

export default function RootLayout() {
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <PreviewSessionProvider><Navigation /></PreviewSessionProvider>
    </ThemeProvider>
  );
}
