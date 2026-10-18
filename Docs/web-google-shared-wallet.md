# 웹 Google 로그인 · 개인/공유 장부 이식

2026-10-18 · 대상 `agy` · 참고 Android 커밋 `6798eb5`

## 적용 범위

- Android의 Google 서명 토큰 검증·nonce challenge·HttpOnly 세션, 장부 membership, 공유 생성/복사/이름 변경, Gmail 대상 초대·수락·철회 코드를 선택적으로 이식했다.
- Android 프로젝트·Capacitor·Credential Manager·기기 백업 플러그인·신규 브랜딩/전체 스타일 변경은 가져오지 않았다. 기존 웹 아이콘·스플래시·로딩 렌더러를 변경하지 않았다.
- 브라우저 로그인은 Google Identity Services의 공식 버튼과 팝업 callback을 사용한다. 서버에서 발급한 nonce로 초기화하고 토큰은 서버 검증에만 제출한다. 서버 쿠키 세션 재조회가 성공하기 전에는 장부를 열지 않는다. 토큰을 localStorage에 저장하지 않는다.
- `/signin`, `/wallet`, `/sharing`을 추가했다. 기존 웹 장부는 설정 → 환경의 Google 로그인으로 들어갈 수 있다. 인증된 화면에는 계정·장부 선택·공유 생성/관리와 받은 초대 팝업이 표시된다.
- 웹 기본 디자인은 유지한다. 새 계정의 기본 개인 장부는 비어 있고 기존 장부를 자동으로 가져오지 않는다. 공유 장부는 빈 장부 또는 **자신의 클라우드 개인 장부 복사본**으로 시작한다. 공유 이후 개인·공유 원본은 별개다.
- 소유 공유 장부 1개 제한, 초대받은 장부 참여, owner/editor/viewer 검사와 초대의 명시적 수락은 Android 동작을 유지한다. 초대는 현재 Gmail 계정을 대상으로 한다. 이메일이 같다고 사용자 ID를 합치지 않는다.

## 저장/권한 경계

`server/wallet/legacy-data.ts`는 기존 금융 핸들러를 옮긴 것이다. 정렬 ID의 TypeScript 타입만 보강했으며 기존 revision·operation·증분 동기화와 저장 정책은 유지한다. `/api/data`는 명시적으로 인증을 활성화한 환경에서만 인증된 라우터를 사용한다. 인증 활성화 후 설정·DB 연결이 잘못되어도 기존 무인증 핸들러로 우회하지 않는다.

| 항목 | 동작 |
| --- | --- |
| 인증 DB `DB` | 사용자, Google subject, 해시 세션, 장부·멤버십, 초대, 생성 metadata |
| 분리 금융 DB `WEB_FINANCE` | `s_<장부 UUID>_<테이블>`로 11개 금융 테이블을 장부마다 분리 |
| 개인 장부 | 인증된 내부 사용자 UUID에서 서버가 고유 장부 ID 도출. 신규 계정은 빈 장부. 중복 요청은 같은 장부로 수렴 |
| 금융 참조 | 거래·정기 규칙의 자산, 카드 결제계좌를 선택된 장부 안에서 검사 |
| 캐시/보류 작업/커서 | `memoney:user:<user>:ledger:<ledger>:`로 분리. 기존 전역 캐시를 자동 복사하거나 업로드하지 않음 |
| 접근 철회/로그아웃 | 장부 화면과 이후 금융 요청을 차단. 미전송 기록은 원래 namespace에 보존 |
| 전체 snapshot POST | 거부. 기존 row-operation 기반 PATCH만 사용 |

테이블 단위 격리는 Android 시험 구현을 재사용한 초기 구조다. 대규모 공개 서비스의 최종 스키마로 확정한 것은 아니다. 장부 수에 비례한 테이블·쿼리 비용과 D1 한도, 미사용 세션/복사 작업 정리와 남용 방지를 출시 전에 검토해야 한다. 서버가 역할을 검사하지만 viewer 전용 화면의 편집 컨트롤 세부 UX도 후속 검토 대상이다.

## 로컬 실행

```powershell
$env:MYWALLET_GOOGLE_CLIENT_ID = '<Web OAuth client ID>.apps.googleusercontent.com'
npm run web:server
```

- 주소: `http://localhost:5189/signin`. Google Cloud의 **Authorized JavaScript origins**에 `http://localhost:5189`를 별도 등록해야 한다. 기존 Android의 Web audience ID를 재사용할 수 있지만 포트가 다르면 origin 등록은 별개다. client secret은 이 ID 토큰 방식에서 사용하지 않는다.
- 기존 `.wrangler`, Android의 로컬 인증 DB, 운영 D1을 사용하지 않는다. `%LOCALAPPDATA%\Memoney\web-auth-sandbox\<작업폴더 해시>`에 로컬 전용 인증·금융 DB를 만든다. DB ID는 실제 원격 DB가 아닌 placeholder다.
- 최초 실행에서만 초기화하고 marker를 기록한다. marker 없는 기존 상태가 있으면 덮어쓰지 않고 중단한다. 초기화 실패 시 원인을 확인하기 전 상태를 삭제하거나 재실행하지 않는다.
- 실행 디렉터리에는 서버 코드와 `jose`도 복사한다. 운영 설정·개인 장부·`.dev.vars`는 복사하지 않는다. Google client ID 미지정 시 로그인은 비활성이고 금융 API도 차단된다.
- 로컬 서버와 Orca의 로그인 탭을 유지했다. 기존 브라우저 탭/서버는 종료하지 않았다.

