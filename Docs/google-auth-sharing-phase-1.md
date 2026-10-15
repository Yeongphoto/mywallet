# Google 로그인과 장부 공유: 1단계

작성: 2026-10-13 · 브랜치: `android_dev`

## 사용자 결정과 확인 대기

- Google 로그인으로 시작한다. 휴대폰 SMS 인증은 최초 가입 범위에 넣지 않는다.
- 본인 Google 로그인과 내부 사용자 UUID를 확인했다. 후속 작업에서 사용자는 기존 장부를 가져오되 여자친구가 사용하는 웹앱도 그대로 함께 쓰도록 요청했다. 지정한 본인 계정에만 로컬 연결 장부 membership을 부여했으며, 첫 가입자 자동 배정은 하지 않는다. 개인 이메일은 문서에 기록하지 않는다.
- 우선 기존 하나의 가계부를 기존 웹앱과 Android에서 함께 사용한다. [공동 사용 연결](android-web-shared-wallet.md)을 구현했다. 별도 개인 장부·초대·공유 해제·웹 Google 인증 전환은 후속 범위다.
- 2026-10-13 사용자가 Google Cloud 프로젝트 `memoney`를 만들었고 콘솔에서 프로젝트 ID `memoney-511500`을 확인했다. 사용자의 초기 설정 완료 후 Web·Android 개발용 OAuth 클라이언트 생성과 본인 시험 사용자 등록, 별도 로컬 서버의 client ID 연결을 완료했다. 후속 작업에서 본인 Google 계정 로그인과 서버 세션·앱 재시작 후 세션 유지를 확인했다. [실제 입력값과 연결 기록](google-cloud-setup.md)을 따른다. 기존 웹앱 장부의 호환 연결도 후속 작업에서 완료했다.

## 구현한 기반

`server/auth`와 `/api/auth/:action`에 다음 기능을 추가했다.

1. 서버가 5분짜리 로그인 challenge와 nonce를 발급한다. challenge는 HttpOnly 쿠키로 전달하고 DB에는 SHA-256 해시만 저장한다.
2. Google에서 받은 ID 토큰의 RSA 서명·issuer·audience·만료·발급 시각·nonce·azp를 `jose`로 검증한다. 원격 키는 Google의 고정 JWKS URL에서만 가져오며 요청 본문이 지정하는 키나 사용자 ID를 쓰지 않는다.
3. 검증한 `(issuer, sub)`를 내부 불변 사용자 UUID에 매핑한다. 이메일이 같아도 계정을 자동 병합하지 않는다. ID 토큰과 Google access token을 DB·로그에 저장하지 않는다.
4. challenge는 성공 시 한 번만 소비한다. 7일 앱 세션을 발급하고 DB에는 세션 토큰의 해시만 저장한다. 재로그인 시 제시된 기존 세션을 철회하며 로그아웃도 서버 세션을 철회한다.
5. HTTPS 세션 쿠키는 `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`를 사용한다. 인증 변경 요청에는 정확한 Origin 검사를 적용한다. HTTP 예외는 명시적으로 설정한 loopback 개발 환경에만 허용하며 다른 쿠키 이름을 쓴다.
6. 비활성 사용자·만료 세션·재사용 challenge·잘못된 서명·다른 audience·nonce는 거부한다. 오류 응답에는 SQL·토큰·이메일을 포함하지 않는다.

설정이 없으면 config는 `enabled: false`, 로그인·세션 API는 `503 AUTH_NOT_CONFIGURED`를 반환한다. 임의의 Google 계정이나 개발용 가짜 사용자를 로그인시키는 API는 없다.

| 경로 | 메서드 | 역할 |
| --- | --- | --- |
| `/api/auth/config` | GET | 활성 여부와 공개 client ID |
| `/api/auth/challenge` | POST | nonce와 로그인 challenge 쿠키 |
| `/api/auth/google` | POST | `{ idToken }` 검증과 앱 세션 발급 |
| `/api/auth/session` | GET | 검증된 사용자 UUID, 미인증은 401 |
| `/api/auth/logout` | POST | 세션 철회와 쿠키 만료 |

