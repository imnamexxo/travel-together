import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { ExpenseInput, Friends, MapFilter, PhotoPlaceLink, PhotoUpload, PlanItemInput, SuggestionAsk, TransferCreate, TripCreate, TripDetail, TripUpdate } from '@/api/client';

export const queryKeys = {
  me: ['me'] as const,
  trips: ['trips'] as const,
  trip: (tripId: string) => ['trips', tripId] as const,
  members: (tripId: string) => ['trips', tripId, 'members'] as const,
  inviteCode: (tripId: string) => ['trips', tripId, 'invite-code'] as const,
  expenses: (tripId: string) => ['trips', tripId, 'expenses'] as const,
  expense: (tripId: string, expenseId: string) => ['trips', tripId, 'expenses', expenseId] as const,
  settlement: (tripId: string) => ['trips', tripId, 'settlement'] as const,
  transfers: (tripId: string) => ['trips', tripId, 'transfers'] as const,
  planItems: (tripId: string) => ['trips', tripId, 'plan-items'] as const,
  placeSearch: (tripId: string, query: string) => ['trips', tripId, 'place-search', query] as const,
  photos: (tripId: string) => ['trips', tripId, 'photos'] as const,
  expensePlaceCandidates: (tripId: string, query: string) => ['trips', tripId, 'expense-place-candidates', query] as const,
  map: (tripId: string, { date, memberId }: MapFilter = {}) => ['trips', tripId, 'map', date ?? '', memberId ?? ''] as const,
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
      // 내보낸 멤버의 사진도 함께 지워진다.
      queryClient.invalidateQueries({ queryKey: queryKeys.photos(tripId) }),
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

/** 지출이 바뀌면 그 여행의 지출 목록·상세와 정산 결과를 다시 불러온다. */
function useRefreshExpenses(tripId: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses(tripId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.settlement(tripId) }),
  ]);
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

export function useSettlement(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.settlement(tripId), queryFn: () => api.getSettlement(tripId) });
}

export function useTransfers(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.transfers(tripId), queryFn: () => api.listTransfers(tripId) });
}

/** 송금이 바뀌면 송금 목록과 정산 결과를 다시 불러온다. */
function useRefreshTransfers(tripId: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.transfers(tripId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.settlement(tripId) }),
  ]);
}

export function useRecordTransfer(tripId: string) {
  const api = useApi();
  const refresh = useRefreshTransfers(tripId);
  return useMutation({ mutationFn: (transfer: TransferCreate) => api.recordTransfer(tripId, transfer), onSuccess: refresh });
}

export function useDeleteTransfer(tripId: string) {
  const api = useApi();
  const refresh = useRefreshTransfers(tripId);
  return useMutation({ mutationFn: (transferId: string) => api.deleteTransfer(tripId, transferId), onSuccess: refresh });
}

export function usePlanItems(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.planItems(tripId), queryFn: () => api.listPlanItems(tripId) });
}

/** 검색어를 확정했을 때만 부른다(입력할 때마다 검색기를 부르지 않는다). */
export function usePlaceSearch(tripId: string, query: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.placeSearch(tripId, query),
    queryFn: () => api.searchPlaces(tripId, query),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
    // 사용자가 검색을 다시 누르면 된다. 몰래 다시 시도하느라 실패 안내가 늦어지지 않게 한다.
    retry: false,
  });
}

function useRefreshPlan(tripId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.planItems(tripId) });
}

type SavePlanItem = { itemId?: string; input: PlanItemInput };

export function useSavePlanItem(tripId: string) {
  const api = useApi();
  const refresh = useRefreshPlan(tripId);
  return useMutation({
    mutationFn: ({ itemId, input }: SavePlanItem) => (itemId ? api.updatePlanItem(tripId, itemId, input) : api.createPlanItem(tripId, input)),
    onSuccess: refresh,
  });
}

