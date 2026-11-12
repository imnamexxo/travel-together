import { TravelColors as C } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function UpcomingScreen({ title, subtitle }: { title: string; subtitle: string }) {
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    <Text style={s.title}>{title}</Text><Text style={s.subtitle}>{subtitle}</Text>
    <View style={s.empty}><Text style={s.label}>곧 함께할 수 있어요</Text><Text style={s.note}>지금은 플래너에서 여행 일정을 만들어보세요.</Text></View>
  </SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: C.background, paddingHorizontal: 24 }, title: { fontSize: 30, fontWeight: '700', color: C.text, marginTop: 28, letterSpacing: -1 }, subtitle: { fontSize: 14, color: C.textSecondary, marginTop: 12, lineHeight: 22 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 90 }, label: { fontSize: 17, fontWeight: '600', color: C.primary }, note: { fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 20 } });
