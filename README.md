# 모아노트

승인된 회원들이 함께 사용하는 한국어 공유 메모장입니다. React + TypeScript + Vite, Supabase PostgreSQL/Auth/Realtime, Vercel 배포로 구성합니다.

## 기능

- 이메일·비밀번호 회원가입과 로그인, 이메일 인증, 비밀번호 재설정
- 최고관리자 `kge@lawbahn.com`의 가입 승인·거절·이용 정지
- 승인된 모든 회원이 함께 사용하는 메모 목록과 편집 화면
- 메모 검색·고정·보관·복원, 버전별 수정 이력
- 변경 알림과 버전 확인을 통한 동시 저장 충돌 방지
- 모바일 대응 화면과 키보드 저장 단축키

동시에 입력하는 글자를 자동 병합하는 편집기는 아닙니다. 저장 시 다른 회원이 먼저 저장했으면 본인을 포함한 기존 변경을 덮어쓰지 않고 최신본 확인을 요청합니다. 로컬 초안은 사용자가 확인할 때까지 편집창에 유지됩니다. `?demo=1`은 화면 검토용 메모리 체험이며 실제 서버 데이터를 저장하지 않습니다.

## 로컬 실행

Node.js 24와 pnpm 11.25.0을 사용합니다.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# .env.local에 실제 프로젝트 URL과 publishable/anon 키 입력
pnpm dev
```

환경변수 미설정 시 설정 안내 화면을 표시합니다. 비밀 키를 입력하라는 사용자용 화면은 제공하지 않습니다.

```sh
pnpm test
pnpm build
```

`pnpm test`는 PGlite에서 PostgreSQL 권한·트리거·RPC 61개 항목을 검사하고, 실제 React 컴포넌트를 렌더링해 승인 차단·느린 생성/저장 중 초안 보존·충돌 처리를 4개 통합 테스트로 확인합니다. 실제 Supabase 메일 전송, 웹소켓, 호스팅 계정 설정은 별도 운영 검증이 필요합니다.

## Supabase 배포

1. 본인 조직에 **Free 요금제** 프로젝트를 만듭니다. 한국 이용자는 Seoul (`ap-northeast-2`)을 선택합니다.
2. 새 프로젝트의 SQL Editor에서 `supabase/migrations/202610220001_shared_notes.sql`을 한 번 실행합니다. SQL은 트랜잭션으로 적용됩니다. 기존 서비스를 운용하는 DB에 무단 적용하지 않습니다.
3. Authentication → Providers → Email에서 이메일 가입과 **Confirm email**을 켭니다. 이메일 인증은 관리자 식별의 필수 전제입니다. **Secure email change**도 유지합니다.
4. Authentication의 SMTP 설정에 발송 가능한 SMTP를 연결합니다. Supabase 기본 SMTP는 프로젝트 팀원 주소 외 일반 회원에게 보낼 수 없습니다. 인증을 끄는 방식으로 우회하지 않습니다. SMTP 비밀번호/API 키는 Supabase 설정에만 저장합니다.
5. Authentication URL Configuration의 Site URL과 Redirect URLs에 배포된 `https://….vercel.app`을 등록합니다. 개발 중에는 `http://127.0.0.1:5173`도 등록할 수 있습니다. 운영 도메인을 지정할 때 광범위한 와일드카드는 피합니다.
6. 프로젝트 URL과 Publishable key(또는 legacy anon key)를 아래 Vercel 환경변수에 설정합니다.

```text
VITE_SUPABASE_URL=https://프로젝트ID.supabase.co
VITE_SUPABASE_ANON_KEY=프로젝트의_publishable_또는_anon_키
```

브라우저용 키는 공개 식별자입니다. **service_role/secret 키는 이 앱에 사용하지 않습니다.** 데이터 권한은 DB RLS와 검사된 RPC로 제한합니다.

## GitHub와 Vercel

1. 이 디렉터리를 확정된 공개 GitHub 저장소 [hahn27541-pixel/gaeun](https://github.com/hahn27541-pixel/gaeun)에 커밋·업로드합니다. `.env*` 실제 값과 `.vercel`은 추적에서 제외됩니다.
2. Vercel에서 해당 저장소를 Import합니다. Framework는 Vite, Build Command는 `pnpm build`, Output Directory는 `dist`입니다.
3. 위 환경변수 두 개와 `ENABLE_EXPERIMENTAL_COREPACK=1`을 Production에 등록하고 배포합니다. Preview를 사용할 경우 테스트 DB를 별도로 연결하는 것을 권장합니다.
4. 기본 `vercel.app` 주소를 사용합니다. 환경변수를 바꾸면 재배포해야 합니다.
5. Supabase의 인증 리디렉션 주소를 최종 도메인과 맞춥니다.

Vercel의 Hobby 무료 호스팅은 개인·비상업 용도로 제한됩니다. 업무 용도이면 적절한 기존 요금제를 확인해야 하며, 이 프로젝트는 유료 전환이나 결제를 자동 실행하지 않습니다. 기본 도메인 사용과 호스팅 요금제는 별개입니다.

## 첫 관리자와 회원

1. 배포된 앱에서 `kge@lawbahn.com`으로 가입합니다.
2. 실제 받은 인증 메일의 링크를 열어 인증합니다.
3. 로그인하면 최고관리자가 자동 활성화됩니다. `멤버 관리`에서 이메일 인증을 완료한 회원을 승인합니다.
4. 다른 회원은 가입·인증 후 승인 대기 화면을 보며, 승인되면 메모를 이용할 수 있습니다.

관리자는 비밀번호나 역할을 코드에 하드코딩하지 않습니다. DB가 최초 가입 이메일을 기록하고 검증된 관리자 사용자 ID를 예약합니다. 다른 계정의 이메일 변경이나 프로필 메타데이터 변경으로 관리자 권한을 얻을 수 없습니다. 관리자 계정 삭제 후 재가입은 자동 복구하지 않으며 DB 소유자의 확인된 복구 절차가 필요합니다.

## 데이터와 운영 범위

- 모든 승인 회원은 같은 메모 공간을 읽고 편집합니다. 메모별 비공개 권한은 제공하지 않습니다.
- 보관은 되돌릴 수 있고, UI에서 영구 삭제하지 않습니다.
- 메모 저장과 이력 기록은 하나의 DB 트랜잭션으로 처리합니다.
- 이용 정지는 다음 DB 요청부터 적용됩니다. 이미 열람한 내용을 회수할 수는 없습니다.
- 기본 무료 서비스의 용량·발송량·일시 중지 정책은 운영 중 확인합니다. DB 백업은 별도 운영 관리 대상입니다.

공식 문서: [Supabase 무료 요금제](https://supabase.com/pricing), [인증 메일 설정](https://supabase.com/docs/guides/auth/auth-smtp), [Vercel 이용 범위](https://vercel.com/docs/limits/fair-use-guidelines).
