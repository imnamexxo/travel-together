// Sentry: 번들에 디버그 id를 넣어 오류 위치를 원본 코드로 되돌릴 수 있게 한다(소스맵).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
