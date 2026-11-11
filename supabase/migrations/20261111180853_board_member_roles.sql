-- A membership row is 'editor' or the read-only 'viewer'. The owner is
-- boards.owner_id; an 'owner' row could edit the board but not write to the
-- library (#676).
update board_members set role = 'editor' where role = 'owner';

alter table board_members
  drop constraint board_members_role_check,
  add constraint board_members_role_check check (role in ('editor', 'viewer'));

create or replace function private.is_board_editor(b_id uuid) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from board_members
    where board_id = b_id and user_id = auth.uid() and role = 'editor'
  );
$$;
