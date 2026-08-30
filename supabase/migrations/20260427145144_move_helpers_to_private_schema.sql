-- Move SECURITY DEFINER helpers and triggers into a non-exposed `private`
-- schema (#91, advisor lints 0028+0029). Schema-move, NOT revoke: policies
-- call these helpers during evaluation, and revoking EXECUTE in that
-- position crashes the backend mid-query (verified — see grants_test.sql).

create schema if not exists private;

-- USAGE is required: without it the role cannot resolve the qualified name
-- during policy evaluation and the same backend crash reappears. anon gets
-- it for symmetry; service_role may invoke helpers from edge functions.
grant usage on schema private to anon, authenticated, service_role;

-- ALTER ... SET SCHEMA preserves OID, flags, ACL and owner, and Postgres
-- rewrites every dependent policy and trigger binding automatically.
alter function public.is_board_owner(uuid)               set schema private;
alter function public.is_board_member(uuid)              set schema private;
alter function public.is_board_editor(uuid)              set schema private;
alter function public.is_owner_shared_with_me(uuid)      set schema private;
alter function public.is_pictogram_storage_visible(text) set schema private;
alter function public.handle_new_user()                  set schema private;
alter function public.set_updated_at()                   set schema private;
