-- FK cascades from app tables to auth.users (#100): account deletion
-- cleans owner-scoped rows in one atomic step. A replay against populated
-- data fails on orphans by design, surfacing them before deploy.

alter table public.kids
  add constraint kids_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.pictograms
  add constraint pictograms_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.boards
  add constraint boards_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.board_members
  add constraint board_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
