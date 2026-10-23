# Memoney 출시 서버·로그인·로컬 보존 준비

작성: 2026-10-23 · `android_dev` · 실제 배포/전환 전 단계

## 이번 단계의 결과

- 출시 원본은 `https://memoney-6r5.pages.dev`, 프로젝트는 `memoney`다. 실제 서비스는 아직 배포하지 않았다.
- 기존 코드가 Android 시험 주소만 허용하던 장부 설정 조건을 보강했다. `AUTH_RELEASE_DEPLOYMENT=true`가 명시된 정확한 출시 원본만 추가로 인정한다. 임의 pages.dev 주소나 미리보기 서브도메인을 허용하지 않는다.
- 계정·장부 UUID, owner/editor/viewer 검사, 소유권 표식, 금융 DB 격리, 원래 웹앱 브리지 제한은 유지한다. origin 허용이 특정 사용자에게 장부 권한을 부여하지는 않는다.
- 기존 Android 시험 origin에는 출시 플래그를 적용하지 않는다. 기존 개발 구성과 개발 앱 식별자는 유지한다.
- 최초 개인 장부 이전 기능은 계속 비활성이다. 출시 주소 준비를 이유로 인증 스키마나 운영 플래그를 바꾸지 않았다.

## 서버 설정 초안

```powershell
npm run android:server:prepare
npm run check:android-server
```

첫 명령은 `android/build/memoney-server-preparation-<고유값>/wrangler.draft.json`만 생성한다. 금융 DB를 조회하거나 쓰지 않고, 로컬 설정에 보존된 기존 개인 장부 UUID를 읽어 그대로 사용한다. 초기 사용자 seed, 금융 데이터 복사, 초기화 SQL, DB 생성·삭제, 배포 명령은 없다.

초안은 의도적으로 `AUTH_ENABLED=false`이며 출력 폴더도 `NOT_PREPARED_FOR_DEPLOYMENT`다. 이 파일만으로 운영 배포할 수 없다. 실제 활성화는 안전한 전체 런타임 구성과 로그인·이전 검증이 끝난 뒤 따로 진행한다.

공통 DB는 이름과 실제 ID를 모두 검사하며 기존 묶음을 유지한다:

| 역할 | 바인딩 | DB 이름 | 실제 database_id |
| --- | --- | --- | --- |
| 인증 | DB | memoney-auth | ec28198a-6040-4074-a142-1cf6f76c7f15 |
| 개인 | TEST_FINANCE | memoney-personal | a4113709-d951-4b50-aa78-cc80eb7cda9f |
| 공유 | TEST_SHARED_FINANCE | memoney-shared | 0a69096e-4d87-423e-b4a2-6afc0fb94698 |

`TEST_*`, `AUTH_SHARED_TEST_DEPLOYMENT`, `AUTH_TEST_*`는 현재 서버 계약의 내부 호환 이름이다. 보이는 앱명·서버 주소에서 test를 없애는 것과 구별한다. 이 이름이나 기존 DB 표식을 단순 치환하면 격리 검사가 깨지므로 이번에는 변경하지 않았다. 새 DB로 갈아타는 작업이 아니다.

실제 런타임을 만들 때에는 `/api/data`를 반드시 인증·장부 scope를 거치는 `sharedWalletData`에 연결해야 한다. 과거 `functions/api/data.ts` 원본을 그대로 공개하면 안 된다. 원본 금융 연산은 별도 내부 모듈로 격리하고, 내부 `{DB}` 호출이 공개 라우트로 재귀하거나 인증 DB를 금융 DB로 사용하는 일이 없는지 검증한다. 현재 초안 생성 도구는 런타임을 생성·배포하지 않는다.

## Google Cloud 추가 설정

