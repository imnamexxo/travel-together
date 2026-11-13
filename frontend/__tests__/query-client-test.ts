import { createQueryClient } from '@/api/query-client';

test('30초 안에 받은 데이터는 화면을 다시 열어도 다시 받지 않는다', () => {
  expect(createQueryClient(() => {}).getDefaultOptions().queries?.staleTime).toBe(30_000);
});
