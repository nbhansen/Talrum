-- The scrub ran as the caller, so an editor's delete left the id on the
-- owner's boards that the editor cannot see (#675). As a definer trigger it
-- reaches every board; RLS on the pictogram row stays the authorization.
create function private.scrub_deleted_pictogram() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update boards
     set step_ids = array_remove(step_ids, old.id)
   where step_ids @> array[old.id];
  return null;
end;
$$;

create trigger pictograms_scrub_step_ids
  after delete on pictograms
  for each row execute function private.scrub_deleted_pictogram();

create or replace function public.delete_pictogram(p_pictogram_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from pictograms where id = p_pictogram_id;
$$;
