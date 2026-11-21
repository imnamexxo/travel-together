import * as WebBrowser from 'expo-web-browser';

/** Play 등록에 쓰는 공개 페이지(EAS Hosting, 원본은 public/privacy.html·delete-account.html). */
export const PRIVACY_URL = 'https://kang1031-frontend.expo.app/privacy';
export const DELETE_ACCOUNT_URL = 'https://kang1031-frontend.expo.app/delete-account';

export function openPrivacyPolicy() {
  void WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
}
