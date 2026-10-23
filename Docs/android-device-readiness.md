# Memoney 실기기·실제 Google 로그인 사전 점검

2026-10-23 · `android_dev` · 실기기 로컬 저장 검증 및 검증용 OAuth 등록 완료, 실제 계정 로그인은 미검증

## 이번 확인 결과

`npm run android:device:check`는 연결 상태와 **빌드된 APK 자체**의 패키지·SDK·서명을 읽는다. 기기 선택, 설치, 실행, 강제 종료, 데이터 초기화, 네트워크 로그인, DB 조회와 배포를 수행하지 않는다. 준비가 안 된 경우 0이 아닌 종료 코드로 알린다. 준비 검사 자체의 실패와 미완료 항목을 구분한다.

- 최초 사전 점검 당시 ADB 연결은 에뮬레이터 1대, 실제 기기 0대였다. 이후 사용자가 USB 디버깅을 승인해 삼성 `SM_F971N` 1대가 연결됐으며 아래 별도 검사 결과를 추가했다.
- APK 서명 검증 성공: `com.memoney.probe`, `versionCode=1`, `0.1.0-probe`, debug, min SDK 24 / target SDK 36.
- APK에서 읽은 SHA-1: `A6:38:48:B2:17:F2:77:99:5D:54:10:D3:82:58:38:1E:09:E4:E9:BA`.
- 기존 `android:bundle:test` fixture는 `isolated-probe-token`만 인정하는 합성 인증용이다. 새 `android:probe:google-server`는 Google JWKS로 ID 토큰을 실제 검증하고 메모리 SQLite에만 인증 세션을 저장한다. `/api/auth/*` 외 모든 API를 거부하며 금융 DB에 연결하지 않는다.
- 정식 `com.memoney.app`의 Android OAuth client·Play 앱 서명 SHA-1·업로드 키·새 서버 배포·origin 이전 검증은 여전히 미완료다. 검사 도구는 준비 플래그를 변경하지 않는다.

APK 지문은 빌드마다 재확인한다. 이 공개 debug 인증서 지문을 Play 앱 서명 인증서나 업로드 키 지문으로 등록하지 않는다. 원본 keystore나 비밀번호는 읽거나 출력하지 않는다.

## 다음 작업: 실제 기기에서 Google 로그인

1. Android 기기에서 개발자 옵션과 USB 디버깅을 켜고 데이터 전송 가능한 USB 케이블로 PC에 연결한다.
2. 기기에 표시되는 이 PC의 USB 디버깅 연결 승인을 확인한다. 잠금 해제와 승인 자체는 사용자가 수행한다.
3. `npm run android:device:check`로 실제 기기가 승인된 `device` 상태인지 확인한다. `unauthorized`와 `offline`은 검증 가능한 연결이 아니다.

연결됐다고 자동 설치하지 않는다. 다음 설치 단계에서 해당 실제 기기를 명시하고 **별도 검증 패키지만** 대상으로 삼는다. 기존 개발 앱/설치 앱을 삭제하거나 데이터를 초기화하지 않는다. 우선 비로그인 합성 거래만 사용해 등록·수정·삭제 → 저장 완료 → 즉시 종료 → 재실행, 오프라인 실행, JSON 백업/복원과 7일 복구를 확인한다. 기존 검사는 에뮬레이터만 허용하므로 `android:bundle:test`의 기기 제한을 제거해 실기기에 그대로 돌리지 않는다.

## Google Cloud에 필요한 값과 순서

기존 프로젝트는 `memoney-511500`이다. 기존 개발용 `com.mywallet.dev` Android client와 공통 Web audience는 보존한다.

검증 패키지용 Android client를 Google Cloud 프로젝트에서 생성했고 콘솔의 패키지와 인증서 지문을 다시 확인했다.

| 항목 | 검증 앱 후보 값 |
| --- | --- |
| 유형 | Android |
| 표시 이름 | `Memoney Probe Debug` |
| 패키지 | `com.memoney.probe` |
| SHA-1 | `A6:38:48:B2:17:F2:77:99:5D:54:10:D3:82:58:38:1E:09:E4:E9:BA` |
| Android client ID | `367615872651-27d00itbvj65ak6pn5f32scgd2ks685t.apps.googleusercontent.com` |

