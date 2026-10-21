# Android 공통 기능의 agy 웹 통합

기준: `android_dev` 커밋 `d161074`. APK 생성·Git 푸시·기존 DB 삭제는 범위에서 제외한다. 원본 작업트리와 미추적 PDF를 변경하거나 배포하지 않는다.

## 연결과 보존 원칙

- 웹은 `https://mywallet-8mx.pages.dev`, Android는 기존 `https://memoney-android-test.pages.dev`를 사용한다. 원본의 Android 전용 origin 및 배포 준비 스크립트를 그대로 적용하지 않는다.
- 인증 `ec28198a-6040-4074-a142-1cf6f76c7f15`, 개인 `a4113709-d951-4b50-aa78-cc80eb7cda9f`, 공유 `0a69096e-4d87-423e-b4a2-6afc0fb94698`의 동일 D1 묶음을 사용한다. 사용자·Google subject·장부 UUID와 역할은 유지한다.
- 이전 무인증 금융 API나 별도 웹 개인 DB를 다시 활성화하지 않는다. 브라우저별 세션·로컬 저장은 별개이며, 다른 기기의 로컬 기록을 로그인만으로 업로드하지 않는다.
- 원격 검증은 조회와 백업만 수행한다. 수정·삭제·복구 검증은 격리된 SQLite 또는 모의 브라우저에서 한다. 데이터 누락·충돌 발견 시 정상 행을 덮어쓰지 않고 보고한다.

## 단계 1: 공통 인증·권한·복구 서버

- Google 브라우저 승인 흐름과 7일 보관·복구·세대 보호를 원본에서 통합했다. 웹은 명시적인 `AUTH_ANDROID_DATA_COMPAT` 및 정확한 웹 origin 검사를 거쳐 같은 금융 DB에 접근한다.
- 원본 금융 핸들러와 기존 웹의 `server/wallet/legacy-data.ts`는 내용상 동일했다. 후자는 내부 모듈로 유지하고 외부 `/api/data`는 항상 인증·장부 접근 검사를 거치도록 했다. 설정 누락 시 무인증 경로로 돌아가지 않는다.
- 독립 세션을 가진 웹/Android 모의 클라이언트에서 동일 사용자·장부, 교차 저장·revision 충돌·초기화·복구·오래된 세대 차단을 검증했다. 원본 인증·초대·소유권·공유 복사·복구 테스트도 수행한다.

## 단계 2: 공통 화면과 기기 모드

- `05b797a` 이후 전체 공통 React 화면·스타일을 기준 소스에서 반영했다. 차트/계획/장부/설정 젤리 토글, 하단·태블릿 메뉴의 탄성, 등록/수정 모달과 제목 추천, 개인/공유/로컬 장부 선택, 재연결, 초대, 계정, 로컬 백업·이관·7일 복구를 포함한다.
- 최근 3개월 카드의 768px 이상 동일 폭·높이 2분할과 기간 우측 정렬도 포함한다. 411/768/1080/1440px × 기본/테마1 × 라이트/다크 16조합에서 수입·지출 상세, 메뉴, 네 가지 등록 폼을 검사했다.
- 웹은 루트 `/`에서도 반드시 `/signin` 또는 `/guest`로 진입해 장부 namespace를 먼저 초기화한다. 원본 Android의 루트 무범위 App 진입을 그대로 복사하지 않았다. 웹 PWA 등록은 모든 화면에서 수행한다.
- 네이티브 호출은 원본의 플랫폼 검사로 차단한다. 공통 코드의 플랫폼 구분에 필요한 `@capacitor/core`만 추가하고 Android SDK·Gradle·네이티브 앱 파일·APK 도구는 가져오지 않았다.
- 로고와 연결 애니메이션은 원본 추적 자산을 그대로 사용했다. 설치 매니페스트·앱 식별자·설치용 벡터는 유지했다. 삼성 실기기 설치 검증을 대신했다고 주장하지 않는다.
- 모의 브라우저에서 외부 Google 승인 전체 흐름, 개인/공유 양방향 전환, 일시 네트워크 오류 시 입력 보존, 세대 변경 보류 큐 보존, 로컬/클라우드 복구를 확인했다. 실제 Google 로그인이나 사용자 장부 수정으로 시험하지 않았다.
- 웹 테스트 산출물은 저장소 밖 `%LOCALAPPDATA%\Memoney\web-ui-checks`에 둔다. 원본의 `android/build` 산출물 경로는 웹용으로 바꿨다. 통합으로 편집한 기존 혼합 개행 파일 `index.html`, `src/styles.css`, `src/loading-scale.css`만 LF로 정리한다.

## 단계 3: 운영 설정·보존 대조·개발 안전장치

