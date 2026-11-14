import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { ApiProvider } from '@/api/api-context';
import type { ApiClient } from '@/api/client';
import { createQueryClient } from '@/api/query-client';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { DialogHost } from '@/components/dialog';
import type { AuthService } from '@/auth/auth-service';

type AppProvidersProps = {
  authService: AuthService;
  api: ApiClient;
  children: ReactNode;
};

/** 앱 전역 의존성. 실제 앱과 테스트가 서로 다른 인증 서비스·API 클라이언트를 넣는다. */
export function AppProviders({ authService, api, children }: AppProvidersProps) {
  return (
    <AuthProvider service={authService}>
      <ApiProvider client={api}>
        <QueryLayer>{children}</QueryLayer>
        <DialogHost />
      </ApiProvider>
    </AuthProvider>
  );
}

function QueryLayer({ children }: { children: ReactNode }) {
  const { status, signOut } = useAuth();
  // signOut은 인증 서비스가 같으면 바뀌지 않으므로 처음 값을 그대로 써도 된다.
  const [queryClient] = useState(() => createQueryClient(() => void signOut()));

  // 로그아웃하면 이전 사용자의 데이터를 캐시에서 지운다.
  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status, queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
