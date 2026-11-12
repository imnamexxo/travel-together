import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { ExpenseInput, TripCreate, TripDetail, TripUpdate } from '@/api/client';

export const queryKeys = {
  me: ['me'] as const,
  trips: ['trips'] as const,
  trip: (tripId: string) => ['trips', tripId] as const,
  members: (tripId: string) => ['trips', tripId, 'members'] as const,
  inviteCode: (tripId: string) => ['trips', tripId, 'invite-code'] as const,
  expenses: (tripId: string) => ['trips', tripId, 'expenses'] as const,
  expense: (tripId: string, expenseId: string) => ['trips', tripId, 'expenses', expenseId] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.getMe() });
}

export function useTrips() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.trips, queryFn: () => api.listTrips() });
}

export function useTrip(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.trip(tripId), queryFn: () => api.getTrip(tripId) });
}

/** 여행을 만들거나 들어간 뒤: 그 여행은 바로 열 수 있게 넣어 두고, 목록은 다시 불러온다. */
function useRememberTrip() {
  const queryClient = useQueryClient();
  return (trip: TripDetail) => {
    queryClient.setQueryData(queryKeys.trip(trip.id), trip);
    return queryClient.invalidateQueries({ queryKey: queryKeys.trips, exact: true });
  };
}

export function useCreateTrip() {
  const api = useApi();
  const remember = useRememberTrip();
  return useMutation({ mutationFn: (trip: TripCreate) => api.createTrip(trip), onSuccess: remember });
}

export function useJoinTrip() {
  const api = useApi();
  const remember = useRememberTrip();
  return useMutation({ mutationFn: (code: string) => api.joinTrip(code), onSuccess: remember });
}

export function useMembers(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.members(tripId), queryFn: () => api.listMembers(tripId) });
}

/** 총무만 볼 수 있다. 총무가 아니면 부르지 않는다. */
export function useInviteCode(tripId: string, { enabled }: { enabled: boolean }) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.inviteCode(tripId), queryFn: () => api.getInviteCode(tripId), enabled });
}

export function useReissueInviteCode(tripId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.reissueInviteCode(tripId),
    onSuccess: (code) => queryClient.setQueryData(queryKeys.inviteCode(tripId), code),
  });
}

export function useUpdateTrip(tripId: string) {
  const api = useApi();
  const remember = useRememberTrip();
  return useMutation({ mutationFn: (changes: TripUpdate) => api.updateTrip(tripId, changes), onSuccess: remember });
}

/**
 * 여행을 지우거나 나간 뒤: 목록을 다시 불러온다.
 * 그 여행의 캐시는 지우지 않는다. 아직 열려 있는 여행 화면이 다시 불러오다 404를 보여주기 때문이다.
 * 다음에 그 여행을 열면 다시 불러와서 404 안내가 나온다.
 */
function useForgetTrip() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.trips, exact: true });
}

export function useDeleteTrip(tripId: string) {
  const api = useApi();
  const forget = useForgetTrip();
  return useMutation({ mutationFn: () => api.deleteTrip(tripId), onSuccess: forget });
}

export function useLeaveTrip(tripId: string) {
  const api = useApi();
  const forget = useForgetTrip();
  return useMutation({ mutationFn: () => api.leaveTrip(tripId), onSuccess: forget });
}

export function useRemoveMember(tripId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.removeMember(tripId, memberId),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.members(tripId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId), exact: true }),
    ]),
  });
}

export function useExpenses(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.expenses(tripId), queryFn: () => api.listExpenses(tripId) });
}

export function useExpense(tripId: string, expenseId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.expense(tripId, expenseId ?? ''),
    queryFn: () => api.getExpense(tripId, expenseId!),
    enabled: !!expenseId,
  });
}

/** 지출이 바뀌면 그 여행의 지출 목록·상세(와 정산)를 모두 다시 불러온다. */
function useRefreshExpenses(tripId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses(tripId) });
}

type SaveExpense = { expenseId?: string; input: ExpenseInput; idempotencyKey: string };

/** expenseId가 없으면 새로 만들고(멱등 키 사용), 있으면 고친다. */
export function useSaveExpense(tripId: string) {
  const api = useApi();
  const refresh = useRefreshExpenses(tripId);
  return useMutation({
    mutationFn: ({ expenseId, input, idempotencyKey }: SaveExpense) =>
      expenseId ? api.updateExpense(tripId, expenseId, input) : api.createExpense(tripId, input, idempotencyKey),
    onSuccess: refresh,
  });
}

export function useConfirmExpense(tripId: string) {
  const api = useApi();
  const refresh = useRefreshExpenses(tripId);
  // 확정에 실패해도 상태가 needs_review로 바뀌므로 성공·실패 모두 다시 불러온다.
  return useMutation({ mutationFn: (expenseId: string) => api.confirmExpense(tripId, expenseId), onSettled: refresh });
}

export function useDeleteExpense(tripId: string) {
  const api = useApi();
  const refresh = useRefreshExpenses(tripId);
  return useMutation({ mutationFn: (expenseId: string) => api.deleteExpense(tripId, expenseId), onSuccess: refresh });
}
