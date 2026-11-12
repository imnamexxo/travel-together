import { renderRouter } from 'expo-router/testing-library';

import type { ApiClient } from '@/api/client';
import { AppProviders } from '@/app-providers';
import TabLayout from '@/app/(tabs)/_layout';
import AlbumScreen from '@/app/(tabs)/album';
import PlannerScreen from '@/app/(tabs)/index';
import MapScreen from '@/app/(tabs)/map';
import SettlementScreen from '@/app/(tabs)/settlement';
import LoginScreen from '@/app/login';
import SignupScreen from '@/app/signup';
import type { AuthService } from '@/auth/auth-service';
import { RootNavigator } from '@/components/root-navigator';

/**
 * 실제 화면과 라우팅을 그리되, 인증 서비스와 API 클라이언트만 가짜로 넣는다.
 * (실제 루트 레이아웃은 Supabase를 불러오므로 쓰지 않는다.)
 */
export function renderApp({ auth, api }: { auth: AuthService; api: ApiClient }) {
  return renderRouter(
    {
      _layout: () => (
        <AppProviders authService={auth} api={api}>
          <RootNavigator />
        </AppProviders>
      ),
      login: LoginScreen,
      signup: SignupScreen,
      '(tabs)/_layout': TabLayout,
      '(tabs)/index': PlannerScreen,
      '(tabs)/album': AlbumScreen,
      '(tabs)/map': MapScreen,
      '(tabs)/settlement': SettlementScreen,
    },
    { initialUrl: '/' },
  );
}
