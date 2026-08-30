-- Pin the grant contract per (role, table): platform-default ACLs differ
-- between local (open) and cloud (locked down), so explicit grants are the
-- only way behavior is identical. Contract: authenticated CRUD on app
-- tables + SELECT-only templates; service_role CRUD on all; anon nothing.

-- authenticated: tighten templates to SELECT-only.
revoke insert, update, delete on
  public.template_pictograms,
  public.template_boards
from authenticated;

-- service_role: explicit CRUD, no platform-default reliance.
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

-- Schema defaults for future tables. ALTER DEFAULT PRIVILEGES is
-- grantor-scoped: migrations run as postgres, whose default ACL is the one
-- granting anon access on local Supabase, so the revoke is effective.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  revoke all on tables from anon;