검증 APK에는 이 Android client ID와 기존 Web audience를 함께 설정했고 다시 빌드했다. `android:probe:google-server`는 실제 Google 서명·issuer·audience·nonce·authorized party를 검증한다. 인증 저장소는 프로세스 메모리에만 존재하며 금융 API는 차단한다. 실제 계정 선택과 동의는 실기기에서 진행한다. 토큰·쿠키·개인 계정 정보는 로그나 Git에 남기지 않는다.

정식 패키지 `com.memoney.app`에는 나중에 **Play 앱 서명 SHA-1**로 별도 Android client를 준비한다. 공통 Web client audience는 `367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com`으로 유지한다. 정식 웹 origin은 `https://memoney-6r5.pages.dev`이며 기존 Web client의 승인된 JavaScript 원본에 추가해야 한다. `/signin` 경로나 임의 redirect URI를 붙이지 않는다. 콘솔 등록과 실제 서버 배포는 이 사전 점검으로 실행하지 않는다.

Google의 [Android 클라이언트 인증 안내](https://developers.google.com/android/guides/client-auth), [Credential Manager 구성 실습](https://codelabs.developers.google.com/sign-in-with-google-android), [웹 원본 설정 안내](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)를 기준으로 패키지/인증서와 Web audience를 구분한다. 콘솔의 현재 등록 여부·Audience·시험 사용자는 별도 확인 대상이며 과거 문서의 상태를 최신으로 단정하지 않는다.

## 이번 단계의 검증

- `npm run check:android-device`: 파서·기기 구분·서명 실패·패키지 혼동·합성 인증 오인 차단·기기 일련번호 비노출 6건 통과.
- `npm run check:android-google-probe`: 실제 Google verifier 구성에서 잘못된 토큰 거부와 금융 API 차단 1건 통과. 합성 토큰만 쓰는 기존 fixture 동작은 별도 유지한다.
- 검증 APK 빌드 성공, 서명 SHA-1이 등록값과 일치. Google Cloud에는 검증용 Android OAuth client만 추가했다. 운영 서버·공유 DB·기존 개발 OAuth client는 변경하지 않았다.
- 2026-10-23 실기기 `SM_F971N`에서 등록한 Android client로 Google 로그인을 완료했다. 격리 인증 서버에서 `/api/auth/session`이 200·authenticated로 확인됐고, 검증 화면은 `Google 로그인 확인 완료`를 표시했다. 금융 API 요청은 0건이었다.
- 처음에는 인증 후 일반 장부 연결 화면으로 넘어가려 했으나, 실데이터 보호를 위해 장부 컨텍스트/API를 막은 검증 서버가 의도대로 요청을 거부해 재연결 안내가 보였다. 검증 APK 전용 `?probe=google` 경로가 인증 성공을 표시하고 장부 API를 생략하도록 보완했다. 정식 앱 동작이나 실서버/공유 DB 연동을 검증한 것은 아니다.
- 검증 완료 후 메모리 인증 서버를 종료하고 이 도구가 추가한 `tcp:5198` reverse만 제거했다. 계정 이메일·토큰·쿠키는 기록하지 않았고, 공유 장부 및 금융 DB에 접근하지 않았다.

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

스크린샷과 검사 전후 합성 JSON은 PC의 `%LOCALAPPDATA%/Memoney/web-ui-checks/<실행 PID>/`에만 보관한다. 실기기 일련번호와 백업은 Git에 넣지 않는다. 앱과 에뮬레이터는 열어 둔다. 재사용 가능한 기기 선택 보호 검사도 추가했다. 이 최초 저장 검사는 JSON 파일 선택기와 복구 UI를 포함하지 않았으며, 다음 후속 검사에서 별도로 확인했다.

## 후속 JSON 파일·7일 복구 실기기 왕복 — 완료

같은 `SM_F971N`의 같은 `com.memoney.probe`에 남은 **합성 거래 1건·합성 자산 2개·금액 0의 계획 양식 15개**로 확인했다. 실제 사용하는 앱과 공유장부, 공통 DB에는 접근하지 않았다. 앱 소스·저장 정책·실제 배포는 변경하지 않았다.

- 원본 snapshot을 PC에 보관하고, 설정 → 데이터 → 로컬 백업에서 Android `ACTION_CREATE_DOCUMENT` 저장 창을 실제 사용했다. 다운로드에 고유한 `memoney-probe-roundtrip-<고유값>.json`을 만들었으며 기존 파일을 덮어쓰지 않았다.
- 휴대폰에 저장된 파일을 직접 읽어 `memoney-local` version 1과 전체 데이터가 원본과 같음을 확인한 **후에만** 초기화했다.
- 로컬 장부 초기화 확인란에 ‘초기화’를 입력하고 실행했다. 검증 앱만 강제 종료/재시작하여 거래·자산·정기·삭제 표식이 비었고, 새 복구 세대가 유지됨을 확인했다. 계획 15개는 앱이 다시 만드는 금액 0의 기본 카테고리 양식이며, 이전 금액이 부활한 것이 아니다.
- IndexedDB 보관본이 전체 원본과 일치하고 `expires_at-created_at`이 정확히 7일임을 대조했다. 기기 시간을 바꾸거나 7일을 실제로 기다린 검사는 아니다. 만료 경계는 기존 격리 검사 범위다.
- 설정의 해당 보관본에서 ‘복구’를 입력해 복구한 후 강제 종료/재시작했다. guest UUID 유지, 새 세대 전환과 전체 원본 일치를 확인했다. 복구 시각인 `updatedAt`만 비교에서 제외했다.
- JSON 복원이 무변경 재조회로 통과하지 않도록, 기존 합성 거래 한 건의 제목을 UI에서 별도로 수정하고 저장했다. Android 파일 선택기에서 앞서 저장한 **해당 고유 파일만** 선택하고 ‘로컬 백업 복원’을 확인했다.
- strict 내구성 사본에 원래 제목이 반영된 것을 읽은 후 검증 앱을 강제 종료했다. 재시작 후 JSON 원본 전체와 일치하고, 복원 직전의 수정본도 별도 `pre-restore` 원본에 남았음을 확인했다. 거래/자산만이 아니라 계획·설정·영수증 등 snapshot 전체를 비교했다.

재현 도구는 `scripts/check-physical-recovery.mjs --serial <승인된 기기> --phase <단계>`다. `export` 후 Android 창에서 저장하고 `verify-file → reset → recover`를 실행한다. 이어 `import`로 파일을 선택해 확인 창을 연 뒤 `prepare-import`로 취소하고 합성 차이를 만든다. 다시 `import`로 같은 파일을 선택한 뒤 `verify-import`로 실제 복원을 확인한다. Android 저장/선택 창은 `scripts/physical-document-dialog.mjs`의 제한된 제어로 다룬다. 초기화는 검증된 파일과 같은 guest UUID가 없으면 중단하며, 알 수 없는 금융 기록이나 사용자 자산은 합성 입력으로 인정하지 않는다. 재현 중 원본·파일·단계 상태는 Git 제외 `android/build/physical-recovery-session.json`과 PC 검사 산출물에 보존한다. 무관한 다운로드 파일은 선택하거나 수정하지 않는다. 문서 선택기의 임시 UI XML은 읽은 뒤 해당 임시 파일만 제거한다.

휴대폰 다운로드에 합성 JSON 백업이 남아 있고 검증 앱은 원본 합성 상태로 복원해 열어 뒀다. Google 로그인·공유장부 교차 저장·운영 DB 검증은 여전히 수행하지 않았다.

관련: [출시 체크리스트](android-release-checklist.md), [번들 APK 검증](android-bundle-probe.md), [기기 기록 내구성](local-guest-durability.md), [출시 서버 준비](android-release-server.md).
