-- Cloud's default ACL lacks CRUD for the API roles, so pushed tables made
-- PostgREST return 42501 before RLS ran. Grant CRUD to authenticated and
-- set the schema default so future migrations stay safe.

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