이 경로 추가만으로 기존 운영 `/api/data`의 인증·소유권이 완성되는 것은 아니다. 기존 장부 핸들러와 저장 로직은 이번 단계에서 바꾸지 않았다. 공개 배포하지 않는다.

## 공유를 지원하는 소유권 방향

기존 계획의 사용자별 `user_id`만으로 장부 데이터를 제한하면 같은 장부에 두 계정이 참여하기 어렵다. 공유를 지원하기 위해 **사용자 식별과 장부 접근권한을 별도로 두는 방향**을 준비했다. 실제 기존 데이터의 소유권 변경은 공유 방식 확인 이후 별도 작업이다.

- `users`, `auth_identities`, `auth_sessions`: 로그인과 앱 사용자.
- `ledgers`: 장부 UUID, 소유 사용자 UUID, 장부 이름.
- `ledger_memberships`: 장부·사용자별 참여 관계. 역할은 owner/editor/viewer.
- `ledgerAccess`: 서버가 이미 인증한 사용자 UUID로 membership을 확인한다. viewer는 조회만, editor는 기록 변경, owner는 멤버 관리까지 허용하는 기반이다. 현재 초대·권한 변경 API는 아직 구현하지 않았다.
- 장부 데이터를 옮길 때 거래·자산·계획·카테고리·설정·정기기록·정기 삭제·카드 결제·operation 결과·sync 변경·sync group 모두 장부 범위로 제한해야 한다. 일부 테이블만 옮겨 공유 기능을 열지 않는다.
- 거래와 자산·정기 규칙·이체·카드 결제의 참조가 같은 장부인지 검사한다. 설정·operation·정렬 group의 고유 키와 커서도 장부 범위에 맞춰 재설계한다.
- 캐시·보류 작업·커서는 사용자와 장부를 함께 구분한다. 공유 해제 시 서버 접근을 즉시 거부하고 화면을 숨긴다. 보류 작업 처리·공유 데이터 내보내기/탈퇴 후 보존은 아직 정책 결정이 필요하다.
- 공유 상대방에게 개인 장부를 자동 공개하지 않는다. 초대는 대상 계정 확인·만료·1회 수락·철회 흐름으로 설계한다. 실제 상대방에게 초대를 보내는 작업은 요청을 받은 뒤 수행한다.
- D1 기준 저장소, pending 표시, 충돌/중복 방지 정책은 유지한다. 공유 장부에 각자의 전체 캐시를 덮어쓰지 않는다.

## 분리된 로컬 시험

```powershell
npm run check:auth
npm run auth:server
```

- 별도 포트 5187, `%LOCALAPPDATA%/Memoney/auth-sandbox/<작업폴더 해시>`를 사용한다. 기존 Android 시험 DB(5186), 개인 백업, `.wrangler`와 분리한다.
- `scripts/auth-foundation-schema.sql`의 인증·장부 메타데이터만 새 빈 DB에 생성한다. 금융 데이터 이전과 운영 마이그레이션 파일이 아니다.
- 인증 시험 서버는 기존 unscoped 장부 API를 실행하지 않는다. 미인증 `/api/data` 전체·증분 조회·PATCH는 401, 세션이 있더라도 장부 격리 미완료 시 503으로 중단한다.
- 현재 Android 개발 앱은 5187의 `/signin`으로 연결한다. 로그인 화면과 Android Credential Manager 연결은 [Android Google 로그인](android-google-login.md)에 정리했다. 기존 5186 장부 시험 서버는 별도로 남아 있다.
- 공개 Web client ID는 `capacitor.config.json`에서 읽는다. 다른 시험 클라이언트를 사용할 때만 환경변수로 지정한다.

```powershell
$env:MYWALLET_GOOGLE_CLIENT_ID = '<웹 OAuth client ID>.apps.googleusercontent.com'
npm run auth:server
```

서버의 `AUTH_ORIGIN`은 이 시험에서 `http://localhost:5187`로 고정한다. 브라우저/네이티브에서 요청 시 같은 Origin을 사용한다. 시험 계정을 아무나 가입하게 하는 공개 서버로 노출하지 않는다.

## Google Cloud 설정 순서

현재 프로젝트에서 사용할 실제 입력값과 진행 상태는 [Memoney Google 설정 안내](google-cloud-setup.md)를 따른다.

