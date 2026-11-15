import { useState, type ReactNode } from 'react';
import { Animated, LayoutAnimation, View, type LayoutChangeEvent } from 'react-native';
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
// 다른 줄이 비켜 주는 움직임
const MAKE_WAY = { duration: 140, update: { type: LayoutAnimation.Types.easeInEaseOut } };

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 꾹 눌러 위아래로 끌어 순서를 바꾸는 목록(플래너 일정). 줄 높이가 달라도 된다.
 *
 * 끄는 줄이 다음 줄의 절반을 넘으면 실제로 순서를 바꿔 그린다(다른 줄은 부드럽게 자리를 옮긴다).
 * 끄는 줄은 손가락 아래에 남도록, 이미 지나온 줄 높이만큼 빼고 따라간다.
 * 짧게 누르면 줄 안의 버튼이 그대로 눌린다. 화면 읽기 사용자는 "위로/아래로 옮기기" 동작으로 바꾼다.
 */
export default function DraggableRows<T>({ items, keyOf, labelOf, renderItem, onReorder, onDragChange, disabled }: Props<T>) {
  // 끄는 동안 바뀌는 값은 다시 그리지 않고 이 상자에 둔다.
  // consumed: 순서를 바꾸며 지나온 줄 높이의 합(끄는 줄 위치를 손가락에 맞추는 데 쓴다)
  const [box] = useState(() => ({ heights: {} as Record<string, number>, dragY: new Animated.Value(0), consumed: 0, active: false, order: [] as string[] }));
  const [dragKey, setDragKey] = useState<string | null>(null);
  // 끄는 동안 화면에 그리는 순서(키). 끄지 않을 때는 items 순서 그대로.
  const [order, setOrder] = useState<string[] | null>(null);
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const shown = order ? order.map((k) => byKey.get(k)).filter((i): i is T => i !== undefined) : items;
  const heightOf = (key: string) => box.heights[key] ?? 60;

  function start(key: string) {
    box.active = true;
    box.consumed = 0;
    box.dragY.setValue(0);
    box.order = items.map(keyOf);
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
      box.dragY.setValue(translationY - box.consumed);
      if (!changed) return;
      box.order = keys;
      LayoutAnimation.configureNext(MAKE_WAY);
      setOrder(keys);
    }
  }

  function finish() {
    box.active = false;
    const finalOrder = box.order;
    box.dragY.setValue(0);
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
          onLayout={(e: LayoutChangeEvent) => { if (!dragging) box.heights[key] = e.nativeEvent.layout.height; }}
          accessibilityActions={[{ name: 'moveUp', label: `${labelOf(item)} 위로 옮기기` }, { name: 'moveDown', label: `${labelOf(item)} 아래로 옮기기` }]}
          onAccessibilityAction={(e) => {
            const to = e.nativeEvent.actionName === 'moveUp' ? index - 1 : e.nativeEvent.actionName === 'moveDown' ? index + 1 : index;
            if (!disabled && to >= 0 && to < items.length && to !== index) onReorder(move(items, index, to));
          }}
          style={[
            dragging && { transform: [{ translateY: box.dragY }], zIndex: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
          ]}>
          {renderItem(item, index, { dragging })}
        </Animated.View>
      </GestureDetector>;
    })}
  </View>;
}
