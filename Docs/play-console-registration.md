# Memoney Play Console 등록 기록

2026-10-24 · android_dev. 공개 출시는 이번 작업 범위에 포함하지 않는다.

## 콘솔에 실제 등록한 값

- 개발자 계정: 서영훈 / PD서 (`syh4472@gmail.com`).
- 앱: `Memoney`, 기본 언어 `ko-KR`, 앱, 무료 설치.
- 패키지: `com.memoney.app`. 콘솔에서 사용 가능 확인 후 생성했다.
- Console 앱 ID: `4976371954207640649`.
- [앱 대시보드](https://play.google.com/console/u/0/developers/7061549866221664591/app/4976371954207640649/app-dashboard).
- 내부 테스트 목록 `Memoney-internal`: PD서 계정 1명. 목록 생성과 트랙 선택 저장을 확인했다.
- 내부 테스트 참여 주소: `https://play.google.com/apps/internaltest/4700164615757710024`. 출시 버전 제공 전에는 설치 가능하다고 안내하지 않는다.

후속 확인: 사용자가 첫 `1 (0.1.1)`을 직접 내부 테스트로 출시해 설치했다. Google 로그인 연결을 보완한 `2 (0.1.2)`도 2026-10-24 21:44 KST에 내부 테스트 출시를 마쳤다. 현재 Console은 활성 / 최신 `2 (0.1.2)` / 내부 테스터에게 제공됨이다. 실제 기기 로그인 검증은 [내부 테스트 로그인 기록](android-internal-login.md)을 따른다. 아래 최초 AAB의 임시 출시 절차는 당시 작업 기록으로 보존한다.

## 첫 업로드와 출시를 구분

Play 앱 서명 인증서가 있어야 정식 패키지 Google OAuth를 연결할 수 있다. 인증서를 확보하기 위한 최초 서명 AAB는 Console **임시 출시**에 업로드한다. 서버·OAuth·실기기 검증 전에는 이 빌드를 테스터에게 출시하지 않는다.

`node scripts/android-play-draft.mjs build-draft <새 versionCode>`는 production 웹 자산을 사용하고 서명된 AAB만 만든다. 기존 개발 프로젝트와 일반 준비 프로젝트의 Release 차단은 그대로 유지한다. 검증 패키지/loopback API/원격 화면/활성 결제 설정은 거부한다. 생성 프로젝트에서만 전용 서명 구성을 사용한다. 미추적 사용자 PDF는 포함하지 않는다. Android 자동 백업을 끄며 기존 앱의 로컬 데이터는 건드리지 않는다.

첫 versionCode는 `1`, versionName은 `0.1.1`. 향후 업로드마다 versionCode를 증가시킨다. 최초 업로드가 소비한 번호를 재사용하지 않는다. 생성물 위치·SHA-256·대기 조건은 무시된 `android/build/memoney-play-draft.json`에 남긴다.

첫 AAB는 Console에서 `1 (0.1.1)` / minSdk 24 / targetSdk 36으로 처리됐다. SHA-256은 `7530dcae9bf0122f2e9cd8bb53d79964c58fa23beb542e9ce4579ccd223b0867`이다. 내부 테스트의 임시 출시 노트에 정식 로그인·공유·구독 연결 준비 중임을 명시했다. 첫 빌드의 Release lint 분석에서 Google ID 라이브러리 Kotlin metadata 2.4.0 대 분석기 2.2.0 경고가 있었다. Gradle 전체 빌드와 JAR 서명 검증은 성공했지만 이 경고를 해결한 것으로 보고하지 않는다.

## 업로드 키 보관

- Git 밖 `C:/Users/syh44/.memoney/signing/memoney-upload.p12`.
- 별칭 `memoney-upload`, RSA 3072, PKCS12.
- 비밀번호는 같은 폴더의 `upload-password.dpapi`에 현재 Windows 사용자 DPAPI로 보호한다. 비밀번호를 코드/콘솔/채팅/명령 인수에 남기지 않는다.
- 공개 인증서 `upload-certificate.pem`은 업로드 키 인증서이며 Google이 사용하는 Play 앱 서명 인증서와 다르다.
- `key-create`는 기존 키/암호화 파일이 있으면 덮어쓰지 않는다.
- DPAPI는 해당 Windows 사용자/환경에 의존한다. **이 폴더의 단순 복사만으로 다른 컴퓨터에서 복구 가능하다고 보장하지 않는다.** 키와 비밀번호의 독립 복구 가능한 백업은 사용자 보관 방식 확정 후 별도로 준비한다.

## 구독 등록 값

| 항목 | 값 |
| --- | --- |
| 상품 ID | `memoney_premium` |
| 이름 | 메머니 프리미엄 |
| 기본 요금제 ID | `annual` |
| 유형 | 자동 갱신 |
| 기간 | 1년 (`P1Y`) |
| 대한민국 가격 | 연 2,000원 |
| 무료 체험/프로모션 | 현재 추가하지 않음 |

상품과 요금제의 생성/가격 저장/활성화는 각각 실제 Console 상태로 기록한다. 예정 값 파일을 실제 등록 증거로 사용하지 않는다. 판매 지역 확대나 해외 가격을 임의 확정하지 않는다. Google 결제 프로필의 법적·정산 정보는 실제 소유자가 입력해야 하며 추측해서 작성하지 않는다.

구독 혜택: 본인의 광고 제거·장부 입력 한도 해제, 본인이 호스트인 장부의 자산 한도 해제. 공유 장부 게스트의 광고 면제는 게스트 본인 구독에 따른다. 구매/복원/관리 문구와 자동 갱신·가격·기간을 앱에서 표시한다. 실제 제한과 광고 SDK는 아직 운영 활성화하지 않았다.

테스터 등록과 **라이선스 테스트** 등록은 별개다. PD서가 테스트 구매 수단을 사용하는지 확인하기 전 실제 결제를 진행하지 않는다.

실제 Console 확인 결과 아직 **판매자 결제 프로필이 없다**. 수익 창출 화면이 결제 프로필 생성으로 안내하므로 상품/기본 요금제/가격은 아직 등록하지 않았다. `config/billing-catalog.json`의 `consoleRegistered=false`를 유지한다. [결제 프로필 화면](https://play.google.com/console/u/0/developers/7061549866221664591/paymentssettings)에 본인의 실제 정보로 프로필을 준비한 뒤 구독 등록을 이어간다. 주소·정산·법적 정보를 추측하거나 기존 다른 서비스의 결제 프로필을 임의로 연결하지 않았다.

스토어 소개문·데이터 보안 대조·계정 삭제 등 심사 준비안은 [스토어·심사 준비](play-review-preparation.md)에 있다. 미확정 삭제/보존 정책을 확정한 것처럼 제출하지 않는다.

## 공개/비공개 테스트 전 남은 조건

- Play 앱 서명 SHA-1과 `com.memoney.app` Android OAuth client 등록, 공통 Web audience 유지.
- 정식 API origin `https://memoney-6r5.pages.dev`의 Google 승인 원본, 인증·최초 이전 스키마/모든 origin 조정 계획과 운영 검증. 기존 DB/공유 장부를 초기화하지 않는다.
- 분리된 시험 장부에서 Google 로그인·동일 계정 UUID·공유 권한·앱웹 교차 저장·복구 검증.
- 개인정보처리방침 공개 URL과 실제 인앱/웹 계정 삭제 요청 경로. 장부 연결 끊기나 초기화를 탈퇴로 표시하지 않는다.
- 호스트 탈퇴 시 소유권과 다른 구성원 데이터 처리 정책 확정. 임의 삭제 금지.
- 실제 SDK/서버 처리 기준 데이터 보안·금융 기능·광고·콘텐츠 등급·대상 연령 답변 확정.

내부 테스트만 활성인 앱의 데이터 보안 신고 면제와 공개 출시 준비 완료는 구분한다. [Google 내부 테스트 안내](https://support.google.com/googleplay/android-developer/answer/9845334?hl=ko), [데이터 보안 안내](https://support.google.com/googleplay/android-developer/answer/10787469?hl=ko).
