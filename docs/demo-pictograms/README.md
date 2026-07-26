# Demo pictograms

Five 500×500 PNGs for manually exercising the pictogram upload flow
(`PictoPicker` → Upload, `src/widgets/PictogramUpload/`). Bus, zoo, lunch,
lion, home — flat line-art on white, the same register as the seeded stock
photos.

They are here so an upload test needs no hunting for a suitable image, and so
everyone testing uses the same ones. Filenames are numbered to sort predictably
in a file picker; the number is not meaningful.

Not fixtures for the automated suite — nothing in `src/` imports them, and
Vitest never reads them. `supabase/seed.sql` seeds its own demo content
independently. Deleting these would break no test, only convenience.
