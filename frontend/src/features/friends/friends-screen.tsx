import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Person } from '@/api/client';
import {
  useAnswerFriend, useAnswerTripInvite, useFriendCode, useFriendSuggestions, useFriends, useInviteFriendTo,
  useRemoveFriend, useRequestFriendFrom, useTripInvites, useTripsForFriend,
} from '@/api/queries';
import ActionSheet from '@/components/action-sheet';
import Pressable from '@/components/pressable';
import { TravelColors as C } from '@/constants/theme';
import { accountStyles as s } from '@/features/account/account-screen';
import { friendLink } from '@/features/trip/pending-invite';
import { formatPeriod } from '@/features/trip/trip-dates';
import { goBack } from '@/navigation';

/** 친구와 여행 초대: 받은 여행 초대, 받은 친구 요청, 내 친구(여행에 초대·끊기), 함께 여행한 사람, 보낸 요청. */
export default function FriendsScreen() {
  const friends = useFriends();
  const invites = useTripInvites();
  const code = useFriendCode();
  const answer = useAnswerFriend();
  const answerInvite = useAnswerTripInvite();
  const remove = useRemoveFriend();
  const suggestions = useFriendSuggestions();
  const ask = useRequestFriendFrom();
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Person | null>(null);
  const fail = (e: Error) => setError(e.message);

  function shareLink() {
    if (!code.data) return;
    const link = friendLink(process.env.EXPO_PUBLIC_API_URL ?? '', code.data.code);
    void Share.share({ message: `Travel Together에서 친구해요! 링크를 누르면 바로 친구가 돼요.\n${link}` });
  }

  function confirmRemove(person: Person) {
    Alert.alert(`${person.display_name}님과 친구를 끊을까요?`, '상대의 친구 목록에서도 사라져요. 함께한 여행은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '끊기', style: 'destructive', onPress: () => remove.mutate(person.user_id, { onError: fail }) },
    ]);
  }

  function respondInvite(inviteId: string, accept: boolean) {
    answerInvite.mutate({ inviteId, accept }, { onSuccess: (trip) => { if (trip) router.push(`/trips/${trip.id}`); }, onError: fail });
  }

  const data = friends.data;
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={friends.isRefetching} onRefresh={() => { void friends.refetch(); void invites.refetch(); void suggestions.refetch(); }} tintColor={C.primary} />}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => goBack('/')} style={s.back}><Text style={s.backText}>‹ 뒤로</Text></Pressable>
      <Text style={s.title}>친구</Text>
      <Text style={s.hint}>친구가 되면 총무가 여행에 버튼 한 번으로 초대할 수 있어요.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="친구 링크 보내기" disabled={!code.data} onPress={shareLink} style={[s.primaryButton, !code.data && s.pressed]}><Text style={s.primaryText}>친구 링크 보내기</Text></Pressable>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}

      {!!invites.data?.length && <View style={s.section}>
        <Text style={s.heading}>받은 여행 초대</Text>
        {invites.data.map((i) => <View key={i.id} style={f.inviteCard}>
          <Text style={s.tripName}>{i.trip.name}</Text>
          <Text style={s.tripMeta}>{i.inviter_name}님이 초대했어요 · {formatPeriod(i.trip.start_date, i.trip.end_date)}</Text>
          <View style={f.inviteActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${i.trip.name} 초대 거절`} disabled={answerInvite.isPending} onPress={() => respondInvite(i.id, false)} style={f.declineButton}><Text style={f.declineText}>거절</Text></Pressable>
            <Pressable haptic accessibilityRole="button" accessibilityLabel={`${i.trip.name} 초대 수락`} disabled={answerInvite.isPending} onPress={() => respondInvite(i.id, true)} style={f.acceptButton}><Text style={f.acceptText}>수락</Text></Pressable>
          </View>
        </View>)}
      </View>}

      {friends.isPending ? <ActivityIndicator style={{ marginTop: 24 }} color={C.primary} />
        : friends.isError ? <Text style={s.error}>{friends.error.message}</Text>
        : data && <>
          {data.incoming.length > 0 && <View style={s.section}>
            <Text style={s.heading}>받은 친구 요청</Text>
            {data.incoming.map((r) => <View key={r.id} style={s.tripRow}>
              <Text style={[s.tripName, { flex: 1 }]}>{r.person.display_name}</Text>
              <Pressable haptic accessibilityRole="button" accessibilityLabel={`${r.person.display_name} 수락`} disabled={answer.isPending} onPress={() => answer.mutate({ requestId: r.id, accept: true }, { onError: fail })} style={s.acceptChip}><Text style={s.acceptText}>수락</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.person.display_name} 거절`} disabled={answer.isPending} onPress={() => answer.mutate({ requestId: r.id, accept: false }, { onError: fail })} style={s.deleteChip}><Text style={s.deleteText}>거절</Text></Pressable>
            </View>)}
          </View>}

          <View style={s.section}>
            <Text style={s.heading}>내 친구 {data.friends.length}명</Text>
            {!data.friends.length && <Text style={s.hint}>친구 링크를 보내거나, 아래 함께 여행한 사람에게 친구 추가를 눌러 보세요.</Text>}
            {data.friends.map((p) => <View key={p.user_id}>
              <View style={s.tripRow}>
                <Text style={[s.tripName, { flex: 1 }]}>{p.display_name}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${p.display_name} 여행에 초대`} accessibilityState={{ expanded: openFor === p.user_id }} onPress={() => setOpenFor(openFor === p.user_id ? null : p.user_id)} style={s.acceptChip}><Text style={s.acceptText}>여행에 초대</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${p.display_name} 더보기`} hitSlop={6} onPress={() => setMenuFor(p)} style={f.more}><Text style={f.moreText}>⋯</Text></Pressable>
              </View>
              {openFor === p.user_id && <TripPicker friend={p} onError={fail} />}
            </View>)}
          </View>

          {!!suggestions.data?.length && <View style={s.section}>
            <Text style={s.heading}>함께 여행한 사람</Text>
            {suggestions.data.map((m) => <View key={`${m.trip_id}-${m.member_id}`} style={s.tripRow}>
              <View style={s.tripCopy}><Text style={s.tripName}>{m.display_name}</Text><Text style={s.tripMeta}>{m.trip_name}</Text></View>
              <Pressable haptic accessibilityRole="button" accessibilityLabel={`${m.display_name} 친구 추가`} disabled={ask.isPending} onPress={() => ask.mutate({ tripId: m.trip_id, memberId: m.member_id }, { onError: fail })} style={s.acceptChip}><Text style={s.acceptText}>친구 추가</Text></Pressable>
            </View>)}
          </View>}

          {data.outgoing.length > 0 && <View style={s.section}>
            <Text style={s.heading}>보낸 요청</Text>
            {data.outgoing.map((r) => <View key={r.id} style={s.tripRow}>
              <Text style={[s.tripName, { flex: 1 }]}>{r.person.display_name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.person.display_name} 요청 취소`} disabled={answer.isPending} onPress={() => answer.mutate({ requestId: r.id, accept: false }, { onError: fail })} style={s.deleteChip}><Text style={s.deleteText}>취소</Text></Pressable>
            </View>)}
          </View>}
        </>}
    </ScrollView>
    <ActionSheet visible={!!menuFor} title={menuFor?.display_name ?? ''} onClose={() => setMenuFor(null)}
      actions={menuFor ? [{ label: '친구 끊기', destructive: true, onPress: () => confirmRemove(menuFor) }] : []} />
  </SafeAreaView>;
}

/** 친구를 초대할 내 여행 고르기(내가 총무인 여행만). */
function TripPicker({ friend, onError }: { friend: Person; onError: (e: Error) => void }) {
  const trips = useTripsForFriend(friend.user_id);
  const invite = useInviteFriendTo();
  if (trips.isPending) return <ActivityIndicator style={f.picker} color={C.primary} />;
  if (trips.isError) return <Text style={[s.error, f.picker]}>{trips.error.message}</Text>;
  if (!trips.data.length) return <Text style={[s.hint, f.picker]}>내가 총무인 여행이 없어요. 여행을 만들면 친구를 초대할 수 있어요.</Text>;
  return <View style={f.picker}>
    {trips.data.map((t) => <View key={t.trip_id} style={f.pickRow}>
      <View style={{ flex: 1 }}><Text style={f.pickName}>{t.name}</Text><Text style={s.tripMeta}>{formatPeriod(t.start_date, t.end_date)}</Text></View>
      {t.state === 'member' ? <Text style={f.state}>이미 멤버</Text>
        : t.state === 'invited' ? <Text style={f.state}>초대함</Text>
        : <Pressable haptic accessibilityRole="button" accessibilityLabel={`${t.name}에 ${friend.display_name} 초대`} disabled={invite.isPending} onPress={() => invite.mutate({ tripId: t.trip_id, userId: friend.user_id }, { onError })} style={s.acceptChip}><Text style={s.acceptText}>초대</Text></Pressable>}
    </View>)}
    <Text style={s.hint}>친구가 앱의 친구 화면에서 수락하면 멤버가 돼요.</Text>
  </View>;
}

const f = StyleSheet.create({
  inviteCard: { padding: 16, borderRadius: 14, backgroundColor: C.banner, gap: 4, marginTop: 10 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  declineButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }, declineText: { fontSize: 14, color: C.text },
  acceptButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, acceptText: { fontSize: 14, fontWeight: '600', color: C.onPrimary },
  more: { minWidth: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' }, moreText: { fontSize: 18, color: C.textMuted },
  picker: { marginLeft: 16, marginTop: 6, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.divider },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  pickName: { fontSize: 14, fontWeight: '600', color: C.text },
  state: { fontSize: 12, color: C.textMuted },
});
