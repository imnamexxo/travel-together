import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import LandingScreen from '@/features/landing/landing-screen';
import TripListScreen from '@/features/trip/trip-list-screen';

/**
 * 첫 주소(/). 로그인했으면 내 여행 목록.
 * 로그인 전: 웹은 소개 페이지(검색엔진도 이 글을 읽는다), 앱은 로그인 화면으로 바로 간다.
 */
export default function Index() {
  const { status } = useAuth();
  if (status === 'signedIn') return <TripListScreen />;
  if (Platform.OS !== 'web') return <Redirect href="/login" />;
  return <LandingScreen />;
}
