# 공개형 앱 전환: 0단계 작업 기록

작성: 2026-10-07 · 브랜치: agy · 기준 커밋: 8e0ce38

## 현재 진행 상태

0단계 준비 도구를 구현했다. **운영 백업·실제 복원·환경 분리·인증 구현은 아직 완료하지 않았다.** 공개형 앱 전환의 전체 단계와 완료 기준은 [전환 계획](public-app-auth-plan.md)을 따른다.

| 항목 | 확인 결과 / 다음 작업 |
| --- | --- |
| API | `functions/api/data.ts` GET/PATCH에 계정 인증·소유자 조건 없음. 외부 접근 보호는 별도 확인 필요 |
| DB 환경 | `wrangler.toml`의 DB는 `mywallet-db`, `remote = true`. 현재 개발 명령을 격리된 시험 환경으로 간주하면 안 됨 |
| 스키마 | 소유자 열 없음. API가 사용하는 `sync_groups` 등은 초기 스키마·0001~0007만으로 재현되지 않으므로 실제 DB 스키마 수집 필요 |
| 기존 내보내기 | `export-api-data-to-sql.mjs`는 API의 가공된 데이터 일부만 내보냄. 자산 연결·거래 메타데이터·카드 결제·동기화 이력 등 전체 복원에 부적합. 이번 작업에서 실행하지 않음 |
| 복원 검증 | `scripts/check-d1-restore.mjs` 추가. 로컬 SQLite 두 개를 읽기 전용 비교. 실제 운영 복원 검증과는 구별 |
| 사용자 데이터 | 운영 D1·브라우저 저장 키·`.wrangler`·PWA 로딩/아이콘 변경 없음 |

## 백업 및 복원 연습 절차

1. 운영 DB 식별자와 Pages 운영/미리보기의 실제 바인딩을 대시보드에서 대조한다. 배포 접근 제한과 미인증 API 응답도 별도 확인한다. 응답에 장부가 포함되면 공개 준비 완료가 아니다. 본문을 터미널·Git에 출력하지 않는다.
2. 사용하지 않는 시간에 D1 전체 SQL을 내보낸다. 공식 문서상 export 중에는 다른 DB 요청이 차단될 수 있다. 파일은 저장소 밖의 접근 제한 폴더에 저장하고, SHA-256·시각·DB ID·코드 커밋·Time Travel 복구 지점을 별도 기록한다. 운영 DB를 바꾸는 명령은 실행하지 않는다.

   ```powershell
   npx wrangler d1 export mywallet-db --remote --output="C:\private-backups\memoney\baseline.sql"
   Get-FileHash -LiteralPath "C:\private-backups\memoney\baseline.sql" -Algorithm SHA256
   ```

   위 경로는 예시이며, 실제 보관 폴더를 준비한 뒤 실행한다. API 내보내기나 `schema.sql`로 전체 백업을 대체하지 않는다.

3. 동일한 SQL 백업을 **서로 다른 빈 시험 DB**에 복원한다. 원본과 복원 대상의 DB ID가 다르고 시험 바인딩에 `remote = true`가 없는지 확인한다. 기존 `.wrangler`에는 복원하지 않는다. SQL의 테이블·인덱스·트리거·뷰와 적용 이력을 함께 보존한다. 운영에 `schema.sql` 또는 백업을 재실행하지 않는다.
4. 각 시험 DB를 SQLite 파일로 확보하고 아래 도구로 비교한다. 두 복원본의 일치만으로 원격 원본과의 일치를 증명하지는 못한다. 원격 원본에서 별도로 수집한 전체 테이블 건수와 거래 집계·정기 삭제 이력·카드 결제 연결 관계도 대조한다. 수집과 export 사이에는 변경이 없도록 해야 한다.

   ```powershell
   node --test scripts/check-d1-restore.test.mjs
   node scripts/check-d1-restore.mjs "C:\private-backups\memoney\baseline.sqlite" "C:\private-backups\memoney\restored.sqlite"
   ```

   Node 24 이상에서 실행한다. 도구는 네트워크 접근·DB 쓰기·보고서 저장을 하지 않는다. 모든 사용자 테이블의 건수·전체 행 해시·스키마와 외래 키 위반을 비교하고, 차이가 있으면 종료 코드 1을 반환한다. 행 순서만 달라도 실패하지 않으며 중복 행·큰 정수·BLOB은 보존해 비교한다. 거래 제목·금액·사용자 ID는 출력하지 않는다. SQLite/D1 시스템 테이블과 `d1_migrations`는 제외하므로 마이그레이션 적용 이력은 따로 확인한다. 선언된 외래 키가 없는 논리적 연결은 이 도구만으로 검증되지 않는다. 큰 DB에서는 전체 행 해시를 정렬하는 데 필요한 메모리를 고려한다.

5. 개발·스테이징·운영 D1을 분리하고, Pages 미리보기/운영 바인딩을 각각 지정한다. 시험용 설정에서 운영 DB ID를 사용하지 못하도록 검증을 추가한다. 실제 새 DB 생성·바인딩 변경은 아직 실행하지 않았다.

공식 근거: [D1 내보내기/가져오기](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Pages D1 바인딩](https://developers.cloudflare.com/pages/functions/bindings/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## 다음 단계와 중단 기준

- 다음 작업: 실제 접근 보호/Cloudflare 로그인 상태 확인 → 운영 백업 보관 → 격리 시험 환경 복원 및 원본 대조 → 인증 골격 구현.
- 인증 착수에 필요한 선택: 최초 로그인 수단/제공자. 기본 설계는 관리형 OIDC이며 비밀번호 직접 저장은 하지 않는다.
- 운영 이전 전 필요한 선택: 기존 장부의 소유 계정. 첫 가입자에게 자동 귀속하지 않는다.
- 계정 삭제·내보내기 정책과 공개 가입 시점은 베타 전에 확정한다.
- 백업 검증 실패, 예상 밖 테이블 누락, 운영 DB 연결 발견 시 마이그레이션을 중단한다. 운영 D1 스키마·데이터는 수정하지 않고 기존 개인용 배포를 유지한다.
- 인증만 붙여 공개하지 않는다. 서버 소유권 격리와 계정별 클라이언트 캐시 시험까지 통과해야 한다.