## 운영 적용 전 필요한 별도 단계

이번 작업은 **웹 소스 이식과 로컬 검증**이다. 운영 배포, Google Cloud 설정 변경, 원격 DB 생성/스키마 적용, 기존 장부 귀속/이전, Android 시험 DB 병합은 수행하지 않았다.

1. 새 인증 DB와 금융 DB를 명시적으로 선택한다. 기존 개인용 금융 DB를 인증 DB로 그대로 쓰거나 초기화 SQL을 실행하지 않는다.
2. 새 인증 DB에 `auth-foundation-schema.sql`, `ledger-invitations-schema.sql`, `shared-creation-auth-schema.sql`, `web-wallet-auth-schema.sql`을 최초 한 번 적용한다. 새 금융 DB에는 `web-wallet-finance-schema.sql`을 최초 한 번 적용한다. 재배포마다 초기화하지 않는다.
3. 새 비공개 시험 배포에 `DB`, `WEB_FINANCE`, `AUTH_ENABLED=true`, `AUTH_WEB_WALLETS=true`, `AUTH_LEDGER_INVITES=true`, 정확한 `AUTH_ORIGIN`, Web `AUTH_GOOGLE_CLIENT_ID`를 지정한다. HTTPS에서는 `AUTH_LOCAL_DEV`를 켜지 않는다. 기존 upstream bridge 및 `TEST_FINANCE`/`TEST_SHARED_FINANCE`와 혼합하지 않는다.
4. 정확한 HTTPS origin을 Google Cloud에 등록하고, 실제 두 계정으로 로그인·개인 장부 격리·공유 초대·수락·수정·철회·로그아웃·재로그인을 확인한다. Google 시험 사용자 등록은 장부 membership 부여와 별개다.
5. 기존 웹/Android 기록을 함께 사용할지, 복사해 독립적으로 시작할지와 소유 계정을 확정한 뒤 백업·이전·대조한다. 현재 원본은 그대로 보존했다.
6. 기존 의존성 감사에서 Vite 등 6개 취약점(높음 5, 보통 1)이 확인됐다. 추가한 `jose`는 해당 감사에서 지적되지 않았다. 자동 `audit fix`나 무관한 버전 업그레이드는 하지 않았다. 공개 전 의존성 보안 정리와 로그인/가입 남용 방지·개인정보 정책도 필요하다.

인증 설정을 확인하지 못하면 시작 화면은 전역 장부 캐시를 먼저 열지 않고 재시도를 안내한다. 이전의 무인증 개인용 배포에서는 인증 설정이 명시적으로 비활성임을 확인한 뒤 기존 시작 경로를 사용한다. 따라서 초기 설정 조회가 불가능한 오프라인 시작 시에는 재시도가 필요하다.

## 검증 결과

- `npm run build`: TypeScript·Vite·기존 PWA artwork/로딩 크기 검사 통과.
- `npm run check:auth`: 인증·초대·복사·캐시·웹 격리 시험 42개 통과.
- 기존 백업/시험 환경 회귀시험 6개 통과.
- `node scripts/check-web-auth-ui.mjs`: **모의 Google 응답과 모의 장부 API**로 브라우저 로그인 → 빈 개인 장부 → 공유 생성 확인. 320/411/1280px 가로 넘침 없음, 기존 전역 캐시 미노출·보존, 금융 쓰기 요청 0. 실제 Google 계정 로그인 성공으로 간주하지 않는다.
- 실제 Wrangler 로컬 D1 기동. 미로그인 세션·장부 context·금융 GET은 401, challenge는 nonce/HttpOnly 쿠키를 발급했다. 실제 금융 데이터는 넣지 않았다.
- Orca 브라우저에서 실제 GIS 버튼 표시, 한국어 화면, 깨진 이미지 0·가로 넘침 없음 확인. 실제 Google 인증 완료와 실제 두 계정 공유는 **아직 미검증**이다.

공식 근거: [Google 웹 버튼](https://developers.google.com/identity/gsi/web/guides/display-button), [GIS JavaScript·nonce](https://developers.google.com/identity/gsi/web/reference/js-reference). 기존 [공개형 앱 계획](public-app-auth-plan.md)과 [동기화 규칙](sync-rules.md)을 함께 따른다.
