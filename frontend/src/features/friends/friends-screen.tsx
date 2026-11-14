import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAnswerFriend, useFriendCode, useFriends, useRemoveFriend } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { accountStyles as s } from '@/features/account/account-screen';
import { friendLink } from '@/features/trip/pending-invite';
import { goBack } from '@/navigation';

/** 친구: 친구 링크 보내기, 받은·보낸 요청, 친구 목록(끊기). */
export default function FriendsScreen() {
  const friends = useFriends();
  const code = useFriendCode();
  const answer = useAnswerFriend();
  const remove = useRemoveFriend();
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  function shareLink() {
    if (!code.data) return;
    const link = friendLink(process.env.EXPO_PUBLIC_API_URL ?? '', code.data.code);
    void Share.share({ message: `Travel Together에서 친구해요! 링크를 누르면 바로 친구가 돼요.\n${link}` });
  }

  function confirmRemove(userId: string, name: string) {
    Alert.alert(`${name}님과 친구를 끊을까요?`, '상대의 친구 목록에서도 사라져요. 함께한 여행은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '끊기', style: 'destructive', onPress: () => remove.mutate(userId, { onError: fail }) },
    ]);
  }

  const data = friends.data;
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={friends.isRefetching} onRefresh={() => friends.refetch()} tintColor={C.primary} />}>
      <Pressable accessibilityRole="button" accessibilityLabel="계정 관리로 돌아가기" onPress={() => goBack('/account')} style={s.back}><Text style={s.backText}>‹ 계정 관리</Text></Pressable>
      <Text style={s.title}>친구</Text>
      <Text style={s.hint}>친구가 되면 총무가 여행에 버튼 한 번으로 초대할 수 있어요.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="친구 링크 보내기" disabled={!code.data} onPress={shareLink} style={({ pressed }) => [s.primaryButton, (pressed || !code.data) && s.pressed]}><Text style={s.primaryText}>친구 링크 보내기</Text></Pressable>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {friends.isPending ? <ActivityIndicator style={{ marginTop: 24 }} color={C.primary} />
        : friends.isError ? <Text style={s.error}>{friends.error.message}</Text>
        : data && <>
          {data.incoming.length > 0 && <View style={s.section}>
            <Text style={s.heading}>받은 친구 요청</Text>
            {data.incoming.map((r) => <View key={r.id} style={s.tripRow}>
              <Text style={[s.tripName, { flex: 1 }]}>{r.person.display_name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.person.display_name} 수락`} disabled={answer.isPending} onPress={() => answer.mutate({ requestId: r.id, accept: true }, { onError: fail })} style={s.acceptChip}><Text style={s.acceptText}>수락</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.person.display_name} 거절`} disabled={answer.isPending} onPress={() => answer.mutate({ requestId: r.id, accept: false }, { onError: fail })} style={s.deleteChip}><Text style={s.deleteText}>거절</Text></Pressable>
            </View>)}
          </View>}
          <View style={s.section}>
            <Text style={s.heading}>내 친구 {data.friends.length}명</Text>
            {!data.friends.length && <Text style={s.hint}>친구 링크를 보내거나, 함께한 여행의 멤버 목록에서 ‘친구 추가’를 눌러 보세요.</Text>}
            {data.friends.map((f) => <View key={f.user_id} style={s.tripRow}>
              <Text style={[s.tripName, { flex: 1 }]}>{f.display_name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${f.display_name} 친구 끊기`} onPress={() => confirmRemove(f.user_id, f.display_name)} style={s.deleteChip}><Text style={s.deleteText}>끊기</Text></Pressable>
            </View>)}
          </View>
          {data.outgoing.length > 0 && <View style={s.section}>
            <Text style={s.heading}>보낸 요청</Text>
            {data.outgoing.map((r) => <View key={r.id} style={s.tripRow}>
              <Text style={[s.tripName, { flex: 1 }]}>{r.person.display_name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.person.display_name} 요청 취소`} disabled={answer.isPending} onPress={() => answer.mutate({ requestId: r.id, accept: false }, { onError: fail })} style={s.deleteChip}><Text style={s.deleteText}>취소</Text></Pressable>
            </View>)}
          </View>}
        </>}
    </ScrollView>
  </SafeAreaView>;
}
