-- Some Supabase projects provision this platform event-trigger function in public.
-- It enables RLS on new public tables; application clients never need to call it.
-- Preserve its definition, owner, settings, and existing event-trigger binding.
-- Projects without the exact no-argument event-trigger function are left unchanged.
begin;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('public.rls_auto_enable()')
      and p.pronargs = 0
      and p.prorettype = 'pg_catalog.event_trigger'::pg_catalog.regtype
  ) then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end;
$$;

commit;
