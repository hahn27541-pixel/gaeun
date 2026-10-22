-- LAWBAHN shared notes. Apply once as the database owner in a fresh Supabase project.
-- Authentication must use email confirmation. No service-role key belongs in the browser.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create type public.member_status as enum ('pending', 'approved', 'rejected', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  status public.member_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Signup email is captured by a trusted trigger, never by browser metadata.
create table app_private.signup_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  original_email text not null,
  created_at timestamptz not null default now()
);

-- A permanent reservation prevents a different user taking over through an email change
-- or by recreating a deleted administrator account. Recovery requires the database owner.
create table app_private.superadmin_identity (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table app_private.membership_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  previous_status public.member_status not null,
  new_status public.member_status not null,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160 and title = btrim(title)),
  body text not null default '' check (char_length(body) <= 100000),
  version bigint not null default 1 check (version >= 1),
  is_pinned boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_updated_at_idx on public.notes(updated_at desc);
create index notes_created_by_idx on public.notes(created_by);
create index notes_updated_by_idx on public.notes(updated_by);
create index profiles_status_idx on public.profiles(status);

create table public.note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  version bigint not null check (version >= 1),
  title text not null,
  body text not null,
  is_pinned boolean not null,
  archived_at timestamptz,
  edited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (note_id, version)
);

create index note_revisions_edited_by_idx on public.note_revisions(edited_by);

create function app_private.is_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from app_private.superadmin_identity s
    join auth.users u on u.id = s.user_id
    where s.singleton and s.user_id = (select auth.uid())
      and lower(btrim(u.email)) = 'kge@lawbahn.com'
      and u.email_confirmed_at is not null
  );
$$;

create function app_private.is_approved_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = (select auth.uid())
      and p.status = 'approved'::public.member_status
      and u.email_confirmed_at is not null
  );
$$;

create function app_private.sync_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into app_private.signup_identities(user_id, original_email)
    values (new.id, lower(btrim(coalesce(new.email, ''))));

    insert into public.profiles(id, display_name)
    values (
      new.id,
      coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 80), ''), '새 회원')
    );
  end if;

  if lower(btrim(coalesce(new.email, ''))) = 'kge@lawbahn.com'
     and new.email_confirmed_at is not null
     and exists (
       select 1 from app_private.signup_identities
       where user_id = new.id and original_email = 'kge@lawbahn.com'
     ) then
    insert into app_private.superadmin_identity(singleton, user_id)
    values (true, new.id)
    on conflict (singleton) do nothing;

    update public.profiles set status = 'approved', updated_at = now()
    where id = new.id and exists (
      select 1 from app_private.superadmin_identity where user_id = new.id
    );
  end if;
  return new;
end;
$$;

create trigger shared_notes_auth_user
after insert or update of email, email_confirmed_at on auth.users
for each row execute function app_private.sync_auth_user();

-- Existing auth users are imported as pending. An existing, confirmed administrator
-- can bootstrap only through the explicit trusted backfill in this migration.
insert into app_private.signup_identities(user_id, original_email)
select id, lower(btrim(coalesce(email, ''))) from auth.users;

insert into public.profiles(id, display_name)
select id, coalesce(nullif(left(btrim(raw_user_meta_data ->> 'display_name'), 80), ''), '새 회원')
from auth.users;

insert into app_private.superadmin_identity(singleton, user_id)
select true, id from auth.users
where lower(btrim(email)) = 'kge@lawbahn.com' and email_confirmed_at is not null
order by created_at asc limit 1;

update public.profiles set status = 'approved'
where id in (select user_id from app_private.superadmin_identity);

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.note_revisions enable row level security;
alter table app_private.signup_identities enable row level security;
alter table app_private.superadmin_identity enable row level security;
alter table app_private.membership_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select app_private.is_superadmin())
  or (status = 'approved'::public.member_status and (select app_private.is_approved_member()))
);

create policy notes_read on public.notes for select to authenticated
using ((select app_private.is_approved_member()));

create policy note_revisions_read on public.note_revisions for select to authenticated
using ((select app_private.is_approved_member()));

create function public.current_access()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin', app_private.is_superadmin(),
    'status', (select status from public.profiles where id = auth.uid()),
    'email_verified', exists (
      select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
    )
  );
$$;

create function public.update_my_display_name(p_display_name text)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare result public.profiles;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80 then
    raise exception using errcode = '22023', message = '이름은 1~80자로 입력해 주세요.';
  end if;
  update public.profiles
  set display_name = btrim(p_display_name), updated_at = now()
  where id = auth.uid() returning * into result;
  if not found then
    raise exception using errcode = '42501', message = '회원 정보를 찾을 수 없습니다.';
  end if;
  return result;
end;
$$;

