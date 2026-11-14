import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isNotFound } from '@/api/client';
import { useTrip } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { CurrentTripProvider } from '@/features/trip/current-trip';

export default function TripLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);

  if (trip.isPending) {
    return <View style={s.center}><ActivityIndicator color={C.primary} /></View>;
  }
  if (trip.isError) {
    const notFound = isNotFound(trip.error);
    return <SafeAreaView style={s.center}>
      <Text style={s.title}>{notFound ? '여행을 찾을 수 없어요' : '여행을 불러오지 못했어요'}</Text>
      <Text style={s.message}>{notFound ? '삭제되었거나 내가 멤버가 아닌 여행이에요.' : trip.error.message}</Text>
      {!notFound && <Pressable accessibilityRole="button" onPress={() => trip.refetch()} style={s.button}><Text style={s.link}>다시 시도</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={s.button}><Text style={s.link}>내 여행 목록으로</Text></Pressable>
    </SafeAreaView>;
  }
  return <CurrentTripProvider trip={trip.data}>
    {/* 탭 화면 위로 멤버·설정·지출 화면이 쌓인다. 뒤로 가기는 쌓인 순서를 따른다. */}
    <Stack screenOptions={{ headerShown: false }} />
  </CurrentTripProvider>;
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, backgroundColor: C.background },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  message: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  button: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 14, fontWeight: '600', color: C.accent },
});
