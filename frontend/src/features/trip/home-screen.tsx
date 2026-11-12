import { TravelColors as C } from '@/constants/theme';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { type PlanItem } from './demo';
import { usePreviewTrip } from './preview-state';
import TravelNotes from './travel-notes';
import { useMe } from '@/api/queries';
import { useAuth } from '@/auth/auth-context';
import { useCurrentTrip } from './current-trip';
import { formatPeriod } from './trip-dates';

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;
export default function HomeScreen() {
  // 여행 정보는 서버에서, 일정 항목은 아직 예시 데이터다(#7에서 서버로 교체).
  const me = useMe();
  const { signOut } = useAuth();
  const { trip, days, isOrganizer } = useCurrentTrip();
  const [selectedDay, setDay] = useState(0);
  const day = Math.min(selectedDay, days.length - 1);
  const { items, setItems, photos } = usePreviewTrip();
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [time, setTime] = useState('10:00');
  const [memo, setMemo] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');
  const plans = items.filter((item) => item.day === day).sort((a, b) => a.time.localeCompare(b.time));
  function edit(item?: PlanItem) {
    setEditing(item ?? null); setName(item?.name ?? ''); setTime(item?.time ?? '10:00');
    setMemo(item?.memo ?? ''); setBudget(item ? String(item.budget) : ''); setError(''); setVisible(true);
  }
  function save() {
    if (!name.trim()) { setError('장소 또는 일정 이름을 입력해주세요.'); return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { setError('시간을 10:00처럼 입력해주세요.'); return; }
    if ((budget && !/^\d+$/.test(budget)) || !Number.isSafeInteger(Number(budget))) { setError('비용은 0 이상의 정수로 입력해주세요.'); return; }
    const item: PlanItem = { id: editing?.id ?? String(Date.now()), day, time, name: name.trim(), memo: memo.trim(), budget: Number(budget), photos: editing?.photos ?? 0 };
    setItems((old) => editing ? old.map((row) => row.id === editing.id ? item : row) : [...old, item]); setVisible(false);
  }
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={s.between}><Text style={s.eyebrow}>TOGETHER, EVERYWHERE</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="여행 메뉴" style={s.circle} onPress={() => Alert.alert('여행 메뉴', [
          me.data && `${me.data.display_name}님으로 로그인했어요.`,
          isOrganizer && '이 여행의 총무예요.',
          `멤버 ${trip.member_count}명`,
        ].filter(Boolean).join('\n'), [
          { text: '닫기', style: 'cancel' },
          { text: '멤버·초대 코드', onPress: () => router.navigate(`/trips/${trip.id}/members`) },
          { text: '여행 설정', onPress: () => router.navigate(`/trips/${trip.id}/settings`) },
          { text: '내 여행 목록', onPress: () => router.replace('/') },
          { text: '로그아웃', onPress: () => Alert.alert('로그아웃할까요?', '예시 여행에서 추가한 일정·사진·메모는 초기화됩니다.', [{ text: '취소', style: 'cancel' }, { text: '로그아웃', style: 'destructive', onPress: () => void signOut() }]) },
        ])}><Text style={s.more}>•••</Text></Pressable>
      </View>
      <Text style={s.title}>{trip.name}</Text><Text style={s.subtitle}>{formatPeriod(trip.start_date, trip.end_date)}  ·  {trip.member_count}명</Text>
      <TravelNotes />
      <View style={s.between}><Text style={s.heading}>여행 일정</Text><Pressable accessibilityRole="button" style={s.action} onPress={() => Alert.alert('추천 일정', 'AI 추천 기능은 다음 단계에서 연결할 예정이에요.')}><Text style={s.link}>✧ 추천 일정</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>{days.map((entry, index) => <Pressable key={entry.iso} accessibilityRole="tab" accessibilityState={{ selected: day === index }} accessibilityLabel={`${index + 1}일 차 ${entry.date}`} onPress={() => setDay(index)} style={[s.day, index === day && s.selected]}><Text style={[s.dayTitle, index === day && s.white]}>{index + 1}일 차</Text><Text style={[s.dayDate, index === day && s.white]}>{entry.date} ({entry.weekday})</Text></Pressable>)}</ScrollView>
      <Text style={s.date}>{days[day].title}</Text>
      <View style={s.timeline}>
        {!plans.length && <View style={s.empty}><Text style={s.itemTitle}>아직 정해진 일정이 없어요</Text><Text style={s.caption}>함께 가고 싶은 곳을 담아보세요.</Text></View>}
        {plans.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.time} ${item.name}, 일정 수정`} onPress={() => edit(item)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
          <Text style={s.time}>{item.time}</Text><View style={s.rail}><View style={[s.dot, index === 0 && s.activeDot]} />{index < plans.length - 1 && <View style={s.line} />}</View>
          <View style={s.item}><View style={s.between}><Text style={s.itemTitle}>{item.name}</Text><Text style={s.chevron}>›</Text></View>{!!item.memo && <Text style={s.memo}>{item.memo}</Text>}<View style={s.meta}>{item.budget > 0 && <Text style={s.metaText}>예상 {money(item.budget)}</Text>}{photos.some((photo) => photo.place === item.name && photo.day === item.day) && <Text style={s.photoText}>사진 {photos.filter((photo) => photo.place === item.name && photo.day === item.day).length}장</Text>}</View></View>
        </Pressable>)}
      </View>
      <Pressable accessibilityRole="button" onPress={() => edit()} style={({ pressed }) => [s.add, pressed && s.pressed]}><Text style={s.link}>＋ 일정 추가</Text></Pressable>
      <Text style={s.notice}>일정은 아직 예시 데이터예요 · 앱을 다시 켜면 초기화돼요</Text>
    </ScrollView>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}><SafeAreaView style={s.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <View style={s.between}><Pressable accessibilityRole="button" style={s.action} onPress={() => setVisible(false)}><Text style={s.memo}>취소</Text></Pressable><Text style={s.itemTitle}>{editing ? '일정 수정' : '일정 추가'}</Text><Pressable accessibilityRole="button" style={s.action} onPress={save}><Text style={s.link}>저장</Text></Pressable></View>
        <Text style={s.caption}>{day + 1}일 차 · {days[day].title}</Text>
        <Text style={s.label}>장소 또는 일정 이름</Text><TextInput accessibilityLabel="장소 또는 일정 이름" style={s.input} value={name} onChangeText={setName} placeholder="어디로 떠날까요?" maxLength={80} />
        <Text style={s.label}>시간</Text><TextInput accessibilityLabel="시간" style={s.input} value={time} onChangeText={setTime} placeholder="10:00" maxLength={5} keyboardType="numbers-and-punctuation" />
        <Text style={s.label}>메모</Text><TextInput accessibilityLabel="메모" style={[s.input, { minHeight: 100, textAlignVertical: 'top' }]} value={memo} onChangeText={setMemo} placeholder="함께 기억할 내용을 남겨요" multiline maxLength={300} />
        <Text style={s.label}>예상 비용 (원)</Text><TextInput accessibilityLabel="예상 비용" style={s.input} value={budget} onChangeText={setBudget} placeholder="0" keyboardType="number-pad" maxLength={12} />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}<Text style={s.notice}>장소 검색과 서버 저장은 추후 연결됩니다.</Text>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { padding: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '600', color: C.textMuted },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, more: { color: C.textSecondary, fontSize: 18 },
  title: { fontSize: 30, letterSpacing: -1.1, fontWeight: '700', color: C.text, marginTop: 12 }, subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 10 },
  heading: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: C.text }, action: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, link: { fontSize: 14, color: C.accent, fontWeight: '500' },
  days: { flexGrow: 1, flexDirection: 'row', gap: 8, marginTop: 15, marginBottom: 25 }, day: { flexGrow: 1, minWidth: 96, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 13, alignItems: 'center', gap: 6, backgroundColor: C.surface }, selected: { backgroundColor: C.primary }, dayTitle: { fontSize: 14, fontWeight: '600', color: C.textSecondary }, dayDate: { fontSize: 11, color: C.textMuted }, white: { color: C.onPrimary },
  date: { fontSize: 15, color: C.text, fontWeight: '600' }, caption: { fontSize: 12, color: C.textMuted, marginTop: 7, lineHeight: 19 }, timeline: { marginTop: 25 }, row: { flexDirection: 'row', minHeight: 103 }, pressed: { opacity: 0.55 }, time: { width: 46, fontSize: 12, fontVariant: ['tabular-nums'], color: C.textSecondary, paddingTop: 4 },
  rail: { width: 26, alignItems: 'center' }, dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: C.border, marginTop: 7, backgroundColor: C.background }, activeDot: { borderColor: C.accent }, line: { width: 1, flex: 1, backgroundColor: C.divider, marginTop: 7 },
  item: { flex: 1, paddingBottom: 27 }, itemTitle: { flexShrink: 1, color: C.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.3, lineHeight: 24 }, chevron: { fontSize: 23, color: C.inactive }, memo: { fontSize: 12, color: C.textSecondary, lineHeight: 19, marginTop: 5 }, meta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 10 }, metaText: { fontSize: 11, color: C.textSecondary }, photoText: { fontSize: 11, color: C.accent },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, padding: 15, borderRadius: 12, alignItems: 'center' }, summary: { marginTop: 27, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider }, amount: { fontSize: 15, fontWeight: '600', color: C.primary }, notice: { fontSize: 11, color: C.textMuted, marginTop: 24, textAlign: 'center', lineHeight: 18 }, empty: { paddingVertical: 26, alignItems: 'center', marginBottom: 20 },
  label: { fontSize: 13, color: C.textSecondary, marginTop: 25, marginBottom: 10 }, input: { backgroundColor: C.surface, borderRadius: 12, padding: 16, fontSize: 16, color: C.text, minHeight: 52 }, error: { fontSize: 13, color: C.error, marginTop: 16 },
});
