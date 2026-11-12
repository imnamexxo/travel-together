// 테스트 환경에는 지도 네이티브 모듈이 없다. 지도는 실기기에서 확인한다(경계 4).
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props: object, _ref: unknown) => <View {...props} />);
  const Marker = (props: object) => <View {...props} />;
  return { __esModule: true, default: MapView, Marker };
});
