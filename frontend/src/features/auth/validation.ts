export type AuthFields = { email: string; password: string; name: string; confirmation: string; ageConfirmed?: boolean };
export type AuthErrors = Partial<Record<'email' | 'password' | 'name' | 'confirmation' | 'age', string>>;

// Input feedback only. Supabase will enforce the actual account/password policies.
export function validateAuth(fields: AuthFields, signup: boolean): AuthErrors {
  const errors: AuthErrors = {};
  if (!fields.email.trim()) errors.email = '이메일을 입력해주세요.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) errors.email = '이메일 주소를 확인해주세요.';
  if (!fields.password) errors.password = '비밀번호를 입력해주세요.';
  if (signup) {
    if (!fields.name.trim()) errors.name = '이름을 입력해주세요.';
    if (fields.password && fields.password.length < 8) errors.password = '비밀번호는 8자 이상으로 입력해주세요.';
    if (!fields.confirmation) errors.confirmation = '비밀번호를 한 번 더 입력해주세요.';
    else if (fields.password !== fields.confirmation) errors.confirmation = '비밀번호가 일치하지 않아요.';
    // 만 14세 미만은 보호자 동의가 필요해 가입을 받지 않는다(개인정보 보호법 제22조의2, 처리방침 9번).
    if (!fields.ageConfirmed) errors.age = '만 14세 이상만 가입할 수 있어요.';
  }
  return errors;
}
