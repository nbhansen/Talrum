-- A co-caregiver edits a shared board like the owner (#447). The share form
-- now writes `editor`; the `boards_update` editor branch already permits it.
-- Rows written as `viewer` before this get the same rights.
update board_members set role = 'editor' where role = 'viewer';
