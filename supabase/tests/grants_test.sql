-- Pins the grant contract (20260427000000) and the function EXECUTE
-- contracts: a migration that revokes or over-grants would otherwise only
-- surface as a 42501 in production. Run with: supabase test db
BEGIN;
SELECT plan(24);

-- Every check below walks pg_tables, so a new public table is covered
-- without an edit here. has_table_privilege (not role_table_grants) so a
-- grant TO PUBLIC or through role membership counts too.
CREATE TEMP VIEW table_privs AS
  SELECT t.tablename AS tbl, format('public.%I', t.tablename) AS qual, p.priv
    FROM pg_tables t
   CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p(priv)
   WHERE t.schemaname = 'public';

-- 1: authenticated has full CRUD on every app (non-template) table.
SELECT is_empty(
  $$ SELECT tbl, priv FROM table_privs
      WHERE tbl NOT LIKE 'template\_%'
        AND NOT has_table_privilege('authenticated', qual, priv) $$,
  'authenticated has SELECT/INSERT/UPDATE/DELETE on every app table');

-- 2: authenticated can only SELECT templates (#78).
SELECT is_empty(
  $$ SELECT tbl, priv, has_table_privilege('authenticated', qual, priv) AS granted
       FROM table_privs
      WHERE tbl LIKE 'template\_%'
        AND has_table_privilege('authenticated', qual, priv) <> (priv = 'SELECT') $$,
  'authenticated has exactly SELECT on every template table');

-- 3: service_role has full CRUD on every table. Pins the explicit grants
-- from 20260427000000 — does not rely on Supabase platform defaults.
SELECT is_empty(
  $$ SELECT tbl, priv FROM table_privs
      WHERE NOT has_table_privilege('service_role', qual, priv) $$,
  'service_role has SELECT/INSERT/UPDATE/DELETE on every table');

-- 4: anon has nothing on any table. Pins the "this app has no
-- anon-readable surface" decision.
SELECT is_empty(
  $$ SELECT tbl, priv FROM table_privs
      WHERE has_table_privilege('anon', qual, priv) $$,
  'anon has no SELECT/INSERT/UPDATE/DELETE on any table');

-- 5–7: EXECUTE on delete_pictogram, per role (20260610110409). anon
-- lacking EXECUTE also proves the PUBLIC revoke held — a PUBLIC grant
-- would flow to anon.
SELECT ok(has_function_privilege('authenticated', 'public.delete_pictogram(uuid)', 'EXECUTE'), 'authenticated can EXECUTE delete_pictogram');
SELECT ok(has_function_privilege('service_role',  'public.delete_pictogram(uuid)', 'EXECUTE'), 'service_role can EXECUTE delete_pictogram');
SELECT ok(NOT has_function_privilege('anon',      'public.delete_pictogram(uuid)', 'EXECUTE'), 'anon cannot EXECUTE delete_pictogram');

-- 8–21: the private RLS helpers KEEP EXECUTE (#91): policies call them
-- during evaluation, and revoking EXECUTE there crashes the backend
-- mid-query (verified empirically). The advisor's revoke remediation must
-- fail here, loudly. Trigger/event functions need no grant and are excluded.
SELECT ok(has_function_privilege('authenticated', 'private.is_board_owner(uuid)',                'EXECUTE'), 'authenticated keeps EXECUTE on is_board_owner (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_board_member(uuid)',               'EXECUTE'), 'authenticated keeps EXECUTE on is_board_member (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_board_editor(uuid)',               'EXECUTE'), 'authenticated keeps EXECUTE on is_board_editor (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_owner_shared_with_me(uuid)',       'EXECUTE'), 'authenticated keeps EXECUTE on is_owner_shared_with_me (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_pictogram_storage_visible(text)',  'EXECUTE'), 'authenticated keeps EXECUTE on is_pictogram_storage_visible (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_editor_for_owner(uuid)',           'EXECUTE'), 'authenticated keeps EXECUTE on is_editor_for_owner (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_pictogram_storage_writable(text)', 'EXECUTE'), 'authenticated keeps EXECUTE on is_pictogram_storage_writable (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_board_owner(uuid)',                'EXECUTE'), 'anon keeps EXECUTE on is_board_owner (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_board_member(uuid)',               'EXECUTE'), 'anon keeps EXECUTE on is_board_member (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_board_editor(uuid)',               'EXECUTE'), 'anon keeps EXECUTE on is_board_editor (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_owner_shared_with_me(uuid)',       'EXECUTE'), 'anon keeps EXECUTE on is_owner_shared_with_me (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_pictogram_storage_visible(text)',  'EXECUTE'), 'anon keeps EXECUTE on is_pictogram_storage_visible (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_editor_for_owner(uuid)',           'EXECUTE'), 'anon keeps EXECUTE on is_editor_for_owner (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_pictogram_storage_writable(text)', 'EXECUTE'), 'anon keeps EXECUTE on is_pictogram_storage_writable (RLS evaluation)');

-- 22–24: USAGE on `private` — the other half of the same crash contract:
-- without USAGE the role cannot resolve the qualified name during policy
-- evaluation. The EXECUTE pins stay green through a schema-level revoke.
SELECT ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated keeps USAGE on private (RLS evaluation)');
SELECT ok(has_schema_privilege('anon',          'private', 'USAGE'), 'anon keeps USAGE on private (RLS evaluation)');
SELECT ok(has_schema_privilege('service_role',  'private', 'USAGE'), 'service_role keeps USAGE on private');

SELECT * FROM finish();
ROLLBACK;
