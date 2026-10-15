# Memoney Android Google 로그인 화면

작성: 2026-10-13 · 브랜치: `android_dev`

최신 상태: [Android와 기존 웹앱 공동 사용](android-web-shared-wallet.md). 연결된 계정은 로그인 후 `/wallet`로 들어가 기존 웹앱과 같은 원격 기록을 사용한다. 아래 초기 인증 시험의 장부 차단 기록은 연결 이전 상태다.

## 구현 범위

Android 개발 앱 `com.mywallet.dev`의 시작 주소를 `http://localhost:5187/signin`으로 연결했다. React 로그인 화면과 네이티브 Credential Manager의 Google 버튼 흐름을 구현했다. 같은 WebView에서 로그인 challenge와 세션 쿠키를 유지한다.

1. 앱 시작·복귀·주기 확인에서 `/api/auth/config`와 `/api/auth/session`을 조회한다.
2. 사용자가 Google 버튼을 누르면 서버에서 새 challenge와 64자 nonce를 받는다.
3. `MemoneyGoogleAuth` 플러그인이 고정 개발 Web client ID와 nonce로 `GetSignInWithGoogleOption`을 요청한다. 사용자 동작 전에 자동으로 Google 창을 열지 않는다.
4. 받은 ID 토큰을 WebView의 `/api/auth/google`에 제출하여 서버의 서명·audience·nonce 검증과 세션 발급을 거친다.
5. `/api/auth/session` 재조회로 실제 쿠키 세션을 확인한 뒤 로그인 완료 화면을 표시한다. 네이티브 토큰을 받았다는 사실만으로 로그인 성공을 표시하지 않는다.
6. 로그아웃은 서버 세션을 먼저 철회하고 Credential Manager 상태를 비운다. provider 정리만 실패한 경우에도 서버에서 철회한 세션을 복구하지 않는다. 서버 철회가 실패하면 성공으로 표시하지 않는다.

네이티브 플러그인은 정확한 개발 origin·`/signin`과 `/wallet` 경로·설정된 Web client ID·nonce 형식을 검사한다. 중복 요청을 거부하고 Activity 종료 시 진행 중 요청을 취소한다. ID 토큰은 일시 전달·제출에만 사용하며 localStorage·DB·로그에 저장하지 않는다. Capacitor의 브리지 로그도 `loggingBehavior: none`으로 껐다.

