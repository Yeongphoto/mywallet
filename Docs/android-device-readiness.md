# Memoney 실기기·실제 Google 로그인 사전 점검

2026-10-23 · `android_dev` · 실기기 로컬 저장 검증 완료, 실제 계정 로그인은 미검증

## 이번 확인 결과

`npm run android:device:check`는 연결 상태와 **빌드된 APK 자체**의 패키지·SDK·서명을 읽는다. 기기 선택, 설치, 실행, 강제 종료, 데이터 초기화, 네트워크 로그인, DB 조회와 배포를 수행하지 않는다. 준비가 안 된 경우 0이 아닌 종료 코드로 알린다. 준비 검사 자체의 실패와 미완료 항목을 구분한다.

- 최초 사전 점검 당시 ADB 연결은 에뮬레이터 1대, 실제 기기 0대였다. 이후 사용자가 USB 디버깅을 승인해 삼성 `SM_F971N` 1대가 연결됐으며 아래 별도 검사 결과를 추가했다.
- APK 서명 검증 성공: `com.memoney.probe`, `versionCode=1`, `0.1.0-probe`, debug, min SDK 24 / target SDK 36.
- APK에서 읽은 SHA-1: `A6:38:48:B2:17:F2:77:99:5D:54:10:D3:82:58:38:1E:09:E4:E9:BA`.
- 검증 서버는 `http://127.0.0.1:5198`. `isolated-probe-token`만 인정하는 메모리 SQLite fixture다. 실제 Google 계정용 서버가 아니며 실제 ID 토큰을 이 서버에 전송해 로그인 완료로 판단하면 안 된다.
- 정식 `com.memoney.app`의 Android OAuth client·Play 앱 서명 SHA-1·업로드 키·새 서버 배포·origin 이전 검증은 여전히 미완료다. 검사 도구는 준비 플래그를 변경하지 않는다.

APK 지문은 빌드마다 재확인한다. 이 공개 debug 인증서 지문을 Play 앱 서명 인증서나 업로드 키 지문으로 등록하지 않는다. 원본 keystore나 비밀번호는 읽거나 출력하지 않는다.

## 사용자에게 필요한 다음 작업: 실제 기기 연결

1. Android 기기에서 개발자 옵션과 USB 디버깅을 켜고 데이터 전송 가능한 USB 케이블로 PC에 연결한다.
2. 기기에 표시되는 이 PC의 USB 디버깅 연결 승인을 확인한다. 잠금 해제와 승인 자체는 사용자가 수행한다.
3. `npm run android:device:check`로 실제 기기가 승인된 `device` 상태인지 확인한다. `unauthorized`와 `offline`은 검증 가능한 연결이 아니다.

연결됐다고 자동 설치하지 않는다. 다음 설치 단계에서 해당 실제 기기를 명시하고 **별도 검증 패키지만** 대상으로 삼는다. 기존 개발 앱/설치 앱을 삭제하거나 데이터를 초기화하지 않는다. 우선 비로그인 합성 거래만 사용해 등록·수정·삭제 → 저장 완료 → 즉시 종료 → 재실행, 오프라인 실행, JSON 백업/복원과 7일 복구를 확인한다. 기존 검사는 에뮬레이터만 허용하므로 `android:bundle:test`의 기기 제한을 제거해 실기기에 그대로 돌리지 않는다.

## Google Cloud에 필요한 값과 순서

기존 프로젝트는 `memoney-511500`이다. 기존 개발용 `com.mywallet.dev` Android client와 공통 Web audience는 보존한다.

검증 패키지로 실제 Google 로그인까지 할 경우 **별도 Android client**가 필요하다. 후보 입력값은 다음과 같으며 아직 생성·저장하지 않았다.

| 항목 | 검증 앱 후보 값 |
| --- | --- |
| 유형 | Android |
| 표시 이름 | Memoney Bundle Probe Debug |
| 패키지 | `com.memoney.probe` |
| SHA-1 | 위 APK에서 검증한 공개 debug 지문 |

그 client는 검증 서버의 `AUTH_GOOGLE_ANDROID_CLIENT_ID`와 검증 앱 구성에만 연결한다. 기존 개발 client ID를 이름만 바꿔 재사용하지 않는다. 서버가 실제 Google 서명·issuer·audience·nonce·authorized party를 검증하는 **분리된 시험 DB 구성**을 먼저 준비해야 하며, 현재 합성 토큰 fixture의 검증기를 실제 토큰 허용 우회로 바꾸지 않는다. 계정 선택·동의는 사용자가 수행하고 토큰·쿠키·개인 계정을 로그나 Git에 남기지 않는다.

