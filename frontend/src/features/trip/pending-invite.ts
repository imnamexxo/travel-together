/**
 * 초대 링크로 앱이 열렸는데 로그인 전이면, 로그인한 뒤 이어서 참여하도록 코드를 잠깐 맡아 둔다.
 * 이 휴대폰에만 남고, 꺼내면 지운다. 저장소를 못 쓰면(웹 미리보기 등) 이 앱이 켜져 있는 동안만 기억한다.
 */
const KEY = 'pending-invite-code';
let memory: string | null = null;

export function savePendingInvite(code: string) {
  memory = code;
  try { localStorage.setItem(KEY, code); } catch { /* 메모리에는 남아 있다 */ }
}

export function takePendingInvite(): string | null {
  let code = memory;
  try { code = localStorage.getItem(KEY) ?? code; localStorage.removeItem(KEY); } catch { /* 메모리 값을 쓴다 */ }
  memory = null;
  return code;
}

/** 초대 링크·앱 주소로 가져갈 앱 밖 주소. 메신저에서 눌리는 https 주소다(서버가 앱을 여는 페이지를 보여 준다). */
export function inviteLink(apiBaseUrl: string, code: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/join/${encodeURIComponent(code)}`;
}
