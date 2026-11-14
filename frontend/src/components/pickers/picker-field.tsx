import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Pressable from '@/components/pressable';

import { TravelColors as C } from '@/constants/theme';

/** 입력칸처럼 보이는 버튼. 누르면 달력·시간 고르기를 연다. */
export default function PickerField({ label, value, placeholder, onPress, invalid, style }: {
  /** 접근성 이름(예: 여행 기간) */
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: value ?? '' }} onPress={onPress} style={[s.field, invalid && s.invalid, style]}>
    <Text style={[s.text, !value && s.placeholder]} numberOfLines={1}>{value ?? placeholder}</Text>
    <Text style={s.icon}>▾</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  field: { minHeight: 52, borderRadius: 12, backgroundColor: C.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  invalid: { borderColor: C.error }, text: { flex: 1, fontSize: 16, color: C.text }, placeholder: { color: C.textMuted }, icon: { fontSize: 12, color: C.textMuted, marginLeft: 8 },
});
