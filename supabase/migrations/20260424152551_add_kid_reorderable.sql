-- Caregiver-controlled flag: when true, KidSequence lets the kid drag tiles
-- to reorder (e.g. decide "snack before puzzle" themselves). Off by default
-- since not every kid can handle the extra interaction complexity.
alter table boards
  add column kid_reorderable boolean not null default false;
