import { useLocalSearchParams } from 'expo-router';

import { ResetPasswordScreen } from '@/features/auth/password-reset-screens';

/** 비밀번호 재설정 메일의 링크(traveltogether://reset-password?code=…)가 여는 화면. 로그인 여부와 관계없이 열린다. */
export default function ResetPassword() {
  const { code, error_description: linkError } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  return <ResetPasswordScreen code={code ?? null} linkError={linkError ?? null} />;
}
