-- A board owner can share a board without the member's consent, so the
-- member must be able to remove their own row (#666).
create policy board_members_leave on board_members
  for delete
  using (user_id = auth.uid());
