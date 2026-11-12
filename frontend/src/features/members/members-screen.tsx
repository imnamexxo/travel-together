import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Member } from '@/api/client';
import { useInviteCode, useMembers, useReissueInviteCode, useRemoveMember } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';

const MAX_MEMBERS = 10;

export default function MembersScreen() {
  const { trip, isOrganizer } = useCurrentTrip();
  const members = useMembers(trip.id);

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={members.isRefetching} onRefresh={() => members.refetch()} tintColor={C.primary} />}>
      <Pressable accessibilityRole="button" accessibilityLabel="플래너로 돌아가기" onPress={() => router.navigate(`/trips/${trip.id}`)} style={s.back}><Text style={s.backText}>‹ 플래너</Text></Pressable>
      <Text style={s.eyebrow}>{trip.name}</Text>
      <Text style={s.title}>멤버</Text>

      {isOrganizer && <InviteCodeCard tripId={trip.id} tripName={trip.name} />}

      <View style={s.between}>
        <Text style={s.heading}>함께하는 멤버</Text>
        <Text style={s.count}>{members.data?.length ?? trip.member_count} / {MAX_MEMBERS}명</Text>
      </View>
      {members.isPending ? <ActivityIndicator style={s.loading} color={C.primary} />
        : members.isError ? <View style={s.errorBox}>
          <Text style={s.muted}>{members.error.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => members.refetch()} style={s.textButton}><Text style={s.link}>다시 시도</Text></Pressable>
        </View>
        : members.data.map((member) => <MemberRow key={member.member_id} member={member} canRemove={isOrganizer && !member.is_organizer} />)}
      {!isOrganizer && <Text style={s.hint}>친구를 초대하려면 총무에게 초대 코드를 받아 공유해 주세요.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function MemberRow({ member, canRemove }: { member: Member; canRemove: boolean }) {
  const { trip } = useCurrentTrip();
  const remove = useRemoveMember(trip.id);

  function confirm() {
    Alert.alert(`${member.display_name}님을 내보낼까요?`, '다시 들어오려면 초대 코드가 필요해요.', [
      { text: '취소', style: 'cancel' },
      { text: '내보내기', style: 'destructive', onPress: () => remove.mutate(member.member_id) },
    ]);
  }

  return <View style={s.memberBlock}>
    <View style={s.memberRow}>
      <View style={s.avatar}><Text style={s.avatarText}>{member.display_name.slice(0, 1)}</Text></View>
      <Text style={s.memberName}>{member.display_name}{member.is_me ? ' (나)' : ''}</Text>
      {member.is_organizer && <Text style={s.badge}>총무</Text>}
      {canRemove && <Pressable accessibilityRole="button" accessibilityLabel={`${member.display_name} 내보내기`} accessibilityState={{ disabled: remove.isPending }} disabled={remove.isPending} onPress={confirm} style={s.removeButton}><Text style={s.removeText}>내보내기</Text></Pressable>}
    </View>
    {remove.isError && <Text accessibilityRole="alert" style={s.removeError}>{remove.error.message}</Text>}
  </View>;
}

function InviteCodeCard({ tripId, tripName }: { tripId: string; tripName: string }) {
  const code = useInviteCode(tripId, { enabled: true });
  const reissue = useReissueInviteCode(tripId);
  const [notice, setNotice] = useState<string | null>(null);

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    setNotice('초대 코드를 복사했어요.');
  }

  function share(value: string) {
    void Share.share({ message: `"${tripName}" 여행에 함께해요! 앱에서 초대 코드 ${value}를 입력하면 들어올 수 있어요.` });
  }

  function confirmReissue() {
    Alert.alert('초대 코드를 새로 만들까요?', '지금 코드로는 더 이상 들어올 수 없어요. 이미 들어온 멤버는 그대로예요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '새로 만들기', style: 'destructive', onPress: () => {
          setNotice(null);
          reissue.mutate(undefined, {
            onSuccess: () => setNotice('새 초대 코드를 만들었어요. 이전 코드는 이제 쓸 수 없어요.'),
            onError: (e) => setNotice(e.message),
          });
        },
      },
    ]);
  }

  return <View style={s.card}>
    <Text style={s.cardLabel}>초대 코드</Text>
    {code.isPending ? <ActivityIndicator color={C.primary} />
      : code.isError ? <Text style={s.muted}>{code.error.message}</Text>
      : <>
        <Text accessibilityLabel={`초대 코드 ${code.data.code}`} style={s.code} selectable>{code.data.code}</Text>
        <View style={s.cardActions}>
          <Pressable accessibilityRole="button" onPress={() => copy(code.data.code)} style={({ pressed }) => [s.cardButton, pressed && s.pressed]}><Text style={s.cardButtonText}>복사</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => share(code.data.code)} style={({ pressed }) => [s.cardButton, pressed && s.pressed]}><Text style={s.cardButtonText}>공유</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: reissue.isPending }} disabled={reissue.isPending} onPress={confirmReissue} style={({ pressed }) => [s.cardButton, (pressed || reissue.isPending) && s.pressed]}><Text style={s.cardButtonText}>재발급</Text></Pressable>
        </View>
      </>}
    {!!notice && <Text style={s.notice}>{notice}</Text>}
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  eyebrow: { fontSize: 12, color: C.textMuted, marginTop: 8 },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.primary, marginTop: 6, marginBottom: 24 },
  card: { padding: 20, borderRadius: 16, backgroundColor: C.banner, marginBottom: 32, gap: 12 },
  cardLabel: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  code: { fontSize: 32, fontWeight: '700', letterSpacing: 4, color: C.primary, fontVariant: ['tabular-nums'] },
  cardActions: { flexDirection: 'row', gap: 8 },
  cardButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
  cardButtonText: { fontSize: 14, fontWeight: '600', color: C.primary },
  notice: { fontSize: 12, color: C.textSecondary, lineHeight: 18 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  count: { fontSize: 12, color: C.textMuted },
  memberBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  removeButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  removeText: { fontSize: 12, color: C.error },
  removeError: { fontSize: 12, color: C.error, paddingBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '600', color: C.primary },
  memberName: { flex: 1, fontSize: 15, color: C.text },
  badge: { fontSize: 11, fontWeight: '600', color: C.primary, backgroundColor: C.banner, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, overflow: 'hidden' },
  loading: { marginTop: 24 },
  errorBox: { paddingVertical: 16, alignItems: 'flex-start' },
  muted: { fontSize: 13, color: C.textSecondary },
  textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 14, fontWeight: '600', color: C.accent },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 20, lineHeight: 18 },
  pressed: { opacity: 0.6 },
});
