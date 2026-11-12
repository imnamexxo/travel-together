import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';
import ExpenseList from '@/features/expenses/expense-list';
import { useCurrentTrip } from '@/features/trip/current-trip';
import PreviewBalance from './preview-balance';

export default function SettlementScreen() {
  const { trip } = useCurrentTrip();
  const [tab, setTab] = useState<'balance' | 'expenses'>('balance');

  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Text style={s.eyebrow}>{trip.name}</Text><Text style={s.title}>여행 정산</Text>
      <View style={s.tabs}>{([{ key: 'balance', title: '정산 현황' }, { key: 'expenses', title: '지출 내역' }] as const).map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: tab === entry.key }} onPress={() => setTab(entry.key)} style={[s.tab, tab === entry.key && s.tabActive]}><Text style={[s.tabText, tab === entry.key && s.tabActiveText]}>{entry.title}</Text></Pressable>)}</View>
      {tab === 'balance' ? <PreviewBalance /> : <ExpenseList />}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, maxWidth: 600, width: '100%', alignSelf: 'center' },
  eyebrow: { fontSize: 12, color: C.textMuted, marginBottom: 8 }, title: { fontSize: 30, fontWeight: '700', color: C.primary, letterSpacing: -1 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, marginTop: 20 }, tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: C.primary }, tabText: { fontSize: 14, color: C.textMuted }, tabActiveText: { color: C.primary, fontWeight: '600' },
});
