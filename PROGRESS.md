# 진행 상황

마지막 갱신: 2026-11-14

작업 단위(티켓)의 상태는 [GitHub Issues](https://github.com/imnamexxo/travel-together/issues)가 기준이다. 이 파일은 티켓에 담기지 않는 것만 기록한다: 지금 어디까지 왔는지, 사람이 해야 할 일, 아직 열린 질문, 날짜별 기록.

## 현재 단계

처음 계획한 티켓과 실기기 확인은 끝. 시연용 APK(EAS Update 포함) 배포 중이고, 앱 코드만 바뀐 수정은 `eas update`로 보낸다. 2026-11-14 해외 여행 지원(#55: 통화·외화 영수증·Google 장소 검색)을 실기기까지 확인. 목표는 정식 출시.

## 바로 다음 할 일

1. 팀원 저장소 초대(아직이면). #1·#2 스펙 이슈는 2026-11-14에 닫음(해외 여행 추가를 본문에 적음)
2. #62 출시 전 Google Places 약관 맞추기 — 다른 작업을 다 끝낸 뒤 마지막에(2026-11-14 결정)

## 사람이 해야 할 일

| 할 일 | 필요한 시점 | 상태 |
|---|---|---|
| Supabase 프로젝트 생성 | #3 | 완료 (`nttoauhqqsqhulbtgixn`, 서울 리전) |
| Render 배포 | #3 | 완료. 2026-11-13 싱가포르로 옮김: https://travel-together-api-sg.onrender.com (DB가 서울이라). 이전 오리건 서버 travel-together-api-d4zr는 확인 후 Suspend |
| Expo 계정, EAS 개발 빌드, Android 실기기 | #3 | 완료 (EAS 계정 kang1031, 패키지 `com.kang1031.frontend`) |
| 테스트용 PostgreSQL 준비 | #3 | 완료 (강동헌 PC: PostgreSQL 17.11 직접 설치, DB `divided_dev`·`divided_test`, 연결 정보는 `backend/.env`). 팀원 PC는 `backend/.env.example` 참고해 각자 준비 |
| 카카오 디벨로퍼스 앱: REST API 키(#7), 같은 앱으로 카카오 로그인 설정(#23) | #7, #23 | REST 키 완료(Render·backend/.env에 `KAKAO_REST_API_KEY`). 카카오 로그인은 #23 때 |
| Google Cloud OAuth 클라이언트(웹) ID·Secret → Supabase Google 로그인 | #23 | 대기 |
| Gemini API 키 | #8, #14 | 완료(`GEMINI_API_KEY`) |
| Supabase Storage 비공개 버킷 + `SUPABASE_SERVICE_ROLE_KEY`를 Render 환경 변수에 | #9 | 완료(버킷 `trip-media`로 안내함) |
| Google Cloud 결제 계정(카드 등록) + Android 지도 키 | #16 | 완료(`GOOGLE_MAPS_ANDROID_KEY`: expo.dev development 환경 + frontend/.env) |
| Google Places API (New) 켜기 + 서버 키 `GOOGLE_PLACES_API_KEY`를 Render에 | #59 해외 장소 검색 | 대기 (#58) |
| 팀원 저장소 초대 | #4 전 | 대기 (아이디 필요) |
| 기획서 용어를 `GLOSSARY.md`에 맞춰 수정 ("그룹", "이용자", "송금 목록" 등) | 제출 전 | 대기 |
| 기획서 4장 UI 목업 이미지 새로 그리기 | 제출 전 | 대기 |
| README 수정본(스펙 결정에 맞춤)을 팀원에게 공유·확인 | 다음 팀 회의 | 대기 |
| 정식 출시 시: 위치정보법 해당 여부 공식 확인(ADR-0003으로 위험은 줄였음), 스토어 등록, Supabase·Render·Gemini 유료 전환 | 출시 결정 시 | 대기 |

## 열린 질문

- 결제 시각은 한국 시간(+09:00)으로 해석한다. 시차 큰 나라는 어긋나지만 신경 쓰지 않기로 함(2026-11-14).
- 자체 학습 모델 없이 Gemini 활용만으로 과목 요건이 충족되는가? 충족되지 않으면 모델 학습 티켓을 추가해야 한다. (기획서 7-1절 댓글)
- 앱 이름은 Travel Together로 정함(2026-11-13). Android 패키지 이름(`com.kang1031.frontend`)과 EAS slug(`frontend`)는 그대로 둠(바꾸면 지도 키 제한·카카오·EAS 프로젝트 설정을 다시 해야 함).
- Render 리전을 싱가포르로 옮길지. 지금은 oregon이라 서울 DB와 왕복이 길다. 옮기려면 `render.yaml`에 `region: singapore`를 넣고 서비스를 다시 만든다.

## 주요 문서

- 기획서 수정판(1~7장): https://claude.ai/artifact/2mDZuaBCKfE2Kat9PxRCy1
- 용어집: [GLOSSARY.md](GLOSSARY.md)
- 결정 기록: [docs/adr/](docs/adr/)
- 백엔드 스펙: #1 / 프론트엔드 스펙: #2
- 구현 티켓: #3~#18 (#1의 하위 이슈, 선행 관계는 GitHub 의존성으로 연결)

## 티켓 순서 요약

```
#3 로그인 뼈대
└─ #4 여행 만들기와 목록
   ├─ #5 초대 코드와 멤버 ─┬─ #6 여행 설정
   │                      └─ #11 수동 지출 ─┬─ #12 정산 화면 ─ #13 송금·재정산
   │                                       ├─ #14 영수증 분석
   │                                       ├─ #16 지도 (+#10)
   │                                       └─ #17 지출 장소 후보
   ├─ #7 플래너 ─┬─ #8 AI 추천 일정
   │            └─ #10 사진 자동 연결 (+#9)
   └─ #9 앨범
#23 소셜 로그인(카카오·Google) ← #7 (메인 기능 다음)
#18 실기기 통합 검증 (사람) ← #6, #8, #13, #14, #16, #17
(#15 경로 기록은 ADR-0003으로 닫힘)
```

## 기록

### 2026-11-14

- 해외 여행 지원 시작(#55). 결정: 여행 하나 = 통화 하나, 정산도 그 통화로 하고 원화 환산 없음(ADR 0004). 국내/해외를 여행마다 정하고 해외는 Google Places로 검색. 하위: #56 여행 통화, #57 외화 영수증, #58 Places 키(사람), #59 해외 장소 검색.
- #56 여행 통화: `trips.currency`(기본 KRW, 마이그레이션 0011 — Render 시작 때 `alembic upgrade head`로 적용). 금액은 통화의 가장 작은 단위 정수(달러는 센트). 원·엔·달러·유로·위안·대만달러·바트·동·페소·홍콩달러·싱가포르달러. 지출·송금이 있으면 통화 변경 409. 앱은 `src/lib/money.ts`(서버 `app/currency.py`와 같은 목록)로 표시·입력, 여행 만들기·설정에 통화 고르기.
- #57 외화 영수증: Gemini에게 여행 통화를 알려 주고 영수증 숫자를 그대로(12.50) 받아 서버가 가장 작은 단위로 바꾼다(`parse_receipt`). 영수증에 보이는 통화도 받아, 여행 통화와 다르면 업로드 응답 `receipt_currency`로 알리고 편집 화면에 "금액을 여행 통화로 바꿔 넣어 주세요" 안내(환산은 안 함). 열린 점: 결제 시각은 여전히 한국 시간(+09:00)으로 해석한다 — 시차가 큰 나라는 시각이 어긋날 수 있다.
- #58 Google Places 키: Places API (New) 사용 설정, 서버 키(Places API만 허용) Render `GOOGLE_PLACES_API_KEY`, Text Search 하루 150건 제한(월 무료 5,000건 안), 결제 계정 유료 전환(정식 출시 목표라 의도대로 둠).
- #59 해외 장소 검색: `trips.is_overseas`(마이그레이션 0012). 해외 여행이면 경로의 여행을 보고 `GooglePlaceSearcher`(Text Search, 필드는 id·이름·주소·좌표·종류만 = Pro 단계)를 쓴다. 카카오 전용 이름을 바꿈: `kakao_place_id` → `source_place_id`(300자), 사진 연결 `kakao_place` → `source_place`, 추천 항목 `kakao_*` → `found_*`. 장소가 생기면 국내/해외 변경 409. AI 추천은 해외면 Google 기준 이름을 요청하고, 이름이 안 맞으면 첫 검색 결과를 쓴다. 출시 전 남은 것: Google 약관(장소 정보 저장 기간·표시 출처) 검토.
- 실기기에서 엔으로 만든 여행이 국내 여행으로 저장돼 AI 추천이 전부 "확인 필요"(카카오로 확인)였다. 여행 만들기에서 원이 아닌 통화를 고르면 해외 여행이 자동으로 켜지게, 원이 아닌 통화인데 국내 여행이면 "카카오맵(국내)에서만 찾아요" 경고.
- 계정 관리와 회원 탈퇴(ADR 0005): 여행 목록의 "계정" → 표시 이름 바꾸기, 로그인 정보(가입 방법·이메일), 이메일 계정 비밀번호 변경(현재 비밀번호 확인), 내가 만든 여행 목록·삭제, 로그아웃, 회원 탈퇴(미리보기 → 확인). 여행 설정에 총무 넘기기. 서버: `PATCH /me`, `GET /me/deletion-preview`, `DELETE /me`(Supabase Admin API로 로그인 계정 삭제, 실패하면 DB 되돌림), `POST /trips/{id}/organizer`, `user_profiles.deleted_at`(마이그레이션 0013). 탈퇴한 계정의 남은 토큰은 401/404.

### 2026-11-13

- 앱 업데이트(EAS Update): `expo-updates`, `runtimeVersion: fingerprint`, 빌드 프로필별 채널(development·preview). 이 설정이 들어간 시연용 APK부터는 앱 코드만 바뀐 수정을 다시 설치 없이 보낼 수 있다: `cd frontend && npx eas-cli update --channel preview --environment preview --message "무엇을 바꿨는지"` → 폰에서 앱을 껐다 켜면 받고, 한 번 더 껐다 켜면 적용. 이름·아이콘·네이티브 기능·권한이 바뀌면 fingerprint가 달라져 업데이트가 안 들어가므로 다시 빌드해야 한다.
- 날짜·시간 입력을 고르기로: 여행 만들기·여행 설정은 달력에서 시작일·종료일을 차례로 누르기(`TripPeriodField`), 일정 시간·지출 결제 시각은 시(0~23)·분(5분 단위) 누르기(`TimePicker`, 일정은 "시간 없음"으로 비우기), 지출 결제 날짜는 달력. 네이티브 모듈 없이 JS로 만들어 개발 빌드를 다시 안 해도 되고 Expo Go에서도 된다(`src/components/pickers/`).
- 앱 이름 Travel Together, 아이콘(남색 바탕·흰 지도 핀·여행 가방) 적용: 기본 아이콘, Android 적응형(앞·뒤·단색), 스플래시(남색), 파비콘. 오리건 서버 삭제, 서버 깨우기(cron) 설정 완료.
- 영수증 크게 보기가 화면의 2배로 열려 너무 컸던 것 → 화면에 맞춰 열고, 두 손가락 확대(최대 5배)·끌어서 이동·두 번 탭 확대/원래대로(react-native-gesture-handler + reanimated, `zoomable-image.tsx`). ScrollView 확대는 iOS에서만 됐다.
- 화면 로딩 줄이기: 서버가 요청마다 `GET /trips/{trip_id}/expenses 200 0.35초 DB 4번` 같은 로그를 남긴다(경로는 라우트 모양, /health 제외). 예시 여행으로 재 보니 항목마다 관계를 따로 묻고 있었다(N+1) → `app/loading.py`의 옵션으로 필요한 관계만 한 번에 읽음: 정산 DB 20→8번, 지출 목록 15→3번, 일정 11→2번, 멤버 7→3번, 송금 6→2번. 모델 전체에 `lazy="selectin"`을 거는 건 오히려 늘어서 쓰지 않음. 앱은 30초 안에 받은 데이터를 다시 쓰고(staleTime), 멤버를 내보내면 사진 목록도 새로 받음.
- 화면 전환이 느린 주원인: 서버(오리건)와 DB(서울)가 멀어 DB 질의마다 태평양 왕복. Render 서버를 싱가포르에 새로 만듦(travel-together-api-sg, 환경 변수 그대로). expo.dev preview 환경의 `EXPO_PUBLIC_API_URL`을 새 주소로, `render.yaml`에 `region: singapore`.
- 시연용 설치 APK: `eas.json`에 `preview` 프로필(내부 배포 APK, 개발 서버 없이 실행). 앱 JS를 EAS 서버에서 묶으므로 `EXPO_PUBLIC_API_URL`·`EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(plaintext)와 `GOOGLE_MAPS_ANDROID_KEY`를 expo.dev의 preview 환경에도 넣음. 빌드: `npx eas-cli build --profile preview --platform android`.
- 지도 시트가 손가락을 따라 움직이고 놓으면 부드럽게 펼침/접힘(Animated + PanResponder, 끌기 처리는 한 번만 만든다: 다시 만들면 끄는 도중 거리를 0부터 세어 튀었음). 내용이 짧으면 그만큼만 펼침. Android 핀 숫자가 빠지던 것 → 핀이 바뀌면 0.8초 동안 다시 그리게(`tracksViewChanges`) 했다가 멈춤.
- 추천이 느린 원인 확인(Render 로그): `gemini-flash-latest`가 시간 초과(504)될 때까지 기다린 뒤 `gemini-flash-lite-latest`가 1.6초에 답함. Gemini 답변 시간 제한 120초 → 30초, 생각 끄기를 거절한 모델은 기억해 다음부터 설정 없이 묻는다. Render에 `GEMINI_MODEL=gemini-flash-lite-latest`를 넣으면 처음부터 가벼운 모델을 쓴다(지우면 원래대로).
- 실기기 피드백 반영: 입력칸 예시 글자가 흰색이라 안 보이던 것(추천 일정·일정 편집·앨범·지출 장소) → 회색. 지도 아래 장소 정보를 손잡이로 끌어 올리고 내리기(누르면 접기/펼치기). 지도 멤버 칩 아래가 잘리던 것.
- 비밀번호 찾기: 이메일 → Supabase 재설정 메일(`resetPasswordForEmail`, 복귀 주소 `traveltogether://reset-password`) → 메일 링크가 앱의 새 비밀번호 화면을 연다 → `exchangeCodeForSession` + `updateUser`. PKCE라 요청한 휴대폰에서 링크를 열어야 한다. Supabase 기본 메일은 시간당 보낼 수 있는 수가 적다.
- 추천·영수증 속도: Gemini 생각(thinking) 끄기(`thinking_budget=0`, 받지 않는 모델이면 설정 없이 한 번 더), 추천의 카카오 확인을 동시에(최대 6곳), 영수증은 저장소 올리기와 Gemini 분석을 동시에, 영수증 이미지 긴 변 2000 → 1600px. Render Logs에 `Gemini … 응답 N초`, `카카오 확인 N곳 N초`가 남는다. Render 무료 플랜은 15분 동안 요청이 없으면 잠들어 첫 요청이 1분 가까이 걸린다(외부에서 /health를 주기적으로 부르면 피할 수 있음).
- 소셜 로그인 후 돌아온 앱 주소(`traveltogether://auth-callback`)를 Expo Router가 화면으로 열어 UnmatchedRoute가 뜸 → `src/app/auth-callback.tsx`가 원래 화면(로그인됐으면 내 여행, 아니면 로그인)으로 돌려보낸다.
- #23 소셜 로그인 코드. 서버: 첫 프로필 이름을 `user_metadata`의 display_name → full_name → name → nickname → preferred_username → user_name → 이메일 앞부분 순으로(이메일 없는 카카오 계정 허용). 앱: 로그인·가입 화면에 카카오·Google 버튼, Supabase OAuth PKCE(`signInWithOAuth` + `expo-web-browser` + `exchangeCodeForSession`), 앱 주소 scheme `traveltogether`(복귀 주소 `traveltogether://auth-callback`), 닫기·동의 거부는 오류 없이 취소. scheme이 바뀌어 개발 빌드를 다시 해야 한다. 카카오·Google·Supabase 설정은 사람이 한다.
- 구글 지도 키 발급(Google Cloud 프로젝트 travel-together, Maps SDK for Android, 패키지·SHA-1 제한) 후 개발 빌드에서 지도 확인 완료: 핀 모양, 화면 맞추기, 하단 시트, 날짜·멤버 필터. #16·#18 끝.
- `npx expo start --tunnel`이 `Install @expo/ngrok` 오류로 안 되던 것 → `@expo/ngrok`을 frontend 개발 의존성으로 추가(전역 설치는 npx가 못 찾음).
- #16 지도 중 키 없이 되는 부분. 서버: `GET /trips/{id}/map?date=&member_id=`(장소별 들른 곳 여부·들른 날짜·일정 항목·사진 썸네일 서명 URL·확정 지출 수와 합계, 장소 미연결 사진 수). 날짜는 그날 계획했거나 들른 곳, 멤버는 그 멤버가 사진을 올렸거나 결제한 곳. 앱: 지도 화면이 이 API를 쓰고 멤버 필터 칩, "들른 날" 표시, 지도 탭에 올 때마다 다시 받음.
- 구글 지도 Android 키는 `app.config.js`가 환경 변수 `GOOGLE_MAPS_ANDROID_KEY`에서 넣는다(공개 저장소에 커밋하지 않음). 개발 서버는 `frontend/.env`, EAS 빌드는 expo.dev Environment variables(development). 키가 없으면 지도 대신 장소 목록.
- 앱 테스트 시계를 2026-11-12로 고정(jest-setup). 날짜가 바뀌자 플래너가 "오늘"을 먼저 열어 날짜에 의존하는 테스트 10개가 깨졌었다.
- Expo 57 패치 버전 5개 올림(expo, expo-constants, expo-linking, expo-router, expo-sqlite, `npx expo install --fix`). expo-doctor 21/21 통과.

### 2026-11-12

- 실기기 확인 중 고친 것. PR #33~#38을 main에 합치고 개발 빌드를 다시 만들어 확인함.
  - 장소 검색·추천이 "서버에 연결하지 못했습니다" → Render에 `KAKAO_REST_API_KEY`·`GEMINI_API_KEY`가 실제로 안 들어가 있었음. 원인을 알 수 있게 외부 서비스(카카오, Gemini, 저장소) 실패 이유를 Render 로그에 남기도록 함(#39). 키 값은 남기지 않는다. Render Logs에서 `실패`로 검색하면 나온다.
  - Gemini 503(바쁨)·504(시간 초과) → 바쁘면 1.5초 뒤 한 번 더, 그래도 안 되면 `gemini-flash-lite-latest`로, 시간 초과는 바로 가벼운 모델로. 답변 시간 제한 60초 → 120초(#40).
  - Gemini 400 INVALID_ARGUMENT → 응답 스키마의 `format: date`·길이·범위·패턴 제한 때문. Gemini에는 타입만 있는 모양을 보내고 받은 답은 서버에서 엄격하게 검사(#42). 추천·영수증 모두.
  - 사진·영수증이 안 올라감(서버 로그에 요청 없음) → Expo SDK 57은 전역 fetch를 expo/fetch로 바꾸는데, React Native식 `{ uri, name, type }` 첨부를 지원하지 않는다. 파일 내용을 `expo-file-system`의 `File.bytes()`로 읽어 보내도록 함(`src/api/file-part.ts`). 서버는 `SUPABASE_URL` 끝의 줄바꿈 때문에 저장소 주소가 깨져서(`httpx.InvalidURL`) 앞뒤 공백을 지우게 함(#41).
  - 지도 탭이 Android에서 안 열림 → 구글 지도 키가 없어서. 키가 없는 Android 빌드에서는 지도 대신 장소 목록을 보여 준다(`hasMapKey`). #16에서 키를 넣고 빌드하면 지도가 나온다.
  - 실기기 확인 결과: 지도 그림(키 필요)을 빼고 체크리스트 전부 문제없음.
  - 화면 확인용 예시 여행 스크립트 `python -m app.seed_demo --email 가입이메일`(backend). "[예시] 제주 여행" 3일 일정·장소 7곳, 가짜 멤버 3명, 확정 지출 4건·송금 1건. 운영 DB에 넣을 때는 터미널에서만 `$env:DATABASE_URL`을 Supabase Session pooler 주소로 잡고 실행. 지우기는 앱에서 여행 삭제.
  - `eas build` 끝의 adb 오류, `--tunnel`에 `@expo/ngrok` 필요(`npm install -g @expo/ngrok@^4.1.0`)는 지난번과 같은 안내.
- 쌓은 PR(#27~#31)이 앞 브랜치로 합쳐져 main에 안 들어간 일이 있었다. PR #32로 한 번에 main에 합침. 이후 PR은 모두 main을 대상으로 올린다.
- Supabase 무료 프로젝트가 일주일 미사용으로 일시 정지돼 Render 배포(마이그레이션)가 실패했다. Restore 후 해결. 일주일 넘게 안 쓰면 다시 멈춘다.
- #17 지출 장소 후보. 서버: `expenses.place_id`(마이그레이션 0010), `GET /trips/{id}/expenses/place-candidates?query=`(총무만, 위치 없이 검색어로만, 이 여행의 장소가 앞), 지출 저장 때 고른 카카오 장소를 확인 후 (여행, 카카오 장소)로 재사용, 지출 목록·상세에 장소. 앱: 지출 편집에 "장소 후보 보기"(상호가 기본 검색어, 다시 찾기, 이 여행의 장소 표시, 고르기·빼기, 자동으로 붙이지 않음), 타임라인 일정 항목에 그날 그 장소의 확정 지출 금액, 지도에서 확정 지출 장소도 들른 곳(일정에 없어도 핀).
- 키·계정 없이 또는 이미 받은 키로 할 수 있는 티켓은 끝남(#7, #8, #9, #10, #14, #17). 서버 테스트 222개, 앱 테스트 131개.
- #14 영수증 분석. 서버: Gemini 영수증 어댑터(`app/receipt_reader.py`, 응답 스키마에 Pydantic, 못 읽은 값은 null), `receipts`(마이그레이션 0009, 이미지 해시로 결과 재사용) + `expenses.receipt_id`, `POST /trips/{id}/receipts`(총무만, 멱등 키, 항상 draft, 분석 실패해도 영수증 저장 + 빈 초안, 결제자는 총무·분담 대상은 전원으로 채움), 지출 조회에 영수증 서명 URL, 여행 삭제 시 영수증 파일도 삭제. 앱: "영수증으로 추가"(카메라·앨범 → 2000px JPEG로 줄여 올림 → 편집 화면), 편집 화면 위 영수증 원본(눌러서 크게), 읽지 못한 칸 "읽지 못함" 표시, 분석 결과 안내. app.json 카메라 권한 문구 추가.
- #10 사진 자동 연결. 앱(휴대폰 안): EXIF GPS(안드로이드·iOS 모양 모두)로 촬영 날짜(한국 시간) 일정 항목의 장소 중 300m 안 가장 가까운 곳을 찾아 장소 id만 보냄(좌표는 메모리에서만 쓰고 버림), 사진 상세에서 연결된 장소·그날 일정 표시, 바꾸기·해제·검색해서 새 장소 연결, 앨범 장소별 보기·미연결 수, 타임라인 사진 수, 지도 들른 곳(사진만 연결된 장소도 핀). 서버: 업로드에 `place_id`(이 여행 장소인지만 확인, 자동), `PUT /photos/{id}/place`(장소 id 또는 카카오 장소로 수동 연결·해제, 새 장소는 카카오로 확인 후 생성).
- #9 앨범. 서버: Supabase Storage 어댑터(`app/storage.py`, 비공개 버킷 `SUPABASE_STORAGE_BUCKET` 기본 `trip-media`, 10분 서명 URL), `photos`(마이그레이션 0008, 장소 연결 칸은 #10용으로 미리), 업로드(JPEG만·5MB·여행당 200장·서버도 APP1/APP13/주석을 지워 EXIF 제거, 위치 필드 없음), 목록, 지우기(올린 사람·총무), 나간 멤버 사진과 여행 삭제 시 파일까지 삭제. 앱: 앨범이 서버 사진으로(고르기 → 촬영 시각만 읽고 1600px JPEG로 줄여 EXIF 제거 → 한 장씩 올리기, 장별 성공·실패와 실패만 다시 올리기, 날짜별·올린 사람별 보기, 남은 장수, 지우기 권한). 팀원의 예시 사진 상태와 예시 장소 삭제. `expo-image-manipulator` 추가(네이티브).
- #8 AI 추천 일정. 서버: Gemini 어댑터(`app/gemini.py`, google-genai 응답 스키마에 Pydantic 모델, 모델은 `GEMINI_MODEL`·기본 `gemini-flash-latest`), 형식 오류면 1회 재요청 후 502, 각 추천을 "장소명 지역"으로 카카오 검색해 이름이 충분히 일치(공백 무시, 짧은 쪽이 긴 쪽 절반 이상이고 글자가 순서대로 들어 있음)하면 확인됨·아니면 "확인 필요", 같은 입력이면 저장된 결과(Gemini 안 부름), 여행당 하루(한국 시간) 새 요청 10회·11번째 429, 고른 카드만 일정 항목으로(장소는 채택할 때 places에 넣어 지도에 미리 안 보이게). 마이그레이션 0007. 앱: 추천 일정 화면(여행지·취향 칩, 진행 표시, 날짜별 카드, 확인 필요 배지, 고른 것만 추가, 429·502 안내).
- #7 플래너와 장소 검색. 서버: 카카오 장소 검색기 어댑터(`app/place_search.py`, 테스트는 가짜), `places`·`plan_items`(마이그레이션 0006), 장소 검색 API, 일정 항목 CRUD(멤버 누구나 추가·수정, 지우기는 만든 사람·총무), 하루 안 순서 바꾸기, 기간 밖 날짜 422, 기간 축소 시 일정 항목 날짜 409(#6의 자리 채움). 장소는 일정 저장 때 이름으로 카카오를 다시 검색해 같은 id가 있을 때만 만든다(카카오에 id 조회 API가 없음). 앱이 보낸 장소 정보는 믿지 않고 카카오 값으로 저장. 앱: 플래너가 서버 일정으로 바뀜(장소 검색, 시간 없는 일정, 순서 위/아래, 지우기 권한, 오늘 강조, 당겨서 새로고침), 지도 핀이 일정의 실제 장소로 바뀜. 팀원의 예시 일정 데이터 삭제.

- #4 여행 만들기와 목록. 서버: `trips`·`members` 테이블(마이그레이션 0002, RLS 켬), `POST /trips`(만든 사람이 총무이자 가입 순서 1), `GET /trips`(내가 멤버인 여행, 시작일 늦은 순), `GET /trips/{id}`(내 멤버 정보·총무 여부, 멤버 아니면 404). 권한 판정은 `app/permissions.py` 한 곳. 총무는 `trips.organizer_user_id`로 저장(위임 없음). 서버 테스트 29개.
- 앱: 로그인 후 첫 화면이 "내 여행" 목록, 새 여행 만들기 화면, 여행을 열면 `/trips/[tripId]` 아래 탭(팀원 디자인). 여행 이름·기간·멤버 수·날짜 탭·총무 여부는 서버 데이터, 일정·사진·정산은 아직 예시 데이터. 날짜는 일단 `YYYY-MM-DD` 직접 입력(날짜 선택기는 개발 빌드 다시 만들 때). 앱 테스트 29개.
- #5 초대 코드와 멤버. 서버: `trips.invite_code`(마이그레이션 0003, 기존 여행은 코드 채움), 멤버 목록, 초대 코드 보기·재발급(총무만, 일반 멤버 403), `POST /trips/join`(대소문자·공백 무시, 이미 멤버면 그대로, 10명이면 409, 동시 가입은 여행 행을 잠가 순서 보장). 앱: 멤버·초대 코드 화면(여행 메뉴에서, 복사·공유·재발급), 초대 코드로 들어가기 화면. 복사용 `expo-clipboard` 추가(네이티브라 개발 빌드 다시 필요).
- #6 여행 설정. 서버: `PATCH /trips/{id}`(총무만, 보낸 값만 변경, 일정 항목 날짜가 빠지면 409를 돌려줄 자리 마련. 실제 검사는 #7), `DELETE /trips/{id}`(총무만, 멤버 등 cascade), `DELETE /trips/{id}/members/me`(나가기, 총무는 409), `DELETE /trips/{id}/members/{member_id}`(총무가 내보내기). 지출에 엮인 멤버 차단은 #11, 사진 삭제는 #9에서 `_remove`에 더한다. 앱: 여행 설정 화면(총무: 이름·기간 수정, 확인 창 거쳐 삭제 / 멤버: 나가기), 멤버 화면에 내보내기.
- #11 수동 지출. 서버: `expenses`·`line_items`·분담 대상 테이블(마이그레이션 0004), 지출 CRUD(총무만, 멤버는 보기만), 확정(4가지 조건, 깨지면 needs_review + 422 깨진 조건 목록, 강제 확정 없음), 고치면 다시 초안, 멱등 키(같은 키면 처음 지출), 지출에 엮인 멤버 나가기·내보내기 409. 멤버 외래 키는 deferrable(여행 삭제 cascade 순서 때문). 시각은 UTC로 내보냄. 앱: 지출 편집 화면(결제자, 총액, 기본 분담 대상, 품목별 예외, 합계·차이 표시, 깨진 조건을 해당 품목 옆에), 정산 탭의 지출 내역(확인 필요 모음). 정산 현황은 아직 예시(#12).
- #12 정산 화면. 서버: 순수 계산 모듈 `app/settlement.py`(남는 원은 가입 순서, 잔액 = 결제액 − 부담액 + 보낸 송금 − 받은 송금, 큰 금액부터 짝짓는 송금 제안, 동률은 가입 순서), `GET /trips/{id}/settlement`(확정 지출만, 멤버별 잔액·송금 제안·품목별 부담 근거). 앱: 정산 현황을 서버 결과로 교체(내 받을/보낼 금액, 결제액·부담액, 송금 제안, 부담액 근거, 송금 안내문 복사, 은행 앱 안내, 정산 완료). 팀원의 정산 예시 데이터와 그 테스트는 삭제.
- #13 송금 기록과 재정산. 서버: `transfers` 테이블(마이그레이션 0005, 금액 > 0, 자기 자신에게 금지), 송금 기록·목록·삭제(기록·삭제는 총무만), 정산 계산에 송금 반영(지출이 바뀌면 기록된 송금은 그대로 두고 다시 계산), 송금 기록이 있는 멤버도 나가기·내보내기 409. 앱: 송금 제안 카드의 "송금 완료로 기록"(확인 창)·"금액 직접 입력", 송금 기록 목록(총무는 지우기).
- 키·계정 없이 할 수 있는 티켓(#4, #5, #6, #11, #12, #13)은 모두 끝남. 서버 테스트 108개, 앱 테스트 77개.
- 구조: 여행 화면을 Stack(탭 + 멤버·설정·지출 화면)으로 바꿈. 쌓인 화면에서 돌아갈 때는 `goBack`(navigate로 탭 주소를 열면 탭 화면이 하나 더 쌓이는 문제).
- 고친 것: 지도 화면의 "플래너 보기"가 탭이 여행 아래로 옮겨진 뒤 여행 목록으로 가던 문제.

- 팀원(imnamexxo)이 화면 디자인 PR #22를 올림: 로그인·회원가입, 플래너, 앨범, 지도, 정산을 예시 데이터로 구현. 웹으로 띄워 6개 화면 확인. 지도는 내 위치를 쓰지 않음(ADR-0003 준수). 다만 #3 이전 main에서 출발해 충돌이 있고, 로그인이 가짜 미리보기로 바뀌어 있어 그대로 합치지 않기로 함.
- 팀원 화면(PR #22)을 #3 뼈대에 합침: 팀원 커밋을 그대로 merge하고 충돌 9개 정리. 로그인·회원가입 디자인은 그대로 두고 진짜 Supabase 로그인에 연결, "로그인 없이 미리보기"와 소셜 버튼은 숨김(소셜은 #23). 여행 홈 "•••" 메뉴에 로그인한 이름과 로그아웃. 플래너·앨범·지도·정산은 아직 예시 데이터이며 #4부터 서버 데이터로 바꾼다. 쓰지 않게 된 템플릿 파일(themed-*, hooks) 삭제.
- 테스트: `npm test`가 jest(13개)와 팀원의 node 테스트(4개)를 함께 돌린다. jest에는 지도 네이티브 모듈이 없어 `__tests__/support/jest-setup.tsx`에서 가짜로 바꾼다. ESLint가 생겨 `npm run lint`도 통과.
- 웹 미리보기(`npx expo start --web`)가 #3 이후 깨져 있었음(expo-sqlite 웹 wasm, 정적 렌더링에 localStorage 없음). 웹에서는 브라우저 localStorage를 쓰게 고침. 팀원이 웹으로 디자인을 확인할 수 있다. 웹은 여전히 지원 대상은 아니다.
- 소셜 로그인(카카오·Google)을 범위 안으로 옮김. 메인 기능(#4 → #5 → #7) 다음에 #23에서 한다. 카카오 앱은 #7 장소 검색과 같이 준비. 스펙 #1·#2와 `docs/specs/` 수정.

### 2026-11-04 (#3 배포·실기기)

- #3 완료: PR #19(코드), PR #20(JWKS 실패 원인 로그, `eas init`이 만든 `app.json` 설정). Android 실기기에서 가입, 로그인(표시 이름), 재시작 후 유지, 로그아웃, 재로그인 확인.
- 배포하며 막힌 곳(팀원 설정 때 참고):
  - Render `DATABASE_URL`은 Supabase Connect → **Session pooler** 주소(`postgres.<ref>@aws-...pooler.supabase.com`)여야 한다. Direct·Dedicated pooler는 IPv6라 Render 무료 플랜에서 `Network is unreachable`.
  - Render `SUPABASE_URL`은 `https://<ref>.supabase.co`만. 뒤에 경로가 붙거나 틀리면 앱에 "로그인 확인 서버에 연결하지 못했습니다"(502)가 뜬다. 이제 원인이 Render 로그에 `JWKS를 가져오지 못했습니다`로 남는다.
  - `eas build` 끝에 에뮬레이터에 설치할지 물으면 n. Yes면 Android Studio(adb)가 없어서 오류가 나지만 빌드 자체는 성공한 것이다. 설치는 expo.dev → Builds → Install QR.
  - 저장소 주인이 imnamexxo라 Render GitHub 앱 설치는 주인 계정에서 해야 한다.
- Supabase 프로젝트는 비대칭 서명 키(ES256, JWKS)를 쓴다. `SUPABASE_JWT_SECRET`은 비워 둔다.

### 2026-11-04

- #3 코드 작성. 서버: FastAPI 기본 구조, 공통 오류 형식(`code`·`message`·`details`), 인증 검증기 어댑터(Supabase JWKS 기본 + 예전 HS256 비밀키 선택), `GET /me`(첫 호출 때 가입 시 표시 이름으로 프로필 생성), `GET /health`, SQLAlchemy + Alembic 첫 마이그레이션, 모든 테이블 RLS 켬(정책 없음 = 클라이언트 거부, 테스트로 강제), `render.yaml`.
- 앱: 템플릿 예제 제거, 로그인/가입 화면, 하단 탭 4개 빈 화면, 인증 서비스 인터페이스(Supabase 구현, 세션은 expo-sqlite localStorage), API 클라이언트(토큰 첨부·공통 오류 해석), TanStack Query(401이면 로그아웃), openapi-typescript 타입 생성(`npm run gen:api`, 입력은 `backend/openapi.json`), `eas.json` 개발 빌드 프로필.
- 테스트: 서버 `venv\Scripts\python -m pytest`, 앱 `npm test`. 앱 테스트 11개, 서버 테스트 17개 모두 통과(로컬 PostgreSQL). `backend/.env`는 이전 폴더에서 복사함.
- `alembic.ini`에 한글을 넣으면 Windows(cp949)에서 읽다가 깨진다. 이 파일은 영어로만 쓴다.
- 서버 API를 바꾸면 `venv\Scripts\python -m app.export_openapi` → `frontend`에서 `npm run gen:api`.
- 버전 메모: SDK 57에서 `expo-router/testing-library`는 RNTL 13만 지원(그래서 `react-test-renderer`를 19.2.3으로 고정). openapi-typescript 7.13은 TypeScript 5를 peer로 요구해서 `overrides`로 프로젝트 TS 6을 쓰게 함. Render 무료 플랜엔 pre-deploy 명령이 없어 시작 명령에서 마이그레이션 적용.
- 프론트에 ESLint가 설치되어 있지 않음(`expo lint` 실패). 필요하면 별도로 구성.

### 2026-10-28

- 기획 방향 변경: 정산 앱 → 여행 플래너·공유 앨범이 메인, 경로 지도·영수증 정산이 부가. AI는 Gemini(일정 추천, 영수증 분석)만 사용하고 자체 분류 모델은 제외.
- 기획서 수정판(1~7장) 작성.
- 도메인 용어 정리: `GLOSSARY.md` 작성, ADR-0001(여행 하나 = 그룹 하나), ADR-0002(모든 데이터 요청은 서버 경유).
- GitHub 저장소 생성(kang1031/divided_app, 비공개). `frontend/`의 기존 `.git`은 루트 저장소로 합치면서 백업 폴더로 옮김.
- 이슈 트래커 설정(GitHub Issues, 기본 분류 라벨 5개), 루트 `AGENTS.md`·`CLAUDE.md`.
- 스펙 #1(백엔드), #2(프론트엔드) 작성. 테스트 경계: 서버 HTTP API, 정산 계산 모듈, 앱 API 클라이언트, 실기기 수동 검증.
- 구현 티켓 #3~#18 등록.
- 구조 정리: `backend/requirements.txt`·`requirements-dev.txt` 추가(psycopg, python-multipart, pytest 설치), 프론트에서 안 쓰는 `react-navigation`·`@react-navigation/native-stack` 제거.
- 기술 스택 보강 채택: SQLAlchemy 2 + Alembic, 테스트 DB는 환경 변수 주소(Docker 또는 직접 설치), openapi-typescript, TanStack Query, expo-sqlite(경로 임시 저장), Gemini 응답 스키마 지정. #1, #2, #3, #8, #14, #15에 반영.
- 알려진 문제: 프론트 타입 검사에서 템플릿의 `.css` 타입 선언 오류 2개. #3에서 템플릿 화면을 걷어낼 때 해결.
- 팀 저장소로 이전: imnamexxo/travel-together(공개)에 README 기록과 합쳐 push. 이슈 #1~#18을 같은 번호·라벨·하위 이슈·선행 관계로 다시 생성. 스펙 백업은 `docs/specs/`. 기존 저장소 kang1031/divided_app은 그대로 두었고 로컬 원격 이름은 `old`.
- README(팀원 작성)와 스펙이 다른 부분은 스펙 기준으로 결정: 동시 편집은 마지막 저장 반영, 장소는 카카오 검증 통과한 것만, 여행 생성 입력은 이름·기간, 사진 자동 연결은 #10, 용어는 `GLOSSARY.md`. README 수정은 팀원과 협의 필요.
- 이동경로 기록 삭제(ADR-0003): 위치정보법·스토어 백그라운드 위치 심사를 피하려고 GPS 경로 기록을 없앰. 지도는 장소 핀(들른 곳·계획만 한 곳)만, 사진 GPS는 휴대폰 안에서 장소 매칭에만 쓰고 서버로 보내지 않음, 지출 장소 후보는 상호 검색만. #15 닫음, #1·#2·#9·#10·#16·#17·#18 수정, 용어집 "경로" → "들른 곳". expo-location·expo-sqlite는 더 이상 쓰지 않음.
- 출시 용량 검토: 사진 저장소·전송량 때문에 정식 출시 시 Supabase Pro, Render 유료, Gemini 유료 필요(월 $35 안팎 + Gemini 사용량). 썸네일 분리·저장소 직접 업로드는 제안만 하고 미반영.
