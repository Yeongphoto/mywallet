# Memoney Google 로그인 설정

작성: 2026-10-13 · 작업 브랜치: `android_dev`

최신 상태: [Android와 기존 웹앱 공동 사용](android-web-shared-wallet.md). 본인 로그인 계정으로 기존 웹앱의 원격 장부에 연결하고 실제 로그아웃·재로그인 후 가계부 진입까지 확인했다. 기존 웹앱은 현재 사용 방식을 유지한다.

## 현재 확인한 상태

- Google Cloud 프로젝트 이름: `memoney`.
- 프로젝트 ID: `memoney-511500`. 콘솔의 현재 URL과 프로젝트 선택 표시에서 확인했다.
- 앱 코드의 npm 이름: `memoney`. Gradle 프로젝트와 문서 표시: `Memoney`. Android 개발 앱: `Memoney Dev`.
- 개발 Android package: `com.mywallet.dev`. 표시 이름 변경은 새 package 생성이나 데이터 이전이 아니다. 저장 키와 운영 D1 연결은 유지한다.
- Google Auth Platform 초기 설정의 App Information, Audience, Contact Information을 입력했다. 앱 이름은 `Memoney`, 지원·연락처는 콘솔의 현재 로그인 계정, 대상은 `External`이다.
- 사용자가 정책 동의와 Create를 완료했고, 콘솔의 `OAuth configuration created!`와 Overview에서 초기 설정 완료를 확인했다.
- Web 클라이언트 `Memoney Local Web`, Android 클라이언트 `Memoney Android Debug`를 생성했다. 콘솔의 생성 완료 안내와 Clients 목록에서 두 이름·유형을 확인했다.
- Audience의 `External / Testing`과 본인 계정의 Test users 등록을 확인했다. 여자친구 계정은 아직 등록하지 않았다.
- 발급한 Web client ID로 별도 로컬 인증 서버를 시작했다. 후속 작업에서 [Android 로그인 화면과 네이티브 연결](android-google-login.md)을 구현했다. 사용자가 기기에 계정을 추가한 뒤 실제 Google 토큰 검증·앱 로그인·서버 세션 200·앱 재시작 후 세션 유지를 확인했다.
- OAuth 설정은 로그인 제공자 구성이다. 금융 데이터의 기준 저장소는 기존 Cloudflare D1이다.

## 1. 초기 설정 완료

