-- Regression test pinning the grant-layer contract from
-- 20260426180000_grant_authenticated.sql + 20260427000000_tighten_grants.sql,
-- plus the function EXECUTE contracts (#401) from
-- 20260610110409_add_delete_pictogram_rpc.sql and
-- 20260427145144_move_helpers_to_private_schema.sql.
-- Without this, a future migration could silently revoke or over-grant and
-- the regression would only surface as a 42501 in production.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(88);

-- 1–16: authenticated has full CRUD on the four real app tables.
SELECT ok(has_table_privilege('authenticated', 'public.kids',          'SELECT'), 'authenticated can SELECT kids');
SELECT ok(has_table_privilege('authenticated', 'public.kids',          'INSERT'), 'authenticated can INSERT kids');
SELECT ok(has_table_privilege('authenticated', 'public.kids',          'UPDATE'), 'authenticated can UPDATE kids');
SELECT ok(has_table_privilege('authenticated', 'public.kids',          'DELETE'), 'authenticated can DELETE kids');

SELECT ok(has_table_privilege('authenticated', 'public.boards',        'SELECT'), 'authenticated can SELECT boards');
SELECT ok(has_table_privilege('authenticated', 'public.boards',        'INSERT'), 'authenticated can INSERT boards');
SELECT ok(has_table_privilege('authenticated', 'public.boards',        'UPDATE'), 'authenticated can UPDATE boards');
SELECT ok(has_table_privilege('authenticated', 'public.boards',        'DELETE'), 'authenticated can DELETE boards');

SELECT ok(has_table_privilege('authenticated', 'public.pictograms',    'SELECT'), 'authenticated can SELECT pictograms');
SELECT ok(has_table_privilege('authenticated', 'public.pictograms',    'INSERT'), 'authenticated can INSERT pictograms');
SELECT ok(has_table_privilege('authenticated', 'public.pictograms',    'UPDATE'), 'authenticated can UPDATE pictograms');
SELECT ok(has_table_privilege('authenticated', 'public.pictograms',    'DELETE'), 'authenticated can DELETE pictograms');

SELECT ok(has_table_privilege('authenticated', 'public.board_members', 'SELECT'), 'authenticated can SELECT board_members');
SELECT ok(has_table_privilege('authenticated', 'public.board_members', 'INSERT'), 'authenticated can INSERT board_members');
SELECT ok(has_table_privilege('authenticated', 'public.board_members', 'UPDATE'), 'authenticated can UPDATE board_members');
SELECT ok(has_table_privilege('authenticated', 'public.board_members', 'DELETE'), 'authenticated can DELETE board_members');

-- 17–18: authenticated can SELECT templates (read-only by design).
SELECT ok(has_table_privilege('authenticated', 'public.template_pictograms', 'SELECT'), 'authenticated can SELECT template_pictograms');
SELECT ok(has_table_privilege('authenticated', 'public.template_boards',     'SELECT'), 'authenticated can SELECT template_boards');

-- 19–24: authenticated CANNOT mutate templates. Load-bearing for #78 — these
-- assertions fail loudly if a future migration re-over-grants.
SELECT ok(NOT has_table_privilege('authenticated', 'public.template_pictograms', 'INSERT'), 'authenticated cannot INSERT template_pictograms');
SELECT ok(NOT has_table_privilege('authenticated', 'public.template_pictograms', 'UPDATE'), 'authenticated cannot UPDATE template_pictograms');
SELECT ok(NOT has_table_privilege('authenticated', 'public.template_pictograms', 'DELETE'), 'authenticated cannot DELETE template_pictograms');
SELECT ok(NOT has_table_privilege('authenticated', 'public.template_boards',     'INSERT'), 'authenticated cannot INSERT template_boards');
SELECT ok(NOT has_table_privilege('authenticated', 'public.template_boards',     'UPDATE'), 'authenticated cannot UPDATE template_boards');
SELECT ok(NOT has_table_privilege('authenticated', 'public.template_boards',     'DELETE'), 'authenticated cannot DELETE template_boards');

-- 25–48: service_role has full CRUD on all six tables. Pins the explicit
-- grants from 20260427000000 — does not rely on Supabase platform defaults.
SELECT ok(has_table_privilege('service_role', 'public.kids',                'SELECT'), 'service_role can SELECT kids');
SELECT ok(has_table_privilege('service_role', 'public.kids',                'INSERT'), 'service_role can INSERT kids');
SELECT ok(has_table_privilege('service_role', 'public.kids',                'UPDATE'), 'service_role can UPDATE kids');
SELECT ok(has_table_privilege('service_role', 'public.kids',                'DELETE'), 'service_role can DELETE kids');

SELECT ok(has_table_privilege('service_role', 'public.boards',              'SELECT'), 'service_role can SELECT boards');
SELECT ok(has_table_privilege('service_role', 'public.boards',              'INSERT'), 'service_role can INSERT boards');
SELECT ok(has_table_privilege('service_role', 'public.boards',              'UPDATE'), 'service_role can UPDATE boards');
SELECT ok(has_table_privilege('service_role', 'public.boards',              'DELETE'), 'service_role can DELETE boards');

SELECT ok(has_table_privilege('service_role', 'public.pictograms',          'SELECT'), 'service_role can SELECT pictograms');
SELECT ok(has_table_privilege('service_role', 'public.pictograms',          'INSERT'), 'service_role can INSERT pictograms');
SELECT ok(has_table_privilege('service_role', 'public.pictograms',          'UPDATE'), 'service_role can UPDATE pictograms');
SELECT ok(has_table_privilege('service_role', 'public.pictograms',          'DELETE'), 'service_role can DELETE pictograms');

SELECT ok(has_table_privilege('service_role', 'public.board_members',       'SELECT'), 'service_role can SELECT board_members');
SELECT ok(has_table_privilege('service_role', 'public.board_members',       'INSERT'), 'service_role can INSERT board_members');
SELECT ok(has_table_privilege('service_role', 'public.board_members',       'UPDATE'), 'service_role can UPDATE board_members');
SELECT ok(has_table_privilege('service_role', 'public.board_members',       'DELETE'), 'service_role can DELETE board_members');

SELECT ok(has_table_privilege('service_role', 'public.template_pictograms', 'SELECT'), 'service_role can SELECT template_pictograms');
SELECT ok(has_table_privilege('service_role', 'public.template_pictograms', 'INSERT'), 'service_role can INSERT template_pictograms');
SELECT ok(has_table_privilege('service_role', 'public.template_pictograms', 'UPDATE'), 'service_role can UPDATE template_pictograms');
SELECT ok(has_table_privilege('service_role', 'public.template_pictograms', 'DELETE'), 'service_role can DELETE template_pictograms');

SELECT ok(has_table_privilege('service_role', 'public.template_boards',     'SELECT'), 'service_role can SELECT template_boards');
SELECT ok(has_table_privilege('service_role', 'public.template_boards',     'INSERT'), 'service_role can INSERT template_boards');
SELECT ok(has_table_privilege('service_role', 'public.template_boards',     'UPDATE'), 'service_role can UPDATE template_boards');
SELECT ok(has_table_privilege('service_role', 'public.template_boards',     'DELETE'), 'service_role can DELETE template_boards');

-- 49–54: anon has no SELECT on any app or template table. Pins the
-- "this app has no anon-readable surface" decision.
SELECT ok(NOT has_table_privilege('anon', 'public.kids',               'SELECT'), 'anon cannot SELECT kids');
SELECT ok(NOT has_table_privilege('anon', 'public.boards',             'SELECT'), 'anon cannot SELECT boards');
SELECT ok(NOT has_table_privilege('anon', 'public.pictograms',         'SELECT'), 'anon cannot SELECT pictograms');
SELECT ok(NOT has_table_privilege('anon', 'public.board_members',      'SELECT'), 'anon cannot SELECT board_members');
SELECT ok(NOT has_table_privilege('anon', 'public.template_pictograms','SELECT'), 'anon cannot SELECT template_pictograms');
SELECT ok(NOT has_table_privilege('anon', 'public.template_boards',    'SELECT'), 'anon cannot SELECT template_boards');

-- 55–72: anon has no INSERT/UPDATE/DELETE on any app or template table.
-- Symmetric with the authenticated-on-templates block (19–24): without
-- these, a regression that re-granted (say) INSERT on public.kids TO anon
-- while leaving SELECT revoked would still pass.
SELECT ok(NOT has_table_privilege('anon', 'public.kids',                'INSERT'), 'anon cannot INSERT kids');
SELECT ok(NOT has_table_privilege('anon', 'public.kids',                'UPDATE'), 'anon cannot UPDATE kids');
SELECT ok(NOT has_table_privilege('anon', 'public.kids',                'DELETE'), 'anon cannot DELETE kids');

SELECT ok(NOT has_table_privilege('anon', 'public.boards',              'INSERT'), 'anon cannot INSERT boards');
SELECT ok(NOT has_table_privilege('anon', 'public.boards',              'UPDATE'), 'anon cannot UPDATE boards');
SELECT ok(NOT has_table_privilege('anon', 'public.boards',              'DELETE'), 'anon cannot DELETE boards');

SELECT ok(NOT has_table_privilege('anon', 'public.pictograms',          'INSERT'), 'anon cannot INSERT pictograms');
SELECT ok(NOT has_table_privilege('anon', 'public.pictograms',          'UPDATE'), 'anon cannot UPDATE pictograms');
SELECT ok(NOT has_table_privilege('anon', 'public.pictograms',          'DELETE'), 'anon cannot DELETE pictograms');

SELECT ok(NOT has_table_privilege('anon', 'public.board_members',       'INSERT'), 'anon cannot INSERT board_members');
SELECT ok(NOT has_table_privilege('anon', 'public.board_members',       'UPDATE'), 'anon cannot UPDATE board_members');
SELECT ok(NOT has_table_privilege('anon', 'public.board_members',       'DELETE'), 'anon cannot DELETE board_members');

SELECT ok(NOT has_table_privilege('anon', 'public.template_pictograms', 'INSERT'), 'anon cannot INSERT template_pictograms');
SELECT ok(NOT has_table_privilege('anon', 'public.template_pictograms', 'UPDATE'), 'anon cannot UPDATE template_pictograms');
SELECT ok(NOT has_table_privilege('anon', 'public.template_pictograms', 'DELETE'), 'anon cannot DELETE template_pictograms');

SELECT ok(NOT has_table_privilege('anon', 'public.template_boards',     'INSERT'), 'anon cannot INSERT template_boards');
SELECT ok(NOT has_table_privilege('anon', 'public.template_boards',     'UPDATE'), 'anon cannot UPDATE template_boards');
SELECT ok(NOT has_table_privilege('anon', 'public.template_boards',     'DELETE'), 'anon cannot DELETE template_boards');

-- 73–75: EXECUTE on the delete_pictogram RPC. Pins the grant contract from
-- 20260610110409_add_delete_pictogram_rpc.sql: anon has no surface in this
-- app, so the default PUBLIC grant is revoked and execute is pinned per
-- role. anon lacking EXECUTE also proves the PUBLIC revoke held — a PUBLIC
-- grant would flow to anon.
SELECT ok(has_function_privilege('authenticated', 'public.delete_pictogram(uuid)', 'EXECUTE'), 'authenticated can EXECUTE delete_pictogram');
SELECT ok(has_function_privilege('service_role',  'public.delete_pictogram(uuid)', 'EXECUTE'), 'service_role can EXECUTE delete_pictogram');
SELECT ok(NOT has_function_privilege('anon',      'public.delete_pictogram(uuid)', 'EXECUTE'), 'anon cannot EXECUTE delete_pictogram');

-- 76–85: the five RLS helpers in `private` KEEP EXECUTE for the API roles.
-- This is the load-bearing half of #91: policies call these helpers during
-- evaluation, and revoking EXECUTE on a function in that position crashes
-- the Postgres backend mid-query (verified empirically — see
-- 20260427145144_move_helpers_to_private_schema.sql). The advisor's
-- "revoke EXECUTE" remediation must fail here, loudly, before it reaches
-- production. The trigger functions (handle_new_user, set_updated_at) and
-- the event trigger (rls_auto_enable) are excluded: the system fires them
-- without checking the caller's EXECUTE, so no grant is load-bearing.
SELECT ok(has_function_privilege('authenticated', 'private.is_board_owner(uuid)',                'EXECUTE'), 'authenticated keeps EXECUTE on is_board_owner (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_board_member(uuid)',               'EXECUTE'), 'authenticated keeps EXECUTE on is_board_member (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_board_editor(uuid)',               'EXECUTE'), 'authenticated keeps EXECUTE on is_board_editor (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_owner_shared_with_me(uuid)',       'EXECUTE'), 'authenticated keeps EXECUTE on is_owner_shared_with_me (RLS evaluation)');
SELECT ok(has_function_privilege('authenticated', 'private.is_pictogram_storage_visible(text)',  'EXECUTE'), 'authenticated keeps EXECUTE on is_pictogram_storage_visible (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_board_owner(uuid)',                'EXECUTE'), 'anon keeps EXECUTE on is_board_owner (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_board_member(uuid)',               'EXECUTE'), 'anon keeps EXECUTE on is_board_member (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_board_editor(uuid)',               'EXECUTE'), 'anon keeps EXECUTE on is_board_editor (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_owner_shared_with_me(uuid)',       'EXECUTE'), 'anon keeps EXECUTE on is_owner_shared_with_me (RLS evaluation)');
SELECT ok(has_function_privilege('anon',          'private.is_pictogram_storage_visible(text)',  'EXECUTE'), 'anon keeps EXECUTE on is_pictogram_storage_visible (RLS evaluation)');

-- 86–88: USAGE on the `private` schema itself. The other documented half of
-- the same crash contract: without USAGE the role cannot resolve the
-- qualified helper name during policy evaluation, and the backend-crash
-- failure mode reappears (20260427145144_move_helpers_to_private_schema.sql).
-- The EXECUTE pins above read the function ACL only and stay green through
-- a schema-level revoke.
SELECT ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated keeps USAGE on private (RLS evaluation)');
SELECT ok(has_schema_privilege('anon',          'private', 'USAGE'), 'anon keeps USAGE on private (RLS evaluation)');
SELECT ok(has_schema_privilege('service_role',  'private', 'USAGE'), 'service_role keeps USAGE on private');

SELECT * FROM finish();
ROLLBACK;
