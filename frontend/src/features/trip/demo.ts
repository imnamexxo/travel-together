export type PlanItem = { id: string; day: number; time: string; name: string; memo: string; budget: number; photos: number };

// UI preview only; replace through the API client when authentication is connected.
export const demoTrip = {
  name: '우리의 제주 여행', period: '2026. 11. 12 – 11. 14',
  members: ['민지', '준호', '서연'],
  days: [
    { date: '11.12', weekday: '목', title: '11월 12일 목요일', caption: '설레는 여행의 시작' },
    { date: '11.13', weekday: '금', title: '11월 13일 금요일', caption: '조금 느리게, 제주를 걷는 날' },
    { date: '11.14', weekday: '토', title: '11월 14일 토요일', caption: '마지막까지 여유롭게' },
  ],
};
export const demoPlanItems: PlanItem[] = [
  { id: '1', day: 0, time: '11:00', name: '제주공항', memo: '도착해서 멤버들과 만나기', budget: 0, photos: 0 },
  { id: '2', day: 0, time: '13:00', name: '동문시장', memo: '점심 먹고 천천히 구경하기', budget: 45000, photos: 0 },
  { id: '3', day: 1, time: '10:00', name: '함덕해수욕장', memo: '바다를 따라 가볍게 산책해요', budget: 0, photos: 12 },
  { id: '4', day: 1, time: '12:00', name: '고기국수 점심', memo: '함께 먹는 든든한 한 끼', budget: 36000, photos: 3 },
  { id: '5', day: 1, time: '14:00', name: '바다가 보이는 카페', memo: '커피 한 잔, 잠깐의 여유', budget: 18000, photos: 8 },
];
