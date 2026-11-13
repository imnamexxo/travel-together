import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * 화면에 맞춰 보여 주고, 두 손가락으로 확대·축소, 확대한 상태에서 끌어서 이동, 두 번 탭하면 확대/원래대로.
 * (ScrollView의 확대는 iOS에서만 되므로 제스처로 직접 한다. 네이티브 모듈은 이 파일에만 둔다.)
 */
export default function ZoomableImage({ uri, accessibilityLabel }: { uri: string; accessibilityLabel: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale)); })
    .onEnd(() => { if (scale.value <= 1.02) reset(); else savedScale.value = scale.value; });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      x.value = savedX.value + e.translationX;
      y.value = savedY.value + e.translationY;
    })
    .onEnd(() => { savedX.value = x.value; savedY.value = y.value; });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });
  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));

  // 모달 안은 앱 루트와 따로 그려져서(Android) 제스처 루트를 여기 둔다.
  return <GestureHandlerRootView style={s.fill}>
    <GestureDetector gesture={gesture}>
      <Animated.View style={[s.fill, s.clip]}>
        <Animated.Image accessibilityLabel={accessibilityLabel} source={{ uri }} style={[s.fill, moved]} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  </GestureHandlerRootView>;
}

const s = StyleSheet.create({ fill: { flex: 1 }, clip: { overflow: 'hidden' } });
