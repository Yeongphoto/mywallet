# Memoney 번들 앱 빌드·에뮬레이터 검증

작성: 2026-10-23 · 브랜치 `android_dev`

## 구현한 것

React 화면·정적 자산을 APK에 포함하고 `https://localhost`에서 연다. `server.url`로 웹사이트 전체를 여는 기존 개발 앱과 별도로, `com.memoney.probe` / `Memoney Probe` / `메머니 검증` 앱을 생성한다. 출시 앱 `com.memoney.app`과 기존 앱 `com.mywallet.dev`를 덮어쓰지 않는다.

- `src/auth/native-api.ts`: 번들 화면의 `/api/` fetch를 네이티브 API로 연결한다. 일반 자산 요청은 기존 fetch를 사용하며, 외부 origin·리다이렉트·잘못된 응답·명시적 credentials omit은 거부한다. 쓰기를 자동 재시도하지 않는다.
- `MemoneyApiPlugin`: 허용된 API 경로·메서드·헤더와 고정 backend만 사용한다. JS가 Cookie·Origin·임의 URL을 주입할 수 없고 Set-Cookie를 JS에 반환하지 않는다. native CookieHandler가 쿠키를 한 번만 전송하고 HttpOnly 쿠키는 backend host에만 저장한다.
- 기존 Capacitor 기본 CookieHandler와 수동 Cookie 헤더를 함께 사용하면 중복 쿠키로 `LOGIN_CHALLENGE_EXPIRED`가 발생했다. 실제 APK에서 발견해 backend 전용 CookieHandler로 수정했다. SDK/node_modules 소스는 수정하지 않았다.
- `MemoneyPageTrust`: 원격 개발 화면의 기존 신뢰 검사는 유지하고, 번들 모드에서는 명시적으로 활성화된 로컬 페이지 경로만 Google 로그인/백업/API 플러그인 호출에 허용한다.
- 번들 앱의 첫 실행은 비로그인 로컬 장부로 진입한다. 원격 로그인 설정을 받아야 로컬 장부가 열리는 구조로 만들지 않는다. 기존 웹·원격 개발 앱은 이 전송 모드를 자동 활성화하지 않는다.

검증 앱의 backend는 `http://127.0.0.1:5198`뿐이다. 이 예외는 debuggable `com.memoney.probe`와 `allowLocalProbe=true`에서만 허용한다. 정식 패키지의 코드 경로는 `https://memoney-6r5.pages.dev`만 허용하며, 아직 출시 구성이나 서버를 활성화하지 않았다.

## 실행

```powershell
npm run android:bundle:build
npm run check:native-api
npm run android:bundle:test
```

- build는 기존 출시 준비 생성기를 재사용하되 생성된 프로젝트의 applicationId만 검증 앱으로 바꾸고 debug APK를 만든다. 원본 Gradle Release 차단과 출시 준비 프로젝트의 생성 차단은 유지한다.
- 정적 자산은 현재 dist에서 복사하되 public의 미추적 사용자 파일은 제외한다. `.wrangler`, 설치 앱 데이터, 서명 키, 사용자 PDF를 복사하지 않는다.
- APK 위치는 Git 제외 파일 `android/build/memoney-bundle-probe.json`에 기록한다. 서명은 Android 개발용 debug 서명이며 Play 업로드용이 아니다.
- test는 부팅된 에뮬레이터가 정확히 하나일 때만 해당 검증 앱을 설치한다. 실기기를 선택하지 않고 기존 앱을 제거하거나 데이터를 지우지 않는다.
- PC loopback에 메모리 SQLite 인증/금융 fixture를 띄우고 adb reverse로 연결한다. 공통 D1·Google Cloud·운영 API에는 연결하지 않는다. 완료 후 fixture 서버를 닫고 전용 reverse 연결을 제거한다. 에뮬레이터와 앱은 남겨 둔다.
- 실제 Google 계정 선택을 실행하지 않는다. 인증 처리기는 실제 코드를 사용하되 Google 검증 콜백은 격리 토큰으로 대체한다. 금융 GET은 격리 SQLite와 기존 처리기를 사용하고 금융 쓰기는 거부한다.

