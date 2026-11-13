import { useLocalSearchParams } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, newIdempotencyKey, type Expense, type ExpenseStatus, type Member } from '@/api/client';
import { useConfirmExpense, useDeleteExpense, useExpense, useMembers, useSaveExpense } from '@/api/queries';
import CalendarPicker from '@/components/pickers/calendar-picker';
import { formatDay } from '@/components/pickers/calendar-logic';
import PickerField from '@/components/pickers/picker-field';
import TimePicker from '@/components/pickers/time-picker';
import { TravelColors as C } from '@/constants/theme';
import { goBack } from '@/navigation';
import { useCurrentTrip } from '@/features/trip/current-trip';
import ExpensePlacePicker from './expense-place-picker';
import ZoomableImage from './zoomable-image';
import {
  STATUS_LABEL, emptyForm, formFromExpense, itemsTotal, newItem, toggleDefaultSharer, toggleItemSharer, toInput, totalAmount,
  type ExpenseForm, type FormErrors,
} from './expense-form';

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/** 서버 오류의 세부 목록을 칸별 문구로 모은다. 같은 칸에 여러 개면 줄을 바꿔 잇는다. */
function detailErrors(e: ApiError): FormErrors {
  const errors: FormErrors = {};
  for (const detail of e.details) {
    const key = detail.field ?? 'form';
    errors[key] = errors[key] ? `${errors[key]}\n${detail.message}` : detail.message;
  }
  return errors;
}

export default function ExpenseEditorScreen() {
  const { trip } = useCurrentTrip();
  const { expenseId, analysis } = useLocalSearchParams<{ expenseId?: string; analysis?: string }>();
  const members = useMembers(trip.id);
  const expense = useExpense(trip.id, expenseId);

  if (members.isPending || (expenseId && expense.isPending)) {
    return <View style={s.center}><ActivityIndicator color={C.primary} /></View>;
  }
  const error = members.error ?? expense.error;
  if (error || !members.data) {
    return <SafeAreaView style={s.center}>
      <Text style={s.muted}>{error?.message ?? '지출을 불러오지 못했어요.'}</Text>
      <Pressable accessibilityRole="button" onPress={() => goBack(`/trips/${trip.id}/settlement`)} style={s.textButton}><Text style={s.link}>정산으로 돌아가기</Text></Pressable>
    </SafeAreaView>;
  }
  return <Editor key={expense.data?.id ?? 'new'} members={members.data} expense={expense.data} analysis={analysis} />;
}

const ANALYSIS_NOTICE: Record<string, string> = {
  read: '영수증에서 읽은 값이에요. 원본과 비교해 빈 칸을 채우고 확정해 주세요.',
  reused: '같은 영수증을 읽어 둔 결과를 썼어요. 원본과 비교해 확인해 주세요.',
  failed: '영수증을 읽지 못했어요. 원본을 보며 직접 입력해 주세요.',
};

