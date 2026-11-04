import { createContext, useContext, type ReactNode } from 'react';

import type { ApiClient } from '@/api/client';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi는 ApiProvider 안에서만 쓸 수 있습니다.');
  return client;
}
