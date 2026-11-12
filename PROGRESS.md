# 진행 상황

마지막 갱신: 2026-11-12

작업 단위(티켓)의 상태는 [GitHub Issues](https://github.com/imnamexxo/travel-together/issues)가 기준이다. 이 파일은 티켓에 담기지 않는 것만 기록한다: 지금 어디까지 왔는지, 사람이 해야 할 일, 아직 열린 질문, 날짜별 기록.

## 현재 단계

#3 로그인 뼈대 완료(서버 Render 배포, Android 실기기 확인). 다음 작업은 #4 여행 만들기와 목록.

## 바로 다음 할 일

1. 팀원 화면 합친 PR 확인 후 main에 합치기, 팀원 PR #22 닫기
2. 개발 빌드 다시 만들기 (지도·사진 선택 네이티브 모듈이 새로 들어옴). Android 지도는 구글 지도 키가 있어야 보인다(#16)
3. #4 여행 만들기와 목록
3. 팀원(유소영) GitHub 아이디 받아서 저장소에 초대 (#4 끝나기 전)

## 사람이 해야 할 일

| 할 일 | 필요한 시점 | 상태 |
|---|---|---|
| Supabase 프로젝트 생성 | #3 | 완료 (`nttoauhqqsqhulbtgixn`, 서울 리전) |
| Render 배포 | #3 | 완료 (https://travel-together-api-d4zr.onrender.com, oregon 리전) |
| Expo 계정, EAS 개발 빌드, Android 실기기 | #3 | 완료 (EAS 계정 kang1031, 패키지 `com.kang1031.frontend`) |
| 테스트용 PostgreSQL 준비 | #3 | 완료 (강동헌 PC: PostgreSQL 17.11 직접 설치, DB `divided_dev`·`divided_test`, 연결 정보는 `backend/.env`). 팀원 PC는 `backend/.env.example` 참고해 각자 준비 |
| 카카오 디벨로퍼스 앱: REST API 키(#7), 같은 앱으로 카카오 로그인 설정(#23) | #7, #23 | 대기 |
| Google Cloud OAuth 클라이언트(웹) ID·Secret → Supabase Google 로그인 | #23 | 대기 |
| Gemini API 키 | #8 | 대기 |
| Google Cloud 결제 계정(카드 등록) + Android 지도 키 | #16 | 대기 |
| 팀원 저장소 초대 | #4 전 | 대기 (아이디 필요) |
| 기획서 용어를 `GLOSSARY.md`에 맞춰 수정 ("그룹", "이용자", "송금 목록" 등) | 제출 전 | 대기 |
| 기획서 4장 UI 목업 이미지 새로 그리기 | 제출 전 | 대기 |
| README 수정본(스펙 결정에 맞춤)을 팀원에게 공유·확인 | 다음 팀 회의 | 대기 |
| 정식 출시 시: 위치정보법 해당 여부 공식 확인(ADR-0003으로 위험은 줄였음), 스토어 등록, Supabase·Render·Gemini 유료 전환 | 출시 결정 시 | 대기 |

## 열린 질문

- 자체 학습 모델 없이 Gemini 활용만으로 과목 요건이 충족되는가? 충족되지 않으면 모델 학습 티켓을 추가해야 한다. (기획서 7-1절 댓글)
- 앱 이름 (미정, 나중에 결정). 정하면 Android 패키지 이름(`com.kang1031.frontend`)도 바꿀지 결정. 바꾸면 개발 빌드를 다시 해야 한다.
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

### 2026-11-12

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
