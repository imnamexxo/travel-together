import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { normalizeInviteCode } from '@/features/trip/join-trip-screen';
import { savePendingInvite } from '@/features/trip/pending-invite';

/** 초대 링크(traveltogether://join?code=…)로 열렸을 때. 로그인돼 있으면 바로 참여 화면으로, 아니면 로그인 뒤 이어서. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { status } = useAuth();
  const normalized = normalizeInviteCode(code ?? '');
  if (status === 'loading') return null;
  if (!normalized) return <Redirect href="/" />;
  if (status === 'signedIn') return <Redirect href={{ pathname: '/trips/join', params: { code: normalized } }} />;
  savePendingInvite(normalized);
  return <Redirect href="/login" />;
}
