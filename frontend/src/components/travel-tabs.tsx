import { TravelColors as C } from '@/constants/theme';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

const screens = [
  { name: 'index', title: '플래너', ios: 'calendar', other: 'calendar_month' },
  { name: 'album', title: '앨범', ios: 'photo.on.rectangle', other: 'photo_library' },
  { name: 'map', title: '지도', ios: 'map', other: 'map' },
  { name: 'settlement', title: '정산', ios: 'wonsign.circle', other: 'payments' },
] as const;

export default function TravelTabs() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.accent, tabBarInactiveTintColor: C.inactive, tabBarStyle: { backgroundColor: C.background, borderTopColor: C.divider }, tabBarLabelStyle: { fontSize: 10, fontWeight: '500' }, sceneStyle: { backgroundColor: C.background } }}>
    {screens.map((screen) => <Tabs.Screen key={screen.name} name={screen.name} options={{ title: screen.title, tabBarIcon: ({ color }) => <SymbolView name={{ ios: screen.ios, android: screen.other, web: screen.other }} tintColor={color} size={23} /> }} />)}
    {/* 멤버·초대 코드, 여행 설정: 탭 버튼 없이 여행 메뉴에서 연다. */}
    <Tabs.Screen name="members" options={{ href: null }} />
    <Tabs.Screen name="settings" options={{ href: null }} />
  </Tabs>;
}
