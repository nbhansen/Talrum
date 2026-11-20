-- One membership helper for board-scoped rows, the twin of has_owner_access
-- for owner-scoped rows. Policies call the core helpers directly, so the
-- identity wrappers go.
create function private.has_board_membership(b_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from board_members
    where board_id = b_id
      and user_id = auth.uid()
      and (not p_write or role = 'editor')
  );
$$;

alter policy boards_select on public.boards
  using (owner_id = auth.uid() or private.has_board_membership(id, false));

alter policy boards_update on public.boards
  using (owner_id = auth.uid() or private.has_board_membership(id, true))
  with check (owner_id = auth.uid() or private.has_board_membership(id, true));

alter policy kids_select on public.kids
  using (private.has_owner_access(owner_id, false));

alter policy pictograms_select on public.pictograms
  using (private.has_owner_access(owner_id, false));

alter policy pictograms_write on public.pictograms
  using (private.has_owner_access(owner_id, true))
  with check (private.has_owner_access(owner_id, true));

drop function private.is_board_member(uuid);
drop function private.is_board_editor(uuid);
drop function private.is_owner_shared_with_me(uuid);
drop function private.is_editor_for_owner(uuid);

create function private.owner_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception '%.owner_id cannot change', tg_table_name using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger boards_owner_immutable on public.boards;
create trigger boards_owner_immutable
  before update of owner_id on public.boards
  for each row execute function private.owner_immutable();

drop trigger pictograms_owner_immutable on public.pictograms;
create trigger pictograms_owner_immutable
  before update of owner_id on public.pictograms
  for each row execute function private.owner_immutable();

drop function public.boards_owner_immutable();
drop function public.pictograms_owner_immutable();

-- The pictograms_scrub_step_ids trigger made it a plain delete (#675), and
-- the REST delete does the same under the same RLS.
drop function public.delete_pictogram(uuid);
