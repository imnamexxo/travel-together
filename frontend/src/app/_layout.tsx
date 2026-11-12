import { DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/app-providers';
import { RootNavigator } from '@/components/root-navigator';
import { apiClient, authService } from '@/dependencies';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // 화면 디자인(TravelColors)이 밝은 테마 기준이라 다크 모드를 따르지 않는다.
  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <AppProviders authService={authService} api={apiClient}>
        <RootNavigator />
      </AppProviders>
    </ThemeProvider>
  );
}
