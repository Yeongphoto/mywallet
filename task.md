# 작업 체크리스트

## 1단계: 월간 계획 및 카테고리 고도화
- [x] `types.ts` 내에 `CategoryPlan` 인터페이스 추가
- [x] `App.tsx` 로드/저장/CSV 핸들러에 `plans` 상태 바인딩 및 데이터 영속화
- [x] `App.tsx` static 카테고리를 React State로 변환하고 로컬스토리지 영속화 구현
- [x] `App.tsx` 자산 탭 '월간 계획' 헤더 하단에 동적 카테고리 등록 폼 & 수입/지출 유형 선택 추가
- [x] `App.tsx` CSV 백업/복원에 동적 카테고리 데이터(`C,type,id,label`) 반영
- [x] `mobile.css` 및 `styles.css` 계획 장표 모바일 2분할 레이아웃 최적화 (갭/크기 축소)
- [x] 빌드 테스트 (`npm run build`)

## 2단계: Cloudflare D1 데이터베이스 연동
- [x] `wrangler.toml` 파일 생성 및 D1 binding(DB) 설정 추가
- [x] D1 데이터베이스 테이블 초기화용 `schema.sql` 파일 작성
- [x] 원격 D1 데이터베이스 마이그레이션 (`wrangler d1 execute` remote) 완료
- [x] 로컬 D1 에뮬레이션 마이그레이션 (`wrangler d1 execute` local) 완료
- [x] Cloudflare Pages Functions 백엔드 API (`functions/api/data.ts`) 구현 (GET/POST 동기화)
- [x] React 클라이언트 D1 API 연동 및 입력 후 1초 뒤 자동 디바운스(Debounce) 저장 로직 적용
- [x] 첫 접속 시 원격 DB 데이터 로딩 마스크 구현 및 DB 데이터 무조건 최우선(DB-First) 덮어쓰기 구현
- [x] `package.json` 로컬 D1 에뮬레이션 dev 스크립트 (`dev:d1`) 추가
- [x] `run.bat` 배치 파일 메뉴 분기 및 로컬 D1 연동 실행 기능 추가

## 3단계: 정기 반복 결제 및 반복 중단 기능
- [x] D1 `schema.sql` 내에 `recurring_rules` 테이블 구조 정의 추가
- [x] 로컬 및 원격 D1 데이터베이스 마이그레이션 (`wrangler d1 execute` remote/local) 실행
- [x] 백엔드 API (`functions/api/data.ts`)에서 `recurringRules` 데이터 CRUD 동기화 지원
- [x] React 클라이언트 `types.ts`에 `RecurringRule` 타입 정의 및 `App.tsx` 임포트
- [x] `App.tsx` 로딩 시 D1 `recurringRules` 데이터 로드 및 로컬스토리지 저장 연동
- [x] 앱 로딩 후 미등록 정기 거래 내역을 자동으로 생성·주입해주는 `generateRecurringTransactions` 훅 추가
- [x] 통합 거래 등록 폼 (`UnifiedEntryForm`) 에 "🔄 매달 정기 기록으로 등록" 체크박스 신설
- [x] 자산 탭 하단에 "🔄 정기 반복 기록 관리" 테이블 장표를 신설하여 규칙 목록 렌더링
- [x] 정기 기록 목록에 "🛑 이달부터 끊기" 및 "삭제" 제어 기능을 달아 `endMonth` 반복 중단 로직 구현
- [x] 전체 초기화 (`handleReset`) 시 `recurringRules` 상태도 함께 비워지도록 리셋 갱신
