# MyWallet 작업 규칙


## Sync API policy and delivery plan

### Non-negotiable rules

- `POST /api/data` must never delete and recreate every table as a normal save path. It is legacy-only until removed after migration.
- A user action writes only its own logical unit: one transaction, one asset, one recurring rule, one category, one setting key, or one explicit reorder group.
- Reordering assets or categories writes only that group order. It must not rewrite transactions, unrelated assets, plans, settings, or recurring rules.
- Every mutable row has a stable `id` and a server-managed `revision` (or equivalent version). The client sends the last known revision for update/delete requests.
- A conflict is scoped to the same row or the same reorder group. Unrelated changes by another user must not block or overwrite each other.
- The server validates and applies an operation atomically. A version check and its data mutation must be in the same D1 transaction/batch; a failed operation must leave all data unchanged.
- `GET /api/data` remains the initial-load/safe-recovery snapshot endpoint only. It is not a persistence mechanism.
- Browser local storage is an offline recovery cache only. It is never evidence that a remote write succeeded.
- A UI action is marked saved only after the operation API responds successfully. On network failure, keep an explicit retryable pending operation; never silently replace the remote dataset.
- API changes require build verification, a read-only remote-D1 verification, and a local UI review on the fixed `5174` server. Do not change production data during diagnosis or test interactions without explicit authorization.

### Staged replacement plan

1. Freeze the destructive snapshot-save path: audit every `saveRemoteD1` call and prevent it from being used by normal edits, drag/drop, registration, deletion, or category ordering.
2. Add version/order support safely: introduce additive schema fields and an order record for each reorderable group. Existing records keep their IDs and values; no deletion, rewrite, or data conversion is allowed.
3. Add operation endpoints alongside the existing snapshot endpoint: create/update/delete by row ID and reorder by group. Return the affected canonical row/group and its revision.
4. Replace client mutation paths one domain at a time, starting with asset drag/drop. Queue only operations for the same row/group; allow unrelated rows to save independently.
5. Add conflict UX: refresh only the conflicting row/group, preserve unsaved user input, and show a clear retry choice. No global "all data conflict" state for a one-row change.
6. Verify with remote D1 using non-destructive reads and controlled UI actions: asset reorder persistence, simultaneous independent edits, same-row conflict, offline retry, reload, and cross-device refresh.
7. Remove the legacy full-snapshot write route only after all domains use operation APIs and the backup/restore flow has a separately verified administrative import route.
## 브라우저 검토 유지

- 작업 완료 뒤에도 사용자가 결과를 직접 검토할 수 있도록 Codex 내부 브라우저 탭을 닫지 않는다. 사용자의 명시적 요청 없이 브라우저를 닫거나 검토 화면을 대체하지 않는다.

## 고정 검토 서버

- 검토용 로컬 서버 주소는 반드시 `http://127.0.0.1:5174`로 고정한다. 포트 `5173` 또는 다른 주소로 변경·안내·실행하지 않는다.
- `run.bat`, `package.json`의 개발 실행 명령, Codex 내부 브라우저 주소는 모두 `5174`와 일치해야 한다. 하나라도 다르면 작업을 중단하고 먼저 통일한다.
- 검토 서버는 `wrangler.toml`의 `remote = true` D1 바인딩만 사용한다. `--d1=DB` 같은 로컬 D1 강제 인자와 `.wrangler` 데이터를 사용한 검토를 금지한다.
- 같은 포트에 이전 서버와 최신 서버를 함께 실행하지 않는다. 시작 전 기존 리스너의 실행 명령과 데이터 연결을 확인하고, 최신 원격 D1 서버 하나만 유지한다.

## UI/UX 기준 문서

