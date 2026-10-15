# Memoney Android 이식 작업

작성: 2026-10-13 · 작업 브랜치: `android_dev`

## 범위와 현재 판단

사용자가 기존 React 화면을 재사용하는 Capacitor 방식으로 착수하도록 승인했다. 이 단계는 에뮬레이터용 개발 APK와 빈 로컬 D1을 연결하는 작업이다. 공개형 앱의 인증·소유권·정책 전환이나 운영 D1 변경 승인은 포함하지 않는다.

현재 DB가 없는 것은 아니다. 기존 앱은 Cloudflare D1을 사용하며, D1 우선 저장 정책은 그대로 유지한다. 아직 준비되지 않은 부분은 공개 가입, 서버 인증, 사용자별 소유권과 계정별 캐시, 계정 삭제·내보내기 정책이다. [공개형 앱 계획](public-app-auth-plan.md), [0단계 기록](public-app-phase-0.md), [다중 사용자 설계](multi-user-data-plan.md)를 후속 작업의 기준으로 삼는다. 기록에 나온 2026-10-07 원격 상태를 오늘 재검증한 것으로 간주하지 않는다.

## 이번 개발 구성

2026-10-13 Google 로그인 화면 연결 후 현재 APK는 인증 시험 서버 5187의 `/signin`을 연다. 아래 5186 구성은 최초 빈 장부 시험 기록이다. 현재 실행·화면·검증 상태는 [Android Google 로그인](android-google-login.md)을 따른다.

- Capacitor 8.5.3, 앱 이름 `Memoney Dev`, Gradle 프로젝트 이름 `Memoney`, 시험 식별자 `com.mywallet.dev`.
- 기존 React 빌드 `dist`와 Pages Functions를 사용한다. 화면·저장 키·동기화 로직은 변경하지 않는다.
- 개발 앱은 `http://localhost:5186`을 열고, `adb reverse`로 PC의 loopback 서버에 연결한다. 기존 운영 API를 앱에 넣지 않는다.
- `scripts/android-sandbox.mjs`는 기존 검증기를 재사용해 원격 DB ID·remote 연결·추가 바인딩을 거부한다. 실제 실행 디렉터리에는 운영 설정과 `.dev.vars`를 복사하지 않는다.
- DB 상태는 `%LOCALAPPDATA%/Memoney/android-sandbox/<작업폴더 해시>`에 둔다. 기존 `.wrangler`, 기존 sandbox 및 개인 백업 복원본과 분리한다.
- 최초 실행에서만 `scripts/android-sandbox-schema.sql`을 적용한다. 검증된 백업에서 테이블 구조만 확인하여 작성한 11개 테이블·4개 인덱스이며, 개인정보와 INSERT·DROP은 없다. 운영 마이그레이션 파일로 사용하지 않는다.
- 기존 상태 폴더에 초기화 표식이 없으면 재초기화하지 않고 중단한다. SQL 실패 후 상태를 자동 삭제하지 않는다.
- 설치 도구는 전용 개발 서버 표식을 검사하고, 온라인 에뮬레이터가 정확히 하나일 때만 설치한다. 실기기를 자동 선택하지 않는다.
- HTTP 허용은 debug 매니페스트에 한정한다. Gradle release 작업은 이 단계에서 차단한다. 이 APK는 서버 없이 단독 사용하는 제품 APK가 아니다.
- Android 아이콘·스플래시는 Capacitor 개발 템플릿 상태다. 정식 Memoney 브랜딩 완료로 간주하지 않으며 기존 PWA 메타데이터와 캔버스 로딩은 보존한다. 정식 아이콘 작업은 [로고 지침](pwa-logo-guidelines.md)에 따라 별도로 검증한다.

## 실행 절차

Node 22 이상, Android SDK, JDK 21을 준비한다. 현재 PC의 Node는 24.14.1이다. Android Studio 내장 JDK 25는 생성된 Gradle 8.14.3과 호환되지 않아 별도 JDK 21을 사용한다. 시스템 JAVA_HOME을 바꾸지 않는다.

`MYWALLET_JAVA_HOME` 또는 호환되는 `JAVA_HOME`을 지정할 수 있다. 실행 도구는 `.android-tools/jdk21/<JDK 폴더>`도 탐색한다. `.android-tools`는 Git에서 제외한다. 현재 PC에는 Adoptium 공식 API에서 받은 JDK 21 ZIP을 SHA-256 대조 후 이 폴더에 압축 해제한다.

1. Orca에서 `Medium_Phone`을 실행한다. ADB 인증이 필요하면 시험 기기 화면에서 이 PC를 허용한다.
2. 프로젝트 터미널 하나에서 개발 서버를 시작하고 유지한다.

   ```powershell
   npm ci
   npm run android:server
   ```

3. 다른 터미널에서 웹 빌드·Capacitor 동기화·debug APK 빌드·설치·실행을 진행한다.

   ```powershell
   npm run android:run
   ```

