-- Relabel the bed-glyph template 'Out of bed' -> 'Sleep' (#176). Slug stays
-- 'bed' so Bedtime's step_slugs array needs no rewrite; already-cloned user
-- rows are left alone on purpose (#192 gives users a rename UI).
-- Idempotent: guarded on the old label.

update template_pictograms set label = 'Sleep'
  where slug = 'bed' and label = 'Out of bed';
