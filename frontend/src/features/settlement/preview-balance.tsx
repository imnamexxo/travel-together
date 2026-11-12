// 정산 현황 미리보기(팀원 디자인). #12에서 서버 정산 결과로 바꾼다.
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import { expenses, memberName, members, snapshots, suggestedTransfers, totalExpense, type MemberId } from './preview-data';

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export default function PreviewBalance() {
  const [viewer, setViewer] = useState<MemberId>('minji');
  const [recorded, setRecorded] = useState<string[]>([]);
  const [basisOpen, setBasisOpen] = useState(false);
  const isOrganizer = viewer === 'minji';
  const person = members.find((member) => member.id === viewer)!;
  const snapshotKey = `${recorded.includes('t1') ? 1 : 0}${recorded.includes('t2') ? 1 : 0}`;
  const balances = snapshots[snapshotKey];
  const balance = balances[viewer];
  const pending = suggestedTransfers.filter((transfer) => !recorded.includes(transfer.id));

  function record(id: string) {
    Alert.alert('송금 완료로 기록할까요?', '미리보기 기록만 바뀌며 실제 송금은 실행되지 않습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '기록', onPress: () => setRecorded((current) => current.includes(id) ? current : [...current, id]) },
    ]);
  }

  function undo(id: string) {
    Alert.alert('송금 기록을 취소할까요?', '송금 제안에 다시 표시됩니다. 실제 금융 거래에는 영향이 없습니다.', [
      { text: '유지', style: 'cancel' },
      { text: '기록 취소', style: 'destructive', onPress: () => setRecorded((current) => current.filter((entry) => entry !== id)) },
    ]);
  }

  return <>
    <View style={s.totalRow}><Text style={s.secondary}>확정된 총지출</Text><Text style={s.total}>{money(totalExpense)}</Text></View>
    <View style={s.previewHeader}><Text style={s.micro}>미리보기 멤버</Text><Text style={s.micro}>예시 데이터 · 정산 계산 연결 전</Text></View>
    <View style={s.members}>{members.map((member) => <Pressable key={member.id} accessibilityRole="radio" accessibilityState={{ checked: viewer === member.id }} onPress={() => setViewer(member.id)} style={[s.member, viewer === member.id && s.memberActive]}><Text style={[s.memberText, viewer === member.id && s.memberActiveText]}>{member.name}{member.id === 'minji' ? ' · 총무' : ''}</Text></Pressable>)}</View>
    <View style={s.balanceSection}>
      <Text style={s.secondary}>{balance > 0 ? '내가 받을 금액' : balance < 0 ? '내가 보낼 금액' : '내 정산이 완료됐어요'}</Text>
      <Text style={s.balance}>{money(Math.abs(balance))}</Text>
      <View style={s.amountRow}><Text style={s.secondary}>결제액 <Text style={s.emphasis}>{money(person.paid)}</Text></Text><Text style={s.secondary}>부담액 <Text style={s.emphasis}>{money(person.owed)}</Text></Text></View>
      <Pressable accessibilityRole="button" onPress={() => setBasisOpen(true)} style={s.basisButton}><Text style={s.link}>내 부담액의 계산 근거</Text><Text style={s.link}>›</Text></Pressable>
    </View>
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
    <Text style={s.footer}>예시 정산 · 실제 송금이나 서버 저장은 실행되지 않아요.</Text>

    <Modal visible={basisOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBasisOpen(false)}>
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.rowBetween}><Pressable accessibilityRole="button" onPress={() => setBasisOpen(false)} style={s.textAction}><Text style={s.link}>닫기</Text></Pressable><Text style={s.sheetTitle}>부담액 계산 근거</Text><View style={s.navSpacer} /></View>
          <Text style={s.detailName}>{person.name}의 부담액</Text><Text style={s.detailAmount}>{money(person.owed)}</Text>
          {expenses.map((expense) => <View key={expense.id} style={s.basisGroup}><Text style={s.expenseName}>{expense.name}</Text>{expense.lines.filter((line) => line.shares[viewer] !== undefined).map((line) => <View key={line.name} style={s.basisRow}><View style={s.expenseCopy}><Text style={s.secondary}>{line.name}</Text><Text style={s.helper}>품목 {money(line.amount)} · {Object.keys(line.shares).length}명 분담</Text></View><Text style={s.emphasis}>{money(line.shares[viewer]!)}</Text></View>)}</View>)}
          <Text style={s.helper}>결제액은 대신 결제한 금액이고, 부담액은 이용한 품목의 분담 금액이에요. 송금 기록은 부담액이 아닌 남은 잔액에 반영돼요.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, maxWidth: 600, width: '100%', alignSelf: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, total: { fontSize: 20, color: C.primary, fontWeight: '600', fontVariant: ['tabular-nums'] }, secondary: { fontSize: 12, lineHeight: 20, color: C.textSecondary },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 20, marginBottom: 10 }, micro: { fontSize: 10, color: C.textMuted },
  members: { flexDirection: 'row', gap: 8 }, member: { flex: 1, minHeight: 40, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, memberActive: { backgroundColor: C.primary }, memberText: { fontSize: 12, color: C.textSecondary }, memberActiveText: { color: C.onPrimary, fontWeight: '500' },
  balanceSection: { paddingVertical: 25 }, balance: { fontSize: 38, fontWeight: '700', color: C.primary, letterSpacing: -1, marginTop: 8, fontVariant: ['tabular-nums'] }, amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 18 }, emphasis: { fontSize: 13, fontWeight: '600', color: C.text }, basisButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, marginTop: 12 }, link: { fontSize: 13, color: C.accent, fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.text, marginTop: 25, marginBottom: 12 },
  transfer: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, transferNames: { fontSize: 15, fontWeight: '500', color: C.text }, arrow: { color: C.textMuted }, transferAmount: { fontSize: 17, fontWeight: '600', color: C.primary }, recordButton: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 9, backgroundColor: C.banner }, recordText: { fontSize: 12, color: C.accent }, helper: { fontSize: 11, lineHeight: 19, color: C.textMuted, marginTop: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }, avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.banner, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 12, color: C.primary }, memberName: { fontSize: 13, color: C.text, flex: 1 }, memberBalance: { fontSize: 12, color: C.textSecondary, flexShrink: 1, textAlign: 'right' },
  history: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, historyCopy: { flex: 1 }, historyTitle: { fontSize: 13, color: C.text }, textAction: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  expenseCopy: { flex: 1 }, expenseName: { fontSize: 14, color: C.text, fontWeight: '500' },
  footer: { fontSize: 10, color: C.textMuted, lineHeight: 18, textAlign: 'center', marginTop: 20 },
  empty: { paddingVertical: 20 }, emptyTitle: { fontSize: 15, color: C.primary, fontWeight: '600' }, sheetTitle: { fontSize: 16, color: C.text, fontWeight: '600' }, navSpacer: { width: 44 }, detailName: { fontSize: 20, color: C.text, fontWeight: '600', marginTop: 24 }, detailAmount: { fontSize: 30, color: C.primary, fontWeight: '700', marginTop: 10 }, basisGroup: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, basisRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'center', paddingTop: 12 },
});
