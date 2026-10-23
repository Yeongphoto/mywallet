# 번들 Android 기기 장부 저장 내구성

2026-10-23 · `android_dev` · 검증 앱 `com.memoney.probe`

## 재현과 범위

기존 APK에서 거래 저장 직후 백그라운드 대기 없이 `am force-stop`하면 최근 기록이 사라졌다. 장부와 무관한 새 localStorage 키를 버튼으로 저장하고 즉시 종료해도 값이 사라졌다. 이 재현은 장부 fixture 주입이나 React 상태 덮어쓰기 없이 발생했다. 진단은 `scripts/diagnose-webview-storage.mjs`로 남긴다. 이 스크립트는 합성 진단 키만 만들며 원격 DB와 장부를 수정하지 않는다.

이번 보강은 `installNativeApi()`가 활성화한 **번들 Android 앱의 기기 장부**에만 적용한다. 일반 웹·기존 원격 개발 앱의 저장 경로, Google 최초 이전 자격, D1 기준과 공통 DB 연결은 변경하지 않는다.

## 성공 응답과 재시작

- `memoney-guest-durability-v1` IndexedDB에 해당 guest UUID의 저장 키, 복구 세대, 버전, SHA-256을 함께 기록한다. 거래·자산·계획·정기·삭제 표식·설정·처리 완료 operation 영수증을 같은 확인 사본에 포함한다.
- `durability: 'strict'` 트랜잭션의 `complete` 후에만 저장 성공을 반환한다. localStorage는 기존 화면의 읽기 경로로 유지하되 확인 사본과 일치시킨다. 단순 요청 성공이나 localStorage read-back으로 저장 완료를 판단하지 않는다.
- strict 옵션과 Web Locks를 지원하지 않거나 초기 사본이 손상됐으면 시작을 중단하고 원본 보존 안내를 표시한다. 저장 실패는 성공으로 숨기지 않고 이전 표시용 snapshot으로 되돌린다.
- 시작 시 마지막 **확인된** 사본을 사용한다. 날짜나 거래 수로 최신성을 추정하거나 서로 합치지 않는다. 차이가 있는 localStorage 원본과 이전 active UUID는 `displaced` store에 먼저 strict 저장한 후 복원한다. 다른 guest UUID의 데이터와 클라우드 캐시는 건드리지 않는다.
- 기존 기기 장부를 처음 도입할 때만 해당 guest 원본을 최초 확인 사본으로 보존한다. 이전 서버 origin·다른 패키지의 데이터를 자동 이전하는 기능은 아니다.
- Web Lock과 저장 버전 비교로 오래된 실행 인스턴스의 덮어쓰기를 거부한다. 새로고침하여 현재 확인 사본을 읽어야 한다. 백그라운드에서 작성한 오래된 화면을 자동 합치지 않는다.

## 복구와 백업

7일 보관 원본을 strict 저장·재검증하고, 새 snapshot과 세대 포인터를 확인 사본에 함께 반영한 뒤 초기화/복구를 완료한다. 이전 화면의 세대 잠금은 유지한다. 완료 표시의 후속 기록이 끊기면 기존 복구 코드가 확정 세대에 맞춰 보정한다. 만료 정리도 guest 잠금 안에서 처리한다.

JSON/CSV 복원은 기존 원본 보관 후 확인 사본 저장이 끝나야 재시작하거나 복원 성공을 알린다. Android 파일 선택기 전체 흐름은 별도 실기기 검증 대상이다. `displaced`는 충돌 원본 보관이며 7일 복구 메뉴와 다르다. 자동 삭제하지 않으며 일반 백업에 포함되지 않는다. 손상 안내가 나오면 앱 데이터를 지우지 말고 원본을 조사한다.

## 검증

```powershell
npm run check:local-durability
npm run android:bundle:build
node scripts/check-bundle-probe.mjs --abrupt-stop
```

실제 Chromium IndexedDB의 격리 테스트 18건: 확인 사본 복원, 처리 영수증, 관련 없는 키 보존, 덮어쓰기 전 원본 보관, 저장 실패 rollback, 오래된 writer 거부, 수정/삭제 유지, 세대 전환, 손상 시 중단, 실제 local adapter 중복 방지와 7일 초기화/복구를 검사한다. 실제 APK에서는 등록 모달이 저장 완료로 닫힌 직후 별도 대기 없이 종료하고 재시작한다. 검사 데이터는 합성 기록뿐이며 공통 DB에는 쓰지 않는다.

`strict`는 브라우저 구현에 전달하는 내구성 **힌트**다. 앱 삭제·앱 데이터 초기화·저장 장치 고장·모든 기기의 전원 차단 내구성을 보장하지 않는다. [IndexedDB 표준 초안의 내구성 정의](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint)를 따른다. 이번 결과는 해당 에뮬레이터/WebView의 강제 종료 검증이며 삼성 등 실제 기기 확인과 외부 백업은 계속 필요하다.
