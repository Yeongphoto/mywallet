# Google 개인 장부 최초 이전 계약

2026-10-21 확정 정책을 Android `android_dev`에서 구현했다. 문서만 있는 상태가 아니다. **운영 DB 변경·플래그 활성화·배포·APK·푸시는 수행하지 않았다.** 웹 `agy`의 미커밋 `personal.ts`와 파일 이름이 겹치므로 그대로 덮어쓰지 말고 이 계약을 기준으로 통합한다.

## 사용자 동작

- 로그인 전 Android/PC의 기록은 각 기기의 로컬 장부에만 남는다. 다른 사용자 캐시나 기존 웹 전역 키를 원본으로 삼지 않는다.
- 해당 계정의 최초 Google 로그인 세션만, 비어 있는 **그 계정의 개인 장부**에 기기 원본을 한 번 이전할 수 있다. 공유 장부는 대상이 아니다.
- 개인 장부에 기존 데이터가 있으면 그 장부로 전환한다. 로컬 원본을 읽거나 업로드하거나 합치지 않는다.
- 이전 시 거래·자산·계획·사용자 카테고리·예산/표시 설정·정기기록(시간 포함)·삭제한 정기거래·카드 결제와 연결 관계·정렬 버전을 함께 저장한다. ID는 유지하고 장부별 테이블로 격리한다. 거래/자산 revision은 새 서버 장부의 1로 시작한다.
- 원본 localStorage, 활성 로컬 장부 ID, 이전 세대, 옛 `sync-job`은 자동 삭제·수정하지 않는다. 옛 작업을 이어서 실행하지 않으며 로컬 쓰기·백업·복구를 잠그지도 않는다.
- 이후 로그인/다른 기기/개인 장부 초기화/7일 복구는 최초 이전 자격을 새로 만들지 않는다. 로컬 모드는 로그인한 상태에서도 별도로 선택할 수 있다.

## 권한과 영속 상태

동일 Google `issuer/sub`는 기존 `resolveUser`에 의해 동일 user UUID를 얻는다. 이메일로 계정을 합치지 않는다.

인증 DB의 `personal_ledgers`는 `user_id PRIMARY KEY`, `ledger_id UNIQUE`, `storage_kind ('legacy','scoped')`를 가진다. 계정별 개인 ledger UUID는 한 번 정해지면 유지한다. 기존 지정 개인 장부는 **실제 owner 한 명에게만** 연결하고 `memoney_test_database`의 지정 UUID를 검증한다. 다른 계정은 개인 DB 안의 `s_<UUID에서 하이픈 제거>_*` 테이블을 쓴다. 공유 장부 생성 시 개인 원본도 이 매핑을 통해 읽는다.

인증 DB의 `personal_onboarding_accounts`는 다음 필드를 가진다.

| 필드 | 의미 |
| --- | --- |
| `user_id` | 계정당 한 행, 기본 키 |
| `first_session_hash` | 최초 로그인 성공 세션의 SHA-256, 원문 세션 토큰 저장 안 함 |
| `first_login_at` | 최초 세션 발급 시각, 서버 UTC ms |
| `expires_at` | 최초 준비 기한, 서버 UTC ms |

네이티브 `/api/auth/google` 및 외부 브라우저 `/api/auth/browser-claim`의 세션 발급과 위 행 생성을 인증 DB의 같은 batch에서 처리한다. 브라우저의 Google 승인만으로는 기회를 소비하지 않고 원래 브라우저가 계정을 확인하고 세션을 받은 시점이 최초 로그인이다. 이미 있는 행은 갱신하지 않는다.

첫 세션의 **5분 준비 기한** 동안 같은 세션의 실패 재시도를 허용한다. 다른 기기는 `waiting`을 받고 원본을 업로드하지 않는다. 완료 후 다시 조회하면 확정된 개인 장부를 연다. 첫 세션 로그아웃/폐기 또는 기한 만료 후에는 새 기기로 자격을 넘기지 않고 `skipped`로 닫는다. 최초 기기가 중단되어도 계정이 영구 대기하지 않게 하는 서버 기한이며, 기기 시각/localStorage로 연장할 수 없다. 실패 후 기한을 넘겼더라도 기기 원본은 남는다.

금융 DB에는 다음 메타데이터를 추가 생성한다. scoped 개인 장부들도 동일 금융 DB의 이 공통 테이블을 이용한다.

```sql
CREATE TABLE memoney_personal_onboarding (
  ledger_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL,
  payload_hash TEXT,
  completed_at INTEGER NOT NULL
);
CREATE TABLE memoney_onboarding_guard (
  id INTEGER PRIMARY KEY CHECK(id=1),
  valid INTEGER NOT NULL CHECK(valid=1)
);
```