create function public.list_members()
returns table (
  id uuid, display_name text, email text, status public.member_status,
  created_at timestamptz, updated_at timestamptz, email_verified boolean, is_admin boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_superadmin() then
    raise exception using errcode = '42501', message = '최고관리자만 회원을 조회할 수 있습니다.';
  end if;
  return query
  select p.id, p.display_name, u.email::text, p.status, p.created_at, p.updated_at,
    u.email_confirmed_at is not null,
    exists (select 1 from app_private.superadmin_identity s where s.user_id = p.id)
  from public.profiles p join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

create function public.set_member_status(p_user_id uuid, p_status public.member_status)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare result public.profiles; old_status public.member_status;
begin
  if not app_private.is_superadmin() then
    raise exception using errcode = '42501', message = '최고관리자만 회원 상태를 변경할 수 있습니다.';
  end if;
  if p_status is null then
    raise exception using errcode = '22023', message = '회원 상태를 선택해 주세요.';
  end if;
  if exists (select 1 from app_private.superadmin_identity where user_id = p_user_id) then
    raise exception using errcode = '42501', message = '최고관리자의 상태는 변경할 수 없습니다.';
  end if;
  select status into old_status from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = '회원을 찾을 수 없습니다.';
  end if;
  if p_status = 'approved' and not exists (
    select 1 from auth.users where id = p_user_id and email_confirmed_at is not null
  ) then
    raise exception using errcode = '22023', message = '이메일 인증을 완료한 회원만 승인할 수 있습니다.';
  end if;
  update public.profiles set status = p_status, updated_at = now()
  where id = p_user_id returning * into result;
  if old_status <> p_status then
    insert into app_private.membership_events(user_id, previous_status, new_status, actor_id)
    values (p_user_id, old_status, p_status, auth.uid());
  end if;
  return result;
end;
$$;

create function public.create_note(p_title text, p_body text default '')
returns public.notes
language plpgsql security definer set search_path = ''
as $$
declare result public.notes;
begin
  if not app_private.is_approved_member() then
    raise exception using errcode = '42501', message = '관리자 승인 후 메모를 이용할 수 있습니다.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_body is null or char_length(p_body) > 100000 then
    raise exception using errcode = '22023', message = '제목은 1~160자, 본문은 100,000자 이내로 입력해 주세요.';
  end if;
  insert into public.notes(title, body, created_by, updated_by)
  values (btrim(p_title), p_body, auth.uid(), auth.uid()) returning * into result;
  insert into public.note_revisions(note_id, version, title, body, is_pinned, archived_at, edited_by)
  values (result.id, result.version, result.title, result.body, result.is_pinned, result.archived_at, auth.uid());
  return result;
end;
$$;

create function public.save_note(
  p_note_id uuid, p_expected_version bigint, p_title text, p_body text,
  p_is_pinned boolean, p_archived boolean
)
returns public.notes
language plpgsql security definer set search_path = ''
as $$
declare result public.notes;
begin
  if not app_private.is_approved_member() then
    raise exception using errcode = '42501', message = '관리자 승인 후 메모를 이용할 수 있습니다.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_body is null or char_length(p_body) > 100000
     or p_expected_version is null or p_expected_version < 1
     or p_is_pinned is null or p_archived is null then
    raise exception using errcode = '22023', message = '메모 입력값을 확인해 주세요.';
  end if;

  -- The row lock and expected version make content AND archive/pin changes atomic.
  select * into result from public.notes where id = p_note_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = '메모를 찾을 수 없습니다.';
  end if;
  if result.version <> p_expected_version then
    raise exception using errcode = 'PT409',
      message = '다른 사용자가 먼저 저장했습니다. 최신 메모를 확인한 뒤 다시 저장해 주세요.';
  end if;
  update public.notes
  set title = btrim(p_title), body = p_body, is_pinned = p_is_pinned,
    archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = p_note_id returning * into result;
  insert into public.note_revisions(note_id, version, title, body, is_pinned, archived_at, edited_by)
  values (result.id, result.version, result.title, result.body, result.is_pinned, result.archived_at, auth.uid());
  return result;
end;
$$;

-- Revoke platform defaults explicitly. Browser mutation is only through checked RPCs.
revoke all on public.profiles, public.notes, public.note_revisions from public, anon, authenticated;
grant select on public.profiles, public.notes, public.note_revisions to authenticated;
revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.is_superadmin(), app_private.is_approved_member() to authenticated;

revoke all on function public.current_access() from public, anon, authenticated;
revoke all on function public.update_my_display_name(text) from public, anon, authenticated;
revoke all on function public.list_members() from public, anon, authenticated;
revoke all on function public.set_member_status(uuid, public.member_status) from public, anon, authenticated;
revoke all on function public.create_note(text, text) from public, anon, authenticated;
revoke all on function public.save_note(uuid, bigint, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.current_access(), public.update_my_display_name(text), public.list_members(),
  public.set_member_status(uuid, public.member_status), public.create_note(text, text),
  public.save_note(uuid, bigint, text, text, boolean, boolean) to authenticated;

-- Supabase projects provide this publication. Local test databases need not provide it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
    ) then
      alter publication supabase_realtime add table public.notes;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
    ) then
      alter publication supabase_realtime add table public.profiles;
    end if;
  end if;
end;
$$;

commit;
