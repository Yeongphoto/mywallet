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
- [x] React 클라이언트 (`src/App.tsx`) D1 API 로드 및 자동 백그라운드 동기화(Sync) 연동
- [x] `package.json` 로컬 D1 에뮬레이션 dev 스크립트 (`dev:d1`) 추가
- [x] `run.bat` 배치 파일 메뉴 분기 및 로컬 D1 연동 실행 기능 추가
