import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AppProviders } from '@/app-providers';
import { RootNavigator } from '@/components/root-navigator';
import { apiClient, authService } from '@/dependencies';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProviders authService={authService} api={apiClient}>
        <RootNavigator />
      </AppProviders>
    </ThemeProvider>
  );
}
