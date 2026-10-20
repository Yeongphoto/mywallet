# Android 시작 화면의 sleep 멧

2026-10-21 사용자 요청으로 앱 실행 직후의 정적인 로고도 sleep 멧으로 변경한다.

- Android 시작 화면: `public/images/met-sleep.gif`의 첫 프레임을 그대로 사용한 투명 PNG다. 설치 아이콘·앱 식별자·저장 키는 변경하지 않는다.
- 초기 HTML과 Android의 React 로딩: 원본 sleep GIF를 재생한다. 원본의 투명 여백 범위를 보존한다. 추가 요청에 따라 로딩 캐릭터는 이전 크기의 30%로 축소하며, Android 시작 화면·초기 HTML·React 표시 틀의 실제 폭은 55.2px다.
- 연결 확인이 끝난 뒤에는 기존 meow 0.7초 완료 표시와 메인 진입을 유지한다.
- 배경은 기본 테마의 밝은 초록색이며, 네이티브 시스템 다크 모드에는 어두운 초록색을 제공한다. 앱의 별도 수동 테마 설정과 시스템 테마가 다르면 시작 배경이 다를 수 있다.

`node scripts/android-sleep-splash.mjs`는 원본 GIF의 프레임 0을 브라우저 ImageDecoder로 읽는다. 원본 좌표 `(96,220,320,320)`의 투명 여백만 제외하고 mdpi~xxxhdpi PNG로 복사한다. 새 그림·불투명 배경·벡터 재해석은 추가하지 않는다. 각 해상도에서 Android 안전 원 밖의 유효 알파 픽셀은 0개로 검사한다.

`node scripts/check-native-sleep.mjs`는 로컬 응답으로 Android 초기 HTML·React 화면의 이미지와 중앙 위치·크기를 확인하고, 일반 웹의 기존 캔버스 로딩을 보존하는지 확인한다. 실제 계정·금융 데이터는 사용하지 않는다.

검증 결과: 웹 빌드와 PWA 검사 통과, 초기·React 로딩 4개 브라우저 시나리오 통과, `:app:compileDebugJavaWithJavac` 네이티브 코드·리소스 컴파일 통과. 최초 구현 검증에서는 APK 패키징을 실행하지 않았다.

웹 로딩 변경은 호스팅 갱신으로 적용되지만, Android 시작 이미지·배경은 APK 리소스이므로 다음 APK 업데이트가 필요하다. 사용자의 별도 요청 전에는 APK를 생성하거나 재설치하지 않는다. 설치 직후 첫 화면과 이어지는 GIF의 실기기 전환은 다음 APK 업데이트 때 확인해야 한다.

## 설치용 APK 0.3.4

2026-10-21 사용자의 APK 요청으로 `npm run android:build`를 실행했다. 버전은 0.3.4·versionCode 9이며 파일은 Git 무시 경로 `android/build/exports/Memoney-0.3.4.apk`에 있다. `com.mywallet.dev` 식별자와 기존 0.3.3 APK의 서명 인증서가 같은 것을 확인해 업데이트 설치를 지원한다.

패키지 안의 호스팅 주소는 `https://memoney-android-test.pages.dev/signin`이다. sleep·meow GIF와 30% 크기의 native sleep 이미지 5개 해상도 리소스가 포함됐으며 APK 서명 검증을 통과했다. 파일 크기는 11,479,450바이트다. 실제 삼성 기기의 첫 시작 화면 전환은 설치 후 확인이 필요하다.
