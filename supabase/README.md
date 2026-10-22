# 공유 메모 데이터베이스

Supabase의 PostgreSQL, 이메일·비밀번호 인증, Realtime을 사용한다. 승인된 회원은 하나의 메모 라이브러리를 공유한다. 브라우저에는 프로젝트 URL과 공개용 publishable/anon key만 넣는다. `service_role` key나 DB 비밀번호를 프런트엔드 환경변수에 넣지 않는다.

## 운영 배포: 기본 이메일 인증 흐름

1. Supabase Free 프로젝트를 생성한다. 무료 한도와 비활성 프로젝트 정책은 [공식 요금 안내](https://supabase.com/pricing)에서 확인한다.
2. SQL Editor 또는 Supabase migration으로 `migrations/202610220001_shared_notes.sql`을 한 번 적용한 다음 `migrations/202610220002_harden_platform_event_trigger.sql`을 적용한다. 기존 앱의 DB 대신 새 프로젝트에 적용하는 것을 전제로 한다. 두 번째 파일은 플랫폼의 `public.rls_auto_enable()` 이벤트 트리거 함수가 있을 때만 일반 클라이언트의 직접 실행 권한을 회수하며, 자동 RLS 기능은 유지한다. 해당 함수가 없는 로컬 DB에서는 아무것도 바꾸지 않고 반복 적용해도 안전하다.
3. Authentication → Email에서 회원가입과 **Confirm email을 활성화**한다. 이메일 변경은 이전·새 이메일 양쪽 확인을 활성화한다. **Confirm email을 끄면 Supabase가 이메일을 자동 확인 처리하며 이것은 이메일 소유 증명이 아니다.** SMTP 없는 운영을 선택하더라도 아래 절차대로 신원이 확인된 관리자 사용자 ID를 먼저 예약하기 전에는 이 설정을 끄지 않는다.
4. Authentication → URL Configuration의 Site URL을 실제 `https://…vercel.app` 주소로 설정한다. 이 주소와 앱에서 사용하는 인증 리다이렉트 경로를 Redirect URLs에 등록한다. 임의의 외부 URL 또는 광범위한 wildcard를 운영 설정에 추가하지 않는다.
5. 일반 사용자의 회원가입 인증과 비밀번호 재설정을 위해 **Custom SMTP**를 구성한다. Supabase 기본 발송기는 프로젝트 팀원 이메일로만 발송하며 운영용 일반 회원가입 발송기로 사용할 수 없다. 이미 보유한 SMTP나 별도 무료 발송 한도가 있는 공급자를 연결해야 한다. SMTP 비밀번호는 Supabase 설정에만 저장한다. [공식 SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp)
6. `kge@lawbahn.com`으로 가입하고 실제 받은 인증 메일의 링크를 눌러 이메일 인증을 마친다. 이 계정만 자동 승인되어 최고관리자가 된다. 비밀번호는 계정 소유자가 직접 정한다.
7. 별도의 일반 계정으로 가입·이메일 인증을 진행한다. 승인 전 메모 열람이 차단되는지 확인하고, 최고관리자 계정에서 승인한 뒤에만 메모를 이용할 수 있는지 확인한다.

최고관리자는 인증 당시 원래 가입 이메일과 현재 이메일이 모두 `kge@lawbahn.com`인 계정에 한 번만 예약된다. 다른 계정의 이메일을 바꾸거나 사용자 metadata에 역할을 넣어도 최고관리자가 되지 않는다. 최고관리자 계정의 현재 이메일이 바뀌면 관리자 권한이 사라진다. 계정 삭제·재가입으로 이 예약을 가져갈 수 없으며, 계정 복구는 프로젝트 소유자가 본인 확인 후 DB에서 별도로 처리한다.

## 선택 사항: SMTP 없는 운영

기본값은 `VITE_EMAIL_DELIVERY_ENABLED=true`다. 아래는 아직 수행되었다고 가정하지 않는 별도 운영 절차이며, UI 설정만으로 Auth 설정이나 DB 권한이 변경되지는 않는다.

1. **Confirm email을 켜 둔 상태에서** DB 소유자가 실제 관리자의 신원을 별도로 확인한다. 소유자가 관리 경로로 `kge@lawbahn.com` 계정을 직접 생성·확인하고 해당 계정의 영구 사용자 ID를 확정한다. 이메일 확인을 먼저 끄고 공개 가입으로 관리자 계정을 만드는 순서는 허용하지 않는다.
2. `app_private.superadmin_identity`의 관리자 예약이 신원이 확인된 바로 그 영구 사용자 ID에 바인딩되어 있는지 DB 소유자가 확인한다. 최초 가입 이메일과 현재 이메일도 `kge@lawbahn.com`이어야 한다. 다른 사람이 선점한 계정이거나 예약이 비어 있다면 진행하지 않는다.
3. 앞 단계가 완료된 뒤에만 프로젝트 소유자가 SMTP 없는 운영을 선택하여 Confirm email을 끈다. Secure email change는 유지한다. 프런트엔드에 `VITE_EMAIL_DELIVERY_ENABLED=false`를 설정하고 재배포한다. 이 값은 메일 발송 관련 화면만 제어하며 마이그레이션이나 승인 검사를 완화하지 않는다.
4. 일반 계정 가입 후 승인 전 메모 접근이 차단되는지, 별도 본인 확인을 거쳐 관리자 승인 후에만 접근되는지 확인한다. 자동 확인된 이메일은 소유가 검증된 주소로 취급하지 않는다.

이 모드에서는 가입 확인 메일 재발송과 비밀번호 재설정 메일 요청을 제공하지 않는다. 비밀번호를 잊으면 프로젝트 소유자의 별도 본인 확인과 계정 복구 절차가 필요하며, 앱에는 다른 회원의 비밀번호를 조회·변경하는 관리 기능이 없다. 관리자 계정을 삭제하거나 새 계정에 기존 예약을 임의로 넘기는 것은 복구 절차가 아니다.

## 데이터와 권한

| 객체 | 용도 | 브라우저 권한 |
| --- | --- | --- |
| `public.profiles` | 표시 이름과 승인 상태 | 자신의 행, 최고관리자 전체, 승인 회원에게 승인된 회원의 안전한 프로필만 조회 |
| `public.notes` | 공유 메모의 현재 버전 | Supabase 계정 확인 상태·승인이 모두 완료된 회원만 조회 |
| `public.note_revisions` | 저장 시점별 불변 이력 | Supabase 계정 확인 상태·승인이 모두 완료된 회원만 조회 |
| `app_private.signup_identities` | 최초 가입 이메일 | 접근 불가 |
| `app_private.superadmin_identity` | 최고관리자 계정 예약 | 접근 불가 |
| `app_private.membership_events` | 승인·거절·정지 변경 감사 기록 | 접근 불가 |

클라이언트의 테이블 직접 INSERT/UPDATE/DELETE는 허용하지 않는다. 변경은 아래 RPC에서 서버가 현재 사용자와 승인 상태를 다시 검사한 뒤 실행한다. 회원을 정지하면 기존 로그인 상태에서도 이후 DB 조회·저장이 차단된다. 이미 기기로 내려받은 데이터나 사용자가 저장한 사본을 회수하는 기능은 아니다.

## 프런트엔드 계약

| RPC | 매개변수 | 반환값 |
| --- | --- | --- |
| `current_access` | 없음 | `{ is_admin, status, email_verified }` JSON |
| `update_my_display_name` | `p_display_name` | profile 객체 |
| `list_members` | 없음 | 최고관리자만 회원 목록; 이메일과 Supabase 확인 상태 포함 |
| `set_member_status` | `p_user_id`, `p_status` | 변경된 profile 객체 |
| `create_note` | `p_title`, `p_body` | 생성된 note 객체 |
| `save_note` | `p_note_id`, `p_expected_version`, `p_title`, `p_body`, `p_is_pinned`, `p_archived` | 저장된 note 객체 |

- `email_verified`는 Supabase의 `email_confirmed_at` 설정 여부다. Confirm email이 켜진 기본 흐름에서는 이메일 인증 결과지만, 꺼진 모드에서는 자동 확인 상태이므로 이메일 소유 증명으로 사용할 수 없다.
- 회원 상태: `pending`, `approved`, `rejected`, `suspended`. 최고관리자 자신의 상태 변경은 금지하며, `email_confirmed_at`이 없는 일반 회원의 승인을 거부한다. SMTP 없는 모드에서도 이 검사와 관리자 승인 요건을 그대로 유지한다.
- 제목은 공백 제거 후 1~160자, 본문은 최대 100,000자. 이름은 공백 제거 후 1~80자.
- 메모 필드: `id`, `title`, `body`, `version`, `is_pinned`, `archived_at`, `created_by`, `updated_by`, `created_at`, `updated_at`.
- 이력 필드: `id`, `note_id`, `version`, `title`, `body`, `is_pinned`, `archived_at`, `edited_by`, `created_at`.
- 메모를 읽은 `version`을 저장 RPC의 `p_expected_version`에 전달한다. 그 사이 다른 회원이 저장했다면 PostgreSQL 오류 코드 `PT409`/HTTP 409가 반환된다. 프런트엔드는 로컬 초안을 유지하고 최신 내용을 보여 주며 사용자가 비교한 다음 저장하도록 한다.
- 보관·복원·고정도 같은 저장 RPC와 버전 검사를 사용한다. 실제 삭제 RPC는 제공하지 않는다.
- 권한 오류는 `42501`, 입력 오류는 `22023`, 없는 회원·메모는 `PT404`다.
- 메모 목록은 `notes`의 `updated_at` 역순으로 읽는다. 이력은 `note_revisions`에서 `note_id`로 필터링하고 `version` 역순으로 읽는다.
- `notes`, `profiles`는 `supabase_realtime` publication이 존재하면 migration에서 등록한다. Supabase Postgres Changes는 RLS로 허용된 행의 INSERT/UPDATE만 전달한다. 클라이언트는 자신의 profile UPDATE를 감시하여 승인·정지 변경 시 접근 상태를 다시 조회한다. [공식 Realtime 권한 안내](https://supabase.com/docs/guides/realtime/authorization)

## 검증

프로젝트 루트에서 실행한다.

```sh
node supabase/tests/security.mjs
```

`@electric-sql/pglite`로 실제 PostgreSQL migration을 실행한다. Supabase Auth의 사용자 테이블과 `auth.uid()`만 테스트용으로 대체한다. 익명 접근, 미승인·정지 계정, 관리자 이메일 변조, metadata 역할 위조, 직접 테이블 변경, 이력 변경, 충돌 저장, 보관·복원, 안전한 함수 권한과 `search_path`를 검증한다. 실제 SMTP, Supabase Auth 인증 링크, Realtime 전달, Vercel 연동은 배포 환경에서 추가 확인해야 한다.

설계는 [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions), [Auth 일반 설정](https://supabase.com/docs/guides/auth/general-configuration)을 따른다.
