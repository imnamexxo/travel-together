import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Pressable from '@/components/pressable';
import { mailSupport, openPrivacyPolicy } from '@/constants/legal';
import { Type, type TravelPalette } from '@/constants/theme';
import { useThemedStyles, useTravelColors } from '@/theme/theme-context';

const FEATURES: { icon: { ios: string; android: string; web: string }; title: string; body: string }[] = [
  { icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }, title: '함께 짜는 일정', body: '날짜별 일정을 멤버 모두가 함께 고쳐요. AI가 빈 시간에 맞춰 동선까지 추천하고, 메모에 써 둔 계획도 붙여 넣으면 일정으로 나눠 줘요.' },
  { icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }, title: '하나로 모이는 사진', body: '각자 찍은 사진을 한 앨범에 모아 날짜별·장소별·올린 사람별로 봐요. 사진 위치 정보는 읽지 않아요.' },
  { icon: { ios: 'map', android: 'map', web: 'map' }, title: '여행 지도', body: '계획한 곳과 실제로 들른 곳을 지도에서 한눈에 봐요. 국내는 카카오맵, 해외는 Google 지도로 보여요.' },
  { icon: { ios: 'creditcard', android: 'receipt_long', web: 'receipt_long' }, title: '경비 정산', body: '영수증을 찍으면 AI가 품목과 금액을 읽어요. 누가 누구에게 얼마를 보내면 되는지 자동으로 계산하고, 외화 여행도 돼요.' },
];

/**
 * 웹 첫 화면(로그인 전). 앱 소개와 시작하기. 검색엔진이 읽는 글도 여기 있다.
 * 앱(안드로이드)에서는 보이지 않고 로그인 화면으로 바로 간다(src/app/index.tsx).
 */
export default function LandingScreen() {
  const C = useTravelColors();
  const s = useThemedStyles(sStyles);

  return <SafeAreaView style={s.screen}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.nav}>
        <Text style={s.brand}>Travel Together</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/login')} style={s.navButton}><Text style={s.navLink}>로그인</Text></Pressable>
      </View>

      <View style={s.hero}>
        <View style={s.icon}><SymbolView name={{ ios: 'suitcase.rolling', android: 'luggage', web: 'luggage' }} tintColor={C.primary} size={34} /></View>
        <Text accessibilityRole="header" style={s.title}>함께 떠나는 여행,{'\n'}계획부터 정산까지 한곳에서</Text>
        <Text style={s.lead}>일정·사진·경비를 여행 멤버와 함께 정리하는 앱이에요. 초대 링크 하나로 친구를 부르고, 여행이 끝나면 누가 누구에게 얼마를 보내면 되는지까지 알려 줘요.</Text>
        <View style={s.ctaRow}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/signup')} style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>무료로 시작하기</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.secondaryText}>로그인</Text></Pressable>
        </View>
        <Text style={s.note}>웹에서 바로 쓸 수 있어요. Android 앱은 Google Play 출시를 준비하고 있어요.</Text>
      </View>

      <View style={s.features}>
        {FEATURES.map((feature) => <View key={feature.title} style={s.card}>
          <View style={s.cardIcon}><SymbolView name={feature.icon as never} tintColor={C.primary} size={22} /></View>
          <Text accessibilityRole="header" style={s.cardTitle}>{feature.title}</Text>
          <Text style={s.cardBody}>{feature.body}</Text>
        </View>)}
      </View>

      <View style={s.steps}>
        <Text accessibilityRole="header" style={s.sectionTitle}>이렇게 써요</Text>
        {['여행을 만들고 날짜와 통화를 정해요.', '초대 링크나 친구 목록으로 멤버를 불러요.', '일정을 함께 짜고, 여행 중에는 사진과 지출을 올려요.', '여행이 끝나면 정산 화면에서 보낼 돈을 확인해요.'].map((step, index) => <View key={step} style={s.step}>
          <Text style={s.stepNumber}>{index + 1}</Text><Text style={s.stepText}>{step}</Text>
        </View>)}
      </View>

      <View style={s.footer}>
        <Pressable accessibilityRole="link" onPress={openPrivacyPolicy} style={s.footerLink}><Text style={s.footerText}>개인정보 처리방침</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => mailSupport('[문의] Travel Together')} style={s.footerLink}><Text style={s.footerText}>문의</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const sStyles = (C: TravelPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 24, paddingBottom: 40, width: '100%', maxWidth: 960, alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64 },
  brand: { fontFamily: Type.heading, fontSize: 17, color: C.primary },
  navButton: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, navLink: { fontSize: 14, fontWeight: '600', color: C.accent },
  hero: { paddingTop: 36, paddingBottom: 28, maxWidth: 640 },
  icon: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.banner, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontFamily: Type.display, fontSize: 34, lineHeight: 46, letterSpacing: -0.8, color: C.primary },
  lead: { fontSize: 16, lineHeight: 27, color: C.textSecondary, marginTop: 16 },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  primary: { minHeight: 52, paddingHorizontal: 24, borderRadius: 14, backgroundColor: C.primary, justifyContent: 'center' }, primaryText: { fontSize: 16, fontWeight: '600', color: C.onPrimary },
  secondary: { minHeight: 52, paddingHorizontal: 24, borderRadius: 14, borderWidth: 1, borderColor: C.border, justifyContent: 'center' }, secondaryText: { fontSize: 16, fontWeight: '600', color: C.text },
  pressed: { opacity: 0.7 },
  note: { fontSize: 13, color: C.textMuted, marginTop: 14, lineHeight: 20 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  card: { flexGrow: 1, flexBasis: 260, padding: 20, borderRadius: 18, backgroundColor: C.surface },
  cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.banner, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardTitle: { fontFamily: Type.heading, fontSize: 17, color: C.text },
  cardBody: { fontSize: 14, lineHeight: 23, color: C.textSecondary, marginTop: 8 },
  steps: { marginTop: 40 },
  sectionTitle: { fontFamily: Type.display, fontSize: 22, color: C.primary, marginBottom: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primary, color: C.onPrimary, textAlign: 'center', lineHeight: 30, fontWeight: '700', overflow: 'hidden' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 23, color: C.text },
  footer: { flexDirection: 'row', gap: 20, marginTop: 48, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  footerLink: { minHeight: 44, justifyContent: 'center' }, footerText: { fontSize: 13, color: C.textMuted },
});
