-- Cloud project's postgres-owned default ACL on schema public grants only
-- Dxtm (truncate/references/trigger/maintain) to anon/authenticated/service_role.
-- Tables created by `supabase db push` (running as postgres) inherit that ACL
-- and lack arwd, so PostgREST returns 42501 "permission denied" before RLS
-- runs. Grant CRUD to authenticated for existing app tables and set the
-- schema default so future migrations stay safe.

grant select, insert, update, delete on
  public.kids,
  public.boards,
  public.pictograms,
  public.board_members,
  public.template_pictograms,
  public.template_boards
to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