- 화면이 비슷해 보인다는 이유만으로 완료 처리하지 않는다. 영향받는 모든 모드, 단일 셸 유지, 터치 대상 크기, 포커스 표시, 최신 브라우저 동작을 확인한다.
- 모드 전환 UI는 공통 모달 셸을 유지하고 내부 폼과 제출 처리만 바꾼다. 모달을 닫고 다른 모달을 열어 전환하지 않는다.
- 동등한 모드의 입력칸과 하단 액션은 공통 높이·위치·안전 영역 여백을 사용한다.
- 모바일 주요 조작 대상은 44px 이상, 압축 조작 대상은 40px 이상을 목표로 한다. 키보드 포커스는 잘리지 않고 보이게 한다.
- 드롭다운은 동일 흐름에서 동일 컴포넌트와 동작을 사용하며, 열린 메뉴의 위치·레이어·선택·닫힘을 실제 브라우저에서 검증한다.
- UI는 정보 계층을 먼저 설계한다. 화면마다 제목, 현재 상태, 핵심 행동, 보조 행동의 우선순위가 한눈에 구분되어야 하며, 강조색은 현재 선택과 단 하나의 주요 행동에만 사용한다.
- 동일한 목적의 컴포넌트는 화면마다 카드 반경, 테두리, 간격, 글자 크기, 아이콘 크기, 누름·비활성·포커스 상태를 공유한다. 한 화면만 예외값으로 보정하지 않는다.
- 폼은 사용자가 읽는 순서와 입력 순서가 일치해야 한다. 필수 입력을 먼저 배치하고, 연관된 항목만 같은 행에 둔다. 모바일에서 한 행의 두 입력은 각각의 의미와 터치 여유가 명확할 때만 허용한다.
- 통합 등록의 자산 모드는 예외 없이 `카테고리`, `자산 이름`, `기초 금액`, `메모`를 각각 1행 1칸(전체 폭)으로 배치한다. 자산 폼에는 2분할 행을 사용하지 않는다. 거래 모드의 날짜/시간·금액/할부 같은 연관 입력만 2분할을 허용한다.
- 모달은 한 가지 완료 목표만 가진다. 제목·모드·본문·하단 행동 순서를 고정하고, 모드 전환 시 제목과 하단 행동의 의미가 즉시 함께 바뀌어야 한다.
- 하단 고정 행동은 키보드·안전 영역·스크롤과 충돌하지 않아야 한다. 행동 버튼은 입력 영역보다 작거나 다른 위치에 놓이지 않으며, 취소는 보조·등록은 주 행동으로 표현한다.
- 색만으로 상태를 전달하지 않는다. 활성·오류·선택 상태에는 텍스트, 아이콘, 테두리 또는 형태 변화 중 하나를 함께 제공한다. 일반 텍스트와 배경의 대비는 WCAG AA 수준을 목표로 한다.
- 빈 상태, 로딩, 저장 성공·실패, 삭제·되돌리기, 유효성 오류를 설계 대상에 포함한다. 오류는 문제·해결 방법·다음 행동을 입력칸 가까이에 명확히 보여 준다.
- 애니메이션은 상태 변화를 설명할 때만 짧게 사용하며, 모드 전환·드롭다운·저장 중에는 레이아웃 점프, 깜빡임, 초점 손실을 만들지 않는다.
- UI 변경 검증은 기본 화면 하나로 끝내지 않는다. 작은 모바일 폭, 일반 모바일 폭, 데스크톱 폭에서 확인하고, 빈 값·긴 값·선택된 값·오류·열린 드롭다운·가상 키보드 상태를 점검한다.

## 필수 실행 형태

- 실데이터 검토는 최신 로컬 UI를 `wrangler pages dev`로 실행하고, 출력에서 `env.DB`의 `Mode`가 반드시 `remote`인 것을 확인한 뒤 진행한다.
- 이때 여는 주소는 로컬 UI 주소여도 원격 D1 데이터를 사용하는 주소다. 로컬 D1 바인딩, `.wrangler` 상태, `localStorage`를 대체 데이터로 사용하지 않는다.

모든 작업 시작 전 이 문서를 먼저 읽고 따른다.

## 실데이터 검토 원칙

- 화면·동작 검토의 기준은 호스팅된 MyWallet 앱과 그 앱이 사용하는 실제 서버 데이터다.
- 로컬 D1, `.wrangler` 상태 파일, 브라우저 `localStorage`는 실데이터 검토를 위해 열거나 읽거나 기준으로 사용하지 않는다.
- 로컬 개발 서버는 코드 빌드 확인 용도로만 사용한다. 로컬 데이터가 호스팅 데이터와 같다고 가정하지 않는다.
- 실제 데이터 동기화 여부가 필요한 경우, 호스팅 환경의 화면과 서버 상태를 기준으로 확인한다.

## 브라우저 규칙

- 사용자가 열어 둔 Codex 내부 브라우저 탭은 사용자의 명시적 요청 없이 닫지 않는다.
- 탭 새로고침·전환·새 탭 생성은 사용자 화면 흐름에 영향을 줄 수 있으므로, 필요한 경우에만 하고 이유를 먼저 알린다.
- 검토 화면을 열 때는 사용자에게 보이는 브라우저 상태를 유지한다.

## 변경과 검증

- 변경은 요청 범위로 한정하고, 한글·이모지 텍스트 수정은 `apply_patch`로만 수행한다.
- 작은 변경마다 `npm run build`를 실행한다.
- 커밋·푸시는 사용자가 명시적으로 요청한 경우에만 수행한다.
- `.wrangler`, `tsconfig.tsbuildinfo`, 백업 파일 등 런타임·생성 파일은 의도적으로 요청되지 않는 한 커밋하지 않는다.