## 통과한 검증

1. Gradle debug APK 빌드, 에뮬레이터 설치·실행, `https://localhost/guest` 진입.
2. 실제 등록 모달과 키패드로 `번들 저장 검증` 1,234원 저장. 로컬 저장 중 금융 네트워크 요청 0건.
3. 번들 화면의 challenge → 시험 인증 → 네이티브 쿠키 저장 → session 확인. JS Cookie/Origin 주입·외부 URL·다른 장부 UUID·리다이렉트 차단.
4. 새로고침과 백그라운드 전환 후 프로세스 재시작에서 로컬 기록과 인증 쿠키 유지. 로그아웃 후 session 401.
5. fixture 서버를 종료하고 adb reverse를 제거한 뒤 cold launch에서도 번들 장부와 로컬 1,234원 기록 표시.
6. 금융 DB 쓰기 0건, 금융 거래 행 0건, 중복 Cookie 이름 0건. 익명·권한 없는 요청은 거부.
7. 네이티브 전송 단위 검사 8건과 기존 회귀 111건, 총 119건 통과. 웹 빌드 통과. 에뮬레이터 화면에서 한글을 확인했다.

재현 가능한 검사는 `scripts/check-bundle-probe.mjs`, `scripts/bundle-probe-fixture.mjs`, `scripts/native-api.test.mjs`에 있다. 스크린샷과 합성 로컬 백업은 `%LOCALAPPDATA%/Memoney/web-ui-checks/<실행 PID>/`에 보존하며 외부에 업로드하지 않는다.

## 발견한 출시 차단 항목: 저장 직후 즉시 강제 종료

초기 검사에서 UI 저장 직후 백그라운드 전환 없이 `am force-stop`한 경우, 재실행 시 최근 거래가 없는 이전 로컬 snapshot이 읽히는 사례를 관찰했다. 현재 통과한 재시작 검사는 새로고침 확인, 홈으로 백그라운드 전환, 3초 대기 후 프로세스 종료를 사용한다. 이를 즉시 강제 종료 내구성까지 검증한 것으로 보지 않는다.

WebView 저장의 디스크 반영 시점과 검증용 초기 fixture 주입의 영향을 분리해 추가 재현해야 한다. 근본 원인은 아직 확정하지 않았다. 이번 작업에서 localStorage 대신 다른 저장소를 조용히 기준으로 삼거나 자동 복구로 덮어쓰는 변경은 하지 않았다.

원래의 더 강한 종료 조건은 `node scripts/check-bundle-probe.mjs --abrupt-stop` 진단 모드로 남긴다. 이 모드는 정상 백그라운드 전환과 대기를 생략하며 통과를 보장하지 않는다. 기본 검사의 성공과 별도로 다룬다.

다음 우선 작업은 테스트 fixture 없이 일반 입력만으로 재현하고, 저장 성공 응답 전에 안전하게 영속화할 네이티브 보존 경로를 검토·검증하는 것이다. 동기화 정책과 원본/복구 세대 보존 규칙은 유지해야 한다. 해결 전 `originMigrationVerified`나 실제 출시 허용을 켜지 않는다.

## 아직 하지 않은 것

- 실제 Google 로그인, 정식 HTTPS 서버와 네이티브 쿠키의 실기기 교차 검증.
- 실사용자의 앱/웹 장부 읽기·쓰기·이전, 파일 선택기를 통한 실제 백업 복원.
- 정식 서명 키 생성, AAB, Play Console 업로드, 원격 푸시, 새 서버 배포, 운영 플래그 활성화.
- 새 패키지로의 데이터 자동 이전과 기존 앱 제거. 기존 데이터 보존은 [출시 서버 이전 절차](android-release-server.md)를 따른다.

이는 실행 가능한 검증용 APK이며 정식 출시 완료본은 아니다. [출시 체크리스트](android-release-checklist.md), [네이티브 준비 경로](android-release-build.md), [서버 준비](android-release-server.md)를 함께 확인한다.