export function useDeletePlanItem(tripId: string) {
  const api = useApi();
  const refresh = useRefreshPlan(tripId);
  return useMutation({ mutationFn: (itemId: string) => api.deletePlanItem(tripId, itemId), onSuccess: refresh });
}

export function useReorderPlanItems(tripId: string) {
  const api = useApi();
  const refresh = useRefreshPlan(tripId);
  // 실패해도(그사이 바뀜 409) 최신 일정을 다시 불러온다.
  return useMutation({
    mutationFn: ({ date, itemIds }: { date: string; itemIds: string[] }) => api.reorderPlanItems(tripId, date, itemIds),
    onSettled: refresh,
  });
}

export function useAskSuggestions(tripId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (ask: SuggestionAsk) => api.askSuggestions(tripId, ask) });
}

export function useAdoptSuggestions(tripId: string) {
  const api = useApi();
  const refresh = useRefreshPlan(tripId);
  return useMutation({
    mutationFn: ({ requestId, itemIds }: { requestId: string; itemIds: string[] }) => api.adoptSuggestions(tripId, requestId, itemIds),
    onSuccess: refresh,
  });
}

/** 서명 URL이 10분이면 만료되므로 그보다 자주 새로 받는다. */
export function usePhotos(tripId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.photos(tripId), queryFn: () => api.listPhotos(tripId), staleTime: 4 * 60 * 1000, refetchInterval: 8 * 60 * 1000 });
}

/** 한 장씩 올린다. 다 올린 뒤 목록을 다시 불러오는 것은 부르는 쪽이 한다(여러 장을 올릴 때 한 번만). */
export function useUploadPhoto(tripId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (photo: PhotoUpload) => api.uploadPhoto(tripId, photo) });
}

export function useDeletePhoto(tripId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api.deletePhoto(tripId, photoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.photos(tripId) }),
  });
}

export function useLinkPhotoPlace(tripId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, link }: { photoId: string; link: PhotoPlaceLink }) => api.linkPhotoPlace(tripId, photoId, link),
    // 사진으로 새 장소가 생길 수 있으므로 사진과 일정(지도)을 다시 불러온다.
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.photos(tripId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.planItems(tripId) }),
    ]),
  });
}

export function useUploadReceipt(tripId: string) {
  const api = useApi();
  const refresh = useRefreshExpenses(tripId);
  return useMutation({
    mutationFn: ({ uri, idempotencyKey }: { uri: string; idempotencyKey: string }) => api.uploadReceipt(tripId, { uri }, idempotencyKey),
    onSuccess: refresh,
  });
}

/** 검색어를 정했을 때만 부른다. 자동으로 장소를 붙이지 않는다. */
export function useExpensePlaceCandidates(tripId: string, query: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.expensePlaceCandidates(tripId, query),
    queryFn: () => api.getExpensePlaceCandidates(tripId, query),
    enabled: query.length > 0,
    retry: false,
  });
}

/** 지도 데이터. 사진·지출·일정이 다른 화면에서 바뀌므로 지도를 열 때마다 다시 받는다(부르는 쪽에서 refetch). */
export function useMapData(tripId: string, filter: MapFilter) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.map(tripId, filter),
    queryFn: () => api.getMapData(tripId, filter),
    // 필터를 바꾸는 동안 이전 핀을 그대로 둔다.
    placeholderData: (previous) => previous,
  });
}


export function useUpdateMe() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api.updateMe(displayName),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me, profile);
      // 여행마다 멤버 목록·정산에 이름이 보이므로 여행 데이터도 다시 받는다.
      return queryClient.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });
}

export function useDeletionPreview({ enabled }: { enabled: boolean }) {
  const api = useApi();
  return useQuery({ queryKey: ['me', 'deletion-preview'], queryFn: () => api.getDeletionPreview(), enabled, staleTime: 0 });
}

export function useDeleteMe() {
  const api = useApi();
  return useMutation({ mutationFn: () => api.deleteMe() });
}

