import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Executes the real migration in PostgreSQL (PGlite), with only Supabase Auth mocked.
// No external account, secrets, network, or production data are used.
const db = new PGlite();
let checks = 0;
const ids = {
  admin: '00000000-0000-4000-8000-000000000001',
  alice: '00000000-0000-4000-8000-000000000002',
  bob: '00000000-0000-4000-8000-000000000003',
  pending: '00000000-0000-4000-8000-000000000004',
  attacker: '00000000-0000-4000-8000-000000000005',
  unverified: '00000000-0000-4000-8000-000000000006',
  replacement: '00000000-0000-4000-8000-000000000007',
};

async function as(userId, sql, values = [], role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role));
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    return (await tx.query(sql, values)).rows;
  });
}

async function denied(label, operation, code = '42501') {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, code, `${label}: ${error.message}`);
    return true;
  }, label);
  checks++;
}

function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

async function addUser(id, email, verified = true, metadata = {}) {
  await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values ($1,$2,case when $3::boolean then now() else null end,$4::jsonb)`,
    [id, email, verified, JSON.stringify(metadata)]);
}

async function access(id) {
  return (await as(id, 'select public.current_access() as access'))[0].access;
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text unique,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const migration = await readFile(new URL('../migrations/202610220001_shared_notes.sql', import.meta.url), 'utf8');
  await db.exec(migration);

  await addUser(ids.attacker, 'attacker@example.com', true, {
    display_name: 'Attacker', is_admin: true, role: 'admin', status: 'approved',
  });
  check('User metadata cannot grant administrator access', await access(ids.attacker), {
    status: 'pending', is_admin: false, email_verified: true,
  });
  await db.query('update auth.users set email=$1 where id=$2', ['kge@lawbahn.com', ids.attacker]);
  check('Changing an existing account email cannot bootstrap administrator', (await access(ids.attacker)).is_admin, false);
  check('Changed-email account remains pending', (await access(ids.attacker)).status, 'pending');
  await db.query('update auth.users set email=$1 where id=$2', ['attacker@example.com', ids.attacker]);

  await addUser(ids.admin, 'kge@lawbahn.com', false, { display_name: '최고관리자' });
  check('Unverified administrator email is not privileged', await access(ids.admin), {
    status: 'pending', is_admin: false, email_verified: false,
  });
  await denied('Unverified admin cannot list members', () => as(ids.admin, 'select * from public.list_members()'));
  await denied('Unverified admin cannot create notes', () => as(ids.admin, "select * from public.create_note('비공개','')"));
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [ids.admin]);
  check('Email verification activates the reserved administrator', await access(ids.admin), {
    status: 'approved', is_admin: true, email_verified: true,
  });

  await addUser(ids.alice, 'alice@example.com', true, { display_name: 'Alice' });
  await addUser(ids.bob, 'bob@example.com', true, { display_name: 'Bob' });
  await addUser(ids.pending, 'pending@example.com', true, { display_name: 'Pending' });
  await addUser(ids.unverified, 'unverified@example.com', false);

  await denied('Anonymous cannot read notes', () => as(null, 'select * from public.notes', [], 'anon'));
  await denied('Anonymous cannot call access RPC', () => as(null, 'select public.current_access()', [], 'anon'));
  await denied('Anonymous cannot call write RPC', () => as(null, "select * from public.create_note('x','')", [], 'anon'));
  await denied('Authenticated user cannot read auth emails', () => as(ids.alice, 'select email from auth.users'));
  await denied('Authenticated user cannot read admin reservation', () => as(ids.alice, 'select * from app_private.superadmin_identity'));
  await denied('Authenticated user cannot rewrite signup identity', () => as(ids.attacker,
    "update app_private.signup_identities set original_email='kge@lawbahn.com'"));
  await denied('User cannot directly approve own profile', () => as(ids.alice,
    "update public.profiles set status='approved' where id=$1", [ids.alice]));
  await denied('Pending user cannot use create RPC', () => as(ids.pending, "select * from public.create_note('x','')"));
  await denied('Pending user cannot use admin RPC', () => as(ids.pending,
    "select * from public.set_member_status($1,'approved')", [ids.pending]));
  await denied('Pending user cannot see member emails', () => as(ids.pending, 'select * from public.list_members()'));
  check('Pending user sees only own profile', (await as(ids.pending, 'select id from public.profiles')).map(x => x.id), [ids.pending]);
  check('Admin can inspect all registered members', (await as(ids.admin, 'select * from public.list_members()')).length, 6);

  await denied('Admin cannot suspend self', () => as(ids.admin,
    "select * from public.set_member_status($1,'suspended')", [ids.admin]));
  await denied('Unverified members cannot be approved', () => as(ids.admin,
    "select * from public.set_member_status($1,'approved')", [ids.unverified]), '22023');
  for (const id of [ids.alice, ids.bob]) {
    await as(ids.admin, "select * from public.set_member_status($1,'approved')", [id]);
  }
  check('Approval state is read from the database immediately', (await access(ids.alice)).status, 'approved');
  check('Approved members only see other approved profile names',
    (await as(ids.alice, 'select count(*)::int as count from public.profiles'))[0].count, 3);
  await denied('Approved member cannot list private emails', () => as(ids.alice, 'select * from public.list_members()'));
  await denied('Even admin cannot bypass checked profile RPC', () => as(ids.admin,
    "update public.profiles set status='approved' where id=$1", [ids.pending]));

  const note = (await as(ids.alice, 'select * from public.create_note($1,$2)', ['공유 메모', '초안']))[0];
  check('New note starts at version one', Number(note.version), 1);
  check('New note records trusted actor ID', note.created_by, ids.alice);
  check('Approved second member sees shared note', (await as(ids.bob, 'select id from public.notes'))[0].id, note.id);
  check('Pending user cannot read existing note', (await as(ids.pending, 'select * from public.notes')).length, 0);
  check('Pending user cannot read revision history', (await as(ids.pending, 'select * from public.note_revisions')).length, 0);
  await denied('Approved member cannot write notes directly', () => as(ids.alice,
    "update public.notes set body='bypass' where id=$1", [note.id]));
  await denied('Approved member cannot insert notes directly', () => as(ids.alice,
    "insert into public.notes(title) values ('bypass')"));
  await denied('Approved member cannot delete notes', () => as(ids.alice, 'delete from public.notes where id=$1', [note.id]));

  const saveSql = 'select * from public.save_note($1,$2,$3,$4,$5,$6)';
  const saved = (await as(ids.bob, saveSql, [note.id, 1, '공유 메모', 'Bob이 먼저 저장', true, false]))[0];
  check('Save increments version', Number(saved.version), 2);
  check('Save records the authenticated editor', saved.updated_by, ids.bob);
  await denied('Stale editor gets explicit conflict', () => as(ids.alice, saveSql,
    [note.id, 1, '공유 메모', 'Alice의 오래된 초안', false, false]), 'PT409');
  check('Conflicting save does not silently overwrite', (await as(ids.alice,
    'select body from public.notes where id=$1', [note.id]))[0].body, 'Bob이 먼저 저장');
  check('Conflicting save does not append false history', (await as(ids.alice,
    'select count(*)::int as count from public.note_revisions where note_id=$1', [note.id]))[0].count, 2);
  await denied('Version cannot be omitted', () => as(ids.alice, saveSql,
    [note.id, null, '공유 메모', 'x', false, false]), '22023');
  await denied('Empty title is rejected', () => as(ids.alice, 'select * from public.create_note($1,$2)', ['  ', '']), '22023');
  await denied('Oversized body is rejected', () => as(ids.alice, 'select * from public.create_note($1,$2)', ['제목', 'x'.repeat(100001)]), '22023');
  await denied('Missing note is reported accurately', () => as(ids.alice, saveSql,
    ['ffffffff-ffff-4fff-8fff-ffffffffffff', 1, 'x', '', false, false]), 'PT404');
  await denied('Revision history is immutable to members', () => as(ids.alice,
    "update public.note_revisions set body='forged' where note_id=$1", [note.id]));

  const archived = (await as(ids.alice, saveSql, [note.id, 2, '공유 메모', saved.body, true, true]))[0];
  check('Archive is reversible and recorded as a new version', [Boolean(archived.archived_at), Number(archived.version)], [true, 3]);
  const restored = (await as(ids.bob, saveSql, [note.id, 3, '공유 메모', saved.body, false, false]))[0];
  check('Restore clears archive and preserves concurrency version', [restored.archived_at, Number(restored.version)], [null, 4]);
  check('History retains all successful versions', (await as(ids.alice,
    'select version::int from public.note_revisions where note_id=$1 order by version', [note.id])).map(r => r.version), [1, 2, 3, 4]);

  await as(ids.admin, "select * from public.set_member_status($1,'suspended')", [ids.bob]);
  check('Suspension immediately blocks reads with existing identity', (await as(ids.bob, 'select * from public.notes')).length, 0);
  check('Suspension immediately blocks history reads', (await as(ids.bob, 'select * from public.note_revisions')).length, 0);
  await denied('Suspension blocks existing-session saves', () => as(ids.bob, saveSql,
    [note.id, 4, '공유 메모', 'forbidden', false, false]));
  await denied('Suspension blocks note creation', () => as(ids.bob, "select * from public.create_note('x','')"));
  await as(ids.admin, "select * from public.set_member_status($1,'rejected')", [ids.pending]);
  check('Rejected user sees own status', (await access(ids.pending)).status, 'rejected');
  await denied('Rejected user cannot create notes', () => as(ids.pending, "select * from public.create_note('x','')"));
  await as(ids.pending, "select * from public.update_my_display_name('  새 이름  ')");
  check('Profile edit only changes safe display name', (await as(ids.pending,
    'select display_name,status from public.profiles where id=$1', [ids.pending]))[0], {
    display_name: '새 이름', status: 'rejected',
  });
  check('Membership changes have a private audit trail', (await db.query(
    'select count(*)::int as count from app_private.membership_events')).rows[0].count, 4);

  await db.query('update auth.users set email=$1 where id=$2', ['former-admin@example.com', ids.admin]);
  check('Administrator loses privileges if current email no longer matches', (await access(ids.admin)).is_admin, false);
  await denied('Former admin cannot approve users', () => as(ids.admin,
    "select * from public.set_member_status($1,'approved')", [ids.pending]));
  await db.query('update auth.users set email=$1 where id=$2', ['kge@lawbahn.com', ids.attacker]);
  check('Another email-change account cannot claim reserved administrator', (await access(ids.attacker)).is_admin, false);
  await db.query('update auth.users set email=$1 where id=$2', ['attacker@example.com', ids.attacker]);
  await addUser(ids.replacement, 'kge@lawbahn.com', true);
  check('Recreated administrator email cannot steal a reserved identity', (await access(ids.replacement)).is_admin, false);
  await db.query('delete from auth.users where id=$1', [ids.replacement]);
  await db.query('update auth.users set email=$1 where id=$2', ['kge@lawbahn.com', ids.admin]);
  check('Original verified administrator retains its reserved identity', (await access(ids.admin)).is_admin, true);

  const unsafeFunctions = (await db.query(`select p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('app_private','public') and p.prosecdef
      and (p.proconfig is null or not ('search_path=""' = any(p.proconfig)))`)).rows;
  check('Every security definer has an empty fixed search_path', unsafeFunctions, []);
  const anonFunctions = (await db.query(`select p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('app_private','public') and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows;
  check('Anonymous cannot execute any application security definer', anonFunctions, []);

  console.log(`PASS: ${checks} database security and collaboration assertions.`);
} finally {
  await db.close();
}
