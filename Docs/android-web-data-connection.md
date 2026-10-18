# Android 데이터와 웹 연결 · 병합 기록

2026-10-18 · agy · 웹 기능 이식 `a838938`의 후속 작업

## 실제 연결

- Android 앱은 `https://memoney-android-test.pages.dev`의 인증 DB·개인 금융 DB·공유 금융 DB를 사용한다. Cloudflare 프로젝트 설정으로 실제 binding을 대조했다.
- 웹 미리보기 **https://android-data.mywallet-8mx.pages.dev/signin**을 같은 세 DB에 연결했다. 배포 ID `bd709261`. 새로운 금융 DB를 만들거나 별도의 복사본으로 갈라놓지 않았다.
- 사용자·Google subject·개인 장부 UUID·기존 공유 장부 UUID와 membership을 그대로 사용한다. 웹과 Android의 브라우저 쿠키는 호스트가 다르므로 각각 로그인하되 같은 사용자/장부로 접근한다.
- 같은 장부의 변경은 같은 DB·revision·operation·증분 이벤트를 사용한다. 개인 장부와 공유 장부는 원래부터 독립된 기록이며 서로 자동 덮어쓰지 않는다.
- 기존 운영 웹 `https://mywallet-8mx.pages.dev`는 아직 예전 DB를 사용한다. **미리보기 연결이 곧 운영 전환은 아니다.** 운영 배포 ID `98e8e160-bb07-4875-86d2-a08571574f64`가 작업 후에도 동일함을 확인했다.

## 백업과 병합

네 DB의 전체 SQL과 로컬 SQLite 복원본을 아래 저장소 밖 폴더에 보관했다. 인증 DB에는 개인 식별정보와 세션 해시가 있으므로 공유하거나 Git에 넣지 않는다. SQL SHA-256과 테이블 목록은 같은 폴더의 `manifest.json`에 있다. 별도 암호화/ACL 변경은 하지 않았으며 사용자 프로필의 기존 권한을 상속한다.

`%LOCALAPPDATA%\Memoney\backups\android-web-6OkOl3`

| 저장소 | 원격 D1 |
| --- | --- |
| 기존 웹 | mywallet-db · 8dfd0da4-d04e-4f57-bc74-4cc567d2de0e |
| Android 인증 | memoney-android-test-auth · 682e0f02-132f-4812-80c6-4815e5cc3c07 |
| Android 개인 | memoney-android-test-personal · 1f8e7054-bdd8-4032-b19e-b12a56ac2777 |
| Android 공유 | memoney-android-test-shared · 1189c109-320b-4822-9f4e-7d1844527e63 |

비교 당시 웹 거래 482행(활성 458), Android 개인 거래 483행(활성 458)이었다. 같은 ID의 거래 481행은 내용이 같고, 웹 전용 활성 1행, Android 전용 활성 1행과 삭제 1행이 있었다. 두 전용 활성 기록은 ID만 다른 동일 내용이 아니었다. 자산·계획·카테고리·정기 규칙·정기 삭제 이력·카드 결제는 동일했다. 동기화/작업 이력은 두 분기에서 따로 늘었으므로 커서 숫자를 기준으로 합치지 않았다.

- 사용자 요청에 따라 Android를 기준으로 웹 전용 활성 1행을 **추가**했다. 기존 Android 거래 483행을 수정·삭제하지 않았다. Android 전용 기록과 삭제 이력도 유지했다.
- 원본 거래의 ID·모든 컬럼·revision·작업 결과를 보존하고, Android의 다음 커서로 새 upsert 이벤트를 추가했다. `updatedAt`은 명시적인 병합을 반영하도록 증가시켰다. 기존 커서·동기화 이벤트를 덮어쓰지 않았다.
- 병합 SQL과 row ID를 포함한 계획 파일은 위 비공개 백업 폴더에만 있다. 원격 적용 전 메모리 복원본에서 SQL을 두 번 실행해 중복 생성을 검사했다. 원격 source/target/operation이 백업 후 달라졌으면 중단하도록 preflight를 수행했다.
- 병합 도구는 충돌 없는 **감사된 활성 거래 1건 추가**만 허용한다. 범위가 달라지면 중단한다. SQL은 재실행 가능한 추가 명령이며 중간 실패 시 자동으로 전체 백업을 복원하거나 데이터를 지우지 않는다. 전체 import가 하나의 원자적 트랜잭션이라고 단정하지 않는다.
- 원격 적용 후 거래 행·operation 결과·증분 이벤트를 확인했다. 개인 거래 484행(활성 459), 작업 결과 459행, 동기화 이벤트 440행이다. 원래 거래 483행·작업 결과 458행·이벤트 439행과 `updatedAt` 외 설정 7행은 모두 내용이 같았다.
- 개인 DB의 나머지 8개 테이블, 기존 웹 11개 테이블, 공유 DB 13개 테이블도 백업과 전체 행 비교에서 차이 없었다. 기존 공유 장부의 금융 데이터나 권한은 변경하지 않았다.

