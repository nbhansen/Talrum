-- Reconcile cloud-only `rls_auto_enable()` into the migration set, in the
-- private schema per the pattern adopted in #91 (closes #92).
--
-- This function existed only on cloud (created via dashboard SQL editor at
-- some early stage of the project, never captured in a migration). It is an
-- event-trigger function on `ddl_command_end` that auto-enables RLS on any
-- new table created in `public` — a defense-in-depth catching "forgot to
-- enable RLS" mistakes. Useful enough to keep, but the cloud-only state is
-- the kind of drift that bites silently: local pgTAP and CI cannot see it,
-- so any regression involving its behavior is invisible until production.
--
-- Closes the last 2 SECURITY DEFINER advisor warnings (lints 0028+0029)
-- left over from #91. After this migration, only the auth-side
-- `auth_leaked_password_protection` warning remains (#93, dashboard toggle).
--
-- Migration is drop-then-recreate rather than ALTER FUNCTION SET SCHEMA
-- because it has to handle both states idempotently:
--   - cloud: function + event trigger exist in public
--   - local: nothing exists (this is the first time it lands)
-- Drop-if-exists is a no-op on local. We also normalize the body's
-- search_path from `pg_catalog` (cloud) to `public` (our convention),
-- which a SET SCHEMA wouldn't have done.
--
-- Empirical Phase 0 verified: event triggers auto-rebind on ALTER FUNCTION
-- SET SCHEMA, and event trigger functions fire correctly when housed in
-- private (event triggers don't go through PostgREST or the API role's
-- privilege check; they fire as the user running the DDL).

drop event trigger if exists ensure_rls;
drop function if exists public.rls_auto_enable();
drop function if exists private.rls_auto_enable();

create function private.rls_auto_enable() returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cmd record;
begin
  for cmd in
    select *
      from pg_event_trigger_ddl_commands()
     where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
       and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name = 'public'
       and cmd.schema_name not like 'pg_%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;

create event trigger ensure_rls
  on ddl_command_end
  execute function private.rls_auto_enable();
