# Auth — email code sign-in

Real email-based sign-in with uuid-native per-user onboarding. It replaced
an earlier stubbed single-user auth from the initial build — the "Phase 2" /
"Phase 3" labels in the storage caveat at the bottom refer to that
transition.

## Flow

- Unauthenticated users see the `Login` screen (`src/features/login/Login.tsx`).
- The client calls `supabase.auth.signInWithOtp({ email })` via
  `useEmailCode` (`src/lib/auth/login.ts`). Supabase emails a 6-digit code.
- The user types the code into the app, which calls
  `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
- `AuthGate` (`src/app/AuthGate.tsx`) subscribes to
  `onAuthStateChange` and swaps the routed app in/out on session changes.
- Sign-out is the avatar button in the parent sidebar.

Why a code and not a link (#498): a link signs in the browser that opens it.
On iOS that is always Safari, and a Home Screen web app has its own storage,
so a link can never sign in the installed app. The code reaches the user only
while the dashboard-managed Magic Link email template renders `{{ .Token }}`;
prod dropped it once (#219). Keep `{{ .Token }}` in the template, remove
`{{ .ConfirmationURL }}`, and keep the dashboard OTP length equal to
`otp_length` in `supabase/config.toml`.

## Local dev — how to sign in

Supabase CLI's email catcher exposes Mailpit at:

```
http://127.0.0.1:54324
```

Sign in in the app, switch to that tab, open the newest email, and type
the code. The token TTL is set in
`supabase/config.toml::auth.email.otp_expiry`.

## Starter library on signup

`handle_new_user()` (see
`supabase/migrations/20260425000000_real_auth_onboarding.sql`) is a trigger
on `auth.users` that clones every row from `template_pictograms` and
`template_boards` into the new user's library, mints fresh uuids per row,
and rewrites board step arrays via a slug→uuid map. It's idempotent:
if the user already has a kid, the trigger no-ops.

Template tables are populated by the
`supabase/migrations/20260427162919_seed_templates.sql` migration — the
single source of truth for template content (`supabase/seed.sql` is
intentionally empty; edit the migration instead). They have RLS enabled
with a read-only-for-authenticated policy so PostgREST can't be abused to
mutate them.

## Smoke-test RLS isolation

1. `supabase db reset` — empties users.
2. Boot the app, sign up as `alice@example.com`, type the code from
   Mailpit.
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

## Why slugs survive alongside uuids

Ids are uuid-native, but text slugs ('apple', 'morning') are preserved as
an optional `slug` column (unique per owner). They exist for the handful of
client-side lookup sites that need to name a template pictogram without
knowing its per-user uuid — `ParentHome`'s recent strip, `BoardBuilder`'s
quick-add — via `usePictogramsBySlug`. Column shapes and constraints live
in the migrations and the generated `src/types/supabase.ts`.

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