## 코드와 배포

- `AUTH_ANDROID_DATA_COMPAT=true`를 명시한 환경에서만 Android 개인/공유 DB 연결을 허용한다. HTTPS 기존 웹 도메인과 그 미리보기 하위 도메인, 명시적인 localhost 5187 개발 환경만 허용한다.
- 기존 Android marker와 사용자 membership 검사를 유지한다. 신규 WEB_FINANCE 모드·원격 upstream bridge와 혼합되면 실패한다. 로그인만으로 새 장부를 만들거나 기존 데이터를 자동 배정하지 않는다.
- 아직 장부 membership이 없는 초대받은 계정은 `/sharing`으로 진입해 받은 초대를 명시적으로 수락할 수 있게 보완했다.
- `wrangler.android-data.json`은 동일 DB 연결 설정이며 기본 `wrangler.toml`을 교체하지 않는다.
- `node scripts/prepare-android-data-web.mjs --preview`는 별도 실행 디렉터리에 표준 `wrangler.json`과 빌드를 준비한다. 이 도구 자체는 배포나 DB 초기화를 실행하지 않는다. 생성된 디렉터리에서 Pages `--branch android-data`로 미리보기만 배포했다.
- Pages 프로젝트의 **preview 기본 binding/vars도 Android 연결 설정으로 반영됐다.** 이후 다른 preview 브랜치를 배포할 때도 원격 DB가 연결될 수 있으므로 기본 로컬 시험 설정으로 착각하지 않는다. 운영 binding과 운영 배포는 변경하지 않았다. 작업 전 Pages 설정도 백업 폴더에 보관했다.
- 정상 로그인 전 `/api/data` 전체·증분, 장부 context, 세션은 401, 인증 설정 조회는 200이며 모두 `no-store`로 응답했다.

## 남은 확인 / 운영 전환

1. Google Cloud의 Web 클라이언트 Authorized JavaScript origins에 `https://android-data.mywallet-8mx.pages.dev`를 등록/확인한다. 운영 전환 시 `https://mywallet-8mx.pages.dev`도 필요하다. 이번 작업에서는 Google 콘솔 설정을 변경하지 않았다.
2. 실제 두 Google 계정으로 미리보기 웹과 Android에서 같은 장부·초대·수정·철회·로그아웃을 확인한다. 세션을 임의 발급하거나 사용자 Google 로그인을 대신하지 않았다. **현재 실제 계정의 미리보기 로그인 성공은 아직 확인하지 않았다.**
3. 운영 전환 직전에 기존 웹의 추가 변경을 다시 비교한다. 지금도 운영 웹은 이전 DB에 기록하므로, 이번 병합 이후의 기록이 자동으로 Android DB로 이동하지는 않는다. 충돌을 확인하고 최종 추가 병합 후 운영 전환한다.
4. 기존 웹 URL을 전환할 때는 정확한 Google origin과 DB binding, 초대받은 사용자 접근을 확인한 뒤 별도 진행한다. 기존 무인증 데이터 API를 새 인증 환경의 우회로로 남기지 않는다.

검증: 인증·장부 회귀 43개(웹↔Android 동일 DB 수정 확인 포함), 병합 도구 2개, 기존 복원/시험환경 6개와 웹 빌드/PWA 검사. SQLite의 모의 두 계정 검증과 실제 두 Google 계정 로그인은 구별한다. 실제 금융 DB에 검증용 거래를 새로 만들지는 않았다. 추가한 1행은 사용자의 기존 웹 기록이다.

참고: [웹 기능 이식](web-google-shared-wallet.md), [D1 전체 내보내기](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Pages DB binding](https://developers.cloudflare.com/pages/functions/bindings/).
