-- Regression test pinning the function-search_path contract.
--
-- Every function in `public` should set `search_path = public` (recorded in
-- `pg_proc.proconfig`). Without this pin, a per-role search_path or a session-
-- level override could shadow object lookups inside the function body — the
-- attack surface called out by Supabase advisor lint 0011
-- (function_search_path_mutable). #64 closed the last gap (set_updated_at);
-- this test makes sure the next `create or replace function` does not silently
-- reopen it.
--
-- The assertion is class-wide rather than naming each function, so it keeps
-- working as new functions are added — anything missing the pin trips it.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(1);

SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT (coalesce(p.proconfig, '{}'::text[]) @> ARRAY['search_path=public'])),
  0,
  'every public function has search_path=public pinned in pg_proc.proconfig'
);

SELECT * FROM finish();
ROLLBACK;