`outcome`은 `imported`, `existing`, `empty`, `skipped`다. 재요청은 저장된 결과를 반환한다. `payload_hash`는 실제 검증·정규화된 테이블 행 payload의 SHA-256이다. 초기화/복구의 삭제·복원 테이블 목록에 이 메타데이터를 넣지 않는다. `memoney_recovery_state`와 `memoney_recoveries`도 해당 ledger의 사용 이력을 검사하는 데 활용한다.

## API

`AUTH_PERSONAL_ONBOARDING=true`일 때만 `/api/wallet/onboarding`을 제공한다. `false`/누락이면 404다. 모든 요청은 HttpOnly 세션으로 계정을 결정한다. 클라이언트 user ID를 받지 않는다. `POST`는 정확한 `AUTH_ORIGIN`과 JSON Content-Type이 필수다. 임의 CORS 허용을 추가하지 않는다.

### GET /api/wallet/onboarding

개인 장부를 준비하고 최초 처리 상태를 반환한다. 기존 데이터가 있거나 최초 자격이 없는 경우에는 이 단계에서 결과를 영속 확정한다. 기존 데이터 검사는 거래뿐 아니라 금융 11개 테이블의 모든 행(삭제표시 행·설정·연산 영수증·증분 이력 포함)과 해당 ledger의 복구 이력/세대도 포함한다.

```json
{"status":"pending","expiresAt":1790000000000,"ledger":{"id":"개인 UUID","kind":"personal"}}
```

- `200 pending`: 현재 세션만 최초 이전 가능.
- `202 waiting`: 다른 최초 세션이 처리 중. `retryAfterMs:1000`, `expiresAt`, 개인 ledger를 반환. 원본을 읽거나 POST하지 않고 조회를 재시도한다.
- `200 complete`: `outcome`, `completedAt`, 개인 ledger 반환. **로컬 스냅샷을 읽거나 보내지 않는다.**

### POST /api/wallet/onboarding

GET에서 받은 개인 UUID를 `X-Memoney-Ledger`에 넣는다. 계정이 중간에 바뀌거나 공유/다른 사람의 UUID이면 403이다.

```json
{"snapshot":null}
```

로컬 원본이 없으면 `null`. 있으면 `localSnapshot`의 전체 의미 필드를 보낸다. 현재 활성 guest UUID와 복구 세대의 원본만 잠금 안에서 읽는다. 폼에서 선택한 장부, 서버 캐시, 예전 전역 키, 옛 sync-job 스냅샷을 대신 보내지 않는다.

본문은 UTF-8 1,500,000바이트 이하. 스냅샷의 배열/날짜/시간/숫자/ID/자산 참조/정렬 버전/중복 키를 검증한다. 상한 초과는 413, 손상된 원본은 400이고 부분 이전이나 조용한 필드 누락으로 우회하지 않는다. 클라이언트 연산 영수증·증분 cursor는 서버에 가져오지 않는다.

검증 완료 후 **동일 개인 금융 DB의 한 batch**에서 빈 상태·미완료·서버 기한을 CHECK guard로 재확인하고, 모든 금융 행을 INSERT하고, 완료 행을 기록한다. `REPLACE/UPSERT/OR IGNORE`로 정상 금융 행을 덮거나 충돌을 숨기지 않는다. JSON 배열당 한 INSERT를 사용하여 레코드별 부분 커밋이 없다. 실패하면 전부 롤백한다. 동시 요청은 완료 행과 guard로 한 요청만 확정한다. 성공 응답이 유실돼도 재요청에서 완료 상태를 읽는다.

응답은 GET과 같은 `complete`다. 경합/저장 실패 시 완료 행이 없으면 `409 INITIAL_IMPORT_RETRY`; 새로 GET부터 재검사한다. 이미 존재하는 정상 행은 `existing`으로 확정한다. 완료된 장부는 다른 payload로 재요청해도 이전 결과만 반환한다.

## 우회 방지와 클라이언트

- `/api/wallet/context`, 인증된 금융 `/api/data`, 장부 생성/복사에는 미완료 계정에 `425 PERSONAL_ONBOARDING_REQUIRED`를 반환한다. `functions/api/data.ts`의 GET/PATCH 진입부도 플래그가 켜져 있으면 `sharedWalletData`로 보낸다. 내부 금융 연산 호출은 스코프가 확정된 `{DB}`만 받아 재귀하지 않는다. 웹이 라우트를 별도 복제했다면 그 복제 경로에도 같은 보호가 필요하다.
- `readWalletContext`는 425를 받으면 최초 준비 API를 실행하고 확정된 개인 UUID로 다시 요청한다. `/wallet` 직접 접근과 설정의 장부 전환도 적용된다.
- 로그인 완료 경로는 `preparePersonalLogin` 후 개인 장부로 들어간다. `/signin?sync=local`, `?account=local`이 옛 합치기 화면으로 되돌아가지 않는다.
- `/guest` 연결 화면에는 합치기/이어서 동기화가 없다. Google 로그인 또는 개인 장부 열기만 있다. 원본을 삭제하거나 guest ID를 없애지 않는다.
- 루트 진입도 새 기능이 활성화되어 있으면 인증/기기 모드를 확인해 `/guest` 또는 `/wallet`로 이동한다. 계정 없는 로컬 금융 쓰기는 네트워크 데이터 API를 호출하지 않는다.
- 오래된 프런트엔드의 합치기 구현은 지원하지 않는다. API·프런트엔드·캐시 갱신을 함께 배포해야 한다. `/api/data`의 정상 수동 기록 API 자체를 금지하는 방식으로 기존 장부 편집을 막지 않는다.

