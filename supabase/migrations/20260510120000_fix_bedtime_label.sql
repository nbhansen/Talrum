-- Issue #176: 'Bedtime' template's final step rendered as 'Out of bed' —
-- the opposite of what a bedtime routine should end with. The original
-- seed (20260427162919) labelled the `bed`-glyph pictogram as 'Out of
-- bed', a phrase that only fits a wakeup sequence. Relabel to 'Sleep' so
-- fresh signups see Bath -> Story time -> Drink -> Sleep.
--
-- Slug stays 'bed' to match the existing glyph and avoid also rewriting
-- Bedtime's step_slugs array. Existing user data (rows in `pictograms`
-- already cloned by handle_new_user) is intentionally left alone — users
-- may have repurposed 'Out of bed' in custom morning routines, and #192
-- gives them a rename UI if they want to change it.
--
-- Idempotent: the label-equals-'Out of bed' guard makes re-runs a no-op.

update template_pictograms set label = 'Sleep'
  where slug = 'bed' and label = 'Out of bed';
