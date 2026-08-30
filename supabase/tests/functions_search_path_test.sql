-- Every function in public AND private must pin search_path = public, or a
-- per-role search_path can shadow lookups inside the body (advisor 0011,
-- #64). Class-wide assertion, so new functions are covered automatically.
-- Run with: supabase test db
BEGIN;
SELECT plan(1);

SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND NOT (coalesce(p.proconfig, '{}'::text[]) @> ARRAY['search_path=public'])),
  0,
  'every function in public+private has search_path=public pinned in pg_proc.proconfig'
);

SELECT * FROM finish();
ROLLBACK;
