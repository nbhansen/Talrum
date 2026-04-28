-- Adds the missing FK cascades from app tables to auth.users.
-- Required by issue #100 (delete-my-account) so that auth.users deletion
-- cleans up all owner-scoped app rows in one atomic step.
--
-- Pre-launch context: cloud has no real users yet, so default validation
-- is safe. If a future replay against populated data finds orphans, the
-- ALTER fails — by design — surfacing them for cleanup before deploy.

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
