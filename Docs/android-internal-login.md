# Play 내부 테스트의 기존 장부 연결

2026-10-24 사용자 요청: 설치한 내부 테스트 앱에서 Google 로그인 후 기존 Android 장부를 이어서 사용한다. 새 DB나 금융 데이터 복사본을 만들지 않는다.

## 확인한 원인

첫 AAB `1 (0.1.1)`은 아직 배포하지 않은 정식 API `https://memoney-6r5.pages.dev`를 사용했다. 조사 당시 `/api/auth/config`는 522였고, 기존 `https://memoney-android-test.pages.dev/api/auth/config`는 정상 응답했다. 사용자도 첫 내부 테스트 설치 후 Google 로그인 외의 로컬 동작을 확인했다.

## 내부 테스트 연결

- 정식 패키지 `com.memoney.app`과 번들 origin `https://localhost`는 유지한다. 기존 설치 앱을 지우지 않고 Play 업데이트한다.
- `config/android-internal.json`이 내부 테스트 전용 API를 기존 서버로 고정한다. 정식 출시 프로필과 개발 앱 설정은 바꾸지 않는다.
- 네이티브 전송은 정식 패키지 + 명시적 `hostedInternalTest=true` + 정확한 HTTPS 호스트일 때만 기존 서버를 허용한다. 임의 호스트나 loopback을 허용하지 않는다.
- 공통 DB는 인증 `ec28198a-6040-4074-a142-1cf6f76c7f15`, 개인 `a4113709-d951-4b50-aa78-cc80eb7cda9f`, 공유 `0a69096e-4d87-423e-b4a2-6afc0fb94698` 그대로다.
- 동일한 Google issuer/subject는 기존 user ID와 소유·참여 장부 UUID를 사용한다. 이메일로 계정을 합치거나 기존 금융행을 이관하지 않는다. 개발 앱과 Play 앱은 로그인 세션/로컬 저장이 별개이므로 다시 로그인하는 것은 정상이다.
- 공통 최초 이전 기능은 별도 조정 배포 전까지 비활성 상태를 유지한다. 이 내부 테스트 업데이트가 로컬 장부를 서버에 합치는 흐름을 다시 켜지는 않는다.

## Google Cloud 실제 등록

프로젝트 `memoney-511500`에 `Memoney Play Signing` Android client를 만들었다.

- 패키지: `com.memoney.app`.
- Play 배포 인증서 SHA-1: `63:40:F9:64:75:7C:FF:30:84:0E:93:09:F7:6D:6A:8C:6F:6D:B9:93`.
- Android client: `367615872651-8l3ik6ilrmratp13iagl8ucnas1m6gnh.apps.googleusercontent.com`.
- 공통 Web audience: `367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com` 유지.
- Play Console에서 다운로드한 인증서 ZIP의 `deployment_cert.der`를 직접 읽었고 SHA-256은 Console의 Digital Asset Links 표기와 같았다. 업로드 키/debug 키를 대신 사용하지 않았다.

ZIP에는 향후/혼합 서명 인증서도 있었다. 이 첫 등록만으로 모든 서명 변형을 검증했다고 주장하지 않는다. 실제 Play 설치 패키지의 서명과 로그인을 기기에서 확인하고 필요 시 해당 인증서에 대응한 client를 추가한다.

## 서버 변경 범위

기존 `AUTH_GOOGLE_ANDROID_CLIENT_ID`를 보존하고 추가 `AUTH_GOOGLE_ANDROID_CLIENT_IDS`의 쉼표 구분 목록을 명시적으로 허용한다. 와일드카드·빈 항목·잘못된 형식·10개 초과는 거부하며 Web audience·nonce·Google 서명 검증은 유지한다.

운영 중인 기존 Android 서버의 금융 로직을 최신 브랜치로 일괄 교체하지 않는다. `scripts/prepare-internal-auth-runtime.mjs`는 마지막 실제 배포인 `f60af397-1d64-45ad-823c-eb4c580fc724`의 동결 runtime을 복사하고, 원격 HTML과 동결본이 같은지 확인한다. 변경 파일은 `server/auth/http.ts`, `server/auth/android-clients.ts`, `wrangler.json` 세 개뿐이다. 모든 기존 정적 자산·금융 처리기·라우트는 바이트 단위로 대조한다. SQL·seed·`.wrangler` 상태를 복사하거나 실행하지 않는다.

검증: 인증 50건(개발/Play 클라이언트로 같은 사용자 ID 반환 포함), 내부 빌드 구성 3건, 웹 production 빌드, 실제 Cloudflare Functions 컴파일 통과. 실제 기기 Google 로그인과 실장부 조회는 별도로 확인해야 한다.

인증 설정 패치는 `bcbf52d` 기준으로 기존 Android 서버에 배포했다: `a5d4d7cd.memoney-android-test.pages.dev`. 업로드한 정적 파일은 0개였으며 배포 후 canonical HTML의 SHA-256이 동결본과 같았다. `/api/auth/config` 200, 비로그인 `/api/auth/session` 및 `/api/data` 401을 확인했다. 금융 DB 조회·수정·스키마 작업은 실행하지 않았다.

## 업데이트

`node scripts/android-play-draft.mjs build-internal <새 versionCode>`로 기존 업로드 키를 사용하는 AAB를 만든다. 앱 ID·저장 키·로컬 기록은 유지한다. 사용자 미추적 APK/MSI/PDF는 네이티브/서버 산출물에 포함하지 않는다. Play Console 내부 테스트 트랙에 올린 뒤 기존 설치에서 업데이트한다. 결제·광고·최초 이전은 이 업데이트로 활성화하지 않는다.

수정 AAB `2 (0.1.2)`의 SHA-256은 `de3898f40b0a77a8e0ce2ac2c94df235ba5ed64e47dfcea0437fa784c8d55a3e`이다. Gradle Release 빌드와 서명 검증이 성공했다. 현재 USB 기기가 연결되지 않아 설치된 Play 패키지 서명·실제 Google 로그인은 아직 확인하지 못했다.
