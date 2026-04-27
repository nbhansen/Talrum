-- Move SECURITY DEFINER helpers and trigger functions out of `public` into a
-- non-exposed `private` schema (#91). Closes Supabase advisor lints 0028+0029
-- (anon/authenticated SECURITY DEFINER function executable) for our 6 helpers,
-- by removing them from PostgREST's exposure list rather than by revoking
-- EXECUTE — which would crash RLS evaluation on every dependent SELECT.
--
-- Why schema-move, not REVOKE EXECUTE: the helpers (is_board_owner, etc.) are
-- referenced from RLS policy USING clauses on every read-side operation. When
-- a user does `select from pictograms`, Postgres' policy machinery calls
-- `is_owner_shared_with_me(owner_id)` as part of the policy expression. That
-- call is gated by the API role's EXECUTE privilege on the function. Revoking
-- EXECUTE on a function used in this position causes Postgres to terminate
-- the backend (verified empirically — server enters recovery mode mid-query).
-- The advisor's "Revoke EXECUTE" remediation is correct only for SECURITY
-- DEFINER functions that are NOT referenced by RLS. The advisor offers two
-- other remediations for this exact case: switch to SECURITY INVOKER (would
-- recurse on `boards` policies via the helpers), or move out of the exposed
-- API schema. Supabase's official RLS guide explicitly recommends the third:
-- "Security-definer functions should never be created in a schema in the
-- 'Exposed schemas' inside your API settings."
-- Reference: https://supabase.com/docs/guides/postgres/row-level-security
--
-- Why this works: PostgREST exposes only schemas listed in `[api].schemas`
-- (config.toml: ["public", "graphql_public"]). Functions in `private` are
-- unreachable via `/rest/v1/rpc/<name>`. Postgres' RLS evaluation, by
-- contrast, doesn't go through PostgREST — it evaluates policy expressions
-- inside the planner with whatever schemas the role can see (USAGE-granted)
-- and EXECUTE-granted functions, regardless of API exposure.
--
-- ALTER FUNCTION ... SET SCHEMA preserves the function's OID, body,
-- SECURITY DEFINER flag, search_path pin, and ACL. Postgres also rewrites
-- every dependent policy expression and trigger binding in pg_policy and
-- pg_trigger to use the new qualified name. We do not drop+recreate any
-- policies or triggers — the rewrite is automatic and atomic with the move.
-- (Empirically verified Phase 0; pg_policies.qual goes from `is_board_owner(id)`
-- to `private.is_board_owner(id)` after ALTER, and all RLS-mediated SELECTs
-- continue to return the same rows.)

create schema if not exists private;

-- USAGE on `private` for the API roles is required: without it, the role
-- can't resolve the qualified function name during policy evaluation, and
-- the same backend-crash failure mode reappears. anon doesn't have policies
-- that match real rows (no anon-readable surface in this app), but grant
-- USAGE for symmetry — denying it would diverge from `public`'s shape and
-- create a future trap where adding an anon-readable table works in `public`
-- but breaks if the policy reaches into `private`. service_role bypasses
-- RLS entirely but may invoke helpers from edge functions; grant for that.
grant usage on schema private to anon, authenticated, service_role;

-- Move all six SECURITY DEFINER RLS helpers + the SECURITY INVOKER trigger.
-- Functions stay owned by postgres (the migration runner) so the SECURITY
-- DEFINER "executes as owner" semantics are unchanged. Postgres rewrites
-- the dependent objects (six policies in public, two in storage.objects,
-- two triggers) automatically; verify by running the pgTAP suite afterward.
alter function public.is_board_owner(uuid)               set schema private;
alter function public.is_board_member(uuid)              set schema private;
alter function public.is_board_editor(uuid)              set schema private;
alter function public.is_owner_shared_with_me(uuid)      set schema private;
alter function public.is_pictogram_storage_visible(text) set schema private;
alter function public.handle_new_user()                  set schema private;
alter function public.set_updated_at()                   set schema private;
