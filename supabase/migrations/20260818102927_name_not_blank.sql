-- A board or kid name must hold at least one non-whitespace character (#482).
-- The create and rename paths already trim and refuse a blank name; this
-- holds it against a client bug or a direct REST call. Prod holds test data
-- only, so no existing row needs a decision.

alter table public.kids
  add constraint kids_name_not_blank
  check (name ~ '\S');

alter table public.boards
  add constraint boards_name_not_blank
  check (name ~ '\S');
