import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { TripDetail } from '@/api/client';
import { moneyFor, type Money } from '@/lib/money';
import { tripDays, type TripDay } from './trip-dates';

type CurrentTrip = {
  trip: TripDetail;
  days: TripDay[];
  /** 총무 전용 동작을 숨길 때 쓴다. 서버도 다시 막는다. */
  isOrganizer: boolean;
  /** 여행 통화로 금액을 보여 주고 읽는다(ADR 0004). */
  money: Money;
};

const CurrentTripContext = createContext<CurrentTrip | null>(null);

/** 열어 둔 여행과 그 여행에서의 내 역할. 여행 화면 전체에서 쓴다. */
export function CurrentTripProvider({ trip, children }: { trip: TripDetail; children: ReactNode }) {
  const value = useMemo(
    () => ({ trip, days: tripDays(trip.start_date, trip.end_date), isOrganizer: trip.me.is_organizer, money: moneyFor(trip.currency) }),
    [trip],
  );
  return <CurrentTripContext.Provider value={value}>{children}</CurrentTripContext.Provider>;
}

export function useCurrentTrip(): CurrentTrip {
  const value = useContext(CurrentTripContext);
  if (!value) throw new Error('useCurrentTrip은 CurrentTripProvider 안에서만 쓸 수 있습니다.');
  return value;
}
