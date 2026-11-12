import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Settlement } from '@/api/client';
import { useSettlement } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';
import { useCurrentTrip } from '@/features/trip/current-trip';

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export function transferGuide(tripName: string, settlement: Settlement): string {
  return [
    `[${tripName}] 정산 송금 안내`,
    ...settlement.suggested_transfers.map((t) => `${t.from_name} → ${t.to_name} ${money(t.amount)}`),
    '실제 송금은 은행 앱에서 해 주세요.',
  ].join('\n');
}

/** 정산 현황. 서버가 계산한 결과만 그린다. 금액을 앱에서 다시 계산하지 않는다. */
export default function BalanceView() {
  const { trip } = useCurrentTrip();
  const settlement = useSettlement(trip.id);
  const [basisOpen, setBasisOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (settlement.isPending) return <ActivityIndicator style={s.loading} color={C.primary} />;
  if (settlement.isError) return <View style={s.empty}>
    <Text style={s.helper}>{settlement.error.message}</Text>
    <Pressable accessibilityRole="button" onPress={() => settlement.refetch()} style={s.textAction}><Text style={s.link}>다시 시도</Text></Pressable>
  </View>;

  const data = settlement.data;
  const me = data.members.find((m) => m.member_id === trip.me.member_id);
  const myShares = data.shares.filter((share) => share.member_id === trip.me.member_id);
  const sharesByExpense = myShares.reduce<Record<string, typeof myShares>>((groups, share) => {
    (groups[share.expense_id] ??= []).push(share);
    return groups;
  }, {});

  async function copyGuide() {
    await Clipboard.setStringAsync(transferGuide(trip.name, data));
    setNotice('송금 안내문을 복사했어요. 메신저에 붙여 넣으세요.');
  }

  return <>
    <View style={s.totalRow}><Text style={s.secondary}>확정된 총지출 · {data.confirmed_count}건</Text><Text style={s.total}>{money(data.confirmed_total)}</Text></View>
    {me && <View style={s.balanceSection}>
      <Text style={s.secondary}>{me.balance > 0 ? '내가 받을 금액' : me.balance < 0 ? '내가 보낼 금액' : '내 정산이 완료됐어요'}</Text>
      <Text style={s.balance}>{money(Math.abs(me.balance))}</Text>
      <View style={s.amountRow}><Text style={s.secondary}>결제액 <Text style={s.emphasis}>{money(me.paid)}</Text></Text><Text style={s.secondary}>부담액 <Text style={s.emphasis}>{money(me.owed)}</Text></Text></View>
      <Pressable accessibilityRole="button" onPress={() => setBasisOpen(true)} style={s.basisButton}><Text style={s.link}>내 부담액의 계산 근거</Text><Text style={s.link}>›</Text></Pressable>
    </View>}

    <Text style={s.sectionTitle}>송금 제안</Text>
    {data.confirmed_count === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>아직 확정된 지출이 없어요</Text><Text style={s.helper}>지출을 확정하면 누가 누구에게 얼마를 보내면 되는지 알려 드려요.</Text></View>
      : data.is_settled ? <View style={s.empty}><Text style={s.emptyTitle}>정산 완료</Text><Text style={s.helper}>모든 멤버의 잔액이 0원이에요.</Text></View>
      : <>
        {data.suggested_transfers.map((transfer) => <View key={`${transfer.from_member_id}-${transfer.to_member_id}`} style={s.transfer}>
          <View style={s.rowBetween}><Text style={s.transferNames}>{transfer.from_name} <Text style={s.arrow}>→</Text> {transfer.to_name}</Text><Text style={s.transferAmount}>{money(transfer.amount)}</Text></View>
        </View>)}
        <Pressable accessibilityRole="button" onPress={copyGuide} style={s.copyButton}><Text style={s.link}>송금 안내문 복사</Text></Pressable>
        {!!notice && <Text style={s.helper}>{notice}</Text>}
      </>}
    <Text style={s.helper}>실제 송금은 은행 앱에서 진행해주세요. 이 앱은 송금하지 않아요.</Text>

    <Text style={s.sectionTitle}>멤버별 잔액</Text>
    {data.members.map((member) => <View key={member.member_id} style={s.listRow}>
      <View style={s.avatar}><Text style={s.avatarText}>{member.display_name.slice(0, 1)}</Text></View>
      <Text style={s.memberName}>{member.display_name}{member.member_id === trip.me.member_id ? ' (나)' : ''}</Text>
      <Text style={s.memberBalance}>{member.balance === 0 ? (data.confirmed_count ? '정산 완료' : '0원') : `${money(Math.abs(member.balance))} ${member.balance > 0 ? '받을 금액' : '보낼 금액'}`}</Text>
    </View>)}

    <Modal visible={basisOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBasisOpen(false)}>
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.rowBetween}><Pressable accessibilityRole="button" onPress={() => setBasisOpen(false)} style={s.textAction}><Text style={s.link}>닫기</Text></Pressable><Text style={s.sheetTitle}>부담액 계산 근거</Text><View style={s.navSpacer} /></View>
          <Text style={s.detailName}>내 부담액</Text><Text style={s.detailAmount}>{money(me?.owed ?? 0)}</Text>
          {!myShares.length && <Text style={s.helper}>확정된 지출 중 내가 분담 대상인 품목이 없어요.</Text>}
          {Object.values(sharesByExpense).map((shares) => <View key={shares[0].expense_id} style={s.basisGroup}>
            <Text style={s.expenseName}>{shares[0].expense_name}</Text>
            {shares.map((share, index) => <View key={`${share.expense_id}-${index}`} style={s.basisRow}>
              <View style={s.expenseCopy}><Text style={s.secondary}>{share.item_name}</Text><Text style={s.helper}>품목 {money(share.item_amount)} · {share.sharer_count}명 분담</Text></View>
              <Text style={s.emphasis}>{money(share.amount)}</Text>
            </View>)}
          </View>)}
          <Text style={s.helper}>결제액은 대신 결제한 금액이고, 부담액은 분담 대상인 품목에서 내 몫을 더한 금액이에요. 나누어 떨어지지 않는 원은 가입 순서가 빠른 멤버부터 1원씩 더 부담해요. 송금 기록은 부담액이 아니라 잔액에 반영돼요.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, maxWidth: 600, width: '100%', alignSelf: 'center' },
  loading: { marginTop: 24 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, total: { fontSize: 20, color: C.primary, fontWeight: '600', fontVariant: ['tabular-nums'] }, secondary: { fontSize: 12, lineHeight: 20, color: C.textSecondary },
  balanceSection: { paddingVertical: 25 }, balance: { fontSize: 38, fontWeight: '700', color: C.primary, letterSpacing: -1, marginTop: 8, fontVariant: ['tabular-nums'] }, amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 18 }, emphasis: { fontSize: 13, fontWeight: '600', color: C.text }, basisButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, marginTop: 12 }, link: { fontSize: 13, color: C.accent, fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.text, marginTop: 25, marginBottom: 12 },
  transfer: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, transferNames: { fontSize: 15, fontWeight: '500', color: C.text }, arrow: { color: C.textMuted }, transferAmount: { fontSize: 17, fontWeight: '600', color: C.primary },
  copyButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8 },
  helper: { fontSize: 11, lineHeight: 19, color: C.textMuted, marginTop: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }, avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.banner, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 12, color: C.primary }, memberName: { fontSize: 13, color: C.text, flex: 1 }, memberBalance: { fontSize: 12, color: C.textSecondary, flexShrink: 1, textAlign: 'right' },
  textAction: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  expenseCopy: { flex: 1 }, expenseName: { fontSize: 14, color: C.text, fontWeight: '500' },
  empty: { paddingVertical: 20 }, emptyTitle: { fontSize: 15, color: C.primary, fontWeight: '600' }, sheetTitle: { fontSize: 16, color: C.text, fontWeight: '600' }, navSpacer: { width: 44 }, detailName: { fontSize: 20, color: C.text, fontWeight: '600', marginTop: 24 }, detailAmount: { fontSize: 30, color: C.primary, fontWeight: '700', marginTop: 10 }, basisGroup: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }, basisRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'center', paddingTop: 12 },
});
