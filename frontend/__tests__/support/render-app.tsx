import { renderRouter } from 'expo-router/testing-library';

import type { ApiClient } from '@/api/client';
import { AppProviders } from '@/app-providers';
import AuthCallback from '@/app/auth-callback';
import ForgotPassword from '@/app/forgot-password';
import ResetPassword from '@/app/reset-password';
import TripListScreen from '@/app/index';
import LoginScreen from '@/app/login';
import SignupScreen from '@/app/signup';
import TripLayout from '@/app/trips/[tripId]/_layout';
import TripTabsLayout from '@/app/trips/[tripId]/(tabs)/_layout';
import AlbumScreen from '@/app/trips/[tripId]/(tabs)/album';
import PlannerScreen from '@/app/trips/[tripId]/(tabs)/index';
import MapScreen from '@/app/trips/[tripId]/(tabs)/map';
import ExpenseScreen from '@/app/trips/[tripId]/expenses/[expenseId]';
import NewExpenseScreen from '@/app/trips/[tripId]/expenses/new';
import MembersScreen from '@/app/trips/[tripId]/members';
import TripSettingsScreen from '@/app/trips/[tripId]/settings';
import SuggestionsScreen from '@/app/trips/[tripId]/suggestions';
import SettlementScreen from '@/app/trips/[tripId]/(tabs)/settlement';
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
      'auth-callback': AuthCallback,
      'forgot-password': ForgotPassword,
      'reset-password': ResetPassword,
      signup: SignupScreen,
      index: TripListScreen,
      'trips/new': NewTripScreen,
      'trips/join': JoinTripScreen,
      'trips/[tripId]/_layout': TripLayout,
      'trips/[tripId]/(tabs)/_layout': TripTabsLayout,
      'trips/[tripId]/(tabs)/index': PlannerScreen,
      'trips/[tripId]/(tabs)/album': AlbumScreen,
      'trips/[tripId]/(tabs)/map': MapScreen,
      'trips/[tripId]/(tabs)/settlement': SettlementScreen,
      'trips/[tripId]/members': MembersScreen,
      'trips/[tripId]/settings': TripSettingsScreen,
      'trips/[tripId]/suggestions': SuggestionsScreen,
      'trips/[tripId]/expenses/new': NewExpenseScreen,
      'trips/[tripId]/expenses/[expenseId]': ExpenseScreen,
    },
    { initialUrl },
  );
}
