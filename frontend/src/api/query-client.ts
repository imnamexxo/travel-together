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
        // 30초 안에 받은 데이터는 화면을 다시 열어도 그대로 쓴다(탭을 오갈 때 로딩이 안 보이게).
        // 내가 저장한 것은 저장 직후 관련 데이터를 새로 받으므로 바로 보인다. 다른 멤버의 변경은 최대 30초 늦게 보일 수 있다.
        staleTime: 30_000,
        // 4xx는 다시 시도해도 결과가 같다. 네트워크·서버 오류만 두 번까지 다시 시도한다.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}
