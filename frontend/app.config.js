// app.json을 그대로 쓰고, 구글 지도 Android 키만 환경 변수에서 넣는다(공개 저장소에 키를 커밋하지 않는다).
// - 개발 서버: frontend/.env의 GOOGLE_MAPS_ANDROID_KEY
// - EAS 빌드: expo.dev 프로젝트의 Environment variables(development 환경)에 같은 이름으로
// 키가 없으면 앱은 지도 대신 장소 목록을 보여 준다(src/features/map/place-map.tsx의 hasMapKey).
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim();
  if (!key) return config;
  return {
    ...config,
    android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: key } } },
    // 실행 중인 앱에서는 키 값이 설정에서 빠지므로(Expo가 숨김), 키가 있는지만 따로 알린다.
    extra: { ...config.extra, hasGoogleMapsKey: true },
  };
};
