import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useFriends } from '@/api/queries';
import { TravelColors as C } from '@/constants/theme';

/** 친구 화면으로 가는 아이콘. 받은 친구 요청이 있으면 위에 빨간 동그라미(개수)가 뜬다. */
export default function FriendButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const incoming = useFriends().data?.incoming.length ?? 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={incoming ? `친구, 받은 요청 ${incoming}개` : '친구'} hitSlop={6} onPress={() => router.push('/friends')} style={({ pressed }) => [style, pressed && s.pressed]}>
    <Ionicons name="people-outline" size={22} color={C.primary} />
    {incoming > 0 && <Badge count={incoming} />}
  </Pressable>;
}

/** 아이콘 오른쪽 위의 작은 빨간 동그라미. */
export function Badge({ count }: { count: number }) {
  return <View accessibilityElementsHidden importantForAccessibility="no" style={s.badge}><Text style={s.badgeText}>{count > 9 ? '9+' : count}</Text></View>;
}

const s = StyleSheet.create({
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.background },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.6 },
});
