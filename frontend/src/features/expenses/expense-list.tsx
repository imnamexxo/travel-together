import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExpenseSummary } from '@/api/client';
import { useExpenses } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { STATUS_LABEL, toKstParts } from './expense-form';

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/** 지출 내역: 확인이 필요한 지출(초안·검사 실패)을 위에 모으고, 그 아래 확정된 지출. */
export default function ExpenseList() {
  const { trip, isOrganizer } = useCurrentTrip();
  const expenses = useExpenses(trip.id);

  if (expenses.isPending) return <ActivityIndicator style={s.loading} color={C.primary} />;
  if (expenses.isError) return <View style={s.empty}>
    <Text style={s.helper}>{expenses.error.message}</Text>
    <Pressable accessibilityRole="button" onPress={() => expenses.refetch()} style={s.textButton}><Text style={s.link}>다시 시도</Text></Pressable>
  </View>;

  const pending = expenses.data.filter((e) => e.status !== 'confirmed');
  const confirmed = expenses.data.filter((e) => e.status === 'confirmed');

  return <>
    {!!pending.length && <>
      <Text style={s.sectionTitle}>확인 필요 · {pending.length}건</Text>
      <Text style={s.helper}>확정하기 전에는 정산에 들어가지 않아요.</Text>
      {pending.map((expense) => <ExpenseRow key={expense.id} expense={expense} tripId={trip.id} />)}
    </>}
    <Text style={s.sectionTitle}>확정된 지출 · {confirmed.length}건</Text>
    {!confirmed.length && <Text style={s.helper}>아직 확정된 지출이 없어요.</Text>}
    {confirmed.map((expense) => <ExpenseRow key={expense.id} expense={expense} tripId={trip.id} />)}
    {isOrganizer && <View style={s.addActions}>
      <Pressable accessibilityRole="button" onPress={() => Alert.alert('영수증으로 추가', '영수증 분석은 준비 중이에요. 지금은 직접 입력해 주세요.')} style={s.receiptButton}><Text style={s.receiptText}>영수증으로 추가</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/trips/${trip.id}/expenses/new`)} style={s.manualButton}><Text style={s.link}>＋ 직접 입력</Text></Pressable>
    </View>}
    {!isOrganizer && <Text style={s.helper}>지출은 총무가 입력하고 확정해요.</Text>}
  </>;
}

function ExpenseRow({ expense, tripId }: { expense: ExpenseSummary; tripId: string }) {
  const name = expense.merchant_name ?? '이름 없는 지출';
  const date = expense.paid_at ? toKstParts(expense.paid_at).date.slice(5).replace('-', '.') : '';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name} 지출 열기`} onPress={() => router.push(`/trips/${tripId}/expenses/${expense.id}`)} style={s.expenseRow}>
    <View style={s.dateBadge}><Text style={s.dateText}>{date}</Text></View>
    <View style={s.expenseCopy}>
      <Text style={s.expenseName}>{name}</Text>
      <Text style={s.helper}>{expense.payer_name ? `${expense.payer_name} 결제` : '결제자 미지정'}{expense.status !== 'confirmed' ? ` · ${STATUS_LABEL[expense.status]}` : ''}</Text>
    </View>
    <Text style={s.expenseAmount}>{expense.total_amount === null ? '금액 미입력' : money(expense.total_amount)}</Text>
    <Text style={s.chevron}>›</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  loading: { marginTop: 24 },
  empty: { paddingVertical: 20, alignItems: 'flex-start' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.text, marginTop: 25, marginBottom: 12 },
  helper: { fontSize: 11, lineHeight: 19, color: C.textMuted, marginTop: 6 },
  textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 13, color: C.accent, fontWeight: '500' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  dateBadge: { minWidth: 42 }, dateText: { fontSize: 11, color: C.textMuted },
  expenseCopy: { flex: 1 }, expenseName: { fontSize: 14, color: C.text, fontWeight: '500' },
  expenseAmount: { fontSize: 14, color: C.primary, fontWeight: '600' }, chevron: { fontSize: 20, color: C.inactive },
  addActions: { marginTop: 28 },
  receiptButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 12 },
  receiptText: { color: C.onPrimary, fontSize: 14, fontWeight: '500' },
  manualButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
