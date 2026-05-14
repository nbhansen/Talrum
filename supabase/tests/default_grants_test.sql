-- Pins the ALTER DEFAULT PRIVILEGES contract from
-- 20260427000000_tighten_grants.sql. When `supabase db push` (running as
-- postgres) creates a new table in schema public, it must inherit:
--   authenticated -> CRUD
--   service_role  -> CRUD
--   anon          -> nothing
--
-- Without this, a regression in default privileges only surfaces when the
-- next real table is added — and after Supabase enforces the May/Oct 2026
-- "secure by default" Data API change, that surfaces as a 42501 in prod.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(12);

-- Create a representative table the same way `supabase db push` would: as
-- postgres, in schema public. ALTER DEFAULT PRIVILEGES is grantor-scoped, so
-- this only proves the contract for tables created by postgres — which is
-- exactly the role migrations run as.
CREATE TABLE public._default_grants_probe (id int);

-- authenticated -> CRUD
SELECT ok(has_table_privilege('authenticated', 'public._default_grants_probe', 'SELECT'),
  'new public table grants SELECT to authenticated by default');
SELECT ok(has_table_privilege('authenticated', 'public._default_grants_probe', 'INSERT'),
  'new public table grants INSERT to authenticated by default');
SELECT ok(has_table_privilege('authenticated', 'public._default_grants_probe', 'UPDATE'),
  'new public table grants UPDATE to authenticated by default');
SELECT ok(has_table_privilege('authenticated', 'public._default_grants_probe', 'DELETE'),
  'new public table grants DELETE to authenticated by default');

-- service_role -> CRUD
SELECT ok(has_table_privilege('service_role', 'public._default_grants_probe', 'SELECT'),
  'new public table grants SELECT to service_role by default');
SELECT ok(has_table_privilege('service_role', 'public._default_grants_probe', 'INSERT'),
  'new public table grants INSERT to service_role by default');
SELECT ok(has_table_privilege('service_role', 'public._default_grants_probe', 'UPDATE'),
  'new public table grants UPDATE to service_role by default');
SELECT ok(has_table_privilege('service_role', 'public._default_grants_probe', 'DELETE'),
  'new public table grants DELETE to service_role by default');

-- anon -> nothing (this app has no anon-readable surface)
SELECT ok(NOT has_table_privilege('anon', 'public._default_grants_probe', 'SELECT'),
  'new public table does not grant SELECT to anon');
SELECT ok(NOT has_table_privilege('anon', 'public._default_grants_probe', 'INSERT'),
  'new public table does not grant INSERT to anon');
SELECT ok(NOT has_table_privilege('anon', 'public._default_grants_probe', 'UPDATE'),
  'new public table does not grant UPDATE to anon');
SELECT ok(NOT has_table_privilege('anon', 'public._default_grants_probe', 'DELETE'),
  'new public table does not grant DELETE to anon');

SELECT * FROM finish();
ROLLBACK;
