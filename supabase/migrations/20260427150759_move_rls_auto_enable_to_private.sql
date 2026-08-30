-- Reconcile the cloud-only rls_auto_enable() event trigger into the
-- migration set, housed in `private` (#91, closes #92). Drop-then-recreate,
-- not SET SCHEMA: it must handle both the cloud state (exists in public)
-- and the local state (does not exist yet) idempotently.

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
