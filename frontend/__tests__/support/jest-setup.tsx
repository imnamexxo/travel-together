// 제스처(끌어서 순서 바꾸기)는 실기기에서 확인한다. 테스트는 접근성 동작(위로/아래로 옮기기)으로 순서를 바꾼다.
import 'react-native-gesture-handler/jestSetup';

// 테스트 환경에는 지도 네이티브 모듈이 없다. 지도는 실기기에서 확인한다(경계 4).
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props: object, _ref: unknown) => <View {...props} />);
  const Marker = (props: object) => <View {...props} />;
  return { __esModule: true, default: MapView, Marker };
});

// 테스트 환경에는 파일 시스템 네이티브 모듈이 없다. 파일 내용 대신 uri를 담은 가짜 조각을 쓴다.
jest.mock('@/api/file-part', () => ({
  filePart: (uri: string, name: string, type: string) => ({ uri, name, type, bytes: async () => new Uint8Array([1, 2, 3]) }),
}));

// 테스트 속 여행은 2026-11-12부터다. 플래너는 "오늘"을 먼저 여므로, 날짜가 바뀌어도 결과가 같도록 시계를 고정한다.
// Date만 바꾸고 타이머는 실제 것을 쓴다(findBy 등 비동기 대기가 그대로 동작하도록).
jest.useFakeTimers({
  now: new Date('2026-11-12T03:00:00Z'),
  doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
});

// 확대 보기(제스처·애니메이션 네이티브 모듈)는 테스트에서 그냥 이미지로 그린다.
jest.mock('@/features/expenses/zoomable-image', () => {
  const { Image } = require('react-native');
  return { __esModule: true, default: ({ uri, accessibilityLabel }: { uri: string; accessibilityLabel: string }) => <Image accessibilityLabel={accessibilityLabel} source={{ uri }} /> };
});

// 밀어서 지우기(제스처·애니메이션)는 실기기에서 확인한다. 테스트에서는 카드만 그리고, 숨은 버튼은 함께 그려 둔다.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Swipeable = React.forwardRef(({ children, renderRightActions }: { children: React.ReactNode; renderRightActions?: () => React.ReactNode }, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ close: () => {}, openRight: () => {}, openLeft: () => {}, reset: () => {} }));
    return <View>{children}{renderRightActions?.()}</View>;
  });
  return { __esModule: true, default: Swipeable };
});
