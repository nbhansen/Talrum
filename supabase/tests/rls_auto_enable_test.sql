-- Regression test for #102: `private.rls_auto_enable()` must not silently
-- swallow per-table RLS-enable failures.
--
-- The original event-trigger body wrapped its `alter table ... enable row
-- level security` call in `begin ... exception when others then raise log
-- ... end`. A failure there meant a public table got created WITHOUT RLS
-- and the only signal was a log line on the dashboard. Since the trigger
-- runs SECURITY DEFINER as `postgres`, forcing a real failure is contrived
-- (postgres has ALTER on everything we'd plausibly create in a migration).
-- So instead, this test asserts a structural property: the function source
-- has no `exception when others` clause.
--
-- This is weaker than a behavioral test but strong enough to catch the
-- specific regression — someone adding the swallow-block back. The happy
-- path (RLS gets enabled on new public tables) is implicitly covered by
-- every other migration that creates a public table plus the RLS-coverage
-- assertion in rest_surface_contract_test.sql.
--
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
