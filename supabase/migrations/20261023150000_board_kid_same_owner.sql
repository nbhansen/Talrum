-- A board may point only at a kid with the same owner. Else an editor can
-- point the owner's board at the editor's own kid, then delete that kid, and
-- the cascade deletes the owner's board (#635).

alter table public.kids
  add constraint kids_id_owner_key unique (id, owner_id);

alter table public.boards
  drop constraint boards_kid_id_fkey,
  add constraint boards_kid_id_fkey
    foreign key (kid_id, owner_id) references public.kids (id, owner_id)
    on delete cascade;