## 활성화 및 웹 통합

1. 웹 `agy` 미커밋 코드를 직접 복사하거나 수정하지 않는다. Android의 검증된 공통 구현/테스트와 웹 변경을 담당자가 통합한다.
2. Google 인증을 받는 **모든 앱/웹 origin의 로그인 경로를 같은 세션 발급 구현으로 준비**한다. 일부만 플래그를 켜고 장기간 혼용하지 않는다.
3. 실제 binding ID 확인: auth `ec28198a-6040-4074-a142-1cf6f76c7f15`, personal `a4113709-d951-4b50-aa78-cc80eb7cda9f`, shared `0a69096e-4d87-423e-b4a2-6afc0fb94698`. 같은 이름의 다른 DB로 대체하지 않는다.
4. 전환 중 로그인 유입을 통제하고 인증 DB에 `scripts/personal-onboarding-auth-schema.sql`을 **한 번만** 적용한다. 그 시점에 이미 존재하는 계정을 `first_session_hash=NULL, expires_at=0`으로 기록한다. 로그아웃해 세션이 사라진 과거 계정도 재이전 자격을 얻으면 안 되기 때문이다. `resolveUser`의 이메일/Google subject/기존 소유권을 이 migration에서 변경하지 않는다.
5. 개인 DB/공유 DB binding, 기존 지정 개인 ledger UUID 및 표식, 이전 공유 장부 스키마를 확인한다. 금융 메타데이터는 런타임에서 additive CREATE IF NOT EXISTS로 생성한다. 최초 이후 플래그를 껐다 켜도 메타데이터를 지우거나 다시 seed하지 않는다.
6. `AUTH_PERSONAL_ONBOARDING=true`를 모든 대상 origin에 맞춰 활성화한다. 현재 다중 장부/초대/복구 기능의 다른 플래그와 binding은 유지한다. `scripts/prepare-hosted-test.mjs`는 아직 이 플래그를 자동 활성화하지 않는다. 승인 없이 운영에 활성화하지 않는다.
7. 웹/Android에서 같은 Google subject → 같은 user UUID → 같은 개인 ledger UUID 및 금융 행을 읽는지 격리 테스트 계정으로 확인한다. origin별 쿠키/localStorage는 공유되지 않는다. 기존 계정의 row 수/내용과 권한을 비교하고 원격 금융 테스트 쓰기를 실사용자 장부에 수행하지 않는다.

기존 OAuth 클라이언트/Android 서명 설정은 바꾸지 않았다. 같은 origin에는 Google 콘솔 추가 작업이 없다. 새 웹 origin을 쓰면 그 정확한 origin만 기존 웹 클라이언트의 승인된 JavaScript 원본에 등록한다. 이 구현은 redirect URI를 새로 추가하거나 client secret을 요구하지 않는다.

## 검증

`npm run check:onboarding`: 격리된 메모리 SQLite 인증/개인/공유 DB에서 기존 데이터 우선, 전체 최초 이전, 두 기기 경합, 요청 경합, 응답 유실 재시도, 중간 실패 롤백, 빈 검사 후 새 행 발생, 로그아웃/재로그인/기한 만료, 과거 사용자, 실제 7일 초기화 후 재이전 금지, 손상/초과 원본, 카드 이력, 다른 계정/공유 대상/Origin 차단, 직접 context 진입, Google/브라우저 세션 발급을 검사한다. 실사용자 DB를 호출하지 않는다.

`node scripts/check-personal-onboarding-ui.mjs`: 실제 서버 처리기를 격리된 메모리 SQLite에 연결해 브라우저에서 계정 없는 루트의 로컬 진입, 최초 로그인 이전, 원본 보존, 설정의 합치기 제거/개인 장부 열기, 별도 브라우저 기기의 재로그인을 검증한다. 금융 `/api/data` 반복 쓰기는 0건이어야 한다. `--serve`는 검사 후 로컬 화면 확인 서버를 유지하며 Ctrl+C로 종료한다.
