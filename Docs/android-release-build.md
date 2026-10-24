# Memoney 출시용 네이티브 준비 경로

작성: 2026-10-23 · `android_dev`

## 현재 구현 범위

기존 개발 앱은 `com.mywallet.dev` / `Memoney Dev`를 유지한다. 출시 준비용 네이티브 프로젝트는 `android/build/memoney-preparation-<고유값>/android`에 따로 생성한다. 기존 Android 소스, 설치된 앱, 로컬 장부, DB, Google client를 덮어쓰지 않는다.

| 항목 | 개발 앱 | 출시 준비 프로젝트 |
| --- | --- | --- |
| applicationId | `com.mywallet.dev` | `com.memoney.app` |
| 기본 이름 | `Memoney Dev` | `Memoney` |
| 한국어 이름 | 기존 설정 유지 | `메머니` |
| 버전 | 9 / 0.3.4 | 1 / 0.1.0, 독립적으로 증가 |
| Java namespace | `com.mywallet.dev` | 기존 namespace 유지 |
| 화면 / API | 기존 Android 시험 주소 | 번들 `https://localhost` / API `https://memoney-6r5.pages.dev`, 운영 연결 미검증 |
| APK/AAB 생성·설치 | 기존 개발 절차 | 준비 전용 가드로 차단 |

Java namespace와 applicationId는 서로 다른 설정이다. Java 파일을 일괄 이동하지 않고 출시 준비 프로젝트의 applicationId만 바꾼다. Activity는 명시적인 `com.mywallet.dev.MainActivity`로 연결하며 FileProvider는 최종 applicationId의 `com.memoney.app.fileprovider`로 분리한다. [Android 공식 설정 안내](https://developer.android.com/build/configure-app-module).

## 실행

```powershell
npm run check:android-config
npm run android:release:prepare
npm run android:release:verify
```

- `prepare`는 매번 새 폴더를 만든다. 기존 폴더를 재사용·삭제하지 않는다.
- Git 추적 Android 소스만 복사하며, Cordova가 생성한 두 Gradle 파일만 명시적으로 추가한다. `.wrangler`, `local.properties`, 서명 키, 설치 앱 데이터, 사용자 PDF, 캐시된 웹 자산은 가져오지 않는다.
- node_modules는 기존 설치 경로를 참조한다. 새 패키지 설치나 의존성 업데이트는 하지 않는다.
- 출시 프로필의 구조 검사를 먼저 실행한다. 미완료 OAuth·서명 항목은 준비에 한해서 허용하지만, 개발용 Android OAuth client를 출시 설정에 넣을 수는 없다.
- `verify`는 JDK 21과 Android SDK를 사용해 Gradle 메타데이터와 `processDebugResources`를 검사한다. 이는 출시 식별자의 리소스·매니페스트 검사이며 배포 가능한 debug 앱을 만드는 작업이 아니다.
- `assembleDebug`와 `bundleRelease`가 실제로 실패하는지 확인한다. 기존 Release 가드도 유지한다. 키 생성, APK/AAB 생성·설치, 장부 API 호출, 서버 배포는 하지 않는다.
- 준비 프로젝트에는 실행 가능한 웹 자산을 복사하지 않는다. 원격 WebView 구조를 그대로 정식 배포하기 위한 도구가 아니다. 번들 화면 + 원격 API, 인증·쿠키·로컬 데이터 이전이 검증된 후 실제 빌드 경로를 확장한다.
- 개발 앱을 계속 빌드하려면 기존 `npm run android:build`를 사용한다. 출시 준비 생성물이 이 경로에 자동 적용되지 않는다.

## 서명 준비

현재 서명 키는 생성하지 않았으며 signingConfig도 활성화하지 않았다. 이후 업로드 키를 만들 때는 Git 밖의 안전한 경로와 별도 백업을 사용한다. Play 앱 서명 키와 개발 debug 키, AAB 업로드 키를 구분한다. [Android 앱 서명 안내](https://developer.android.com/studio/publish/app-signing).

입력 확인 명령:

```powershell
npm run android:signing:check
```

필요한 환경변수 이름:

- `MEMONEY_UPLOAD_KEYSTORE`: 업로드 키 파일 경로
- `MEMONEY_UPLOAD_KEY_ALIAS`: 업로드 키 별칭
- `MEMONEY_UPLOAD_STORE_PASSWORD`: 키 저장소 비밀번호
- `MEMONEY_UPLOAD_KEY_PASSWORD`: 키 비밀번호

비밀번호 값은 명령줄 인수, 커밋 파일, 콘솔 출력, 채팅에 남기지 않는다. 이 명령은 입력 누락과 debug 키 재사용을 검사할 뿐, 실제 인증서·개인 키의 유효성이나 백업 완료를 증명하지 않는다. 현재 값이 없으므로 실패하는 것이 정상이다.

Google Cloud Android OAuth client는 추후 `com.memoney.app`과 Play 앱 서명 SHA-1에 맞춰 추가한다. 준비용 검사 때문에 기존 Web audience나 개발 Android client를 바꾸지 않는다. 실제 Google 로그인과 앱 실행 검증은 서명·서버·앱 준비가 끝난 뒤 별도로 수행한다.

## 다음 작업

1. 번들 화면과 원격 API·네이티브 로그인은 검증 패키지에서 실기기 확인했다. 2026-10-24 정식 프로필에도 같은 번들 origin과 제한된 `MemoneyApi` 전송 구성을 적용했다. 정식 패키지의 운영 서버 왕복 검증은 남아 있다.
2. 새 서버 origin을 위한 Google 인증 허용 원본과 쿠키·CSP·로그인 복귀 경로를 준비한다.
3. 키 보관·백업 방식과 Play App Signing을 구성한 뒤 업로드 키를 생성한다.
4. 인증·서명·서버·origin 이전 검증 후에만 실제 AAB 빌드를 허용한다.

현재 단계는 네이티브 준비 경로와 자원 검사다. Play 업로드 가능 상태나 실기기 출시 검증 완료로 해석하지 않는다. 전체 순서는 [출시 체크리스트](android-release-checklist.md)를 따른다.

## 검증 기록

- 설정·출시 준비 단위 검사 24건 통과. 기존 개발 설정 검사 통과.
- 실제 Gradle 메타데이터와 리소스 처리 성공. 최종 매니페스트의 출시 package, FileProvider authority, 기존 namespace의 Activity 연결을 확인했다.
- Android 병합 리소스에서 기본 `Memoney`와 한국어 `메머니`를 확인했다. 설치된 런처 화면 검증은 아직 수행하지 않았다.
- 준비 프로젝트의 `assembleDebug`, `bundleRelease` 차단 확인. APK/AAB 생성·설치 없음.
- 서명 환경변수 4개가 없는 상태에서 검사 실패를 확인했다. 키 생성·서명·비밀번호 출력 없음.
- Git에 추적되지 않은 생성 폴더는 검증 기록으로 보존한다. 기존 개발 소스와 `.wrangler`, DB, 실행 중인 브라우저는 변경하지 않았다.

2026-10-24 `android:release:verify` 재검증: `com.memoney.app` 준비 프로젝트의 리소스와 매니페스트 처리가 성공했고 APK/AAB 생성 차단도 유지됐다. 원격 `server.url`은 출시 프로필에서 제거했다. `https://localhost` 번들과 `https://memoney-6r5.pages.dev` API만 허용하며, 원격 WebView·HTTP·검증 앱용 loopback API·`allowLocalProbe` 혼입을 구성 검사에서 거부한다. 현재 출시 프로필은 서명·OAuth·운영 서버 검증 5개 항목이 여전히 미완료다.
