import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { showAlert } from '@/components/dialog';
import Pressable from '@/components/pressable';

import { newIdempotencyKey, type ExpenseSummary } from '@/api/client';
import { useExpenses, useUploadReceipt } from '@/api/queries';
import { Type, type TravelPalette } from '@/constants/theme';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { STATUS_LABEL, toKstParts } from './expense-form';
import { pickReceipt, prepareReceipt, type ReceiptSource } from './receipt-prep';

/** 지출 내역: 확인이 필요한 지출(초안·검사 실패)을 위에 모으고, 그 아래 확정된 지출. */
export default function ExpenseList() {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);
  const { trip, isOrganizer, money } = useCurrentTrip();
  const expenses = useExpenses(trip.id);
  const upload = useUploadReceipt(trip.id);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // 같은 영수증을 다시 시도할 때 지출 초안이 두 개 생기지 않도록, 성공할 때까지 같은 키를 쓴다.
  const receiptKey = useRef(newIdempotencyKey());

  function chooseReceipt() {
    showAlert('영수증으로 추가', '영수증을 찍거나 앨범에서 골라 주세요.', [
      { text: '취소', style: 'cancel' },
      { text: '앨범에서 고르기', onPress: () => void addReceipt('library') },
      { text: '사진 찍기', onPress: () => void addReceipt('camera') },
    ]);
  }

  async function addReceipt(source: ReceiptSource) {
    setReceiptError(null);
    try {
      const picked = await pickReceipt(source);
      if (!picked) return;
      const uri = await prepareReceipt(picked);
      const result = await upload.mutateAsync({ uri, idempotencyKey: receiptKey.current });
      receiptKey.current = newIdempotencyKey();
      const other = result.receipt_currency ? `&receiptCurrency=${result.receipt_currency}` : '';
      router.push(`/trips/${trip.id}/expenses/${result.expense.id}?analysis=${result.analysis}${other}`);
    } catch (e) {
      setReceiptError(e instanceof Error ? e.message : '영수증을 올리지 못했어요.');
    }
  }

  if (expenses.isPending) return <ActivityIndicator style={s.loading} color={C.primary} />;
  if (expenses.isError) return <View style={s.empty}>
    <Text style={s.helper}>{expenses.error.message}</Text>
    <Pressable accessibilityRole="button" onPress={() => expenses.refetch()} style={s.textButton}><Text style={s.link}>다시 시도</Text></Pressable>
  </View>;

  const pending = expenses.data.filter((e) => e.status !== 'confirmed');
  const confirmed = expenses.data.filter((e) => e.status === 'confirmed');

  return <>
    {!!pending.length && <>
      <View style={s.sectionRow}><Text style={s.sectionTitle}>확인 필요</Text><Text style={s.sectionCount}>{pending.length}건</Text></View>
      <Text style={s.helper}>확정하기 전에는 정산에 들어가지 않아요.</Text>
      {pending.map((expense) => <ExpenseRow key={expense.id} expense={expense} tripId={trip.id} />)}
    </>}
    <View style={s.sectionRow}><Text style={s.sectionTitle}>확정된 지출</Text><Text style={s.sectionCount}>{confirmed.length}건</Text></View>
    {!confirmed.length ? <Text style={s.helper}>아직 확정된 지출이 없어요.</Text> : <View style={s.receipt}>
      {confirmed.map((expense, i) => <View key={expense.id}>
        {i > 0 && <View style={s.receiptRule} />}
        <ExpenseRow expense={expense} tripId={trip.id} onReceipt />
      </View>)}
      <View style={s.totalRule} />
      <View style={s.totalRow}><Text style={s.totalLabel}>합계</Text><Text style={s.totalValue}>{money.format(confirmed.reduce((sum, x) => sum + (x.total_amount ?? 0), 0))}</Text></View>
    </View>}
    {isOrganizer && <View style={s.addActions}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: upload.isPending, busy: upload.isPending }} disabled={upload.isPending} onPress={chooseReceipt} style={[s.receiptButton, upload.isPending && s.busy]}>
        {upload.isPending ? <ActivityIndicator color={C.onPrimary} /> : <Text style={s.receiptText}>영수증으로 추가</Text>}
      </Pressable>
      {upload.isPending && <Text style={s.helper}>영수증을 읽는 중이에요. 20초쯤 걸릴 수 있어요.</Text>}
      {!!receiptError && <Text accessibilityRole="alert" style={s.error}>{receiptError}</Text>}
      <Pressable accessibilityRole="button" onPress={() => router.push(`/trips/${trip.id}/expenses/new`)} style={s.manualButton}><Text style={s.link}>＋ 직접 입력</Text></Pressable>
    </View>}
    {!isOrganizer && <Text style={s.helper}>지출은 총무가 입력하고 확정해요.</Text>}
  </>;
}

function ExpenseRow({ expense, tripId, onReceipt = false }: { expense: ExpenseSummary; tripId: string; onReceipt?: boolean }) {
  const s = useThemedStyles(sStyles);
  const { money } = useCurrentTrip();
  const name = expense.merchant_name ?? '이름 없는 지출';
  const date = expense.paid_at ? toKstParts(expense.paid_at).date.slice(5).replace('-', '.') : '';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name} 지출 열기`} onPress={() => router.push(`/trips/${tripId}/expenses/${expense.id}`)} style={onReceipt ? s.receiptRow : s.expenseRow}>
    <View style={s.dateBadge}><Text style={s.dateText}>{date}</Text></View>
    <View style={s.expenseCopy}>
      <Text style={s.expenseName}>{name}</Text>
      <View style={s.payerRow}><Text style={s.helper}>{expense.payer_name ? `${expense.payer_name} 결제` : '결제자 미지정'}</Text>{expense.status !== 'confirmed' && <Text style={s.statusTag}>{STATUS_LABEL[expense.status]}</Text>}</View>
    </View>
    <Text style={s.expenseAmount}>{expense.total_amount === null ? '금액 미입력' : money.format(expense.total_amount)}</Text>
    <Text style={s.chevron}>›</Text>
  </Pressable>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  loading: { marginTop: 24 },
  empty: { paddingVertical: 20, alignItems: 'flex-start' },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 25, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: Type.heading, color: C.text }, sectionCount: { fontSize: 13, color: C.textMuted, fontVariant: ['tabular-nums'] },
  payerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusTag: { fontSize: 11, color: C.accent, backgroundColor: C.banner, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  helper: { fontSize: 11, lineHeight: 19, color: C.textMuted, marginTop: 6 },
  textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 13, color: C.accent, fontWeight: '500' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  dateBadge: { minWidth: 42 }, dateText: { fontSize: 11, color: C.textMuted },
  expenseCopy: { flex: 1 }, expenseName: { fontSize: 14, color: C.text, fontWeight: '500' },
  expenseAmount: { fontSize: 15, color: C.primary, fontFamily: Type.medium, fontVariant: ['tabular-nums'] }, chevron: { fontSize: 20, color: C.inactive },
  receipt: { backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22, marginTop: 4 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  receiptRule: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: C.border },
  totalRule: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: C.border, marginTop: 6, marginBottom: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontFamily: Type.heading, fontSize: 14, color: C.text },
  totalValue: { fontFamily: Type.display, fontSize: 22, color: C.primary, fontVariant: ['tabular-nums'] },
  addActions: { marginTop: 28 },
  receiptButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14 },
  receiptText: { color: C.onPrimary, fontSize: 14, fontWeight: '500' },
  manualButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  busy: { opacity: 0.6 }, error: { fontSize: 12, color: C.error, marginTop: 8, lineHeight: 18 },
});
