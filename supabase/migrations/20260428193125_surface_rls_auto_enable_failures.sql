-- Surface trigger-function failures (#102).
--
-- `private.rls_auto_enable()` was an event trigger that ran on every
-- `ddl_command_end` and tried to enable RLS on any new table created in
-- `public`. Failures inside the per-table loop were swallowed by an inner
-- `exception when others then raise log` block, which writes to the Postgres
-- log but is not surfaced anywhere actionable. A failure means a new public
-- table was created WITHOUT row-level security — a real security regression
-- that we'd never see unless someone happened to scroll the dashboard logs.
--
-- Fix: drop the inner exception handler. Any RLS-enable failure now
-- propagates and aborts the originating CREATE TABLE. The migration author
-- will see the error in their `supabase db push` output and have to deal
-- with it before the migration can land.
--
-- Drop-then-recreate (rather than CREATE OR REPLACE) because the function's
-- return type / language / volatility don't change but we want the migration
-- diff to read as a deliberate body swap, not a one-line edit. The event
-- trigger has to be dropped first because it depends on the function.
--
-- handle_new_user(): NOT touched in this migration. It already has no
-- try/catch, so any failure (template-clone INSERT, slug-mismatch RAISE
-- EXCEPTION) propagates and aborts the auth.users insert — signup fails
-- loudly. Once #45 (Sentry) ships, those propagated errors get captured
-- at the `auth.signUp` call site on the client. Adding a
-- `public.signup_errors` table now would be speculative infrastructure
-- for a logging system we haven't picked yet.

drop event trigger if exists ensure_rls;
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
      execute format('alter table if exists %s enable row level security', cmd.object_identity);
      raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
    end if;
  end loop;
end;
$$;

create event trigger ensure_rls
  on ddl_command_end
  execute function private.rls_auto_enable();
