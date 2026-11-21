-- Pins the ALTER DEFAULT PRIVILEGES contract (20260427000000): a new
-- public table inherits CRUD for authenticated + service_role and nothing
-- for anon. A regression here only surfaces when the next table is added.
-- Run with: supabase test db
BEGIN;
SELECT plan(1);

-- Create a representative table the same way `supabase db push` would: as
-- postgres, in schema public. ALTER DEFAULT PRIVILEGES is grantor-scoped, so
-- this only proves the contract for tables created by postgres — which is
-- exactly the role migrations run as.
CREATE TABLE public._default_grants_probe (id int);

-- anon gets nothing: this app has no anon-readable surface.
SELECT is_empty(
  $$ SELECT r.role, p.priv
       FROM unnest(ARRAY['authenticated', 'service_role', 'anon']) AS r(role)
      CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p(priv)
      WHERE has_table_privilege(r.role::name, 'public._default_grants_probe', p.priv)
            <> (r.role <> 'anon') $$,
  'a new public table grants CRUD to authenticated and service_role, nothing to anon'
);

SELECT * FROM finish();
ROLLBACK;
