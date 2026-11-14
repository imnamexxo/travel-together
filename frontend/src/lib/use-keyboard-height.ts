import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

// 키보드와 그 위에 붙는 버튼 사이의 여유
const GAP = 8;

/** 키보드가 화면 아래에서 차지하는 높이. 일부 키보드(삼성 등)는 위 도구 줄을 height에 넣지 않아 화면 좌표로도 잰다. */
function coveredHeight(e: KeyboardEvent): number {
  const fromTop = Dimensions.get('screen').height - e.endCoordinates.screenY;
  return Math.max(e.endCoordinates.height, fromTop);
}

/**
 * 지금 올라와 있는 키보드 높이(없으면 0). 아래에 고정한 버튼이 키보드에 가려지지 않도록 이만큼 올린다.
 * Android는 화면을 끝까지 쓰는 설정이라 키보드가 올라와도 화면이 줄지 않는다.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(coveredHeight(e) + GAP));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
