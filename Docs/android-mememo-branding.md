# Android 메메모 아이콘과 공통 로딩

## 로그인 후 네모 깜빡임 대응 (2026-10-15)

APK `Memoney-loading-0.3.3.apk` / versionCode 8. 사용자가 Google 계정을 선택한 뒤 캐릭터가 보이고 단색 네모가 깜빡였다고 보고했다. 앱 로딩의 단색 배경+CSS mask 대체 표시가 위험 후보라서, Android의 미완성 캔버스는 원본 투명 PNG 배경으로 대체하고 mask를 사용하지 않도록 변경했다. 초기 HTML과 React 로딩에 동일하게 적용한다. 캔버스가 준비되면 기존처럼 DPR에 맞춘 원본 픽셀을 표시한다.

Android 렌더러는 크기가 그대로인 resize 이벤트에서 이미 완성된 캔버스를 다시 초기화하지 않는다. 실제 크기 변경이나 이전 렌더러에서 넘어온 경우에는 버퍼를 정리한 뒤 원본을 한 번 그려 알파가 중복 누적되지 않게 한다. 캐시된 이전 renderer를 구분하는 native variant를 `mememo-native-v2`, 갱신 URL을 `?native=mememo-v2`로 바꿨다. 일반 웹 렌더링 분기는 기존 동작을 유지한다. 홈 아이콘·OS 스플래시·인증·금융 저장은 변경하지 않는다.

초기/세션 로딩의 DPR 1·2·3 픽셀 비교, 반복 resize 후 원본 비교, 이미지 지연 중 투명한 대체 표시와 decode 후 캔버스 전환, 로그인 권한 확인 후 화면 전환 검사를 통과했다. 보고된 실제 Google 계정 선택 직후의 한 프레임을 직접 캡처해 원인을 확정한 것은 아니다. 실기기/에뮬레이터에서 같은 로그인 구간의 재확인이 필요하다.

2026-10-14 사용자 요청으로 Android 앱 아이콘과 실행 직후 로딩에 기존 `public/images/mememo/mememo-met-mint.png`를 적용했다. 원본 윤곽·눈·입·투명한 틈과 색상을 유지하고 크기와 배치만 조정했다. 새로 그리거나 AI로 재해석하지 않았다.

`scripts/android-mememo-artwork.mjs`는 원본을 Canvas `drawImage`로 축소하여 Android density별 launcher·adaptive foreground·splash PNG를 만든다. 적응형 아이콘은 108dp, 스플래시는 288dp 캔버스를 사용하며 각각의 안전 원 안에 모든 알파 픽셀이 들어오는지 검사한다. 원본 벡터 변환은 하지 않았다. [Android 시작 화면 지침](https://developer.android.com/develop/ui/views/launch/splash-screen)을 따른다.

홈 아이콘은 짙은 초록 배경과 원본 민트색 캐릭터를 사용한다. 스플래시는 같은 배경의 중앙에 큰 캐릭터만 표시한다. Android 시작 화면은 cold/warm launch에서 시스템이 표시하며 실행 중인 앱을 다시 여는 경우에는 생략될 수 있다.

사용자는 회전 표시·문구가 있는 화면 대신 **처음의 큰 캐릭터만 있는 화면**으로 로딩을 통일하도록 지정했다. 초기 HTML·Google 상태 확인·계정 작업·공유/로컬 장부 로딩·Android 동기화 대기는 공통 `LoadingScreen`과 원본 PNG Canvas 렌더러를 사용한다. Android에서는 194px 이미지 상자 안에 캐릭터가 표시되며 회전 표시·Memoney 문구는 숨긴다. 원본 이미지 자체의 투명한 여백을 포함하므로 보이는 캐릭터 너비는 약 160px이다. 상태 오류와 동기화 작업의 명시적 진행 UI는 별도로 유지한다.

Android WebView의 `MemoneyAndroid` user-agent 표식으로 초기 HTML부터 해당 모양을 적용한다. 이 표식은 외형 분기용이며 인증이나 권한에 사용하지 않는다. 일반 웹에서는 기존 49px 흰 로고·회전 표시를 유지한다. PWA 매니페스트·설치 아이콘·앱 식별자·금융 데이터 저장 키는 변경하지 않는다.

이후 사용자가 깜빡임을 지적해 시작 전환을 추가로 수정했다. 시스템 스플래시를 React의 로그인/장부 준비 또는 오류 표시까지 유지하고 WebView visual-state 확인 후 한 번에 제거한다. 준비 신호가 오지 않아도 최대 30초 뒤 해제한다. 초기 로그인 상태 검사 이후 주기적인 검사에는 전체 로딩을 재표시하지 않으며 Android의 데이터 갱신도 전체 화면 overlay를 띄우지 않는다. 이전에 immutable URL로 캐시된 로딩 JS는 Android 전용 query URL로 새 렌더러를 불러온다. 이 조정은 실제 금융 요청과 저장 정책을 변경하지 않는다.

검증: 웹·Android 빌드, 인증/저장 검사 32건, density별 안전 영역 검사와 초기/세션 로딩의 DPR 1·2·3 원본 픽셀 비교를 통과했다. Android에서는 RGB와 알파가 같은 크기로 그린 원본과 동일하며 웹에서는 기존 원본의 알파가 동일하다. 에뮬레이터에서 설치 아이콘과 실제 시작 화면을 녹화해 확인한다. 다른 실기기의 launcher mask나 설치 캐시 동작까지 동일하다고 보장하지 않는다.

재생성:

```powershell
node scripts/android-mememo-artwork.mjs
npm run android:build
node scripts/check-mememo-loading.mjs
```
# 로그인 화면 (2026-10-15)

APK `Memoney-login-local-0.3.2.apk` / versionCode 7. 로그인 화면은 저장된 장부 스타일과 별개로 메메모 녹색을 사용하며, 라이트/다크 선택은 유지한다. 원본 `mememo-met-green.png`와 `mememo-met-mint.png`를 변경 없이 사용한다. 로그인 전용 워드마크 클래스로 다른 스타일의 흰 글자 강제 규칙을 피한다. 홈 아이콘·네이티브 스플래시·웹 로딩 렌더러는 변경하지 않았다.

Google 버튼은 전체 버튼 이미지를 중첩하던 구조에서 아이콘과 한글 텍스트가 있는 버튼으로 정리했다. `public/google-g.png`는 [Google 공식 아이콘](https://developers.google.com/static/identity/images/g-logo.png)을 그대로 받아 사용한다. 참고: [Google 로그인 브랜드 지침](https://developers.google.com/identity/branding-guidelines).

`로그인 없이 이용하기`는 기존 기기 장부 ID를 유지하고 `/guest`로 즉시 이동한다. 계정 생성·Google 인증·금융 데이터 업로드를 수행하지 않는다. 첫 사용은 새 기기 장부를 생성한다. 3가지 저장 스타일·라이트/다크·320/411/768 화면 폭과 직접 로컬 진입을 격리 브라우저에서 확인했고, 실제 Android 로그인 화면의 로고·활성 Google 버튼·새 문구를 확인했다.
