import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { normalizeInviteCode } from '@/features/trip/join-trip-screen';
import { savePendingFriend } from '@/features/trip/pending-invite';

/** 친구 링크(traveltogether://friend?code=…)로 열렸을 때. 코드를 맡겨 두면 여행 목록이 친구 맺기를 마친다(로그인 전이면 로그인 뒤). */
export default function FriendLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { status } = useAuth();
  if (status === 'loading') return null;
  const normalized = normalizeInviteCode(code ?? '');
  if (normalized) savePendingFriend(normalized);
  return <Redirect href={status === 'signedIn' ? '/' : '/login'} />;
}
