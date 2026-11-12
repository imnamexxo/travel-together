import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { TripCreate } from '@/api/client';

export const queryKeys = {
  me: ['me'] as const,
  trips: ['trips'] as const,
  trip: (tripId: string) => ['trips', tripId] as const,
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

export function useCreateTrip() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trip: TripCreate) => api.createTrip(trip),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trip(trip.id), trip);
      return queryClient.invalidateQueries({ queryKey: queryKeys.trips, exact: true });
    },
  });
}
