# 브라우저 Google 로그인

2026-10-21. Android는 기존 Credential Manager 경로를 유지한다. 브라우저에서는 기본 브라우저의 Google Identity Services와 일회용 로그인 연결을 사용한다. Google 인증 페이지를 내장 브라우저에서 강제로 열거나 User-Agent를 위장하지 않는다.

## 설정과 사용

웹 OAuth 클라이언트의 승인된 JavaScript 원본에 `https://memoney-android-test.pages.dev`를 등록한다. GIS callback 방식이므로 별도의 리디렉션 URI나 client secret은 필요하지 않다. [Google 설정 지침](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

오르카의 앱 미리보기도 인증 API가 있는 위 호스팅의 `/signin`을 사용한다. 정적 Vite preview(`127.0.0.1:5176`)에는 인증 서버가 없다.

1. 오르카에서 ‘Google로 계속하기’를 누른다. 로그인 링크가 기본 브라우저에서 열리며 연결 코드가 표시된다. 링크가 내장 탭에서 열리는 환경에서는 ‘로그인 링크 복사’ 후 Chrome/Edge 주소창에 붙여 넣는다.
2. 기본 브라우저에서 두 화면의 연결 코드가 같은지 확인하고 Google 계정을 선택한다.
3. 오르카로 돌아와 표시된 이메일을 확인한 뒤 ‘이 계정으로 계속하기’를 누른다. 이때 오르카에 자체 HttpOnly 로그인 세션이 생성된다.

## 보안과 격리

- `AUTH_BROWSER_LOGIN=true`인 배포에서만 `/api/auth/browser-*`를 활성화한다. 기존 인증·장부 소유권·금융 저장 규칙은 바꾸지 않는다.
- 요청 브라우저의 256비트 비밀값은 HttpOnly·Secure·SameSite=Lax cookie에만 둔다. 외부 브라우저용 승인 토큰은 별개의 256비트 난수이며 DB에는 두 값의 해시만 저장한다.
- 승인 토큰은 URL fragment로 전달한 뒤 외부 화면에서 주소 표시줄에서 제거한다. 페이지는 no-store, strict-origin-when-cross-origin과 same-origin-allow-popups를 사용한다. SDK는 Google 공식 URL에서 직접 로드한다.
- 서버가 Google JWT의 서명·issuer·audience·만료·nonce를 검증한다. 승인 링크나 화면 코드만으로 세션을 발급하지 않는다. 원래 브라우저에서 검증된 이메일과 코드를 명시적으로 확인해야 한다.
- 모든 단계는 같은 Origin의 POST만 허용한다. 유효기간 5분, 중복 승인·중복 claim 거부, IP 해시 기준 분당 8회 시작 제한을 적용한다. 새 계정을 기존 장부에 자동 연결하거나 이메일만으로 기존 사용자와 합치지 않는다.
- Google credential이나 다른 브라우저의 cookie를 복사하지 않는다. 승인·poll 응답에는 세션 토큰을 담지 않는다.

## 검증

`npm run check:browser-login`은 실제 서명 JWT와 격리 SQLite에서 승인/명시적 계정 확인, 일회용 발급, nonce·Origin·다른 cookie·만료·재사용 차단, feature flag와 요청 제한을 검사한다.

`node scripts/check-browser-login-ui.mjs`는 서로 다른 브라우저 저장 공간과 실제 인증 핸들러(테스트 Google credential 검증기)로 연결 전체를 검사한다. 600/768/1080px에서 왼쪽 메뉴의 젤리 눌림·복원, 고정 터치 영역, 기본/테마1·라이트/다크·동작 줄이기를 확인한다. 실제 Google 계정 선택과 인증 승인은 사용자에게 남긴다.
