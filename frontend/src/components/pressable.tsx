import { forwardRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable as RNPressable,
  Vibration,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

type Props = PressableProps & {
  /** 저장·수락·초대처럼 중요한 버튼은 누를 때 짧게 진동한다(Android). */
  haptic?: boolean;
  /** false면 누를 때 어두워지지(투명해지지) 않고 작아지기만 한다. 밀어서 뒤 버튼이 나오는 카드처럼 뒤가 비치면 안 될 때. */
  dim?: boolean;
};

/**
 * 앱의 모든 버튼. 누르는 동안 살짝 작아지고 어두워져서 눌린 게 보인다.
 * react-native Pressable과 같은 props를 받는다(style·children 함수도 그대로).
 */
const Pressable = forwardRef<View, Props>(function Pressable({ style, haptic, dim = true, onPressIn, onPressOut, onPress, disabled, children, ...rest }, ref) {
  const [anim] = useState(() => new Animated.Value(0));
  const [pressed, setPressed] = useState(false);
  const to = (value: number) => Animated.spring(anim, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  const state: PressableStateCallbackType = { pressed, hovered: false } as PressableStateCallbackType;
  const resolved = typeof style === 'function' ? style(state) : style;
  const motion = {
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }],
    opacity: dim ? anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }) : 1,
  };

  return <AnimatedPressable
    ref={ref}
    disabled={disabled}
    onPressIn={(e: GestureResponderEvent) => { setPressed(true); to(1); onPressIn?.(e); }}
    onPressOut={(e: GestureResponderEvent) => { setPressed(false); to(0); onPressOut?.(e); }}
    onPress={(e: GestureResponderEvent) => {
      // iOS의 기본 진동은 길어서(0.4초) Android에서만 짧게 울린다.
      if (haptic && Platform.OS === 'android') Vibration.vibrate(12);
      onPress?.(e);
    }}
    style={[resolved as StyleProp<ViewStyle>, motion]}
    {...rest}>
    {typeof children === 'function' ? children(state) : children}
  </AnimatedPressable>;
});

export default Pressable;
