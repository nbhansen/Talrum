-- Tighten the grant-layer contract added in 20260426180000_grant_authenticated.sql.
-- That migration over-granted IUD on read-only-by-design template tables
-- (template_pictograms, template_boards) and only set schema defaults for
-- authenticated, leaving service_role and anon dependent on platform-default
-- ACLs that differ between local Supabase (open) and cloud (locked down).
--
-- This migration pins the contract explicitly per (role, table) so behavior
-- is identical regardless of starting ACL.
--
--   authenticated -> CRUD on app tables, SELECT-only on template tables
--   service_role  -> CRUD on ALL six tables (explicit; do not rely on platform
--                    defaults — pinning makes the contract survive future
--                    Supabase changes and shows up in the pgTAP test)
--   anon          -> revoked from all six tables and from schema defaults
--                    (this app has no anon-readable surface)

-- authenticated: tighten templates to SELECT-only.
revoke insert, update, delete on
  public.template_pictograms,
  public.template_boards
from authenticated;

-- service_role: explicit CRUD on every existing table. No platform-default
-- reliance. If Supabase ever changes service_role's default grants, this
-- migration plus the pgTAP test catch it.
grant select, insert, update, delete on
  public.kids,
  public.boards,
  public.pictograms,
  public.board_members,
  public.template_pictograms,
  public.template_boards
to service_role;

-- anon: revoke everything from existing tables.
revoke all on
  public.kids,
  public.boards,
  public.pictograms,
  public.board_members,
  public.template_pictograms,
  public.template_boards
from anon;

-- Schema defaults for future tables.
--   service_role -> CRUD (new). Without this, future tables created via
--                   supabase db push leave service_role on the cloud's
--                   broken Dxtm-only default — admin tooling and edge
--                   functions hit 42501 the same way the SPA did before
--                   20260426180000 fixed it for authenticated.
--   anon         -> revoked. Note: ALTER DEFAULT PRIVILEGES is grantor-
--                   scoped — this only cancels grants the executing role
--                   would otherwise extend. All migrations run as postgres,
--                   and postgres' default ACL on schema public is the one
--                   that grants anon access on local Supabase, so this
--                   revoke is effective for tables created by our migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  revoke all on tables from anon;