[기존 프로젝트의 Clients](https://console.cloud.google.com/auth/clients?project=memoney-511500)에서 현재 Web application client의 **승인된 JavaScript 원본**에 다음 주소를 추가할 예정이다:

```text
https://memoney-6r5.pages.dev
```

`/signin`, `/browser-login`, `/api/auth/google` 경로를 원본에 붙이지 않는다. 현재 Google ID 토큰 JavaScript 콜백 방식이므로 별도의 OAuth redirect URI를 추측해 추가하지 않는다. 서버가 제공하는 `/browser-login#approve=...`는 앱의 승인 흐름이며 OAuth redirect URI와 다른 것이다. [Google 공식 설정 안내](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

- 기존 Web client ID와 서버 audience를 유지한다. Android client ID를 Web audience 자리에 넣지 않는다.
- 추후 `com.memoney.app` + Play 앱 서명 SHA-1의 Android client를 추가하고, 그 ID를 출시 프로필과 서버의 Android authorized-party 허용 목록에 같이 넣는다. 개발 client를 재사용하지 않는다.
- Audience/동의 화면의 현재 게시 상태·시험 사용자·지원 연락처·정책 링크를 콘솔에서 다시 확인한다. 이번 단계에서 Google 콘솔을 저장하거나 공개 상태로 바꾸지 않았다.
- 세션은 새 origin의 `__Host-` 쿠키에 `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`를 유지한다. Domain 쿠키로 넓히거나 CORS `*`/서드파티 쿠키 허용으로 우회하지 않는다.
- 새로운 origin에서도 동일한 Google issuer/subject는 같은 인증 DB user ID를 가리킨다. 브라우저 쿠키는 origin별로 별개이므로 새 주소의 재로그인은 정상이다. 실제 Google/실기기 로그인은 아직 하지 않았다.

## 네이티브 번들 화면 호환성에서 확인한 문제

현재 화면은 `/api/auth/*`, `/api/wallet/*`, `/api/data`의 같은 origin 요청과 same-origin 쿠키를 사용한다. 상대 경로 이동과 네이티브 플러그인의 `getServerUrl()` 기반 trustedPage 검사도 원격 화면 구조에 맞춰져 있다.

따라서 `server.url`만 지우고 화면을 번들에 넣는 것으로 출시 준비가 완료되지 않는다. [Capacitor 설정 안내](https://capacitorjs.com/docs/config)는 원격 `server.url`을 개발 용도로 설명한다. 현재 구조는 개발 앱에 보존하고 다음 구현에서 번들 화면 + 원격 API의 전송·인증 경계를 격리 시험한다.

후속 구현에서 필요한 작업:

1. 네이티브 번들 화면의 안정적인 로컬 origin과 원격 API 전송 경로를 정의한다. 금융 API뿐 아니라 인증·복구·초대 등 모든 요청 경로를 포함한다.
2. 상대 경로 fetch를 무작정 원격 주소로 바꾸지 않는다. 인증 쿠키 저장·로그아웃·재인증·CSRF 검증과 플러그인 호출 출처 제한을 함께 검증한다.
3. 네이티브 Google·파일 백업 플러그인이 번들 화면을 신뢰하는 최소 경로만 허용하도록 검사한다. 외부 링크나 임의 URL에 권한을 열지 않는다.
4. 로그인 승인 페이지의 Google SDK, COOP, Referrer-Policy, CSP와 네이티브 앱 복귀를 검증한다. 실제 헤더를 시험하기 전 CSP 완료로 표시하지 않는다.
5. 번들 화면만으로 비로그인 장부가 오프라인 실행되는지 확인한다. 로그인된 클라우드 장부를 검증 없이 오프라인 기준 데이터로 승격하지 않는다.

이 단계에서는 전송 구조를 임의 변경하지 않았으며 기존 앱의 저장·동기화 정책은 그대로다.

## 기존 로컬 기록 보존·전환 절차

- 새 패키지와 새 origin은 기존 기기의 localStorage를 자동으로 읽을 수 없다. 같은 DB에 연결하는 것과 기기 내부 데이터 이전은 별개다.
- 기존 개발 앱을 제거하거나 기존 사이트 데이터를 삭제하지 않는다. 저장 키·guest UUID·선택된 복구 세대를 자동 재작성하지 않는다.
- 비로그인 로컬 사용자는 기존 앱에서 JSON 백업을 내보내고, 새 앱의 로컬 장부에서 명시적으로 복원한다. 계정 로그인이나 클라우드 합치기를 강요하지 않는다.
- 기존 `memoney-local` version 1 백업 형식과 전체 snapshot 검증을 재사용한다. 복원 시 현재 원본을 먼저 보존하는 기존 동작을 유지한다.
- 동일 Google 계정에 개인 장부가 이미 있으면 새 앱은 로그인 후 그 UUID로 전환한다. 로컬 기록을 반복 합치지 않는다.
- 최초 로그인 1회 이전은 [공통 계약](personal-onboarding-contract.md)의 자격·기한·서버 완료 상태를 따른다. 앱 이전이라는 이유로 완료 상태를 초기화하지 않는다.
- 실제 전환 전 거래·자산·계획·카테고리·정기·삭제 표식·카드 정산·설정과 복구 세대를 대조한다. 현재 작업은 실장부를 읽거나 변경하지 않았다.

## 검증 범위와 미완료 항목

- 설정/준비 검사 22건, 출시 서버 격리 검사 6건, 인증/로컬/공유 49건, 최초 이전 17건, 복구 6건, 정기기록 7건, 브라우저 로그인 4건: 총 111건 통과. 웹 빌드 통과.
- 새 주소의 승인→사용자 확인→세션 발급은 메모리 SQLite와 격리된 서명 토큰으로 검증했다. 실제 Google 승인·운영 쿠키·공통 DB 접속을 검증한 것으로 보지 않는다.
- 새 origin의 교차 출처 POST 차단, host-only 보안 쿠키, 명시적 출시 플래그·정확한 origin, 동일 Google subject 매핑을 확인했다.
- 기존 비로그인 로컬 저장·백업 왕복과 최초 이전 원본 보존은 기존 회귀 검사에서 확인했다. 실제 서로 다른 패키지의 파일 선택·복원은 향후 실기기에서 검증한다.
- 남은 작업: 번들/API 전송 호환 구현, 새 origin의 Google 콘솔 등록, CSP/실제 응답 검증, 서명 준비, 분리된 시험 장부를 통한 실기기·앱웹 교차 저장 및 복구 검증, 승인된 운영 활성화.
