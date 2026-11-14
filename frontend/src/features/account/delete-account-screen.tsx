import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { showAlert } from '@/components/dialog';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { useDeleteMe, useDeletionPreview } from '@/api/queries';
import { useAuth } from '@/auth/auth-context';
import { TravelColors as C } from '@/constants/theme';
import { goBack } from '@/navigation';
import { accountStyles as s } from './account-screen';

/** 회원 탈퇴(ADR 0005). 탈퇴하면 내 여행들이 어떻게 되는지 먼저 보여 준다. */
export default function DeleteAccountScreen() {
  const preview = useDeletionPreview({ enabled: true });
  const remove = useDeleteMe();
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    showAlert('정말 탈퇴할까요?', '계정과 위 내용은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '탈퇴', style: 'destructive', onPress: async () => {
          setError(null);
          try {
            await remove.mutateAsync();
            // 로그아웃되면 루트 내비게이터가 로그인 화면으로 바꾼다.
            await signOut();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : '탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.');
          }
        },
      },
    ]);
  }

  const data = preview.data;
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="계정 관리로 돌아가기" onPress={() => goBack('/account')} style={s.back}><Text style={s.backText}>‹ 계정 관리</Text></Pressable>
      <Text style={s.title}>회원 탈퇴</Text>
      <Text style={s.hint}>탈퇴하면 로그인 계정이 지워지고, 내가 올린 사진은 모든 여행에서 지워져요.</Text>
      {preview.isPending ? <ActivityIndicator style={{ marginTop: 24 }} color={C.primary} />
        : preview.isError ? <Text accessibilityRole="alert" style={s.error}>{preview.error.message}</Text>
        : data && <>
          {data.deleted_trips.length > 0 && <View style={s.section}>
            <Text style={s.heading}>삭제되는 여행</Text>
            <Text style={s.hint}>나 혼자인 여행은 일정·지출까지 통째로 지워져요.</Text>
            {data.deleted_trips.map((t) => <Text key={t.id} style={s.listItem}>• {t.name}</Text>)}
          </View>}
          {data.handed_over.length > 0 && <View style={s.section}>
            <Text style={s.heading}>총무가 넘어가는 여행</Text>
            <Text style={s.hint}>가장 먼저 들어온 멤버가 총무가 돼요. 다른 사람에게 넘기려면 탈퇴 전에 여행 설정에서 넘겨 주세요.</Text>
            {data.handed_over.map((h) => <Text key={h.trip.id} style={s.listItem}>• {h.trip.name} → {h.new_organizer_name}님</Text>)}
          </View>}
          {data.kept_records.length > 0 && <View style={s.section}>
            <Text style={s.heading}>지출 기록이 남는 여행</Text>
            <Text style={s.hint}>다른 멤버의 정산이 깨지지 않도록 결제·분담 기록은 남고, 내 이름만 ‘탈퇴한 멤버’로 바뀌어요.</Text>
            {data.kept_records.map((t) => <Text key={t.id} style={s.listItem}>• {t.name}</Text>)}
          </View>}
          {!data.deleted_trips.length && !data.handed_over.length && !data.kept_records.length &&
            <Text style={s.notice}>남는 기록이 없어요. 참여한 여행에서는 자동으로 나가져요.</Text>}
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="탈퇴하기" disabled={remove.isPending} onPress={confirm} style={({ pressed }) => [s.dangerButton, (pressed || remove.isPending) && s.pressed]}>
            <Text style={s.dangerText}>탈퇴하기</Text>
          </Pressable>
        </>}
    </ScrollView>
  </SafeAreaView>;
}
