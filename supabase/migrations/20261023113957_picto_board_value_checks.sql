-- glyph and accent hold only the names the client renders (GlyphName and
-- AccentBg); an unknown one crashes the screen (#633). tint goes into an
-- inline CSS background, so it must be a bare OKLCH colour, never a url()
-- (#642). Prod holds test data only, and every current row passes.

alter table public.pictograms
  add constraint pictograms_glyph_known check (glyph in (
    'apple', 'bag', 'bath', 'bed', 'book', 'bowl', 'brush', 'car', 'check', 'cup',
    'heart', 'park', 'play', 'shirt', 'shoe', 'store', 'sun', 'swing', 'tooth', 'zoo'
  )),
  add constraint pictograms_tint_oklch
  check (tint ~ '^oklch\(\d+(\.\d+)?% \d+(\.\d+)? \d+(\.\d+)?\)$');

alter table public.template_pictograms
  add constraint template_pictograms_glyph_known check (glyph in (
    'apple', 'bag', 'bath', 'bed', 'book', 'bowl', 'brush', 'car', 'check', 'cup',
    'heart', 'park', 'play', 'shirt', 'shoe', 'store', 'sun', 'swing', 'tooth', 'zoo'
  )),
  add constraint template_pictograms_tint_oklch
  check (tint ~ '^oklch\(\d+(\.\d+)?% \d+(\.\d+)? \d+(\.\d+)?\)$');

alter table public.boards
  add constraint boards_accent_known
  check (accent in ('sage', 'sky', 'peach', 'lavender', 'sun'));

alter table public.template_boards
  add constraint template_boards_accent_known
  check (accent in ('sage', 'sky', 'peach', 'lavender', 'sun'));
