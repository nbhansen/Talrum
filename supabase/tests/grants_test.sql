-- Regression test pinning the grant-layer contract from
-- 20260426180000_grant_authenticated.sql + 20260427000000_tighten_grants.sql.
-- Without this, a future migration could silently revoke or over-grant and
-- the regression would only surface as a 42501 in production.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(54);

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

SELECT * FROM finish();
ROLLBACK;