1. 사용자가 소유한 Google Cloud 프로젝트를 만들거나 기존 프로젝트를 선택한다. Google Auth Platform의 Branding에서 앱 이름·지원 이메일을 설정한다.
2. Audience를 개발용 External/Testing으로 두고 본인과 여자친구를 시험 사용자로 등록한다. 공개 전환은 별도 승인 뒤에 한다.
3. 서버 ID 토큰 검증 audience로 사용할 **Web application OAuth client ID**를 만든다. 위 API는 ID 토큰을 받는 방식이므로 OAuth Client Secret을 APK·브라우저·Git·채팅에 넣지 않는다. 웹 Google Identity Services 연결 시 실제 웹 origin을 정확히 등록한다.
4. 네이티브 Google 로그인은 Android Credential Manager를 사용하도록 준비한다. Android 클라이언트에는 시험 package `com.mywallet.dev`와 debug 서명 SHA-1을 등록하고, 서버용 Web client ID를 연결한다. 정식 앱 식별자와 release 서명은 출시 준비 때 따로 등록한다.
5. 네이티브 로그인 UI에서 서버 nonce를 Google 요청에 전달하고, 반환 ID 토큰을 같은 WebView의 인증 API로 보낸다. challenge 쿠키와 세션 쿠키를 웹뷰에서 유지한다. ID 토큰을 localStorage에 저장하지 않는다.
6. 서버 토큰 검증 후 내부 사용자·장부 membership을 확인한다. 기존 장부 이전은 별도로 지정한 계정의 실제 Google sub를 확인한 후에만 수행한다.

현재 개발 머신의 debug 서명은 다음 명령으로 확인할 수 있다. 이 키는 Android 개발 기본 키이며 출시용으로 사용하지 않는다.

```powershell
& '<JDK 21 경로>/bin/keytool.exe' -list -v -keystore "$env:USERPROFILE/.android/debug.keystore" -alias androiddebugkey -storepass android
```

공식 근거: [Google ID 토큰과 sub 검증](https://developers.google.com/identity/openid-connect/openid-connect), [Android Credential Manager Google 로그인](https://developer.android.com/identity/sign-in/credential-manager-siwg), [Google 인증 토큰의 서버 검증](https://developers.google.com/identity/sign-in/android/backend-auth).

## 이번 검증과 남은 작업

- 인증 TypeScript 검사와 서명 토큰·DB·HTTP 통합 시험 7개 통과. Google 인증 성공 시험은 로컬에서 생성한 RSA 서명 토큰으로 수행했으며, 실제 Google 계정 로그인 성공으로 간주하지 않는다.
- 실제 Wrangler/로컬 D1 기동 성공. 설정 없는 인증 API 차단, 전체·증분·PATCH 장부 API의 401 확인.
- 기존 웹 빌드·PWA 검사와 sandbox 설정 시험 통과. 운영 D1·개인 장부·기존 캐시 변경 없음.
- 후속 로그인 UI 작업에서 Android 빌드와 인증·클라이언트 시험 15개를 통과했다. Android `azp`를 등록한 client ID로 제한하는 검증을 추가했다. 에뮬레이터에서 본인 Google 계정 로그인·서버 세션 200·앱 재시작 후 세션 유지, 로그인 취소 후 재시도를 확인했다.
- 다음 필수 작업: 기존 장부를 받을 실제 Google 계정의 소유권 확인, 공유 방식 확인, 장부별 금융 테이블/API 전수 격리, 계정·장부별 캐시, 두 실제 시험 계정 교차 접근 시험. Google client ID의 로컬 서버 연결과 네이티브 Google UI는 후속 작업에서 완료했다.
- 출시 전에는 로그인 요청 제한·봇/남용 방지, 만료 세션/challenge 정리, HTTPS 스테이징, 로그/탈퇴/내보내기/보존 정책과 복원 시험도 완료해야 한다.

기존 [공개형 앱 계획](public-app-auth-plan.md), [다중 사용자 메모](multi-user-data-plan.md), [개발 규칙](development-rules.md), [동기화 규칙](sync-rules.md)을 함께 따른다. 공유 범위 확정 전에는 운영 장부를 옮기지 않는다.
