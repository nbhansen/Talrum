-- Rewrites pictograms_select and kids_select onto one helper
-- (is_owner_shared_with_me): inline EXISTS joins are the column-shadowing
-- surface that broke storage RLS (#37, 20260425020000).

drop policy pictograms_select on pictograms;
drop policy kids_select on kids;

-- Owner sees own rows; members of any of the owner's boards see the
-- owner's rows. Kept separate from is_pictogram_storage_visible(text): a
-- malformed storage path must not reach a uuid parameter.

create or replace function is_owner_shared_with_me(p_owner_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select p_owner_id = auth.uid()
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id = p_owner_id
        and bm.user_id = auth.uid()
    );
$$;

create policy pictograms_select on pictograms
  for select using (is_owner_shared_with_me(owner_id));

create policy kids_select on kids
  for select using (is_owner_shared_with_me(owner_id));
