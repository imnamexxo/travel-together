import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialIcons name={name} color={color} size={size} />
  );
}

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '플래너', tabBarIcon: tabIcon('event-note') }} />
      <Tabs.Screen name="album" options={{ title: '앨범', tabBarIcon: tabIcon('photo-library') }} />
      <Tabs.Screen name="map" options={{ title: '지도', tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="settlement" options={{ title: '정산', tabBarIcon: tabIcon('payments') }} />
    </Tabs>
  );
}