/** 지우는 여행을 화면에서 고르는 경우(계정 관리의 내가 만든 여행). */
export function useDeleteAnyTrip() {
  const api = useApi();
  const forget = useForgetTrip();
  return useMutation({ mutationFn: (tripId: string) => api.deleteTrip(tripId), onSuccess: forget });
}

export function useLeaveAnyTrip() {
  const api = useApi();
  const forget = useForgetTrip();
  return useMutation({ mutationFn: (tripId: string) => api.leaveTrip(tripId), onSuccess: forget });
}

export function useHandOverOrganizer(tripId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.handOverOrganizer(tripId, memberId),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trip(tripId), trip);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(tripId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trips, exact: true }),
      ]);
    },
  });
}


export function useFriends() {
  const api = useApi();
  return useQuery({ queryKey: ['friends'], queryFn: () => api.listFriends() });
}

/** 친구 관계가 바뀌면 친구 목록과(멤버 목록에 친구 상태가 보이므로) 여행 멤버 목록을 다시 받는다. */
function useFriendChange() {
  const queryClient = useQueryClient();
  return (friends?: Friends) => {
    if (friends) queryClient.setQueryData(['friends'], friends);
    else void queryClient.invalidateQueries({ queryKey: ['friends'] });
    return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'trips' && q.queryKey[2] === 'members' });
  };
}

export function useFriendSuggestions() {
  const api = useApi();
  return useQuery({ queryKey: ['friends', 'suggestions'], queryFn: () => api.listFriendSuggestions() });
}

/** 여행을 고르지 않고(친구 화면의 제안에서) 요청한다. */
export function useRequestFriendFrom() {
  const api = useApi();
  const changed = useFriendChange();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, memberId }: { tripId: string; memberId: string }) => api.requestFriend(tripId, memberId),
    onSuccess: (friends) => { void queryClient.invalidateQueries({ queryKey: ['friends', 'suggestions'] }); return changed(friends); },
  });
}

export function useRequestFriend(tripId: string) {
  const api = useApi();
  const changed = useFriendChange();
  return useMutation({ mutationFn: (memberId: string) => api.requestFriend(tripId, memberId), onSuccess: changed });
}

export function useAnswerFriend() {
  const api = useApi();
  const changed = useFriendChange();
  return useMutation({
    mutationFn: ({ requestId, accept }: { requestId: string; accept: boolean }) => (accept ? api.acceptFriend(requestId) : api.declineFriend(requestId)),
    onSuccess: changed,
  });
}

export function useRemoveFriend() {
  const api = useApi();
  const changed = useFriendChange();
  return useMutation({ mutationFn: (userId: string) => api.removeFriend(userId), onSuccess: changed });
}

export function useFriendCode() {
  const api = useApi();
  return useQuery({ queryKey: ['friends', 'code'], queryFn: () => api.getFriendCode(), staleTime: Infinity });
}

export function useBefriendByCode() {
  const api = useApi();
  const changed = useFriendChange();
  return useMutation({ mutationFn: (code: string) => api.befriendByCode(code), onSuccess: () => changed() });
}

export function useInviteFriend(tripId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (userId: string) => api.inviteFriend(tripId, userId) });
}

export function useTripsForFriend(userId: string | null) {
  const api = useApi();
  return useQuery({ queryKey: ['friends', 'trips', userId], queryFn: () => api.listTripsForFriend(userId!), enabled: !!userId, staleTime: 0 });
}

export function useInviteFriendTo() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) => api.inviteFriend(tripId, userId),
    onSuccess: (_, { userId }) => queryClient.invalidateQueries({ queryKey: ['friends', 'trips', userId] }),
  });
}

export function useTripInvites() {
  const api = useApi();
  return useQuery({ queryKey: ['trip-invites'], queryFn: () => api.listTripInvites() });
}

export function useAnswerTripInvite() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ inviteId, accept }: { inviteId: string; accept: boolean }) => (accept ? api.acceptTripInvite(inviteId) : api.declineTripInvite(inviteId).then(() => null)),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trip-invites'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.trips, exact: true }),
    ]),
  });
}
