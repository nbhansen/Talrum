-- A co-caregiver edits a shared board like the owner (#447). The share form
-- now writes `editor`; the `boards_update` editor branch already permits it.
-- Rows written as `viewer` before this get the same rights.
update board_members set role = 'editor' where role = 'viewer';

-- `boards_update`'s WITH CHECK accepts `owner_id = auth.uid()`, so an editor
-- could set `owner_id` to themselves and take the board: delete it, manage
-- its roster, and lock the owner out. Dormant while every share was a
-- viewer. A trigger holds it, as RLS cannot compare NEW with OLD.
create or replace function public.boards_owner_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'boards.owner_id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger boards_owner_immutable
  before update of owner_id on public.boards
  for each row execute function public.boards_owner_immutable();
