-- A pictogram a co-caregiver adds to a shared board is theirs (`owner_id`),
-- so the owner and the other members could not read its row or its bytes
-- (#490): `pictograms_select` and the storage SELECT policies were per
-- owner only. A pictogram is now also visible to anyone who can read a
-- board that lists it in `step_ids`. Writes stay owner-only.

create or replace function private.is_pictogram_on_my_board(p_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1
    from boards b
    where p_id = any (b.step_ids)
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1 from board_members bm
          where bm.board_id = b.id and bm.user_id = auth.uid()
        )
      )
  );
$$;

create index boards_step_ids_idx on public.boards using gin (step_ids);

drop policy pictograms_select on public.pictograms;
create policy pictograms_select on public.pictograms
  for select using (
    private.is_owner_shared_with_me(owner_id)
    or private.is_pictogram_on_my_board(id)
  );

-- The storage path carries the uploader's id, not the board owner's, so
-- the bytes are matched through the pictogram row that names them.
create or replace function private.is_pictogram_storage_visible(p_object_name text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select
    auth.uid()::text = (storage.foldername(p_object_name))[1]
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id::text = (storage.foldername(p_object_name))[1]
        and bm.user_id = auth.uid()
    )
    or exists (
      select 1
      from pictograms p
      where (p.image_path = p_object_name or p.audio_path = p_object_name)
        and private.is_pictogram_on_my_board(p.id)
    );
$$;
