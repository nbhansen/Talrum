-- List order comes from these columns, so a sharer must not choose them
-- for a member's lists (#665). Data migrations that insert boards disable
-- boards_set_updated_at, as for data-only updates.
create function private.set_created_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  return new;
end;
$$;

create trigger kids_set_created_at
  before insert or update on public.kids
  for each row execute function private.set_created_at();

create trigger pictograms_set_created_at
  before insert or update on public.pictograms
  for each row execute function private.set_created_at();

drop trigger boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
  before insert or update on public.boards
  for each row execute function private.set_updated_at();
