import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';

export const queryKeys = {
  me: ['me'] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.getMe() });
}
