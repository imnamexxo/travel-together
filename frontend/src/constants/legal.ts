import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { showAlert } from '@/components/dialog';

/** Play 등록에 쓰는 공개 페이지(EAS Hosting, 원본은 public/privacy.html·delete-account.html). */
export const PRIVACY_URL = 'https://kang1031-frontend.expo.app/privacy';
export const DELETE_ACCOUNT_URL = 'https://kang1031-frontend.expo.app/delete-account';
/** 문의·신고를 받는 운영자 메일(처리방침 10번의 개인정보 보호책임자 메일과 같다). */
export const SUPPORT_EMAIL = 'traveltogether.apps@gmail.com';

export function openPrivacyPolicy() {
  void WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
}

/** 메일 앱으로 운영자에게 보낸다. 메일 앱이 없으면 주소를 알려 준다. */
export function mailSupport(subject: string, body = '') {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  Linking.openURL(url).catch(() => showAlert('메일 앱을 열지 못했어요', `${SUPPORT_EMAIL} 로 메일을 보내주세요.`));
}

/**
 * 부적절한 사진 신고(Play 사용자 제작 콘텐츠 정책). 운영자가 찾을 수 있게 여행·사진 id를 함께 보낸다.
 * 확인 후 운영자가 사진을 지운다. 문제 멤버는 총무가 멤버 화면에서 내보낼 수 있다.
 */
export function reportPhoto(tripId: string, photoId: string) {
  mailSupport('[신고] 부적절한 사진', `신고 사유를 적어주세요:\n\n\n---\n아래 정보는 지우지 말아주세요.\n여행: ${tripId}\n사진: ${photoId}`);
}
