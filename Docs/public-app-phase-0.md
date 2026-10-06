# 공개형 앱 전환: 0단계 작업 기록

작성: 2026-10-07 · 브랜치: agy · 기준 커밋: 8e0ce38

## 현재 진행 상태

0단계 준비 도구를 구현했다. 운영 SQL 백업, 로컬 D1 복원과 읽기 API 검증을 수행했다. **원격 스테이징 분리·화면/쓰기 복원 시험·인증 구현은 아직 완료하지 않았다.** 공개형 앱 전환의 전체 단계와 완료 기준은 [전환 계획](public-app-auth-plan.md)을 따른다.

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

## 2026-10-07 실행 결과

- 준비 도구 커밋: `b2fec50`.
- Wrangler `4.148.0`으로 Cloudflare 로그인 및 D1 접근 확인. 기존 프로젝트에 Wrangler가 설치되지 않아 `--no-install` 조회는 실패했으며, 버전 지정 실행으로 해결했다. 의존성 파일은 변경하지 않았다.
- Pages 프로젝트 `mywallet`: 대시보드 API의 운영 브랜치 설정은 `main`. 운영과 미리보기 모두 D1 `8dfd0da4-d04e-4f57-bc74-4cc567d2de0e`에 연결됨. 사용자가 배포 대상으로 사용하는 agy와 이 설정의 관계는 인증 배포 전 확인해야 한다.
- 쿠키 없는 `https://mywallet-8mx.pages.dev/api/data` 요청은 `200 application/json`, 리다이렉트 없음. 본문은 출력하지 않고 스트림을 취소했다. 인증 차단은 확인되지 않았으므로 공개 가입을 열 수 없는 상태다. PATCH로 접근 여부를 시험하지 않았다.
- 전체 SQL 백업 위치: `%LOCALAPPDATA%\Memoney\backups\phase0-1fa41fa652dd4202b957f75b2d57abd1\baseline.sql`. 개인 장부가 포함되므로 공유·Git 등록 금지. 기본 사용자 프로필 권한을 상속하며 별도 암호화·접근 권한 감사는 아직 수행하지 않았다.
- 백업 SHA-256: `27cebbeb7bb38dc8b5a15e4d6b2ed06b25b7adc12399d6ab343509294bc1be93`.
- Time Travel bookmark: `00000424-00000000-000050fc-8a7651f5c90db5e746d267327d41079f`. 백업 전과 복원 후 조회에서 동일했다. 실제 Time Travel 복구는 실행하지 않았다.
- 같은 폴더에 `baseline.sqlite`, `restored.sqlite` 생성. 메모리 SQLite에 전체 SQL을 각각 적용한 뒤 파일로 백업했다. 기존 파일 덮어쓰기와 운영 import는 하지 않았다.
- 두 복원본의 11개 사용자 테이블 건수·스키마·전체 행 해시가 일치하고 선언된 외래 키 위반은 0. 원격 D1의 각 테이블을 읽기 전용 COUNT로 별도 조회하여 11개 건수 모두 일치했다. 이는 원격의 모든 행을 해시 비교한 검증은 아니다.
- 건수: 거래 437, 자산 14, 계획 34, 카테고리 23, 설정 8, 정기 규칙 5, 정기 삭제 이력 2, 카드 결제 2, 작업 결과 400, 변경 이력 382, 동기화 그룹 9.
- 원격 건수 일괄 UNION 조회는 D1의 compound SELECT 제한으로 실패했다. 원인을 확인한 뒤 개별 SELECT로 조회했다. 운영 데이터 변경 없음.

### 분리된 로컬 실행

`wrangler.sandbox.json`은 실제 원격 DB 대신 로컬 전용 placeholder ID와 `remote: false`를 사용한다. 기존 `wrangler.toml`과 기존 개발 명령은 유지한다.

```powershell
npm run build
node scripts/dev-sandbox.mjs --check
node scripts/dev-sandbox.mjs
```

- 포트 5184. 기존 앱 포트 5174와 분리한다. 상태는 `%LOCALAPPDATA%\Memoney\sandbox\<작업폴더 해시>`에 저장하며 기존 `.wrangler`에 접근하지 않는다.
- 시작 전 실제 DB ID, remote 연결, 추가 바인딩·환경 덮어쓰기를 거부한다. 임의 CLI 옵션도 전달받지 않는다. 실행 도구의 경로를 우회하여 Wrangler를 직접 실행하면 이 보호는 적용되지 않는다.
- 처음에는 빈 시험 DB로 시작한다. 현재 API 전체 구조를 사용하려면 확보한 전체 스키마를 이 별도 로컬 DB에 먼저 적용해야 한다. 초기 `schema.sql`과 0001~0007만으로 충분하다고 가정하지 않는다. 아래 후속 시험에서 전체 백업 import와 서버 기동·읽기 API 검증을 수행했다. 화면·쓰기 검증은 아직 하지 않았다.
- 테스트: `node --test scripts/check-d1-restore.test.mjs scripts/dev-sandbox.test.mjs` 4개 통과. Node SQLite 모듈은 현재 실험적 API라는 경고를 출력한다.

