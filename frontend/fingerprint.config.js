// 앱 업데이트(eas update)가 어느 설치본에 맞는지 정하는 "실행 환경 지문" 설정.
// package.json의 scripts(예: legal:build)는 앱 네이티브 코드와 상관없으므로 지문에서 뺀다.
// 2026-11-26: scripts 한 줄 추가로 지문이 바뀌어 설치된 APK가 업데이트를 못 받은 적이 있다.
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips:
    SourceSkips.ExpoConfigVersions |
    SourceSkips.ExpoConfigRuntimeVersionIfString |
    SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun |
    SourceSkips.PackageJsonScriptsAll,
};
