import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * 지금 올라와 있는 키보드 높이(없으면 0).
 * Android는 화면을 끝까지 쓰는 설정이라 키보드가 올라와도 화면이 줄지 않는다. 아래에 고정한 버튼이 가려지지 않도록 이 값만큼 올린다.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
