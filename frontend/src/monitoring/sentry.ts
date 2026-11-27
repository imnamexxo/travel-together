import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

/**
 * 앱 오류 수집(Sentry). DSN이 있는 배포 빌드에서만 켠다(개발 중에는 끈다).
 * 개인정보 처리방침 4번·데이터 보안 양식의 "비정상 종료 로그"와 맞춘다:
 * - 사용자 식별 정보(이메일·IP)는 보내지 않는다(sendDefaultPii: false, Sentry 프로젝트에서 IP 저장도 끈다).
 * - 콘솔 로그는 보내지 않고, 요청 주소의 검색어(쿼리 문자열)는 지운다.
 * - 화면 녹화(Replay)와 성능 추적은 쓰지 않는다.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'console') return null;
  const url = crumb.data?.url;
  if (typeof url === 'string') return { ...crumb, data: { ...crumb.data, url: url.split('?')[0] } };
  return crumb;
}

if (dsn && !__DEV__) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    environment: Updates.channel || 'unknown',
    tracesSampleRate: 0,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  // 어느 OTA 업데이트에서 난 오류인지 알 수 있게(Expo 문서의 권장 태그).
  const scope = Sentry.getGlobalScope();
  scope.setTag('expo-update-id', Updates.updateId ?? 'embedded');
  scope.setTag('expo-runtime-version', Updates.runtimeVersion ?? 'unknown');
}

export const wrapRoot = Sentry.wrap;
