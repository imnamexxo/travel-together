import { TravelColors as C } from '@/constants/theme';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PlanItem } from '@/api/client';
import { queryKeys, useExpenses, useMe, usePhotos, usePlanItems, useReorderPlanItems } from '@/api/queries';
import DraggableRows from '@/components/draggable-rows';
import { toKstParts } from '@/features/expenses/expense-form';
import { photoDayIndex } from '@/features/album/album-screen';
import TravelNotes from './travel-notes';
import { useAuth } from '@/auth/auth-context';
import { useCurrentTrip } from './current-trip';
import ActionSheet from '@/components/action-sheet';
import FriendButton from '@/components/friend-button';
import PlanItemEditor from './plan-item-editor';
import { formatPeriod } from './trip-dates';

/** 한국 시간 기준 오늘(YYYY-MM-DD). */
export function todayInKorea(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Editing = { item?: PlanItem } | null;

export default function HomeScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const { trip, days, isOrganizer, money } = useCurrentTrip();
  const planItems = usePlanItems(trip.id);
  const photos = usePhotos(trip.id).data?.photos ?? [];
  const expenses = useExpenses(trip.id).data ?? [];
  const todayIndex = days.findIndex((d) => d.iso === todayInKorea());
  // 여행 중이면 오늘을 먼저 보여준다.
  const [selectedDay, setDay] = useState(Math.max(todayIndex, 0));
  const day = Math.min(selectedDay, days.length - 1);
  const [editing, setEditing] = useState<Editing>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const reorder = useReorderPlanItems(trip.id);
  // 끌어서 바꾼 순서를 서버가 답하기 전에 먼저 보여 준다.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  // 끌기를 막 끝낸 손가락이 일정 편집을 열지 않게 한다.
  const lastDragEnd = useRef(0);
  const sorted = (planItems.data ?? []).filter((item) => item.date === days[day].iso).sort((a, b) => a.position - b.position);
  const plans = pendingOrder ? pendingOrder.map((id) => sorted.find((i) => i.id === id)).filter((i): i is PlanItem => !!i) : sorted;

  function saveOrder(next: PlanItem[]) {
    const ids = next.map((i) => i.id);
    setPendingOrder(ids);
    setOrderError(null);
    reorder.mutate({ date: days[day].iso, itemIds: ids }, {
      onError: () => setOrderError('순서를 바꾸지 못했어요. 다른 멤버가 일정을 바꿨다면 새로 불러온 순서를 확인해 주세요.'),
      onSettled: () => setPendingOrder(null),
    });
  }
  // 일정 항목의 장소에 연결된 그날의 사진 수
  // 그날 그 장소에서 쓴 확정된 지출의 합
  const spentAt = (item: PlanItem) => item.place ? expenses
    .filter((e) => e.status === 'confirmed' && e.place?.id === item.place!.id && e.paid_at && toKstParts(e.paid_at).date === item.date)
    .reduce((sum, e) => sum + (e.total_amount ?? 0), 0) : 0;
  const photoCount = (item: PlanItem) => item.place ? photos.filter((p) => p.place?.id === item.place!.id && photoDayIndex(p, days) === day).length : 0;

  function refresh() {
    void planItems.refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.trip(trip.id), exact: true });
  }

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!dragging} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={planItems.isRefetching} onRefresh={refresh} tintColor={C.primary} />}>
      <View style={s.between}><Text style={s.eyebrow}>TOGETHER, EVERYWHERE</Text>
        <View style={s.headerButtons}>
          <FriendButton style={s.circle} />
          <Pressable accessibilityRole="button" accessibilityLabel="여행 메뉴" style={s.circle} onPress={() => setMenuOpen(true)}><Text style={s.more}>•••</Text></Pressable>
        </View>
      </View>
      <Text style={s.title}>{trip.name}</Text><Text style={s.subtitle}>{formatPeriod(trip.start_date, trip.end_date)}  ·  {trip.member_count}명</Text>
      <TravelNotes />
      <View style={s.between}><Text style={s.heading}>여행 일정</Text><Pressable accessibilityRole="button" style={s.action} onPress={() => router.push(`/trips/${trip.id}/suggestions`)}><Text style={s.link}>✧ 추천 일정</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>{days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="tab" accessibilityState={{ selected: day === index }} accessibilityLabel={`${index + 1}일 차 ${entry.date}${index === todayIndex ? ' 오늘' : ''}`} onPress={() => setDay(index)} style={[s.day, index === day && s.selected, index === todayIndex && index !== day && s.today]}><Text style={[s.dayTitle, index === day && s.white]}>{index === todayIndex ? '오늘' : `${index + 1}일 차`}</Text><Text style={[s.dayDate, index === day && s.white]}>{entry.date} ({entry.weekday})</Text></Pressable>)}</ScrollView>
      <Text style={s.date}>{days[day].title}</Text>
      <View style={s.timeline}>
        {planItems.isPending ? <ActivityIndicator style={s.empty} color={C.primary} />
          : planItems.isError ? <View style={s.empty}><Text style={s.caption}>{planItems.error.message}</Text><Pressable accessibilityRole="button" onPress={() => planItems.refetch()} style={s.action}><Text style={s.link}>다시 시도</Text></Pressable></View>
          : !plans.length && <View style={s.empty}><Text style={s.itemTitle}>아직 정해진 일정이 없어요</Text><Text style={s.caption}>함께 가고 싶은 곳을 담아보세요.</Text></View>}
        <DraggableRows items={plans} keyOf={(item) => item.id} labelOf={(item) => item.title} onReorder={saveOrder} disabled={reorder.isPending}
          onDragChange={(active) => { setDragging(active); if (!active) lastDragEnd.current = Date.now(); }}
          renderItem={(item, index, { dragging: lifted }) => {
          const time = item.time?.slice(0, 5) ?? '';
          const photosHere = photoCount(item);
          const spent = spentAt(item);
          return <Pressable accessibilityRole="button" accessibilityLabel={`${time ? `${time} ` : ''}${item.title}, 일정 수정`} accessibilityHint="꾹 눌러 끌면 순서를 바꿀 수 있어요" onPress={() => { if (Date.now() - lastDragEnd.current > 400) setEditing({ item }); }} style={({ pressed }) => [s.row, lifted && s.lifted, pressed && !lifted && s.pressed]}>
            <Text style={s.time}>{time || '—'}</Text><View style={s.rail}><View style={[s.dot, index === 0 && s.activeDot]} />{index < plans.length - 1 && <View style={s.line} />}</View>
            <View style={s.item}>
              <View style={s.between}><Text style={s.itemTitle}>{item.title}</Text><Text style={s.chevron}>›</Text></View>
              {!!item.memo && <Text style={s.memo}>{item.memo}</Text>}
              <View style={s.meta}>
                {!!item.place && item.place.name !== item.title && <Text style={s.metaText}>📍 {item.place.name}</Text>}
                {item.estimated_cost != null && item.estimated_cost > 0 && <Text style={s.metaText}>예상 {money.format(item.estimated_cost)}</Text>}
                {photosHere > 0 && <Text style={s.photoText}>사진 {photosHere}장</Text>}
                {spent > 0 && <Text style={s.photoText}>지출 {money.format(spent)}</Text>}
              </View>
            </View>
          </Pressable>;
        }} />
      </View>
      {!!orderError && <Text accessibilityRole="alert" style={s.orderError}>{orderError}</Text>}
      {plans.length > 1 && <Text style={s.dragHint}>일정을 꾹 눌러 위아래로 끌면 순서를 바꿀 수 있어요</Text>}
      <Pressable accessibilityRole="button" onPress={() => setEditing({})} style={({ pressed }) => [s.add, pressed && s.pressed]}><Text style={s.link}>＋ 일정 추가</Text></Pressable>
      <Text style={s.notice}>당겨서 새로고침하면 다른 멤버가 바꾼 일정이 보여요</Text>
    </ScrollView>
    <ActionSheet visible={menuOpen} title={trip.name} onClose={() => setMenuOpen(false)}
      info={[me.data ? `${me.data.display_name}님으로 로그인했어요.` : '', isOrganizer ? '이 여행의 총무예요.' : '', `멤버 ${trip.member_count}명`].filter(Boolean)}
      actions={[
        { label: '멤버·초대 코드', onPress: () => router.navigate(`/trips/${trip.id}/members`) },
        { label: '여행 설정', onPress: () => router.navigate(`/trips/${trip.id}/settings`) },
        { label: '내 여행 목록', onPress: () => router.replace('/') },
        { label: '로그아웃', destructive: true, onPress: () => Alert.alert('로그아웃할까요?', '이 기기에서 로그아웃해요.', [{ text: '취소', style: 'cancel' }, { text: '로그아웃', style: 'destructive', onPress: () => void signOut() }]) },
      ]} />
    {editing && <PlanItemEditor item={editing.item} day={days[day]} dayNumber={day + 1} onClose={() => setEditing(null)} />}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lifted: { backgroundColor: C.background, borderRadius: 12 }, orderError: { fontSize: 12, color: C.error, marginTop: 8 }, dragHint: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 10 },
  screen: { flex: 1, backgroundColor: C.background }, content: { padding: 24, paddingTop: 12, paddingBottom: 72, width: '100%', maxWidth: 600, alignSelf: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '600', color: C.textMuted },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, more: { color: C.textSecondary, fontSize: 18 },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.text, marginTop: 12 }, subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 10 },
  heading: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: C.text }, action: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, link: { fontSize: 14, color: C.accent, fontWeight: '500' },
  days: { flexGrow: 1, flexDirection: 'row', gap: 8, marginTop: 15, marginBottom: 25 }, day: { flexGrow: 1, minWidth: 96, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 13, alignItems: 'center', gap: 6, backgroundColor: C.surface }, selected: { backgroundColor: C.primary }, today: { borderWidth: 1.5, borderColor: C.accent }, dayTitle: { fontSize: 14, fontWeight: '600', color: C.textSecondary }, dayDate: { fontSize: 11, color: C.textMuted }, white: { color: C.onPrimary },
  date: { fontSize: 15, color: C.text, fontWeight: '600' }, caption: { fontSize: 12, color: C.textMuted, marginTop: 7, lineHeight: 19 }, timeline: { marginTop: 25 }, row: { flexDirection: 'row', minHeight: 103 }, pressed: { opacity: 0.55 }, time: { width: 46, fontSize: 12, fontVariant: ['tabular-nums'], color: C.textSecondary, paddingTop: 4 },
  rail: { width: 26, alignItems: 'center' }, dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: C.border, marginTop: 7, backgroundColor: C.background }, activeDot: { borderColor: C.accent }, line: { width: 1, flex: 1, backgroundColor: C.divider, marginTop: 7 },
  item: { flex: 1, paddingBottom: 27 }, itemTitle: { flexShrink: 1, color: C.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, lineHeight: 24 }, chevron: { fontSize: 23, color: C.inactive }, memo: { fontSize: 12, color: C.textSecondary, lineHeight: 19, marginTop: 5 }, meta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 10 }, metaText: { fontSize: 11, color: C.textSecondary }, photoText: { fontSize: 11, color: C.accent },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, padding: 15, borderRadius: 12, alignItems: 'center' }, notice: { fontSize: 11, color: C.textMuted, marginTop: 24, textAlign: 'center', lineHeight: 18 }, empty: { paddingVertical: 26, alignItems: 'center', marginBottom: 20 },
});
