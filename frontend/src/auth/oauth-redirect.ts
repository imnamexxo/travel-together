/**
 * 소셜 로그인에서 외부 로그인 페이지를 앱 안 브라우저로 열고, 앱 주소(딥링크)로 돌아온 결과를 받는다.
 * 네이티브 모듈은 이 파일에만 둔다. 주소 해석(parseRedirect)은 순수 함수라 따로 테스트한다.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

/** 로그인 후 돌아올 앱 주소. Supabase Authentication → URL Configuration → Redirect URLs에 등록해야 한다. */
export function redirectUrl(): string {
  return Linking.createURL('auth-callback');
}

/** 비밀번호 재설정 메일의 링크가 열 앱 주소(같은 Redirect URLs 규칙 traveltogether://** 에 들어간다). */
export function passwordResetUrl(): string {
  return Linking.createURL('reset-password');
}

export type BrowserResult = { type: 'success'; url: string } | { type: 'cancel' };

/** 로그인 페이지를 열고, 앱 주소로 돌아오면 그 주소를 준다. 사용자가 닫으면 cancel. */
export async function openLoginPage(url: string, returnUrl: string): Promise<BrowserResult> {
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  return result.type === 'success' ? { type: 'success', url: result.url } : { type: 'cancel' };
}

/** 돌아온 주소의 ?…와 #… 값을 읽는다(React Native의 URL은 searchParams가 불완전해 직접 읽는다). */
export function parseRedirect(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of url.split(/[?#]/).slice(1)) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  return params;
}
