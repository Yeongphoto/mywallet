# Android와 기존 웹앱 가계부 공동 사용

작성: 2026-10-13 · 브랜치: `android_dev`

2026-10-14 최신 테스트 APK는 `https://memoney-android-test.pages.dev`에 직접 연결한다. 아래 localhost 구성은 이전 개발 연결 기록이다. 새 HTTPS 시험 서버는 별도 인증·초대 DB를 사용하며 기존 금융 원본으로 연결한다. 기존 웹앱을 재배포하거나 금융 스키마를 변경하지 않았다. [최신 APK와 받은 초대 팝업](android-invitation-test.md)을 따른다.

사용자는 기존 `syh4472` 기록을 가져오고 여자친구가 사용 중인 웹앱도 그대로 이용하도록 요청했다. Android 개발 앱을 기존 웹 API `https://mywallet-8mx.pages.dev/api/data`에 연결했다. 두 앱은 같은 원격 D1 기록을 사용하며, 기존 웹앱 배포·DB 스키마·저장 프로토콜을 변경하지 않았다.

| 경로 | 금융 데이터 흐름 |
| --- | --- |
| 기존 웹앱 | 기존 Pages API → 기존 원격 D1 |
| Android 개발 앱 | Google 로그인 → 로컬 세션·장부 권한 확인 → 같은 Pages API → 같은 원격 D1 |

## 연결 동작

연결된 계정은 `/signin`에서 세션과 장부 권한 확인 후 `/wallet`로 자동 이동한다. 가계부는 기존 `App.tsx`를 사용하고, 설정 → 환경에 공동 사용 안내와 로그아웃을 추가했다.

`server/wallet/shared-web.ts`는 로컬 개발 환경에서만 동작한다. 고정 장부 membership을 확인한 뒤 GET·PATCH를 전달한다. viewer 쓰기, 권한 없는 계정, 미인증 요청, 다른 Origin의 PATCH와 전체 snapshot POST를 거부한다. 대상 URL은 서버 설정으로 고정한다. Google 토큰·세션 쿠키·클라이언트 소유자 헤더는 기존 웹 API로 보내지 않는다.

`.android-tools/shared-wallet.json`은 공개 origin·실제 로그인으로 확인한 사용자 UUID·연결 장부 UUID만 보관한다. Git 제외이며 토큰·금융 행을 저장하지 않는다. 연결 생성 도구는 기존 파일을 덮어쓰지 않는다. 서버 시작 시 지정한 활성 사용자에게만 로컬 장부 metadata와 owner membership을 추가하며 신규 가입자에게 자동으로 권한을 주지 않는다. 원격 금융 DB의 소유권을 변경하는 마이그레이션은 아니다.

현재는 기존 하나의 공유 가계부에 연결한다. 기존 웹 API의 접근 방식은 유지하며, 웹 Google 로그인·공개 가입·여러 개인 장부 격리를 완성한 상태는 아니다. 여자친구의 현재 웹앱 사용에는 추가 Google 가입이 필요하지 않다.

## 캐시와 저장

Android의 cache·복구 후보·보류 거래 작업·동기화 커서·장치 설정은 `memoney:user:<사용자 UUID>:ledger:<장부 UUID>:` 아래에 둔다. 기존 웹 경로에서는 기존 `mywallet:*` 키를 유지한다. 전역 cache를 로그인 계정에 복사하지 않는다.

보류 snapshot 플래그나 거래 operation queue가 있으면 preload로 덮어쓰지 않는다. 첫 금융 조회 실패 시 빈 장부를 열지 않는다. 세션·권한 상실과 로그아웃은 화면을 숨기고 이후 금융 요청을 차단한다. 보류 작업은 원래 계정·장부 범위에 보존한다.

PATCH의 UTF-8 본문, operation ID, revision, 409 충돌과 증분 cursor를 보존한다. 기존 Worker 호환 날짜에서 지원하는 `redirect: manual`과 cache 방지 헤더를 사용하고 리다이렉트를 거부한다. [Workers Fetch 문서](https://developers.cloudflare.com/workers/runtime-apis/fetch/)를 참고한다.

## 실행과 검증

```powershell
npm run android:server
npm run android:run
npm run check:auth
```

개발 APK는 PC의 로컬 서버와 ADB 연결을 사용한다. 서버 없이 실기기에서 사용하는 출시 APK까지 구성한 상태는 아니다. 기존 웹앱은 기존 HTTPS 주소에서 계속 사용할 수 있다.

- 인증·클라이언트·공동 사용·캐시 시험 24개 통과.
- 시험 DB에서 기존 웹 핸들러와 Android 경로를 연결해 생성·중복 재시도·다른 기기 수정·409 충돌·증분 조회·삭제를 확인했다. 운영 장부에 시험 거래를 만들지 않았다.
- 실제 Android 장부 권한 200, 금융 API 200과 가계부 화면을 확인했다. API 응답 전체 SHA-256을 기존 웹 API와 비교해 동일함을 확인했다. 금융 행은 검증 로그에 출력하지 않는다.
- 실제 로그아웃 후 세션 401과 로그인 화면 복귀, 본인 계정 재로그인 후 `/wallet` 자동 진입과 금융 API 200을 확인했다.
- 웹 TypeScript·Vite·PWA와 Gradle debug APK 빌드 통과. 모바일 가로 넘침과 깨진 이미지 없음.

관련 기록: [Android 로그인](android-google-login.md), [Google 설정](google-cloud-setup.md), [Google 로그인·공유 기반](google-auth-sharing-phase-1.md).