실제 Android 토큰은 서버용 Web client ID를 `aud`, Android client ID를 `azp`로 전달했다. 처음에는 두 값을 같게 요구해 정상 로그인이 거부되었다. 서버는 Web audience를 그대로 검증하고, `azp`가 있으면 Web client ID 또는 서버에 명시한 Android client ID만 허용하도록 수정했다. Android ID가 미설정이면 기존 Web 검증만 허용하며, 임의의 client ID를 허용하지 않는다. 개발 서버는 `capacitor.config.json`의 `androidClientId`를 `AUTH_GOOGLE_ANDROID_CLIENT_ID`로 전달한다. 근거: [Google의 Android·웹 앱 azp 설명](https://developers.google.com/identity/openid-connect/openid-connect).

한국어 로그인 화면, Google 공식 배포 버튼, 취소·연결 실패·만료 안내와 재시도를 추가했다. Google 버튼 이미지는 [공식 자산 ZIP](https://developers.google.com/static/identity/images/signin-assets.zip)의 Android + Web / PNG @4x / Light / Show text=Yes / Shape=Pill 파일을 수정 없이 추출했다. 기존 고양이 로고 자산을 재사용하며 아이콘·스플래시·로딩 렌더러는 바꾸지 않았다.

## 데이터와 기존 앱

장부별 금융 API·캐시 분리는 아직 구현 전이다. 로그인 완료 화면에서 장부 연결 준비 상태를 보여주며 기존 장부로 이동시키지 않는다. 로그인 경로에서는 `App`을 import하거나 D1 캐시 preloader·PWA 등록을 실행하지 않는다. 금융 API 요청이 발생하지 않는 것을 에뮬레이터에서 확인했다.

로그인 시험 서버의 `/api/data`는 미인증 401, 인증 후에도 장부 격리 완료 전에는 503으로 차단한다. 기존 장부·사용자 캐시·운영 D1은 이전하거나 삭제하지 않는다. 기존 웹 시작 경로는 기존 장부 앱을 유지한다. 브라우저의 `/signin`은 화면 미리보기만 제공하며 네이티브 버튼은 비활성이다.

기존 빈 장부 시험 서버 5186은 별도로 보존했다. 이후 해당 서버를 실행하는 명령은 `npm run android:ledger-server`다. 현재 Android 앱과 설치 도구는 인증 서버 5187을 사용한다.

### 로그인 후 가계부에 들어가지 않는 원인과 연결 작업

`SignInScreen.tsx`의 인증 성공 분기는 로그인 완료 안내와 로그아웃만 렌더링한다. 가계부 이동 버튼이나 자동 이동은 아직 없다. `auth-sandbox.mjs`가 생성한 `/api/data`도 로그인 후 503을 반환한다. 따라서 주소만 기존 앱 시작 경로로 바꾸는 것으로 장부 연결이 완성되지 않는다.

연결 대상 데이터는 사용자에게 확인한다. 기존 `syh4472` 장부를 연결하는 경우, 로그인한 불변 사용자 UUID에 해당 원본 장부를 귀속하는 범위를 확정하고 원격 D1 백업·시험 복원·이전 전후 검증을 준비한다. 빈 개발용 장부를 선택한 경우 별도 개발 D1에서 시작하며 기존 기록을 복제하지 않는다. 어떤 선택도 다른 신규 계정에 기존 장부를 자동 배정하는 규칙으로 사용하지 않는다.

구현 순서는 다음과 같다.

1. 서버가 세션의 사용자와 `ledger_memberships`를 확인하고 접근 가능한 장부를 반환한다. 개인 장부의 연결과 공유 권한 부여는 별도다.
2. 장부 범위로 거래·자산·계획·카테고리·설정·정기기록·삭제 기록·카드 결제·작업 결과·동기화 변경·정렬 그룹을 분리한다. GET 전체·증분 조회와 PATCH 전 작업, 참조 검증을 함께 적용한다.
3. `App.tsx`의 장부 캐시·보류 작업·동기화 커서·복원 후보와 `d1-cache-preload.ts`를 사용자·장부 기준으로 구분한다. 기존 전역 캐시를 새 계정으로 자동 적용하거나 업로드하지 않는다.
4. 서버가 장부 접근을 확인한 뒤 가계부를 렌더링하고 로그인 성공에서 해당 화면으로 이어준다. 만료·로그아웃·공유 철회 때는 화면과 요청을 중단하고 보류 작업은 원래 사용자·장부 범위에 보존한다.
5. 실제 Android에서 로그인 → 장부 조회 → 등록 → 서버 저장 → 재실행 → 수정·삭제를 검증한다. 다른 계정·장부 접근 거부와 기존 데이터 보존을 확인한 뒤 연결 완료로 보고한다.

이 검토 이후 사용자는 기존 웹앱 장부를 여자친구와 함께 계속 사용하도록 요청했다. 후속 작업에서 기존 웹 API와의 호환 연결을 구현했다. 여러 개인 장부를 분리하는 전환은 별도이며, 현재 연결 결과는 위 공동 사용 문서를 따른다.

## 실행

```powershell
# 첫 번째 터미널: 인증 서버를 유지한다.
npm run android:server

# 두 번째 터미널: 에뮬레이터가 부팅된 상태에서 빌드·설치·실행한다.
npm run android:run
```

`android:server`는 `auth:server`를 실행한다. 발급한 공개 개발 Web client ID는 `capacitor.config.json`의 플러그인 설정에서 읽으므로 기본 실행에 별도 환경변수가 필요 없다. `MYWALLET_GOOGLE_CLIENT_ID`로 서버를 덮어쓴 경우 네이티브 빌드의 client ID와 일치해야 한다. 운영 client ID·원격 서버를 이 개발 설정에 넣지 않는다.

에뮬레이터에 Google 계정이 없으면 버튼이 Google의 기기 계정 추가 화면을 연다. 사용자가 Google 화면에서 본인 계정·비밀번호·추가 인증을 직접 입력한다. 새로운 Google 계정을 만들 필요는 없다. 앱 설정에서는 Google 계정을 제거하지 않는다. Google 초기 계정 검색 옵션은 SKIP으로 건너뛰고 계정 입력 화면까지 확인했다.

로그인 도중 5분이 지나면 서버 challenge가 만료된다. 기기 계정 추가 후 앱으로 돌아와 Google 버튼을 다시 누르면 새 challenge로 재시도한다.

## 검증

- 웹 TypeScript·Vite·PWA 검사와 Gradle debug APK 빌드 통과. Credential Manager 1.6.0, googleid 1.2.1 사용.
- 서버 인증 시험 9개와 클라이언트 흐름 시험 6개, 총 15개 통과. Android authorized party 허용·미설정 거부·등록되지 않은 client 거부·잘못된 audience/nonce 거부와 HTTP 세션 연결 회귀 검증을 포함한다.
- 에뮬레이터 설치·실행, 네이티브 플러그인 등록, Google 기기 계정 입력 화면 호출 확인.
- 실제 취소 후 한국어 취소 안내와 버튼 재활성화 확인. 새로운 요청은 새 challenge를 발급한다.
- 모바일 가로 넘침·깨진 이미지 없음, 로그인 페이지에서 금융 API 요청 0 확인.
- 사용자가 Google 계정을 추가한 뒤 실제 계정 선택·Google 서명 토큰 검증·`GET /api/auth/session` 200과 로그인 완료 화면을 확인했다. 앱을 강제 종료하고 다시 실행해 같은 쿠키 세션이 유지되는 것도 확인했다. 기존 금융 API 요청은 계속 0이었다.
- 후속 공동 사용 작업에서 실제 로그아웃 후 세션 401·로그인 화면 복귀·본인 계정 재로그인 후 `/wallet` 진입을 확인했다. 인증·공동 사용·캐시 자동 시험은 총 24개 통과했다.

기술 근거: [Google 버튼 흐름과 서버 검증](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation), [Credential Manager 안정 버전](https://developer.android.com/jetpack/androidx/releases/credentials), [Capacitor Android 플러그인](https://capacitorjs.com/docs/plugins/android). 콘솔 설정값은 [Google Cloud 기록](google-cloud-setup.md)을 따른다.