4. APK만 만들려면 `npm run android:build`, 웹 자산 동기화만 하려면 `npm run android:sync`를 사용한다. APK 경로는 `android/app/build/outputs/apk/debug/app-debug.apk`다.
5. 다음 날에도 같은 절차로 시작한다. 개발 서버가 꺼져 있으면 앱은 로컬 화면을 불러올 수 없다. 서버 재시작은 같은 시험 DB를 사용하며 초기화를 반복하지 않는다. `adb install -r`는 재설치 시 앱 데이터를 유지한다. 데이터 삭제·앱 제거는 이 절차에 없다.

Android Studio로 열 때는 저장소의 `android` 폴더를 열고 Gradle JDK를 동일한 JDK 21로 지정한다. `local.properties`, 빌드 결과, 서명 키는 Git에 넣지 않는다.

## 다음 단계와 결정 항목

| 단계 | 작업 | 완료 기준 |
| --- | --- | --- |
| 개발 APK | 설치·재실행·모바일 레이아웃, 키보드·뒤로가기·파일 내보내기 확인 | 에뮬레이터에서 기본 동작과 시험 DB 저장 확인 |
| 원격 시험 환경 | 운영과 분리된 비공개 스테이징 D1·Pages 준비 | 운영 DB ID가 시험 설정에 없고 복원 절차 검증 |
| 인증 | 로그인 제공자·최초 로그인 수단 결정, PKCE·시스템 브라우저 복귀 설계 | 미인증 장부 API 거부, 세션 만료·로그아웃 처리 |
| 사용자별 DB | 서버 검증 user_id, 소유권·고유 키·참조·변경 커서 범위 수정 | 두 시험 계정의 교차 읽기·쓰기·삭제·참조 모두 차단 |
| 캐시·동기화 | 계정별 캐시·보류 작업·백업 분리 | A→B→A 전환과 오프라인 재시도에서 데이터가 섞이지 않음 |
| 정책·출시 | 내보내기·탈퇴·백업 보존·개인정보·지원 채널 및 출시 지역 결정 | 정책 확정, 실기기 검증, 공개 전환의 명시적 승인 |

2026-10-13 사용자는 **Google 로그인부터 시작**하기로 결정했다. SMS 휴대폰 인증은 첫 로그인 범위에 넣지 않는다. Google 로그인 수단 선택은 Firebase 등 별도 인증 서비스 채택이나 유료 계약 승인과 구별한다. 제공자 구성·OAuth 클라이언트·리다이렉트 URI·시스템 브라우저 복귀·계정 매핑은 후속 설계에서 구체화한다.

남은 결정은 인증 제공자 구성, 기존 장부를 받을 계정, 초대형 베타 범위, 삭제·내보내기·백업 보존 정책이다. 현재 개발 앱에는 임의의 정책을 구현하지 않는다. 기존 데이터를 첫 가입자에게 자동 귀속하지 않는다.

2026-10-13 후속 작업에서 Google 토큰·세션 검증과 장부 공유 권한의 서버 기반을 준비했다. 실제 로그인 설정과 금융 데이터 격리는 진행 전이다. 공유 요청에 따른 설계 방향·설정 절차·확인 대기는 [Google 로그인·공유 1단계 기록](google-auth-sharing-phase-1.md)을 따른다.

공식 참고: [Capacitor 설치](https://capacitorjs.com/docs/getting-started), [개발 환경](https://capacitorjs.com/docs/getting-started/environment-setup), [개발용 server 설정](https://capacitorjs.com/docs/config), [Adoptium ZIP 설치·검증](https://adoptium.net/installation/archives).

## 검증 기록

- 기존 웹 빌드 및 PWA 검사 통과.
- 기존 sandbox 설정·복원·API 도구 시험 총 6개 통과.
- 별도 로컬 D1 생성 성공, 실제 API의 초기 거래·자산 0건과 전용 환경 표식 확인.
- `npm run android:build` 성공. Gradle 8.14.3·JDK 21로 debug APK 생성, 필요한 Android SDK Platform 36·Build Tools 35 설치.
- `node scripts/android-dev.mjs run`으로 에뮬레이터 설치·실행 성공. Orca의 Connected 화면에서 MyWallet의 빈 대시보드 확인.
- WebView 주소 `http://localhost:5186/`, 새로고침 후 `/api/data` 응답 200, JavaScript 실행 오류 0, 가로 넘침 없음. 화면 증거는 Git 제외 경로 `android/build/mywallet-android-dashboard.png`에 저장.
- `node scripts/check-android-sandbox-api.mjs` 통과: 시험 거래 생성, 동일 operation 재시도 중복 방지, 수정, 증분 조회, 삭제. 합성 거래만 사용하며 삭제 이력은 시험 DB에 남는다. 개인 장부를 조회·수정하지 않는다.
- `assembleRelease`가 의도한 차단 메시지로 실패하는 것을 확인했다. 배포 APK는 아직 만들지 않는다.
- 문서 UTF-8 및 `git diff --check` 확인. 기존 텍스트 파일의 CRLF 유지.
- 남은 검증: 실기기, 뒤로가기·키보드·파일 내보내기·오프라인 재시도, 정식 아이콘/스플래시, 인증·계정 격리. npm audit에는 개발 도구 의존성을 포함해 9건(높음 5·보통 4)이 보고됐으며 출시 전 별도 의존성 점검이 필요하다. 이번 이식에서 무관한 패키지를 강제 업데이트하지 않았다.
