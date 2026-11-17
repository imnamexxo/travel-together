import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

/**
 * 점선 그림 조각.
 * Android는 한쪽 테두리만 점선으로 그리면 실선이 되는 경우가 있어, 점선은 작은 막대를 늘어놓아 그린다.
 */

/** 가로 또는 세로 점선. 놓인 칸의 길이만큼 막대를 채운다. */
export function Dashes({ color, vertical = false, dash = 6, gap = 5, thickness = 1.5 }: { color: string; vertical?: boolean; dash?: number; gap?: number; thickness?: number }) {
  const [length, setLength] = useState(0);
  const count = Math.max(0, Math.floor((length + gap) / (dash + gap)));
  const onLayout = (e: LayoutChangeEvent) => setLength(vertical ? e.nativeEvent.layout.height : e.nativeEvent.layout.width);
  return <View onLayout={onLayout} style={[vertical ? s.column : s.row, vertical ? { width: thickness } : { height: thickness }]} importantForAccessibility="no-hide-descendants">
    {Array.from({ length: count }, (_, i) => <View key={i} style={[{ backgroundColor: color }, vertical ? { height: dash, width: thickness } : { width: dash, height: thickness }]} />)}
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1 },
  column: { flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', flex: 1 },
});
