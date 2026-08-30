-- REST surface contract (#91): PostgREST exposes every function in the
-- [api].schemas list as /rest/v1/rpc/<name>, so internal RLS helpers must
-- live in `private`. A DEFINER helper landing in `public` trips this
-- (advisor lints 0028+0029). Run with: supabase test db
BEGIN;
SELECT plan(2);

-- 1. No SECURITY DEFINER function should exist in `public`. SECURITY INVOKER
--    functions in `public` are fine (they have no privilege-elevation surface
--    even when REST-exposed). DEFINER functions in `public` are the lint
--    target.
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true),
  0,
  'no SECURITY DEFINER function exists in public schema (use private instead)'
);

-- 2. The internal helpers from this app must live in `private`. Pinning
--    by name catches a regression where a maintainer drops one of them, then
--    recreates it in `public` (which a class-wide DEFINER check could miss
--    if they happened to flip the function to INVOKER along the way).
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN (
            'is_board_owner', 'is_board_member', 'is_board_editor',
            'is_owner_shared_with_me', 'is_pictogram_storage_visible',
            'is_editor_for_owner', 'is_pictogram_storage_writable',
            'handle_new_user', 'set_updated_at',
            'rls_auto_enable'
          )
      AND n.nspname <> 'private'),
  0,
  'all known internal helpers live in private schema (none stray into public)'
);

SELECT * FROM finish();
ROLLBACK;
