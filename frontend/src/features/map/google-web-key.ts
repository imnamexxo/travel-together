/**
 * 웹 Google 지도(Maps JavaScript API) 키. 등록한 웹 주소에서만 쓰이게 제한하고, 하루 요청 한도를 걸어 둔다
 * (월 1만 회 무료를 넘지 않게). 안드로이드 앱 키(GOOGLE_MAPS_ANDROID_KEY)와 다르다.
 */
export const GOOGLE_MAPS_WEB_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
