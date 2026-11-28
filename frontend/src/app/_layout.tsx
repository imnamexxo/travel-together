import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { IBMPlexSansKR_400Regular, IBMPlexSansKR_500Medium, IBMPlexSansKR_600SemiBold, IBMPlexSansKR_700Bold, useFonts } from '@expo-google-fonts/ibm-plex-sans-kr';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { useTravelTheme } from '@/theme/theme-context';
import { AppProviders } from '@/app-providers';
import { RootNavigator } from '@/components/root-navigator';
import { apiClient, authService } from '@/dependencies';
import { wrapRoot } from '@/monitoring/sentry';

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  // 제목·숫자 글꼴. 다 받기 전에는 스플래시를 그대로 둔다(글꼴이 바뀌며 화면이 튀지 않게).
  const [fontsLoaded, fontError] = useFonts({ IBMPlexSansKR_400Regular, IBMPlexSansKR_500Medium, IBMPlexSansKR_600SemiBold, IBMPlexSansKR_700Bold });
  // 웹 페이지 제목(검색 결과·브라우저 탭). 글꼴을 받기 전(정적 렌더링 포함)에도 넣는다. 설명·미리보기 정보는 +html.tsx에 있다.
  const head = <Head><title>Travel Together - 함께 짜는 여행 일정·사진·경비 정산</title></Head>;
  if (!fontsLoaded && !fontError) return head;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {head}
      <AppProviders authService={authService} api={apiClient}>
        <ThemedNavigation />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);

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
