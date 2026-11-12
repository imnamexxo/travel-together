import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';
import { expenses, memberName, members, snapshots, suggestedTransfers, totalExpense, type MemberId } from './preview-data';

type Draft = { id: string; name: string; amount: number; payer: MemberId; sharers: MemberId[] };
const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export default function SettlementScreen() {
  const { trip } = useCurrentTrip();
  const [viewer, setViewer] = useState<MemberId>('minji');
  const [tab, setTab] = useState<'balance' | 'expenses'>('balance');
  const [recorded, setRecorded] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sheet, setSheet] = useState<'basis' | 'expense' | 'draft' | null>(null);
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<MemberId>('minji');
  const [sharers, setSharers] = useState<MemberId[]>(['minji', 'junho', 'seoyeon']);
  const [error, setError] = useState('');
  const nextId = useRef(0);
  const isOrganizer = viewer === 'minji';
  const person = members.find((member) => member.id === viewer)!;
  const snapshotKey = `${recorded.includes('t1') ? 1 : 0}${recorded.includes('t2') ? 1 : 0}`;
  const balances = snapshots[snapshotKey];
  const balance = balances[viewer];
  const detail = expenses.find((expense) => expense.id === expenseId);
  const pending = suggestedTransfers.filter((transfer) => !recorded.includes(transfer.id));

  function openDraft(draft?: Draft) {
    if (!isOrganizer) return;
    setDraftId(draft?.id ?? null); setName(draft?.name ?? ''); setAmount(draft ? String(draft.amount) : '');
    setPayer(draft?.payer ?? viewer); setSharers(draft?.sharers ?? ['minji', 'junho', 'seoyeon']);
    setError(''); setSheet('draft');
  }

  function saveDraft() {
    if (!isOrganizer) return;
    if (!name.trim()) { setError('지출 이름을 입력해주세요.'); return; }
    if (!/^\d+$/.test(amount) || Number(amount) <= 0 || !Number.isSafeInteger(Number(amount))) { setError('금액은 0보다 큰 원 단위 정수로 입력해주세요.'); return; }
    if (!sharers.length) { setError('분담 대상을 한 명 이상 선택해주세요.'); return; }
    const draft: Draft = { id: draftId ?? `draft-${Date.now()}-${nextId.current++}`, name: name.trim(), amount: Number(amount), payer, sharers };
    setDrafts((current) => draftId ? current.map((entry) => entry.id === draftId ? draft : entry) : [...current, draft]);
    setSheet(null); setTab('expenses');
  }

  function record(id: string) {
    if (!isOrganizer) return;
    Alert.alert('송금 완료로 기록할까요?', '미리보기 기록만 바뀌며 실제 송금은 실행되지 않습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '기록', onPress: () => setRecorded((current) => current.includes(id) ? current : [...current, id]) },
    ]);
  }

  function undo(id: string) {
    if (!isOrganizer) return;
    Alert.alert('송금 기록을 취소할까요?', '송금 제안에 다시 표시됩니다. 실제 금융 거래에는 영향이 없습니다.', [
      { text: '유지', style: 'cancel' },
      { text: '기록 취소', style: 'destructive', onPress: () => setRecorded((current) => current.filter((entry) => entry !== id)) },
    ]);
  }

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Text style={s.eyebrow}>{trip.name}</Text><Text style={s.title}>여행 정산</Text>
      <View style={s.totalRow}><Text style={s.secondary}>확정된 총지출</Text><Text style={s.total}>{money(totalExpense)}</Text></View>
      <View style={s.previewHeader}><Text style={s.micro}>미리보기 멤버</Text><Text style={s.micro}>로그인 연결 전 · 예시 데이터</Text></View>
      <View style={s.members}>{members.map((member) => <Pressable key={member.id} accessibilityRole="radio" accessibilityState={{ checked: viewer === member.id }} onPress={() => setViewer(member.id)} style={[s.member, viewer === member.id && s.memberActive]}><Text style={[s.memberText, viewer === member.id && s.memberActiveText]}>{member.name}{member.id === 'minji' ? ' · 총무' : ''}</Text></Pressable>)}</View>
      <View style={s.balanceSection}>
        <Text style={s.secondary}>{balance > 0 ? '내가 받을 금액' : balance < 0 ? '내가 보낼 금액' : '내 정산이 완료됐어요'}</Text>
        <Text style={s.balance}>{money(Math.abs(balance))}</Text>
        <View style={s.amountRow}><Text style={s.secondary}>결제액 <Text style={s.emphasis}>{money(person.paid)}</Text></Text><Text style={s.secondary}>부담액 <Text style={s.emphasis}>{money(person.owed)}</Text></Text></View>
        <Pressable accessibilityRole="button" onPress={() => setSheet('basis')} style={s.basisButton}><Text style={s.link}>내 부담액의 계산 근거</Text><Text style={s.link}>›</Text></Pressable>
      </View>
      <View style={s.tabs}>{([{ key: 'balance', title: '정산 현황' }, { key: 'expenses', title: '지출 내역' }] as const).map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: tab === entry.key }} onPress={() => setTab(entry.key)} style={[s.tab, tab === entry.key && s.tabActive]}><Text style={[s.tabText, tab === entry.key && s.tabActiveText]}>{entry.title}</Text></Pressable>)}</View>

      {tab === 'balance' ? <>
        <Text style={s.sectionTitle}>송금 제안</Text>
        {!pending.length && <View style={s.empty}><Text style={s.emptyTitle}>모두 정산을 마쳤어요</Text><Text style={s.helper}>기록된 송금을 아래에서 확인할 수 있어요.</Text></View>}
        {pending.map((transfer) => <View key={transfer.id} style={s.transfer}>
          <View style={s.rowBetween}><Text style={s.transferNames}>{memberName(transfer.from)} <Text style={s.arrow}>→</Text> {memberName(transfer.to)}</Text><Text style={s.transferAmount}>{money(transfer.amount)}</Text></View>
          {isOrganizer && <Pressable accessibilityRole="button" accessibilityLabel={`${memberName(transfer.from)} ${money(transfer.amount)} 송금 완료로 기록`} onPress={() => record(transfer.id)} style={s.recordButton}><Text style={s.recordText}>송금 완료로 기록</Text></Pressable>}
        </View>)}
        <Text style={s.helper}>실제 송금은 은행 앱에서 진행해주세요.</Text>
        <Text style={s.sectionTitle}>멤버별 잔액</Text>
        {members.map((member) => <View key={member.id} style={s.listRow}><View style={s.avatar}><Text style={s.avatarText}>{member.name.slice(0, 1)}</Text></View><Text style={s.memberName}>{member.name}{member.id === viewer ? ' (나)' : ''}</Text><Text style={s.memberBalance}>{balances[member.id] === 0 ? '정산 완료' : `${money(Math.abs(balances[member.id]))} ${balances[member.id] > 0 ? '받을 금액' : '보낼 금액'}`}</Text></View>)}
        {!!recorded.length && <><Text style={s.sectionTitle}>송금 기록</Text>{suggestedTransfers.filter((transfer) => recorded.includes(transfer.id)).map((transfer) => <View key={transfer.id} style={s.history}><View style={s.historyCopy}><Text style={s.historyTitle}>{memberName(transfer.from)} → {memberName(transfer.to)}</Text><Text style={s.helper}>{money(transfer.amount)} · 완료 기록</Text></View>{isOrganizer && <Pressable accessibilityRole="button" accessibilityLabel={`${memberName(transfer.from)} 송금 기록 취소`} onPress={() => undo(transfer.id)} style={s.textAction}><Text style={s.link}>기록 취소</Text></Pressable>}</View>)}</>}
      </> : <>
        {!!drafts.length && <><Text style={s.sectionTitle}>확인 필요 · {drafts.length}건</Text><Text style={s.helper}>초안은 총지출과 정산 금액에 포함되지 않아요.</Text>{drafts.map((draft) => <Pressable key={draft.id} accessibilityRole="button" disabled={!isOrganizer} onPress={() => openDraft(draft)} style={s.expenseRow}><View style={s.expenseCopy}><Text style={s.expenseName}>{draft.name}</Text><Text style={s.helper}>{memberName(draft.payer)} 결제 · 초안</Text></View><Text style={s.expenseAmount}>{money(draft.amount)}</Text></Pressable>)}</>}
        <Text style={s.sectionTitle}>확정된 지출 · {expenses.length}건</Text>
        {expenses.map((expense) => <Pressable key={expense.id} accessibilityRole="button" accessibilityLabel={`${expense.name} 상세 보기`} onPress={() => { setExpenseId(expense.id); setSheet('expense'); }} style={s.expenseRow}><View style={s.dateBadge}><Text style={s.dateText}>{expense.date}</Text></View><View style={s.expenseCopy}><Text style={s.expenseName}>{expense.name}</Text><Text style={s.helper}>{memberName(expense.payer)} 결제</Text></View><Text style={s.expenseAmount}>{money(expense.amount)}</Text><Text style={s.chevron}>›</Text></Pressable>)}
      </>}
      {isOrganizer && <View style={s.addActions}>
        <Pressable accessibilityRole="button" onPress={() => Alert.alert('영수증 분석 연결 전', '현재는 직접 입력으로 지출 초안을 작성할 수 있어요. 영수증 촬영·분석은 서버 연결 후 제공됩니다.')} style={s.receiptButton}><Text style={s.receiptText}>영수증으로 추가</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => openDraft()} style={s.manualButton}><Text style={s.link}>＋ 직접 입력</Text></Pressable>
      </View>}
      <Text style={s.footer}>예시 정산 · 실제 송금이나 서버 저장은 실행되지 않아요.{ '\n' }추가한 초안과 송금 기록은 앱 재시작 시 초기화됩니다.</Text>
    </ScrollView>

    <Modal visible={sheet !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
      <SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <View style={s.rowBetween}><Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={s.textAction}><Text style={s.link}>{sheet === 'draft' ? '취소' : '닫기'}</Text></Pressable><Text style={s.sheetTitle}>{sheet === 'basis' ? '부담액 계산 근거' : sheet === 'expense' ? '지출 상세' : '지출 초안'}</Text>{sheet === 'draft' ? <Pressable accessibilityRole="button" onPress={saveDraft} style={s.textAction}><Text style={s.link}>저장</Text></Pressable> : <View style={s.navSpacer} />}</View>
          {sheet === 'basis' && <>
            <Text style={s.detailName}>{person.name}의 부담액</Text><Text style={s.detailAmount}>{money(person.owed)}</Text>
            {expenses.map((expense) => <View key={expense.id} style={s.basisGroup}><Text style={s.expenseName}>{expense.name}</Text>{expense.lines.filter((line) => line.shares[viewer] !== undefined).map((line) => <View key={line.name} style={s.basisRow}><View style={s.expenseCopy}><Text style={s.secondary}>{line.name}</Text><Text style={s.helper}>품목 {money(line.amount)} · {Object.keys(line.shares).length}명 분담</Text></View><Text style={s.emphasis}>{money(line.shares[viewer]!)}</Text></View>)}</View>)}
            <Text style={s.helper}>결제액은 대신 결제한 금액이고, 부담액은 이용한 품목의 분담 금액이에요. 송금 기록은 부담액이 아닌 남은 잔액에 반영돼요.</Text>
          </>}
          {sheet === 'expense' && detail && <>
            <Text style={s.detailName}>{detail.name}</Text><Text style={s.detailAmount}>{money(detail.amount)}</Text><Text style={s.helper}>{detail.date} · {memberName(detail.payer)} 결제 · 확정된 예시 지출</Text>
            {detail.lines.map((line) => <View key={line.name} style={s.basisGroup}><View style={s.rowBetween}><Text style={s.expenseName}>{line.name}</Text><Text style={s.emphasis}>{money(line.amount)}</Text></View>{members.filter((member) => line.shares[member.id] !== undefined).map((member) => <View key={member.id} style={s.basisRow}><Text style={s.secondary}>{member.name}</Text><Text style={s.secondary}>{money(line.shares[member.id]!)}</Text></View>)}</View>)}
            <Text style={s.helper}>영수증 원본과 지출 수정 기능은 서버 연결 후 제공됩니다.</Text>
          </>}
          {sheet === 'draft' && <>
            <Text style={s.helper}>검산·확정 기능 연결 전에는 초안으로만 저장됩니다.</Text>
            <Text style={s.label}>지출 이름</Text><TextInput accessibilityLabel="지출 이름" value={name} onChangeText={setName} placeholder="예: 저녁 식사" maxLength={80} style={s.input} />
            <Text style={s.label}>총액 (원)</Text><TextInput accessibilityLabel="지출 총액" value={amount} onChangeText={setAmount} placeholder="0" maxLength={12} keyboardType="number-pad" style={s.input} />
            <Text style={s.label}>결제자</Text><View style={s.members}>{members.map((member) => <Pressable key={member.id} accessibilityRole="radio" accessibilityState={{ checked: payer === member.id }} onPress={() => setPayer(member.id)} style={[s.member, payer === member.id && s.memberActive]}><Text style={[s.memberText, payer === member.id && s.memberActiveText]}>{member.name}</Text></Pressable>)}</View>
            <Text style={s.label}>기본 분담 대상</Text><View style={s.members}>{members.map((member) => <Pressable key={member.id} accessibilityRole="checkbox" accessibilityState={{ checked: sharers.includes(member.id) }} onPress={() => setSharers((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} style={[s.member, sharers.includes(member.id) && s.memberActive]}><Text style={[s.memberText, sharers.includes(member.id) && s.memberActiveText]}>{sharers.includes(member.id) ? '✓ ' : ''}{member.name}</Text></Pressable>)}</View>
            {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            {draftId && <Pressable accessibilityRole="button" onPress={() => Alert.alert('초안을 삭제할까요?', '정산에 반영되지 않은 초안만 삭제됩니다.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { setDrafts((current) => current.filter((draft) => draft.id !== draftId)); setSheet(null); } }])} style={s.textAction}><Text style={s.error}>초안 삭제</Text></Pressable>}
          </>}
        </ScrollView>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, maxWidth: 600, width: '100%', alignSelf: 'center' },
  eyebrow: { fontSize: 12, color: C.textMuted, marginBottom: 8 }, title: { fontSize: 30, fontWeight: '700', color: C.primary, letterSpacing: -1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, total: { fontSize: 20, color: C.primary, fontWeight: '600', fontVariant: ['tabular-nums'] }, secondary: { fontSize: 12, lineHeight: 20, color: C.textSecondary },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 20, marginBottom: 10 }, micro: { fontSize: 10, color: C.textMuted },
  members: { flexDirection: 'row', gap: 8 }, member: { flex: 1, minHeight: 40, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, memberActive: { backgroundColor: C.primary }, memberText: { fontSize: 12, color: C.textSecondary }, memberActiveText: { color: C.onPrimary, fontWeight: '500' },
  balanceSection: { paddingVertical: 25 }, balance: { fontSize: 38, fontWeight: '700', color: C.primary, letterSpacing: -1, marginTop: 8, fontVariant: ['tabular-nums'] }, amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 18 }, emphasis: { fontSize: 13, fontWeight: '600', color: C.text }, basisButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, marginTop: 12 }, link: { fontSize: 13, color: C.accent, fontWeight: '500' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }, tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: C.primary }, tabText: { fontSize: 14, color: C.textMuted }, tabActiveText: { color: C.primary, fontWeight: '600' }, sectionTitle: { fontSize: 15, fontWeight: '600', color: C.text, marginTop: 25, marginBottom: 12 },
  transfer: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, transferNames: { fontSize: 15, fontWeight: '500', color: C.text }, arrow: { color: C.textMuted }, transferAmount: { fontSize: 17, fontWeight: '600', color: C.primary }, recordButton: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 9, backgroundColor: C.banner }, recordText: { fontSize: 12, color: C.accent }, helper: { fontSize: 11, lineHeight: 19, color: C.textMuted, marginTop: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }, avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.banner, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 12, color: C.primary }, memberName: { fontSize: 13, color: C.text, flex: 1 }, memberBalance: { fontSize: 12, color: C.textSecondary, flexShrink: 1, textAlign: 'right' },
  history: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, historyCopy: { flex: 1 }, historyTitle: { fontSize: 13, color: C.text }, textAction: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, dateBadge: { minWidth: 42 }, dateText: { fontSize: 11, color: C.textMuted }, expenseCopy: { flex: 1 }, expenseName: { fontSize: 14, color: C.text, fontWeight: '500' }, expenseAmount: { fontSize: 14, color: C.primary, fontWeight: '600' }, chevron: { fontSize: 20, color: C.inactive },
  addActions: { marginTop: 28 }, receiptButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 12 }, receiptText: { color: C.onPrimary, fontSize: 14, fontWeight: '500' }, manualButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, footer: { fontSize: 10, color: C.textMuted, lineHeight: 18, textAlign: 'center', marginTop: 20 },
  empty: { paddingVertical: 20 }, emptyTitle: { fontSize: 15, color: C.primary, fontWeight: '600' }, sheetTitle: { fontSize: 16, color: C.text, fontWeight: '600' }, navSpacer: { width: 44 }, detailName: { fontSize: 20, color: C.text, fontWeight: '600', marginTop: 24 }, detailAmount: { fontSize: 30, color: C.primary, fontWeight: '700', marginTop: 10 }, basisGroup: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, basisRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'center', paddingTop: 12 },
  label: { fontSize: 13, color: C.textSecondary, marginTop: 24, marginBottom: 10 }, input: { backgroundColor: C.surface, borderRadius: 12, padding: 16, minHeight: 52, color: C.text, fontSize: 16 }, error: { fontSize: 12, color: C.error, lineHeight: 20, marginTop: 12 },
});
