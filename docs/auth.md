# Auth (Phase 3: real sign-in via OTP magic link)

Phase 3 replaced the Phase 2 stub with real email-based sign-in and
uuid-native per-user onboarding.

## Flow

- Unauthenticated users see the `Login` screen (`src/features/login/Login.tsx`).
- The client calls `supabase.auth.signInWithOtp({ email })`. Supabase emails
  a 6-digit code (plus a magic-link URL we don't use).
- The user pastes the code; the client calls `supabase.auth.verifyOtp` and
  gets a session.
- `AuthGate` (`src/app/AuthGate.tsx`) subscribes to
  `onAuthStateChange` and swaps the routed app in/out on session changes.
- Sign-out is the avatar button in the parent sidebar.

## Local dev — how to read the OTP

Supabase CLI's email catcher exposes Mailpit's API at:

```
http://127.0.0.1:54324
```

Sign in in the app, switch to that tab, grab the 6-digit code, paste it.
Tokens have an hour TTL (see `supabase/config.toml::auth.email.otp_expiry`).

## Starter library on signup

`handle_new_user()` (see
`supabase/migrations/20260425000000_real_auth_onboarding.sql`) is a trigger
on `auth.users` that clones every row from `template_pictograms` and
`template_boards` into the new user's library, mints fresh uuids per row,
and rewrites board step arrays via a slug→uuid map. It's idempotent:
if the user already has a kid, the trigger no-ops.

Template tables are populated by `supabase/seed.sql` (edit it directly).
They have RLS enabled with a read-only-for-authenticated policy so PostgREST
can't be abused to mutate them.

## Smoke-test RLS isolation

1. `supabase db reset` — empties users.
2. Boot the app, sign up as `alice@example.com`, verify OTP via Mailpit.
3. Rename a board, add a photo, record audio.
4. Sign out.
5. Sign up as `bob@example.com`. His library is a fresh clone of the
   templates — none of alice's edits visible.
6. As bob, try to read alice's board by her uuid (grab it from Studio or
   the psql shell): the query returns `[]`, not an error — RLS filters
   the row out silently.
7. As bob, `supabase.storage.from('pictogram-audio').createSignedUrl(<alice-path>)`
   either fails or produces a URL that 403s on fetch. Bucket RLS keys off
   the first path segment matching `auth.uid()::text`.

## Schema notes

- `kids.id`, `pictograms.id`, `boards.id` are all `uuid primary key default
gen_random_uuid()`.
- Text slugs ('apple', 'morning', 'liam') are preserved as an optional
  `slug text` column (with a `unique (owner_id, slug)` constraint on
  pictograms and boards). They're used by a handful of client-side lookup
  sites — `ParentHome.RECENT_STRIP_SLUGS`, `BoardBuilder.QUICK_ADD_SLUGS`,
  `GenerateTab.RESULT_SLUGS` — via `usePictogramsBySlug`.
- `boards.kid_id uuid references kids(id) on delete cascade` — real FK.
- `boards.step_ids uuid[]` — the trigger rewrites template `step_slugs
text[]` into per-user uuids at signup.
- `board_members.board_id uuid references boards(id)` — unchanged in shape.

## Storage cleanup caveat

Phase-2 uploads (if any were ever made against a real DB) were keyed under
the stub user's uuid path. The Phase-3 migration drops and recreates the
application tables but does **not** touch `storage.objects`. If this
migration is ever applied to a DB that saw Phase-2 traffic, stranded
objects will remain in the audio/images buckets — RLS will 403 them to
every real user and they're invisible to the UI. Purge manually with:

```sql
delete from storage.objects
where bucket_id in ('pictogram-audio', 'pictogram-images')
  and (storage.foldername(name))[1] = '00000000-0000-0000-0000-0000000000a1';
```

For local dev this is a non-issue because `supabase db reset` clears
storage.objects alongside the schema.

## What got deleted

- `src/lib/localAuth.ts` and `LOCAL_PARENT_ID` / `LOCAL_KID_ID` constants.
- `ensureStubSession`, `STUB_EMAIL`, `STUB_PASSWORD` in `src/lib/supabase.ts`.
- The `auth.users` / `auth.identities` seed block in
  `scripts/gen-seed.ts` — no dev-password rows in `seed.sql`.
- `slugifyLabel` in `src/lib/image.ts` — photo-pictogram ids are now
  uuids generated via `crypto.randomUUID()`.
