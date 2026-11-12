import { renderRouter } from 'expo-router/testing-library';

import type { ApiClient } from '@/api/client';
import { AppProviders } from '@/app-providers';
import TripListScreen from '@/app/index';
import LoginScreen from '@/app/login';
import SignupScreen from '@/app/signup';
import TripLayout from '@/app/trips/[tripId]/_layout';
import AlbumScreen from '@/app/trips/[tripId]/album';
import PlannerScreen from '@/app/trips/[tripId]/index';
import MapScreen from '@/app/trips/[tripId]/map';
import MembersScreen from '@/app/trips/[tripId]/members';
import TripSettingsScreen from '@/app/trips/[tripId]/settings';
import SettlementScreen from '@/app/trips/[tripId]/settlement';
import JoinTripScreen from '@/app/trips/join';
import NewTripScreen from '@/app/trips/new';
import type { AuthService } from '@/auth/auth-service';
import { RootNavigator } from '@/components/root-navigator';

/**
 * 실제 화면과 라우팅을 그리되, 인증 서비스와 API 클라이언트만 가짜로 넣는다.
 * (실제 루트 레이아웃은 Supabase를 불러오므로 쓰지 않는다.)
 */
export function renderApp({ auth, api, initialUrl = '/' }: { auth: AuthService; api: ApiClient; initialUrl?: string }) {
  return renderRouter(
    {
      _layout: () => (
        <AppProviders authService={auth} api={api}>
          <RootNavigator />
        </AppProviders>
      ),
      login: LoginScreen,
      signup: SignupScreen,
      index: TripListScreen,
      'trips/new': NewTripScreen,
      'trips/join': JoinTripScreen,
      'trips/[tripId]/_layout': TripLayout,
      'trips/[tripId]/index': PlannerScreen,
      'trips/[tripId]/album': AlbumScreen,
      'trips/[tripId]/map': MapScreen,
      'trips/[tripId]/settlement': SettlementScreen,
      'trips/[tripId]/members': MembersScreen,
      'trips/[tripId]/settings': TripSettingsScreen,
    },
    { initialUrl },
  );
}
