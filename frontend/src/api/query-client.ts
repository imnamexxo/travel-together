import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError, isUnauthorized } from '@/api/client';

/**
 * 서버 데이터 캐시. 어떤 요청이든 401을 받으면 onUnauthorized(로그아웃)를 부른다.
 */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  const handleError = (error: unknown) => {
    if (isUnauthorized(error)) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        // 4xx는 다시 시도해도 결과가 같다. 네트워크·서버 오류만 두 번까지 다시 시도한다.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}