### 로컬 D1 및 API 복원 시험 (후속 단계)

- 복원 전 별도 시험 상태 폴더가 존재하지 않음을 확인하고, 검증된 로컬 전용 설정으로 다음 명령을 실행했다. 이 명령을 데이터가 있는 DB에 재실행하지 않는다.

  ```powershell
  npx --yes wrangler@4.148.0 d1 execute memoney-sandbox-local --local --config wrangler.sandbox.json --persist-to "$env:LOCALAPPDATA\Memoney\sandbox\4670b876ae30" --file "$env:LOCALAPPDATA\Memoney\backups\phase0-1fa41fa652dd4202b957f75b2d57abd1\baseline.sql"
  ```

- 로컬 D1에 1,334개 SQL 명령 적용 성공. 운영 D1이나 기존 `.wrangler`로 import하지 않았다. SQL 파일·복원 DB는 Git에 포함하지 않았다.
- 실제 서버 기동에서 Pages는 사용자 지정 `--config` 경로를 거부했다. 이전 커밋의 실행 도구는 설정 단위 시험만 통과했던 것이며 실제 실행 가능성은 검증되지 않았었다. 원인을 확인하고 보완했다.
- 보완된 도구는 `%LOCALAPPDATA%\Memoney\sandbox-runtimes\<작업폴더 해시>-<임시값>`에 매번 새 실행 디렉터리를 만들고 표준 `wrangler.json`, 빌드 산출물, 현재 Functions만 복사한다. 운영 설정·`.dev.vars`·브라우저 캐시를 복사하지 않는다. 삭제된 핸들러가 이전 실행 디렉터리에 남아 재사용되는 것도 방지한다. Windows 실행은 Node로 npx CLI를 호출하며 쉘 명령 문자열을 조합하지 않는다.
- 실제 서버 로그에서 DB 바인딩 모드 `local`, 주소 `http://127.0.0.1:5184` 확인. 기존 5174 서버·브라우저는 조작하지 않았다. 서버는 시험을 계속할 수 있도록 유지했다. 복원본에는 개인 데이터가 있으므로 localhost 포트를 외부에 공개하지 않는다.
- 로컬 D1 파일은 시험 상태의 `v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite`. 런타임 버전에 따라 파일명은 달라질 수 있다.
- 원본 백업 SQLite와 실제 로컬 D1 사이의 11개 테이블·스키마·전체 행 해시 비교에서 차이 없음.
- `check-sandbox-api.mjs`는 주소를 loopback 5184로 고정하고 GET만 수행한다. 개인 장부 행은 출력하지 않는다. 전체 조회의 활성 거래 415건과 거래 필드 전체, 자산·계획·정기 규칙·삭제 이력·카드 결제·카테고리 건수, `updatedAt`·커서를 대조했다. 자산 등 거래 외 항목은 API의 건수만 검증하며 필드별 비교는 아직 하지 않았다.
- 변경 이벤트 382건을 페이지 끝까지 조회하여 payload·삭제 이벤트·revision·커서가 DB와 일치함을 확인했다. 빈 마지막 페이지, 잘못된 커서의 400, 정상 조회의 `Cache-Control: no-store`도 검증했다. GET 전후 DB 전체 내용이 동일했다.
- 이번 검증은 기존 개인용 API의 복원 검증이다. 사용자별 격리·인증·동시 쓰기·복구 실패 대응이 해결됐다는 뜻은 아니다.

  ```powershell
  node scripts/check-sandbox-api.mjs "$env:LOCALAPPDATA\Memoney\sandbox\4670b876ae30\v3\d1\miniflare-D1DatabaseObject\9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite"
  node --test scripts/check-d1-restore.test.mjs scripts/dev-sandbox.test.mjs scripts/check-sandbox-api.test.mjs
  ```

## 다음 단계와 중단 기준

- 다음 작업: 원격 스테이징 DB/Pages 바인딩 분리 → 인증 골격 구현. 기존 배포의 미리보기 바인딩을 즉시 바꾸지 않고 별도 비공개 시험 배포를 준비한다. 원격 환경 생성·배포 설정 변경은 아직 실행하지 않았다.
- 인증 착수에 필요한 선택: 최초 로그인 수단/제공자. 기본 설계는 관리형 OIDC이며 비밀번호 직접 저장은 하지 않는다.
- 운영 이전 전 필요한 선택: 기존 장부의 소유 계정. 첫 가입자에게 자동 귀속하지 않는다.
- 계정 삭제·내보내기 정책과 공개 가입 시점은 베타 전에 확정한다.
- 백업 검증 실패, 예상 밖 테이블 누락, 운영 DB 연결 발견 시 마이그레이션을 중단한다. 운영 D1 스키마·데이터는 수정하지 않고 기존 개인용 배포를 유지한다.
- 인증만 붙여 공개하지 않는다. 서버 소유권 격리와 계정별 클라이언트 캐시 시험까지 통과해야 한다.
