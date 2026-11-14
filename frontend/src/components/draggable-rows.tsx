import { useState, type ReactNode } from 'react';
import { Animated, View, type LayoutChangeEvent } from 'react-native';
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

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 꾹 눌러 위아래로 끌어 순서를 바꾸는 목록(플래너 일정). 줄 높이가 달라도 된다.
 * 짧게 누르면 줄 안의 버튼이 그대로 눌린다. 화면 읽기 사용자는 "위로/아래로 옮기기" 동작으로 바꾼다.
 */
export default function DraggableRows<T>({ items, keyOf, labelOf, renderItem, onReorder, onDragChange, disabled }: Props<T>) {
  // 끄는 동안 바뀌는 값은 다시 그리지 않고 이 상자에 둔다(줄 높이, 줄마다 비켜 줄 거리, 들어갈 자리).
  // active: 길게 눌러 끌기가 시작됐는가. 짧게 누르고 뗀 경우에는 아무것도 하지 않는다.
  const [box] = useState(() => ({
    heights: {} as Record<string, number>,
    offsets: {} as Record<string, Animated.Value>,
    dragY: new Animated.Value(0),
    target: 0,
    active: false,
  }));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dragY = box.dragY;

  const offsetOf = (key: string) => (box.offsets[key] ??= new Animated.Value(0));
  const heightOf = (key: string) => box.heights[key] ?? 60;

  /** 끄는 줄이 from에서 dy만큼 움직였을 때 들어갈 자리. */
  function targetIndex(from: number, dy: number): number {
    let index = from;
    let moved = dy;
    if (dy > 0) {
      while (index < items.length - 1 && moved > heightOf(keyOf(items[index + 1])) / 2) { moved -= heightOf(keyOf(items[index + 1])); index += 1; }
    } else {
      while (index > 0 && -moved > heightOf(keyOf(items[index - 1])) / 2) { moved += heightOf(keyOf(items[index - 1])); index -= 1; }
    }
    return index;
  }

  /** 끄는 줄이 지나간 줄들은 끄는 줄 높이만큼 비켜 준다. */
  function shiftOthers(from: number, to: number) {
    const h = heightOf(keyOf(items[from]));
    items.forEach((item, i) => {
      if (i === from) return;
      const shift = from < to && i > from && i <= to ? -h : from > to && i < from && i >= to ? h : 0;
      Animated.timing(offsetOf(keyOf(item)), { toValue: shift, duration: 120, useNativeDriver: true }).start();
    });
  }

  function finish(from: number) {
    const to = box.target;
    items.forEach((item) => offsetOf(keyOf(item)).setValue(0));
    dragY.setValue(0);
    setDragKey(null);
    onDragChange?.(false);
    if (to !== from) onReorder(move(items, from, to));
  }

  return <View>
    {items.map((item, index) => {
      const key = keyOf(item);
      const dragging = dragKey === key;
      const pan = Gesture.Pan()
        .runOnJS(true)
        .enabled(!disabled && items.length > 1)
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => { box.active = true; box.target = index; setDragKey(key); onDragChange?.(true); })
        .onUpdate((e) => {
          dragY.setValue(e.translationY);
          const next = targetIndex(index, e.translationY);
          if (next !== box.target) { box.target = next; shiftOthers(index, next); }
        })
        .onFinalize(() => { if (box.active) { box.active = false; finish(index); } });
      return <GestureDetector key={key} gesture={pan}>
        <Animated.View
          testID={`draggable-${key}`}
          onLayout={(e: LayoutChangeEvent) => { box.heights[key] = e.nativeEvent.layout.height; }}
          accessibilityActions={[{ name: 'moveUp', label: `${labelOf(item)} 위로 옮기기` }, { name: 'moveDown', label: `${labelOf(item)} 아래로 옮기기` }]}
          onAccessibilityAction={(e) => {
            const to = e.nativeEvent.actionName === 'moveUp' ? index - 1 : e.nativeEvent.actionName === 'moveDown' ? index + 1 : index;
            if (!disabled && to >= 0 && to < items.length && to !== index) onReorder(move(items, index, to));
          }}
          style={[
            { transform: [{ translateY: dragging ? dragY : offsetOf(key) }] },
            dragging && { zIndex: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
          ]}>
          {renderItem(item, index, { dragging })}
        </Animated.View>
      </GestureDetector>;
    })}
  </View>;
}
