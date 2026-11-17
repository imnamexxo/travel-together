import { useMemo, type ReactNode } from 'react';
import { Platform, Vibration, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { NestedReorderableList, reorderItems, useIsActive, useReorderableDrag } from 'react-native-reorderable-list';

type RowState = {
  /** 이 줄을 끄는 중이면 true */
  dragging: boolean;
  /** 줄 안 버튼의 onLongPress에 넘긴다. 꾹 누르면 끌기가 시작된다. */
  drag: () => void;
};

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** 접근성 동작(위로/아래로 옮기기)에 붙일 이름 */
  labelOf: (item: T) => string;
  renderItem: (item: T, index: number, state: RowState) => ReactNode;
  /** 놓았을 때 바뀐 순서. 순서가 그대로면 부르지 않는다. */
  onReorder: (next: T[]) => void;
  disabled?: boolean;
};

/** 줄 안 버튼의 꾹 누르기 시간(밀리초). 끌기 제스처는 이보다 조금 늦게 켜서 바깥 스크롤·당겨서 새로고침과 겹치지 않게 한다. */
export const LONG_PRESS_MS = 250;

function move<T>(list: T[], from: number, to: number): T[] {
  return reorderItems(list, from, to);
}

/**
 * 꾹 눌러 위아래로 끌어 순서를 바꾸는 목록(플래너 일정). 줄 높이가 달라도 된다.
 * 바깥 스크롤은 react-native-reorderable-list의 ScrollViewContainer여야 한다.
 *
 * 끄는 동안의 움직임과 놓은 뒤 자리 잡기는 라이브러리가 Reanimated로(화면 쪽에서) 처리한다.
 * 놓으면 바뀐 순서를 onReorder로 바로 넘기고, 바깥은 그 순서를 그대로 그려야 깜빡이지 않는다.
 * 화면 읽기 사용자는 "위로/아래로 옮기기" 동작으로 바꾼다.
 */
export default function DraggableRows<T>({ items, keyOf, labelOf, renderItem, onReorder, disabled }: Props<T>) {
  const panGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(LONG_PRESS_MS + 20), []);
  return <NestedReorderableList
    data={items}
    keyExtractor={keyOf}
    scrollEnabled={false}
    dragEnabled={!disabled && items.length > 1}
    shouldUpdateActiveItem
    panGesture={panGesture}
    animationDuration={180}
    onReorder={({ from, to }) => { if (from !== to) onReorder(move(items, from, to)); }}
    renderItem={({ item, index }) => <Row item={item} index={index} items={items} keyOf={keyOf} labelOf={labelOf}
      renderItem={renderItem} onReorder={onReorder} disabled={disabled} />}
  />;
}

function Row<T>({ item, index, items, keyOf, labelOf, renderItem, onReorder, disabled }: Props<T> & { item: T; index: number }) {
  const startDrag = useReorderableDrag();
  const dragging = useIsActive();
  const drag = () => {
    if (disabled || items.length < 2) return;
    // 끌기가 시작된 걸 손끝으로 알 수 있게 짧게 진동한다(Android).
    if (Platform.OS === 'android') Vibration.vibrate(12);
    startDrag();
  };
  return <View
    testID={`draggable-${keyOf(item)}`}
    accessibilityActions={[{ name: 'moveUp', label: `${labelOf(item)} 위로 옮기기` }, { name: 'moveDown', label: `${labelOf(item)} 아래로 옮기기` }]}
    onAccessibilityAction={(e) => {
      const to = e.nativeEvent.actionName === 'moveUp' ? index - 1 : e.nativeEvent.actionName === 'moveDown' ? index + 1 : index;
      if (!disabled && to >= 0 && to < items.length && to !== index) onReorder(move(items, index, to));
    }}>
    {renderItem(item, index, { dragging, drag })}
  </View>;
}
