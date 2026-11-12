import { router, type Href } from 'expo-router';

/**
 * 쌓인 화면(멤버·설정·지출 편집)에서 돌아갈 때 쓴다.
 * navigate로 탭 화면 주소를 열면 기존 탭 화면으로 돌아가지 않고 하나 더 쌓이므로,
 * 뒤로 갈 수 있으면 뒤로 가고 아니면(딥링크로 바로 열었을 때) 그 주소로 바꾼다.
 */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
