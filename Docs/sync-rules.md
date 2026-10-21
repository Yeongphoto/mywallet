# 데이터 동기화 규칙

MyWallet의 기준 저장소는 Cloudflare D1이다. 브라우저 localStorage와 Wrangler 로컬 D1은 검토와 복구를 위한 캐시일 뿐이며, 기준 데이터로 간주하지 않는다.

2026-10-18부터 웹과 Android는 Android에서 사용하던 인증·개인장부·공유장부 D1을 정식으로 공유한다. `wrangler.toml`과 `wrangler.android-data.json`의 DB ID가 운영 연결 기준이다. 이전 `mywallet-db`나 웹의 기존 전역 캐시를 이 DB 위에 덮어쓰거나 자동 병합하지 않는다. 상세 전환 이력은 [Android 데이터와 웹 연결](android-web-data-connection.md)에 기록한다.

`android_dev@d161074` 전체 기능 통합으로 웹에서도 사용자가 명시적으로 선택한 `/guest` 로컬 장부는 예외적으로 해당 브라우저의 `memoney:guest:<id>:` 저장소를 기준으로 한다. Google 로그인만으로 이 기록을 공통 DB에 업로드하지 않는다. 계정·대상 장부·ID 매핑과 원본을 보관한 명시적 이관만 허용하고, 중단 후 재시도도 같은 작업 ID를 사용한다. 기존 클라우드 장부의 예산·기본 계획·설정을 자동 덮어쓰지 않는다.

같은 통합의 7일 복구 기능은 전체 열·해시 검증, 소유자·최근 재인증·Origin 검사, 동일 금융 DB 트랜잭션의 세대 guard를 거쳐서만 초기화·복구·공유 삭제 예약을 수행한다. 다른 세대의 보류 변경은 기기에 별도 보관하고 자동 재전송하지 않는다. 로컬 복구는 IndexedDB·Web Locks·세대 포인터를 사용하며 사이트 데이터 삭제나 기기 분실까지 서버처럼 보호한다고 주장하지 않는다. 상세 검증과 연결 범위는 [전체 통합 기록](android-web-full-integration.md)을 따른다.

## 기준

- 원격 D1의 `settings.updatedAt`이 서버 데이터의 기준 시각이다.
- localStorage의 `updatedAt`은 로컬 캐시가 가진 데이터 시각이다.
- `mywallet:v2:pendingSyncAt`이 있을 때만 localStorage를 "서버에 아직 반영되지 않은 로컬 수정"으로 본다.
- pending 플래그가 없는 localStorage는 오래된 캐시일 수 있으므로 D1을 덮어쓰면 안 된다.

## 앱 시작 시

- D1에 데이터가 있으면 기본적으로 D1 데이터를 적용한다.
- localStorage에 pending 플래그가 있고, 그 시각이 D1 `updatedAt`보다 최신일 때만 localStorage를 D1에 업로드한다.
- D1 적용 직후 React state가 바뀌어도 사용자 수정으로 취급하지 않는다.
- 서버 데이터 적용만으로 새 `updatedAt`을 만들거나 D1에 다시 POST하면 안 된다.

## 사용자 수정 시

- 거래, 자산, 계획, 카테고리, 정기기록 등 사용자가 데이터를 바꾸는 순간에만 새 `updatedAt`을 만든다.
- 수정 내용은 먼저 localStorage에 저장하고 `mywallet:v2:pendingSyncAt`을 기록한다.
- D1 저장이 성공하면 pending 플래그를 제거한다.
- D1 저장이 실패하면 pending 플래그를 남겨 다음 실행 때 재시도할 수 있게 한다.

## 금지

- 단순 조회, 화면 진입, 서버 데이터 로드, 캐시 복원만으로 `updatedAt`을 갱신하지 않는다.
- pending 플래그가 없는 로컬 데이터로 원격 D1을 덮어쓰지 않는다.
- 일부 필드만 들어있는 payload로 D1 전체 데이터를 교체하지 않는다.
- 검토용 로컬 D1을 원격 최신 데이터보다 우선하지 않는다.
