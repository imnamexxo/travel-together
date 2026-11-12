import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { TravelColors as C } from '@/constants/theme';

// Provider credentials and a real Supabase session are not configured yet.
// These buttons must never grant preview access or pretend to authenticate.
export default function SocialLoginButtons() {
  function connect(provider: 'Google' | '카카오') {
    Alert.alert(`${provider} 로그인 연결 전이에요`, '현재는 버튼 미리보기입니다. Supabase와 소셜 계정 설정이 완료되면 실제 로그인으로 연결됩니다.');
  }
  return <View style={s.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Google로 계속하기, 현재 연결 준비 중" onPress={() => connect('Google')}
      style={({ pressed }) => [s.button, s.google, pressed && s.pressed]}>
      <Text style={s.googleText}>Google로 계속하기</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="카카오로 계속하기, 현재 연결 준비 중" onPress={() => connect('카카오')}
      style={({ pressed }) => [s.button, s.kakao, pressed && s.pressed]}>
      <Text style={s.kakaoText}>카카오로 계속하기</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  container: { gap: 10, marginTop: 18 },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  google: { backgroundColor: C.background, borderWidth: 1, borderColor: C.border },
  googleText: { fontSize: 14, fontWeight: '500', color: C.text },
  kakao: { backgroundColor: '#FEE500' },
  kakaoText: { fontSize: 14, fontWeight: '600', color: '#191919' },
  pressed: { opacity: 0.65 },
});
