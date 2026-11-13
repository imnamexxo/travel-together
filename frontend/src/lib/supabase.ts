import '@/lib/local-storage';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// 로그인·세션 유지 전용. DB·Storage는 앱에서 직접 부르지 않는다(ADR-0002).
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      // 웹 정적 렌더링(Node)에는 localStorage가 없다. 그때는 Supabase 기본값(메모리)을 쓴다.
      storage: globalThis.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // 소셜 로그인(#23): 돌아온 앱 주소에 토큰 대신 일회용 code가 오고, 앱이 세션으로 바꾼다.
      flowType: 'pkce',
    },
  },
);

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
