-- Bedtime is a routine — kids shouldn't be able to drag the steps out of
-- order (issue #187). Bedtime was the only sequence in the seed library
-- with `kid_reorderable = true`, which contradicts the point of teaching
-- the routine.
--
-- Fix two surfaces:
--   1. `template_boards` row that `handle_new_user()` clones for fresh
--      signups — without this, every new user keeps inheriting the wrong
--      default.
--   2. `boards` rows already cloned into existing accounts. Scoped to
--      `slug = 'bedtime'` so users who deliberately turned reorder back on
--      for their copy aren't caught (the slug filter only matches the
--      seeded original; user-customised boards keep slug from the clone
--      but if a user flipped the toggle off and back on we'd still revert
--      — accepted, since the toggle is being hidden for choice boards but
--      remains correct for sequences post-PR).
--
-- Idempotent: the `= true` guard makes re-runs a no-op.

update template_boards set kid_reorderable = false
  where slug = 'bedtime' and kid_reorderable = true;

update boards set kid_reorderable = false
  where slug = 'bedtime' and kid_reorderable = true;
