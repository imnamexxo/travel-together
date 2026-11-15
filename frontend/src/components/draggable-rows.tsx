import { useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** 접근성 동작(위로/아래로 옮기기)에 붙일 이름 */
  labelOf: (item: T) => string;
  renderItem: (item: T, index: number, state: { dragging: boolean }) => ReactNode;
  /** 놓았을 때 바뀐 순서. 순서가 그대로면 부르지 않는다. */
  onReorder: (next: T[]) => void;
  /** 끄는 동안 true. 바깥 ScrollView의 스크롤을 잠글 때 쓴다. */
  onDragChange?: (dragging: boolean) => void;
  disabled?: boolean;
};

const LONG_PRESS_MS = 250;
// 다른 줄이 비켜 주는 움직임(밀리초)
const MAKE_WAY_MS = 140;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 꾹 눌러 위아래로 끌어 순서를 바꾸는 목록(플래너 일정). 줄 높이가 달라도 된다.
 *
 * 끄는 줄은 목록 위에 뜬 복사본으로 그려 손가락만 따라간다(목록 안 자리는 투명한 빈칸으로 남는다).
 * 끄는 줄이 다음 줄의 절반을 넘으면 실제로 순서를 바꿔 그리고, 비켜 준 줄만 예전 자리에서 새 자리로 미끄러진다
 * (새 위치를 잰 뒤 그 차이만큼 되돌려 놓고 0으로 움직인다). 복사본은 목록 배치와 상관없어 흔들리지 않는다.
 * 끄는 줄은 손가락 아래에 남도록, 이미 지나온 줄 높이만큼 빼고 따라간다.
 * 짧게 누르면 줄 안의 버튼이 그대로 눌린다. 화면 읽기 사용자는 "위로/아래로 옮기기" 동작으로 바꾼다.
 */
export default function DraggableRows<T>({ items, keyOf, labelOf, renderItem, onReorder, onDragChange, disabled }: Props<T>) {
  // 끄는 동안 바뀌는 값은 다시 그리지 않고 이 상자에 둔다.
  // consumed: 순서를 바꾸며 지나온 줄 높이의 합(다음 자리 바꿈을 판단할 때 쓴다)
  const [box] = useState(() => ({
    heights: {} as Record<string, number>, ys: {} as Record<string, number>, offsets: {} as Record<string, Animated.Value>,
    dragY: new Animated.Value(0), consumed: 0, active: false, order: [] as string[], dragKey: null as string | null,
  }));
  const [dragKey, setDragKey] = useState<string | null>(null);
  // 떠 있는 복사본의 시작 위치(끌기 시작할 때 그 줄의 y)
  const [floatTop, setFloatTop] = useState(0);
  // 끄는 동안 화면에 그리는 순서(키). 끄지 않을 때는 items 순서 그대로.
  const [order, setOrder] = useState<string[] | null>(null);
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const shown = order ? order.map((k) => byKey.get(k)).filter((i): i is T => i !== undefined) : items;
  const heightOf = (key: string) => box.heights[key] ?? 60;
  const offsetOf = (key: string) => (box.offsets[key] ??= new Animated.Value(0));

  function measured(key: string, e: LayoutChangeEvent) {
    const { y, height } = e.nativeEvent.layout;
    const before = box.ys[key];
    box.ys[key] = y;
    if (key === box.dragKey) return;
    box.heights[key] = height;
    // 끄는 중에 자리가 바뀐 줄: 예전 자리에서 시작해 새 자리로 미끄러진다.
    if (box.active && before !== undefined && before !== y) {
      const offset = offsetOf(key);
      offset.setValue(before - y);
      // JS로 움직인다. 네이티브로 돌리면 놓는 순간 다시 그릴 때 시작값(예전 자리)이 한 번 다시 적용돼 깜빡인다.
      Animated.timing(offset, { toValue: 0, duration: MAKE_WAY_MS, useNativeDriver: false }).start();
    }
  }

  function start(key: string) {
    box.active = true;
    box.consumed = 0;
    box.dragY.setValue(0);
    box.order = items.map(keyOf);
    box.dragKey = key;
    setFloatTop(box.ys[key] ?? 0);
    setOrder(box.order);
    setDragKey(key);
    onDragChange?.(true);
  }

  function follow(key: string, translationY: number) {
    {
      const keys = [...box.order];
      let at = keys.indexOf(key);
      let changed = false;
      // 다음(또는 앞) 줄의 절반을 넘을 때마다 한 칸씩 자리를 바꾼다.
      for (;;) {
        const dy = translationY - box.consumed;
        const below = keys[at + 1];
        const above = keys[at - 1];
        if (below && dy > heightOf(below) / 2) {
          keys.splice(at, 2, below, key); box.consumed += heightOf(below); at += 1; changed = true;
        } else if (above && -dy > heightOf(above) / 2) {
          keys.splice(at - 1, 2, key, above); box.consumed -= heightOf(above); at -= 1; changed = true;
        } else break;
      }
      box.dragY.setValue(translationY);
      if (!changed) return;
      box.order = keys;
      setOrder(keys);
    }
  }

  function finish() {
    box.active = false;
    box.dragKey = null;
    const finalOrder = box.order;
    box.dragY.setValue(0);
    // 비켜 주던 움직임이 남아 있으면 지금 자리(0)로 끝낸다. 남은 값이 다음 그리기에서 예전 자리로 보이지 않게.
    Object.values(box.offsets).forEach((offset) => { offset.stopAnimation(); offset.setValue(0); });
    setDragKey(null);
    setOrder(null);
    onDragChange?.(false);
    const next = finalOrder.map((k) => byKey.get(k)).filter((i): i is T => i !== undefined);
    if (next.some((item, i) => item !== items[i])) onReorder(next);
  }

  return <View>
    {shown.map((item, index) => {
      const key = keyOf(item);
      const dragging = dragKey === key;
      const pan = Gesture.Pan()
        .runOnJS(true)
        .enabled(!disabled && items.length > 1)
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => start(key))
        .onUpdate((e) => follow(key, e.translationY))
        .onFinalize(() => { if (box.active) finish(); });
      return <GestureDetector key={key} gesture={pan}>
        <Animated.View
          testID={`draggable-${key}`}
          onLayout={(e: LayoutChangeEvent) => measured(key, e)}
          accessibilityActions={[{ name: 'moveUp', label: `${labelOf(item)} 위로 옮기기` }, { name: 'moveDown', label: `${labelOf(item)} 아래로 옮기기` }]}
          onAccessibilityAction={(e) => {
            const to = e.nativeEvent.actionName === 'moveUp' ? index - 1 : e.nativeEvent.actionName === 'moveDown' ? index + 1 : index;
            if (!disabled && to >= 0 && to < items.length && to !== index) onReorder(move(items, index, to));
          }}
          style={[{ transform: [{ translateY: dragging ? 0 : offsetOf(key) }] }, dragging && { opacity: 0 }]}>
          {renderItem(item, index, { dragging: false })}
        </Animated.View>
      </GestureDetector>;
    })}
    {dragKey && byKey.has(dragKey) && <Animated.View pointerEvents="none" style={[s.floating, { top: floatTop, transform: [{ translateY: box.dragY }] }]}>
      {renderItem(byKey.get(dragKey)!, -1, { dragging: true })}
    </Animated.View>}
  </View>;
}

const s = StyleSheet.create({
  floating: { position: 'absolute', left: 0, right: 0, zIndex: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
});
