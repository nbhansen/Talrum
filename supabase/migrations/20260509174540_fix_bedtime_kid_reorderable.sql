-- Bedtime is a routine, so kids must not drag its steps out of order
-- (#187). Fix the template row and the already-cloned boards, scoped to
-- slug = 'bedtime' so deliberate user changes on other boards survive.
-- Idempotent: the `= true` guard makes re-runs a no-op.

update template_boards set kid_reorderable = false
  where slug = 'bedtime' and kid_reorderable = true;

update boards set kid_reorderable = false
  where slug = 'bedtime' and kid_reorderable = true;
