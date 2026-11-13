import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';

/**
 * 소셜 로그인 후 돌아오는 앱 주소(traveltogether://auth-callback). 세션 처리는 소셜 로그인 버튼이 하고,
 * Expo Router도 이 주소를 화면으로 열려고 하므로 여기서 원래 화면으로 돌려보낸다.
 * 아직 세션이 없으면 로그인 화면으로 가고, 세션이 생기면 루트 내비게이터가 내 여행 목록으로 바꾼다.
 */
export default function AuthCallback() {
  const { status } = useAuth();
  return <Redirect href={status === 'signedIn' ? '/' : '/login'} />;
}