정식 패키지 `com.memoney.app`에는 나중에 **Play 앱 서명 SHA-1**로 별도 Android client를 준비한다. 공통 Web client audience는 `367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com`으로 유지한다. 정식 웹 origin은 `https://memoney-6r5.pages.dev`이며 기존 Web client의 승인된 JavaScript 원본에 추가해야 한다. `/signin` 경로나 임의 redirect URI를 붙이지 않는다. 콘솔 등록과 실제 서버 배포는 이 사전 점검으로 실행하지 않는다.

Google의 [Android 클라이언트 인증 안내](https://developers.google.com/android/guides/client-auth), [Credential Manager 구성 실습](https://codelabs.developers.google.com/sign-in-with-google-android), [웹 원본 설정 안내](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)를 기준으로 패키지/인증서와 Web audience를 구분한다. 콘솔의 현재 등록 여부·Audience·시험 사용자는 별도 확인 대상이며 과거 문서의 상태를 최신으로 단정하지 않는다.

## 이번 단계의 검증

- `npm run check:android-device`: 파서·기기 구분·서명 실패·패키지 혼동·합성 인증 오인 차단·기기 일련번호 비노출 6건 통과.
- `npm run android:device:check`: SDK 도구로 실제 APK 서명과 패키지를 확인했고, 실기기 부재와 실제 Google 로그인 미준비를 보고했다. 미완료이므로 0이 아닌 종료가 정상이다.
- 앱 소스·운영 서버·Google 콘솔·DB와 기존 설치 앱은 변경하지 않았다. APK를 새로 만들거나 다른 기기에 설치한 단계가 아니다.

## 후속 실기기 검사 — 공유장부 보호

사용자는 USB 연결을 승인하면서 실제 사용하는 공유장부를 보호하라고 명시했다. 삼성 `SM_F971N`에 별도 `com.memoney.probe`(메머니 검증)만 설치했다. APK 내부 `assets/capacitor.config.json`을 ZIP에서 읽어 `server.url`이 없고 API backend가 `http://127.0.0.1:5198`뿐임을 먼저 확인했다. 기존 `com.mywallet.dev` 등 사용자 앱의 설치·실행·강제 종료·데이터 정리는 하지 않았다.

재현 스크립트는 `scripts/check-physical-local-probe.mjs --serial <승인된 실기기 일련번호>`다. 이미 별도로 확인·설치한 검증 앱만 대상으로 한다. 기기를 자동 선택하거나 기존 에뮬레이터 검사의 제한을 풀지 않는다. 검증 앱의 `/guest`와 비로그인 로컬 모드를 확인하며 Google 로그인·공유장부 연결·직접 금융 API 호출은 하지 않는다. fixture 서버를 시작하거나 ADB reverse를 만들지 않았고, 휴대폰 네트워크 설정도 바꾸지 않았다.

결과:

1. 고유 이름의 합성 현금 자산과 1,234원 거래를 등록 모달로 생성.
2. 저장 완료 직후 검증 패키지만 강제 종료 → 재실행: 같은 guest UUID와 거래 ID/금액 유지.
3. 해당 합성 거래의 제목 수정 → 저장 완료 직후 종료 → 재실행: 같은 ID에 수정값 유지.
4. 해당 합성 거래만 삭제 → UI에 삭제 완료가 반영된 직후 종료 → 재실행: 부활하지 않음.
5. 검사 전후의 나머지 거래·자산·계획·정기 규칙·삭제 표식 배열이 같음을 대조. 정상 공유장부를 읽어 대조한 것이 아니라 **검증 앱의 로컬 합성 데이터만** 대조했다.

첫 시도의 수정 자동화는 모바일의 세 번 클릭이 전체 선택으로 작동하지 않아 제목이 이어 붙었다. 앱 저장 유실이 아닌 검사 입력 실패였다. 입력의 전체 선택 범위를 명시한 뒤 새 합성 기록으로 전체 검사를 다시 수행해 통과했다. 첫 시도 합성 기록과 합성 자산은 증거 보존을 위해 검증 앱에 남겼으며 사용자 앱 데이터와 무관하다.

스크린샷과 검사 전후 합성 JSON은 PC의 `%LOCALAPPDATA%/Memoney/web-ui-checks/<실행 PID>/`에만 보관한다. 실기기 일련번호와 백업은 Git에 넣지 않는다. 앱과 에뮬레이터는 열어 둔다. 재사용 가능한 기기 선택 보호 검사도 추가했다. JSON 파일 선택기 백업/복원·7일 복구의 실기기 UI·실제 Google 로그인·앱웹 공유장부 교차 저장은 이번 검사에 포함하지 않았다.

관련: [출시 체크리스트](android-release-checklist.md), [번들 APK 검증](android-bundle-probe.md), [기기 기록 내구성](local-guest-durability.md), [출시 서버 준비](android-release-server.md).
