import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TripSummary } from '@/api/client';
import { useMe, useTrips } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { formatPeriod } from './trip-dates';

export default function TripListScreen() {
  const me = useMe();
  const trips = useTrips();

  const header = <View style={s.header}>
    <Text style={s.eyebrow}>TRAVEL TOGETHER</Text>
    <View style={s.titleRow}>
      <Text style={s.title}>내 여행</Text>
      <View style={s.headerActions}>
      <Pressable accessibilityRole="button" accessibilityLabel="새 여행 만들기" onPress={() => router.push('/trips/new')} style={({ pressed }) => [s.newButton, pressed && s.pressed]}><Text style={s.newText}>＋ 새 여행</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="계정 관리" hitSlop={6} onPress={() => router.push('/account')} style={({ pressed }) => [s.accountButton, pressed && s.pressed]}><Ionicons name="person-circle" size={40} color={C.textMuted} /></Pressable>
      </View>
    </View>
    {!!me.data && <Text style={s.subtitle}>{me.data.display_name}님, 함께 떠날 여행을 골라요.</Text>}
    <Pressable accessibilityRole="button" onPress={() => router.push('/trips/join')} style={s.joinButton}><Text style={s.link}>초대 코드로 들어가기 ›</Text></Pressable>
  </View>;

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <FlatList
      data={trips.data ?? []}
      keyExtractor={(trip) => trip.id}
      contentContainerStyle={s.content}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={trips.isRefetching} onRefresh={() => trips.refetch()} tintColor={C.primary} />}
      renderItem={({ item }) => <TripCard trip={item} />}
      ItemSeparatorComponent={() => <View style={s.gap} />}
      ListEmptyComponent={trips.isPending ? <ActivityIndicator style={s.loading} color={C.primary} />
        : trips.isError ? <View style={s.empty}>
          <Text style={s.emptyTitle}>여행 목록을 불러오지 못했어요</Text>
          <Text style={s.emptyText}>{trips.error.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => trips.refetch()} style={s.textButton}><Text style={s.link}>다시 시도</Text></Pressable>
        </View>
        : <View style={s.empty}>
          <Text style={s.emptyTitle}>아직 여행이 없어요</Text>
          <Text style={s.emptyText}>새 여행을 만들거나, 친구에게 받은 초대 코드로 들어가 보세요.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/trips/new')} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryText}>여행 만들기</Text></Pressable>
        </View>}
    />
  </SafeAreaView>;
}

function TripCard({ trip }: { trip: TripSummary }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${trip.name} 열기`} onPress={() => router.push(`/trips/${trip.id}`)} style={({ pressed }) => [s.card, pressed && s.pressed]}>
    <View style={s.between}>
      <Text style={s.cardTitle} numberOfLines={1}>{trip.name}</Text>
      {trip.is_organizer && <Text style={s.badge}>총무</Text>}
    </View>
    <Text style={s.cardMeta}>{formatPeriod(trip.start_date, trip.end_date)}  ·  멤버 {trip.member_count}명</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center', flexGrow: 1 },
  header: { marginBottom: 24 },
  eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '600', color: C.textMuted, marginTop: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.primary },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 10 },
  newButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: C.banner, justifyContent: 'center' },
  newText: { fontSize: 14, fontWeight: '600', color: C.primary },
  card: { padding: 18, borderRadius: 16, backgroundColor: C.surface },
  cardTitle: { flexShrink: 1, fontSize: 17, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  cardMeta: { fontSize: 12, color: C.textSecondary, marginTop: 8 },
  badge: { fontSize: 11, fontWeight: '600', color: C.primary, backgroundColor: C.banner, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, overflow: 'hidden' },
  gap: { height: 12 },
  loading: { marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.primary },
  emptyText: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  primaryButton: { minHeight: 50, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, marginTop: 12 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
  textButton: { minHeight: 44, justifyContent: 'center' },
  joinButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  link: { fontSize: 14, fontWeight: '600', color: C.accent },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
