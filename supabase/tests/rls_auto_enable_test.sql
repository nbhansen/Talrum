-- rls_auto_enable must not swallow RLS-enable failures (#102). Forcing a
-- real failure as postgres is contrived, so the assertion is structural:
-- the body has no `exception when others` clause.
-- Run with: supabase test db
BEGIN;
SELECT plan(2);

SELECT ok(
  (SELECT prosrc FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'rls_auto_enable')
    !~* '\mexception\s+when\s+others\M',
  'private.rls_auto_enable has no `exception when others` swallow-block'
);

-- The event trigger must still be wired. A regression that dropped the
-- function-body handler but also dropped the trigger would silently disable
-- the whole RLS-auto-enable safety net.
SELECT is(
  (SELECT count(*)::int FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
      AND evtevent = 'ddl_command_end'
      AND evtenabled <> 'D'),
  1,
  'ensure_rls event trigger is installed and enabled on ddl_command_end'
);

SELECT * FROM finish();
ROLLBACK;
