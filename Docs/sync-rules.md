# 데이터 동기화 규칙

MyWallet의 기준 저장소는 Cloudflare D1이다. 브라우저 localStorage와 Wrangler 로컬 D1은 검토와 복구를 위한 캐시일 뿐이며, 기준 데이터로 간주하지 않는다.

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
