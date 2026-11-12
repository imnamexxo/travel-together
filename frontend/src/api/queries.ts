import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { TripCreate, TripDetail } from '@/api/client';

export const queryKeys = {
  me: ['me'] as const,
  trips: ['trips'] as const,
  trip: (tripId: string) => ['trips', tripId] as const,
  members: (tripId: string) => ['trips', tripId, 'members'] as const,
  inviteCode: (tripId: string) => ['trips', tripId, 'invite-code'] as const,
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