- UI 단계 커밋은 `f81e361`이다. 웹에 `AUTH_BROWSER_LOGIN=true`, `AUTH_LEDGER_RECOVERY=true`를 추가하며 Android 전용 origin·native OAuth client·upstream bridge는 복사하지 않는다.
- 운영 웹의 금융 API는 항상 인증·장부 권한 검사를 거친다. 별도 `WEB_FINANCE` 개인 장부 자동 생성 모드는 사용하지 않는다. 해당 모드를 검사하던 과거 테스트를 현재 공통 DB/권한 거부 검사로 대체했다.
- `npm run dev`와 `npm run web:server`는 `http://localhost:5189`의 새 공통 API 로컬 시험환경을 사용한다. 세 DB는 모두 `remote:false`·영(0) 기반 가짜 ID이며, 이전 시험환경 상태를 그대로 보존한다. 실제 사용자 ID·Google subject·금융 데이터는 seed하지 않는다. Google 로그인을 시험하려면 개발 Web client 및 정확한 localhost origin을 별도로 설정해야 한다. 기본은 로컬 장부 사용이다.
- `npm run check:web-connection`은 실제 Android 운영 binding, 실제 웹 운영 binding, 원격 DB 목록을 로컬 설정과 ID로 대조한다. 이름만 같거나 한 설정만 갱신한 상태를 성공으로 보지 않는다.
- 배포 준비 시 `dist`에 섞인 미추적 `public` 파일을 제외한다. 컴파일 산출물과 Git 추적된 정적 자산만 runtime에 복사한다. 사용자 PDF는 읽거나 복사하거나 Git에 추가하지 않았다.
- 통합 직전 세 공통 DB 전체 SQL·로컬 복원본·manifest와 배포 전 설정은 저장소 밖 `%LOCALAPPDATA%\Memoney\backups\android-web-ZmIMSk`에 보관했다. 인증 세션/신원과 금융 정보가 있으므로 공유하거나 Git에 추가하지 않는다.

### 이전 웹 데이터의 보존

원격 계정에 `mywallet-db`와 이전 `memoney-android-test-*` DB는 이미 없다. 이번 작업에서 다시 만들거나 삭제하지 않았다. 삭제 직전 검증된 `%LOCALAPPDATA%\Memoney\backups\android-web-LSJjls`의 SQL 체크섬을 확인하고 복원본을 현재 공통 DB 백업과 비교했다.

| 이전 웹 데이터 | 이전 행 수 | 동일 내용이 보존된 행 수 | 현재 개인 DB 행 수 |
| --- | ---: | ---: | ---: |
| 거래(삭제 표식 포함) | 482 | 482 | 484 |
| 자산 | 14 | 14 | 14 |
| 계획 | 34 | 34 | 34 |
| 사용자 카테고리 | 23 | 23 | 23 |
| 정기 규칙 | 5 | 5 | 5 |
| 삭제된 정기거래 ID | 3 | 3 | 3 |
| 카드 정산 | 3 | 3 | 3 |
| 작업 영수증 | 452 | 452 | 459 |

설정 8행 중 `updatedAt`만 기존 명시적 병합 시각으로 바뀌었고 나머지 7행은 동일했다. 동기화 그룹 9행 중 revision 1행, 이전 cursor 435행 중 1행의 이벤트 내용은 과거 분기·추가 병합 이력으로 다르다. 현재 cursor 440행을 옛 분기의 숫자로 덮어쓰지 않았다. 거래·자산 등 사용자 데이터의 누락/충돌은 발견하지 않았으므로 추가 이관 SQL은 실행하지 않았다.

이전 인증 백업 대비 사용자 2행·Google 신원 2행·장부 3행·membership 4행은 모두 같은 값으로 보존됐고, 신원·권한의 고아 참조는 0건이다. 개인 DB의 marker UUID도 운영 설정과 일치한다. 이전 웹은 무인증 장부였으므로 그 내용을 현재 개인 장부와 행 단위 대조했으며, 이를 신규 사용자나 공유 장부에 중복 배정하지 않았다.

이전 웹의 원격 스키마에는 별도 첨부 테이블이 없다. 서버 보관본·로컬 백업·다른 기기의 파일은 같은 것으로 간주하지 않는다. 기기별 localStorage/IndexedDB 및 외부 JSON 파일은 원격 DB 조사로 전부 열람할 수 없으며, 원본을 보존하는 로컬 이관·복구 검증으로 구분한다.

`memoney-recovery-cleanup` Worker의 AUTH/PERSONAL/SHARED binding도 같은 세 ID임을 확인했다. 웹을 위해 정리 Worker를 중복 배포하지 않는다. 초기화·복구·정리 검사는 원본의 격리 테스트에서 수행하고, 실사용자 장부에는 시험용 초기화/삭제를 보내지 않는다.

### Google origin

승인된 JavaScript 원본에 필요한 운영 값은 정확히 `https://mywallet-8mx.pages.dev`다. `/browser-login`은 GIS callback 화면이므로 이를 별도 redirect URI로 등록하는 방식이 아니다. 개발 로그인에는 선택한 Web client의 `http://localhost:5189`도 필요하다. `--preview`로 배포하면 `https://android-data.mywallet-8mx.pages.dev`도 별도 등록 대상이다. Google 콘솔을 자동 변경하거나 실제 사용자 인증을 대신하지 않는다.

## 배포·최종 확인

웹 배포 및 실제 응답 확인을 이어서 수행한다. 실제 Google 계정 로그인과 삼성 실기기 설치 화면은 자동 모의 테스트 통과와 구분해 보고한다.