[현재 프로젝트의 Google Auth Platform](https://console.cloud.google.com/auth/overview?project=memoney-511500)을 연다.

2026-10-13 사용자가 [Google 사용자 데이터 정책](https://developers.google.com/terms/api-services-user-data-policy) 동의와 초기 설정 생성을 완료했다. Audience에서 Testing 상태를 확인했다. 공개 전환은 이번 단계에 포함하지 않는다.

처음부터 입력해야 할 경우:

| 항목 | 입력값 |
| --- | --- |
| App name | `Memoney` |
| User support email | 본인 Google 계정 이메일 |
| Audience | `External` |
| Contact Information / Email addresses | 본인 Google 계정 이메일 |

Audience의 Test users에는 우선 본인 시험 계정을 등록한다. 여자친구 계정은 이메일을 확인한 뒤 시험 대상으로 추가한다. 시험 사용자 등록이 장부 공유 권한을 부여하지는 않는다.

이번 작업에서는 본인 계정 한 개를 등록하고 Audience 목록에서 확인했다. 개인 이메일은 이 문서에 기록하지 않는다.

## 2. 서버용 Web 클라이언트

[Clients](https://console.cloud.google.com/auth/clients?project=memoney-511500) → Create client로 만든다.

| 항목 | 입력값 |
| --- | --- |
| Application type | `Web application` |
| Name | `Memoney Local Web` |
| Authorized JavaScript origins | `http://localhost`와 `http://localhost:5187` |
| Authorized redirect URIs | 현재 ID 토큰 콜백 방식에는 입력하지 않는다 |

웹 origin은 scheme·호스트·포트까지만 입력한다. `/api/auth/google` 같은 경로를 origin에 붙이지 않는다. 현재 5187은 인증 시험 서버이며 `/signin`의 네이티브 로그인 화면과 연결되어 있다. 일반 브라우저에서는 해당 화면 미리보기만 제공한다.

네이티브 로그인도 서버 검증 audience로 이 Web client ID를 사용한다. Web client ID의 `.apps.googleusercontent.com`으로 끝나는 공개 식별자를 로컬 인증 서버에 설정한다. Client Secret은 이 ID 토큰 검증 방식에서 필요하지 않으며 채팅·Git·APK에 저장하지 않는다. 내려받은 클라이언트 JSON에 secret이 포함될 수 있으므로 공유하지 않는다.

발급한 공개 Web client ID: `367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com`.

```powershell
$env:MYWALLET_GOOGLE_CLIENT_ID = '367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com'
npm run auth:server
```

현재 터미널의 실행에만 적용한다. 기존 인증 서버가 실행 중이면 해당 프로세스를 종료한 뒤 다시 실행하여 적용한다. 운영 설정이나 기존 `.dev.vars`를 덮어쓰지 않는다.

후속 로그인 화면 구현에서 공개 개발 Web client ID를 `capacitor.config.json`에 기록했고 인증 서버의 기본값도 연결했다. 이제 기본 실행은 환경변수 없이 `npm run android:server`로 가능하다.

## 3. 개발 Android 클라이언트

같은 프로젝트의 Clients → Create client에서 만든다.

| 항목 | 입력값 |
| --- | --- |
| Application type | `Android` |
| Name | `Memoney Android Debug` |
| Package name | `com.mywallet.dev` |
| SHA-1 certificate fingerprint | `A6:38:48:B2:17:F2:77:99:5D:54:10:D3:82:58:38:1E:09:E4:E9:BA` |

위 SHA-1은 2026-10-13 이 PC의 기본 Android debug keystore에서 확인한 인증서 지문이다. 다른 PC·새 debug 키·release 서명에는 다시 확인해야 한다. 앱 이름 `Memoney Dev`와 package name은 서로 다른 항목이다.

Android 클라이언트 ID를 서버의 Web client ID 자리에 넣지 않는다. 출시 package와 release 서명은 출시 준비 때 별도로 정한다.

발급한 공개 Android client ID: `367615872651-q007dfm9n7hf0q3jj62mepc50bhsoc4h.apps.googleusercontent.com`.

서버 audience는 Web client ID로 유지한다. 실제 Android 토큰의 `azp`는 Android client ID이므로, 개발 서버는 `AUTH_GOOGLE_ANDROID_CLIENT_ID`에 위 식별자를 별도로 허용한다. `capacitor.config.json`의 `plugins.MemoneyGoogleAuth.androidClientId`에서 읽으며 임의의 Android 클라이언트를 허용하지 않는다.

## 연결 확인

별도 포트 5187의 기존 인증 시험 서버만 종료·재실행했다. Android 장부 시험 서버 5186과 기존 `.wrangler`는 유지했다. 로컬 D1의 초기화 SQL을 다시 실행하거나 금융 데이터를 이전하지 않았다.

| 확인 | 결과 |
| --- | --- |
| `GET /api/auth/config` | 200, `enabled: true`, 발급한 Web client ID 일치 |
| `GET /api/auth/session` | 401, 미인증 |
| `POST /api/auth/challenge`, Origin `http://localhost:5187` | 200, 64자 nonce와 challenge 쿠키 발급 |
| `GET /api/data` | 401, 미인증 장부 접근 거부 |

위 표는 계정 추가 전 익명 요청 결과다. 후속 실제 계정 시험에서는 Google 계정 선택 후 서버 검증과 쿠키 세션 생성이 성공했고, Android WebView의 `/api/auth/session`은 200을 반환했다. 앱 강제 종료·재실행 후에도 로그인 완료 화면과 세션 200을 확인했다. 장부 데이터는 아직 연결하지 않았다.

## 다음 작업

1. 실제 기기 로그아웃과 Credential Manager 상태 정리, 두 계정 전환을 추가 검증한다. 본인 계정 로그인·서버 세션·앱 재시작 후 세션 유지는 확인했다.
2. [Google 로그인·공유 1단계](google-auth-sharing-phase-1.md)에 따라 장부별 금융 API와 캐시를 격리한 후 두 시험 계정으로 검증한다. 기존 장부 이전과 공유 범위는 별도로 확정한다.

공식 안내: [Google 웹 클라이언트 설정](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Android Google 로그인 설정 실습](https://codelabs.developers.google.com/sign-in-with-google-android), [Android Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg).