function Editor({ members, expense, analysis }: { members: Member[]; expense: Expense | undefined; analysis?: string }) {
  const { trip, isOrganizer } = useCurrentTrip();
  const memberOrder = members.map((m) => m.member_id);
  const nameOf = (id: string) => members.find((m) => m.member_id === id)?.display_name ?? '알 수 없음';
  const [form, setForm] = useState<ExpenseForm>(() => expense ? formFromExpense(expense) : emptyForm(memberOrder, trip.me.member_id));
  const [savedId, setSavedId] = useState(expense?.id);
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);
  const [status, setStatus] = useState<ExpenseStatus | undefined>(expense?.status);
  // 한 번 만든 키는 저장에 성공할 때까지 다시 쓴다. 재시도해도 지출은 하나만 생긴다.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const receiptNotice = analysis ? ANALYSIS_NOTICE[analysis] ?? null : null;
  const [receiptOpen, setReceiptOpen] = useState(false);
  // 영수증으로 만든 지출이면 읽지 못한(비어 있는) 칸을 표시한다.
  const fromReceipt = !!expense?.has_receipt && isOrganizer;
  const missing = (value: string) => fromReceipt && !value.trim() ? <Text style={s.missing}>읽지 못함</Text> : null;
  const save = useSaveExpense(trip.id);
  const confirm = useConfirmExpense(trip.id);
  const remove = useDeleteExpense(trip.id);
  const busy = save.isPending || confirm.isPending || remove.isPending;
  const editable = isOrganizer;

  const total = totalAmount(form);
  const sum = itemsTotal(form);
  const update = (changes: Partial<ExpenseForm>) => setForm((f) => ({ ...f, ...changes }));
  const updateItem = (key: string, changes: Partial<ExpenseForm['items'][number]>) =>
    setForm((f) => ({ ...f, items: f.items.map((item) => (item.key === key ? { ...item, ...changes } : item)) }));

  /** 저장하고 지출 id를 돌려준다. 입력 형식이 틀리거나 서버가 거절하면 null. */
  async function persist(): Promise<string | null> {
    const { input, errors: formErrors } = toInput(form);
    setErrors(formErrors);
    setNotice(null);
    if (Object.keys(formErrors).length) return null;
    try {
      const saved = await save.mutateAsync({ expenseId: savedId, input, idempotencyKey });
      setSavedId(saved.id);
      setStatus(saved.status);
      return saved.id;
    } catch (e) {
      setErrors(e instanceof ApiError && e.details.length ? detailErrors(e) : { form: e instanceof Error ? e.message : '저장하지 못했어요.' });
      return null;
    }
  }

  async function onSave() {
    if (await persist()) setNotice('초안으로 저장했어요. 확정해야 정산에 들어가요.');
  }

  async function onConfirm() {
    const id = await persist();
    if (!id) return;
    try {
      await confirm.mutateAsync(id);
      goBack(`/trips/${trip.id}/settlement`);
    } catch (e) {
      setStatus('needs_review');
      setErrors(e instanceof ApiError && e.details.length ? detailErrors(e) : { form: e instanceof Error ? e.message : '확정하지 못했어요.' });
    }
  }

  function onDelete() {
    if (!savedId) return;
    Alert.alert('지출을 삭제할까요?', status === 'confirmed' ? '확정된 지출이라 정산 금액이 다시 계산돼요.' : '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          try {
            await remove.mutateAsync(savedId);
            goBack(`/trips/${trip.id}/settlement`);
          } catch (e) {
            setErrors({ form: e instanceof Error ? e.message : '삭제하지 못했어요.' });
          }
        },
      },
    ]);
  }

  const fieldError = (key: string) => errors[key] ? <Text accessibilityRole="alert" style={s.error}>{errors[key]}</Text> : null;
  const input = (label: string, value: string, onChange: (v: string) => void, props: Partial<ComponentProps<typeof TextInput>> = {}) =>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} placeholderTextColor={C.textMuted} style={[s.input, !editable && s.readOnly]} {...props} />;
  const chip = (label: string, selected: boolean, onPress: () => void, role: 'radio' | 'checkbox', a11yLabel: string) =>
    <Pressable key={a11yLabel} accessibilityRole={role} accessibilityLabel={a11yLabel} accessibilityState={{ checked: selected, disabled: !editable }} disabled={!editable} onPress={onPress} style={[s.chip, selected && s.chipActive]}>
      <Text style={[s.chipText, selected && s.chipActiveText]}>{selected && role === 'checkbox' ? '✓ ' : ''}{label}</Text>
    </Pressable>;

  const title = !editable ? '지출 상세' : savedId ? '지출 수정' : '지출 입력';

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="정산으로 돌아가기" onPress={() => goBack(`/trips/${trip.id}/settlement`)} style={s.back}><Text style={s.backText}>‹ 정산</Text></Pressable>
        <View style={s.between}><Text style={s.title}>{title}</Text>{status && <Text style={[s.status, status === 'needs_review' && s.statusWarn, status === 'confirmed' && s.statusDone]}>{STATUS_LABEL[status]}</Text>}</View>
        {!!expense?.receipt_url && <Pressable accessibilityRole="button" accessibilityLabel="영수증 원본 크게 보기" onPress={() => setReceiptOpen(true)} style={s.receipt}>
          <Image source={{ uri: expense.receipt_url }} style={s.receiptImage} resizeMode="contain" />
          <Text style={s.receiptHint}>눌러서 크게 보기</Text>
        </Pressable>}
        {!!receiptNotice && <Text style={s.receiptNotice}>{receiptNotice}</Text>}
        {editable && status !== 'confirmed' && <Text style={s.hint}>확정한 지출만 정산에 들어가요.</Text>}
        {editable && status === 'confirmed' && <Text style={s.hint}>고쳐서 저장하면 다시 초안이 돼요. 확정해야 정산에 다시 들어가요.</Text>}

        <View style={s.labelRow}><Text style={s.label}>상호</Text>{missing(form.merchant)}</View>
        {input('상호', form.merchant, (v) => update({ merchant: v }), { placeholder: '예: 제주 편의점', maxLength: 50 })}
        <Text style={s.label}>장소 (선택)</Text>
        <ExpensePlacePicker tripId={trip.id} merchant={form.merchant} value={form.place} onChange={(place) => update({ place })} editable={editable} />
        {fieldError('place')}
        <View style={s.row}>
          <View style={s.flex}><View style={s.labelRow}><Text style={s.label}>결제 날짜</Text>{missing(form.date)}</View><PickerField label="결제 날짜" value={form.date ? formatDay(form.date) : null} placeholder="날짜 고르기" onPress={() => setPicking('date')} invalid={!!errors.date} />{fieldError('date')}</View>
          <View style={s.flex}><Text style={s.label}>결제 시각</Text><PickerField label="결제 시각" value={form.time || null} placeholder="시각 고르기" onPress={() => setPicking('time')} invalid={!!errors.time} />{fieldError('time')}</View>
          <CalendarPicker visible={picking === 'date'} mode="single" title="결제 날짜" date={form.date || null} onClose={() => setPicking(null)} onConfirm={(d) => { update({ date: d }); setPicking(null); }} />
          <TimePicker visible={picking === 'time'} title="결제 시각" value={form.time} onClose={() => setPicking(null)} onConfirm={(t) => { update({ time: t }); setPicking(null); }} />
        </View>

        <Text style={s.label}>결제자</Text>
        <View style={s.chips}>{members.map((m) => chip(m.display_name, form.payerId === m.member_id, () => update({ payerId: m.member_id }), 'radio', `결제자 ${m.display_name}`))}</View>
        {fieldError('payer_member_id')}

        <View style={s.labelRow}><Text style={s.label}>총액 (원)</Text>{missing(form.total)}</View>
        {input('총액', form.total, (v) => update({ total: v }), { placeholder: '0', keyboardType: 'number-pad', maxLength: 9 })}
        {fieldError('total_amount')}

        <Text style={s.label}>누가 함께 썼나요? · 기본 분담 대상</Text>
        <View style={s.chips}>{members.map((m) => chip(m.display_name, form.defaultSharerIds.includes(m.member_id), () => setForm((f) => toggleDefaultSharer(f, m.member_id, memberOrder)), 'checkbox', `기본 분담 대상 ${m.display_name}`))}</View>
        <Text style={s.hint}>예외로 바꾸지 않은 품목에 함께 적용돼요.</Text>

        <Text style={s.heading}>품목</Text>
        {form.items.map((item, index) => <View key={item.key} accessibilityLabel={`품목 ${index + 1}`} style={s.item}>
          <View style={s.between}>
            <View style={s.labelRow}><Text style={s.itemTitle}>품목 {index + 1}</Text>{missing(item.name)}{!!item.name.trim() && missing(item.amount)}</View>
            <View style={s.row}>
              <Text style={[s.tag, !item.followsDefault && s.tagException]}>{item.followsDefault ? '기본 분담 대상' : '예외'}</Text>
              {editable && form.items.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`품목 ${index + 1} 삭제`} onPress={() => update({ items: form.items.filter((it) => it.key !== item.key) })} style={s.smallButton}><Text style={s.removeText}>삭제</Text></Pressable>}
            </View>
          </View>
          {input(`품목 ${index + 1} 이름`, item.name, (v) => updateItem(item.key, { name: v }), { placeholder: '예: 간식', maxLength: 50 })}
          {fieldError(`items.${index}.name`)}
          <View style={s.row}>
            <View style={s.quantity}>{input(`품목 ${index + 1} 수량`, item.quantity, (v) => updateItem(item.key, { quantity: v }), { placeholder: '수량', keyboardType: 'number-pad', maxLength: 4 })}</View>
            <View style={s.flex}>{input(`품목 ${index + 1} 금액`, item.amount, (v) => updateItem(item.key, { amount: v }), { placeholder: '금액 (원)', keyboardType: 'number-pad', maxLength: 9 })}</View>
          </View>
          {fieldError(`items.${index}.quantity`)}
          {fieldError(`items.${index}.amount`)}
          <View style={s.chips}>{members.map((m) => chip(m.display_name, item.sharerIds.includes(m.member_id), () => setForm((f) => toggleItemSharer(f, item.key, m.member_id, memberOrder)), 'checkbox', `품목 ${index + 1} 분담 ${m.display_name}`))}</View>
          {fieldError(`items.${index}.sharers`)}
          {fieldError(`items.${index}.sharer_ids`)}
        </View>)}
        {fieldError('items')}
        {editable && <Pressable accessibilityRole="button" onPress={() => update({ items: [...form.items, newItem(form.defaultSharerIds)] })} style={s.addItem}><Text style={s.link}>＋ 품목 추가</Text></Pressable>}

        <View style={s.summary}>
          <Text style={s.summaryText}>품목 합계 {money(sum)} · 총액 {total === null ? '미입력' : money(total)}</Text>
          {total !== null && <Text style={[s.summaryDiff, sum !== total && s.mismatch]}>{sum === total ? '품목 합계와 총액이 같아요' : `차이 ${money(Math.abs(total - sum))}`}</Text>}
        </View>

        {!editable && <Text style={s.hint}>지출은 총무만 고칠 수 있어요. {form.payerId ? `${nameOf(form.payerId)}님이 결제했어요.` : ''}</Text>}
        {fieldError('form')}
        {!!notice && <Text style={s.notice}>{notice}</Text>}
        {editable && <>
          <View style={s.row}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onSave} style={({ pressed }) => [s.secondaryButton, (pressed || busy) && s.pressed]}><Text style={s.secondaryText}>저장</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onConfirm} style={({ pressed }) => [s.primaryButton, (pressed || busy) && s.pressed]}><Text style={s.primaryText}>확정</Text></Pressable>
          </View>
          {!!savedId && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onDelete} style={s.deleteButton}><Text style={s.removeText}>지출 삭제</Text></Pressable>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
    {!!expense?.receipt_url && <Modal visible={receiptOpen} animationType="fade" onRequestClose={() => setReceiptOpen(false)}>
      <SafeAreaView style={s.viewer}>
        <Pressable accessibilityRole="button" onPress={() => setReceiptOpen(false)} style={s.viewerClose}><Text style={s.viewerCloseText}>닫기</Text></Pressable>
        {/* 화면에 맞춰 보여 주고, 두 손가락으로 확대·이동, 두 번 탭하면 확대/원래대로 */}
        <ZoomableImage uri={expense.receipt_url} accessibilityLabel="영수증 원본" />
        <Text style={s.viewerHint}>두 손가락으로 확대 · 두 번 탭하면 크게</Text>
      </SafeAreaView>
    </Modal>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, backgroundColor: C.background },
  content: { padding: 24, paddingTop: 12, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { fontSize: 14, color: C.accent },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1 }, quantity: { width: 84 },
  title: { fontSize: 28, letterSpacing: -1, fontWeight: '700', color: C.primary, marginTop: 8 },
  status: { fontSize: 12, fontWeight: '600', color: C.textSecondary, backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, overflow: 'hidden', marginTop: 8 },
  statusWarn: { color: C.error }, statusDone: { color: C.primary, backgroundColor: C.banner },
  heading: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 28 },
  label: { fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 8, marginTop: 18 },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.text, marginTop: 6 },
  readOnly: { backgroundColor: C.background, paddingHorizontal: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: C.primary }, chipText: { fontSize: 14, color: C.textSecondary }, chipActiveText: { color: C.onPrimary, fontWeight: '600' },
  item: { marginTop: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.divider },
  itemTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  tag: { fontSize: 11, color: C.textMuted }, tagException: { color: C.accent, fontWeight: '600' },
  smallButton: { minHeight: 36, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  addItem: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border },
  summary: { marginTop: 24, padding: 16, borderRadius: 14, backgroundColor: C.banner, gap: 6 },
  summaryText: { fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] },
  summaryDiff: { fontSize: 13, color: C.textSecondary }, mismatch: { color: C.error, fontWeight: '600' },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 18 },
  error: { fontSize: 12, lineHeight: 18, color: C.error, marginTop: 6 },
  notice: { fontSize: 13, color: C.textSecondary, marginTop: 14 },
  muted: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
  textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontSize: 14, fontWeight: '600', color: C.accent },
  secondaryButton: { flex: 1, minHeight: 52, borderRadius: 13, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  secondaryText: { fontSize: 15, fontWeight: '600', color: C.primary },
  primaryButton: { flex: 1, minHeight: 52, borderRadius: 13, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
  deleteButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  removeText: { fontSize: 13, color: C.error },
  pressed: { opacity: 0.6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missing: { fontSize: 11, fontWeight: '600', color: C.error, backgroundColor: C.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', marginTop: 10 },
  receipt: { marginTop: 16, borderRadius: 14, backgroundColor: C.surface, padding: 8, alignItems: 'center' },
  receiptImage: { width: '100%', height: 220 }, receiptHint: { fontSize: 11, color: C.textMuted, marginTop: 6 },
  receiptNotice: { fontSize: 13, lineHeight: 19, color: C.primary, marginTop: 12 },
  viewer: { flex: 1, backgroundColor: '#000' }, viewerClose: { alignSelf: 'flex-end', minHeight: 48, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  viewerCloseText: { color: '#fff', fontSize: 15 }, viewerHint: { color: '#bbb', fontSize: 12, textAlign: 'center', paddingVertical: 10 },
});
