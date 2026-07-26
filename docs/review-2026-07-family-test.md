# Senior review — readiness for testing with one family

**Date:** 2026-07-26 · **Commit reviewed:** `f91266b` · **Test shape assumed:** one adult + one
child, single iPad, no second caregiver account and no multi-device sync.

## How this was verified

Not a reading-only pass. Every finding below is either verified against a running app or marked
otherwise:

- Local Supabase + **production build** served on the same origin (`npm run build` + `preview`), driven
  in Chrome at the design viewport 1194×834. Dev mode was not trusted for offline claims because
  `vite.config.ts` sets `devOptions.enabled: false`, so there is no service worker in dev.
- A brand-new account created through the real magic-link flow, to settle what first-run looks like.
- Production Supabase inspected read-only (advisors, template tables). No writes to prod.
- Full gate re-run at the end: `typecheck`, `lint`, `lint:css`, `test:coverage`, `test:db`.

Baseline is genuinely strong and that shaped the review. All green: 89 Vitest files / 558 tests,
11 pgTAP files / 161 asserts, zero lint warnings, zero `TODO`/`FIXME` in `src/`, zero open bug issues.
The only prod security advisor is the Pro-tier HIBP one (#93), which is out of scope. So this review
targets what unit tests in jsdom structurally cannot see, and copy/docs that promise things the code
does not do.

---

## Blockers — fix before the iPad is handed over

### B1. A child can let themselves out of kid mode — ~~blocker~~ fixed in #353

`src/widgets/KidModeGate/KidModeGate.tsx:38`

When no PIN exists on the device, `requestExit` opens the **setup** flow rather than a verification
prompt. Anyone holding the tablet can choose a PIN, confirm it, and leave kid mode.

Verified: on a fresh profile with no stored PIN, tapping "Exit kid mode" → "Set a parent PIN" →
`1111` → `1111` landed on `/boards/:id/edit`. That is the board builder, which has a **Remove button
on every step** and a live title field — the most destructive parent surface in the app, not the home
screen. Screenshots: `02-kid-can-set-own-pin.png`, `03-kid-escaped-to-board-builder.png`.

This contradicts the README's central promise that a kid "can never land in parent UI." It is a soft
gate by design, and that is fine — but a gate that hands the key to whoever asks first is not a gate.

Options, cheapest first: require PIN setup during onboarding before kid mode can be *entered*; or keep
lazy setup but exit to `/` instead of the builder; or gate first-time setup behind something a child
won't complete. Independently, ship the Guided Access documentation (B5/M9) — on iPadOS that is the
only real containment, and the PIN is a speed bump.

**Fixed (#353).** Took the first option, enforced at the router rather than at the buttons: the
`'kid'` variant of `wrap()` now renders a `RequireKidPin` guard, so no PIN means no kid mode —
`/settings?pin=required` instead. That placement matters because there are three ways in and only one
is a button (the sidebar `KID`; `BoardBuilder`'s hardcoded launch; `ParentHomeRoute`'s auto-launch),
and a fourth added later inherits the guard for free. The gate itself lost its setup flow entirely and
can no longer write a PIN; creating one moved to Settings → *Set a PIN*, which did not exist before —
the old copy there just told parents they would be prompted on first exit. Details in
[kid-mode.md](./kid-mode.md).

Two related holes stayed open and are filed separately: the kid-route crash fallback still offers an
ungated "Tap to go back" link into parent home (#371), and the PIN pad has no attempt throttling, so
brute force is now the only remaining path in (#372).

### B2. Sync status is invisible on the screen where parents actually work

`src/layouts/ParentShell.tsx:79-89`, `src/features/board-builder/BoardBuilder.tsx:133`

`<OfflineIndicator />` is nested inside `{title && (<header>…</header>)}`. Two screens render
`ParentShell` **without** a `title` — `BoardBuilder.tsx:133` and `BoardNotFound.tsx:38` — so on those
screens the header never renders and the indicator is unreachable.

Consequence: while editing a board the parent gets no "Offline", no "N pending", no "Syncing…", and —
worst — no **"N sync changes failed"** row, which is the only place the **Retry** and **Discard**
buttons live. A permanently-failed write made on the builder is both invisible and unrecoverable
without navigating elsewhere first.

Verified in a production build with an active service worker: offline on `/` the pill reads "Offline";
offline on `/boards/:id/edit` there is no `<header>` element and no `[role="status"]` pill at all,
while an edit queues silently. Screenshot: `05-prod-offline-boardbuilder-no-pill.png`.

This is a good example of what the jsdom suite cannot catch: `OfflineIndicator.test.tsx` correctly
tests the component in isolation, and it passes. The defect is in the *coupling* — status visibility
accidentally depends on whether a screen passes a `title`.

Fix: move `<OfflineIndicator />` out of the `title &&` block so it renders for every parent screen.

### B3. The live privacy policy is a draft with unfilled blanks — ~~blocker~~ fixed

`docs/privacy-policy.md`, rendered at `/privacy-policy` (`src/app/routes.tsx:118`), reachable while
signed out (`src/app/publicPaths.ts`), linked from `src/features/settings/DeleteAccountSection.tsx:26`.

The file opened with "ENGINEERING DRAFT — NOT FOR PRODUCTION USE … must be reviewed and approved by
counsel before being linked from production builds," and contained `[TBD]` for effective date,
operator name, contact email (three places), Supabase region, and backup retention.

Even for one known family this was the wrong thing to ship — the contact email is how they'd exercise
deletion or ask what is stored.

**Fixed (#357).** Operator, contact email and effective date supplied by Nicolai. Two of the blanks
turned out to be false premises rather than missing values, and filling them in changed what the
policy says:

- **Region** is West EU (Ireland) — verified via `supabase projects list`, so the EU claim is real.
- **Backup retention** does not exist. Supabase takes daily backups only on Pro and above; the free
  plan (see `project_supabase_free_tier`, #93) has none. The old §8 promised a discretionary restore
  "within the backup window" and `docs/runbooks/account-deletion.md` told the operator to check a
  7-day window in the dashboard. Both described a paid plan. §8 is now "There is no restore" and the
  runbook's Scenario 2 answer is a flat no, with the plan change spelled out for whoever wants to
  change it.

Two adjacent claims were false for the same reason and were corrected in the same pass: §2 described
error reporting as future work ("once issue #45 lands" — it landed), and §5 promised that operator
access to user rows "is logged", which nothing in the stack does.

### B4. The persisted-cache escape hatch is welded shut

`package.json` version, consumed as `persistOptions.buster` via `__APP_VERSION__`
(`src/lib/queryClient.ts`, `vite.config.ts:112`)

`docs/offline-cache.md` calls the buster "the escape hatch for domain-type changes": bump the version
and every client discards its persisted IndexedDB cache. But `package.json` has never left `0.1.0`
(confirmed by #302, which added a commit-hash readout precisely because the version is static), so the
buster never changes and the hatch never fires.

During a live test you will be shipping changes to a device that is holding a week-old dehydrated
cache (`maxAge` is one week). Any change to a domain type's shape can surface as broken UI that a
reload will not clear. Fix: feed the buster from `__APP_COMMIT__`, which `vite.config.ts:16` already
computes.

---

## High

### H1. The offline media cache is never populated

`vite.config.ts:81-98`, verified in `dist/sw.js`

The `CacheFirst` runtime rule is registered as
`registerRoute(/\/storage\/v1\/object\/.*/i, new CacheFirst({cacheName:"talrum-storage-v1", …}))`.
Workbox only applies a **RegExp** route to a **cross-origin** request when the pattern matches from the
*start* of the URL. Supabase Storage is a different origin from the app, and this pattern matches
mid-URL only, so the route never fires for storage requests.

Verified: after uploading a photo and viewing it, `caches.keys()` contains only
`workbox-precache-v2-…` — `talrum-storage-v1` **does not exist**. The uploaded photo did still render
offline, but from Chrome's ordinary HTTP cache, not from the bounded, deliberate 200-entry / 30-day
cache the design calls for.

So the guarantee described in `vite.config.ts:77-80` ("CacheFirst keeps photo/audio bytes on disk so
kid-mode in the car works even after the signed-URL token has expired") and in `docs/offline-cache.md`
is not actually in force. Kid mode offline works today by accident of the HTTP cache, which is
opportunistically evicted and gives no expiry guarantees — and the signed-URL-expiry argument
specifically depends on the Workbox cache, since `ignoreSearch` is what makes a rotated token hit the
same entry.

Fix: anchor the pattern so it matches the whole cross-origin URL, e.g.
`/^https?:\/\/[^/]+\/storage\/v1\/object\/.*/i`. A function matcher would be clearer but
`generateSW` mode requires serializable config. Then assert `talrum-storage-v1` gets created — this is
exactly the class of bug a build-output check could pin, like `verify-build-css.mjs` does for CSS
(#218).

---

## Medium

| # | Finding | Location |
|---|---|---|
| M1 | **Library empty state advertises a feature that does not exist**: "Pictograms you upload, **generate**, or pick from the library will show up here." `PictoPicker` has exactly two tabs, `library` and `upload`; nothing in `src/` generates images. | `src/features/library/Library.tsx` |
| M2 | **Recorded-voice failure is silent to everyone**: `catch { /* fall through to TTS */ }` with no `captureException`. A systematically broken parent recording degrades to TTS forever with no signal to Sentry and none to the parent. For a first family test this is the difference between "it worked" and never finding out it didn't. | `src/lib/voiceOut.ts:20` |
| M3 | **Broken copy on the main upload path**: `Real photos of {fileName ?? 'cereal, shoes, or bed'} work best` renders as "Real photos of 3-lunch.png work best." once a file is chosen. Verified in the browser. | `src/widgets/PictogramUpload/PictogramUpload.tsx:124` |
| M4 | **Active-kid persistence swallows errors with no telemetry** — the only best-effort `catch {}` pair in `lib/` holding real app state rather than preferences, and the only ones that don't report. | `src/lib/queries/kids.ts:91,107` |
| M5 | **`docs/auth.md` still documents the replaced sign-in flow** (paste a 6-digit code, `verifyOtp`). `verifyOtp` appears nowhere in `src/`; #219 switched to magic links. The README half was fixed in #368; the doc is not. | `docs/auth.md:10-17` |

---

## Low / defer (`prod-hedge`)

- **RLS policies re-evaluate `auth.uid()` per row** across `boards`, `board_members`, `kids`,
  `pictograms`, `template_*` — confirmed in both source (`supabase/migrations/20260424145200_rls.sql:46`
  and ~30 further sites) and the live project's performance advisors. Also duplicate permissive SELECT
  policies on `board_members`/`kids`/`pictograms`, and `boards.kid_id` has no covering index.
  Irrelevant at one-family scale; the fix is mechanical (`(select auth.uid())`).
- **The coverage ratchet has slack in every dimension.** Floors are lines 87 / statements 84 /
  functions 77 / branches 78; measured this run: **88.97 / 86.59 / 79.72 / 79.83**. So 2–3 points of
  regression can land without CI noticing. Raise floors to just under actual, as #351 intended.
- **`useSetStepIds` skips the mutation silently in production on a cache miss** — the `console.warn` is
  `import.meta.env.DEV`-gated and then it `return`s. I could not construct a reachable path: all four
  callers receive an already-loaded `board` prop. So this is a latent trap, not a live bug — but the
  comment itself says a miss would mean "a future wiring put `useSetStepIds` ahead of its data," which
  is precisely the regression that would then be invisible in prod. Report it instead of returning
  silently. (`src/lib/queries/boards.mutations.ts:153-168`)
- **#326's trigger condition has already fired.** It defers a shared create-entity modal until "a third
  'create X' modal appears"; there are three: `NewKidModal`, `NewBoardModal`, `NewPictogramModal`.
  Either do it or restate the trigger.
- **`VITE_DISABLE_PIN=1` is an undocumented total bypass**: it skips the gate *and* makes `hasPin()`
  return `true`, so Settings reports a PIN that does not exist. Low likelihood, high impact if it ever
  reaches a production build. (`src/lib/pin.ts:13,29`)
- **The stored PIN is recoverable.** SHA-256 of a 4-digit PIN, unsalted, is a 10,000-entry rainbow
  table; in this session the stored hash was identifiable as `1234` on sight. `docs/kid-mode.md`'s "we
  never keep the digits themselves" is technically true but overstates the protection. Consistent with
  the documented soft-gate threat model — worth a one-line doc correction, not a redesign.
- **Everything user-scoped is per-device, not per-account** (PIN, language, speech prefs, active kid).
  Correct for this test; it is the bill that comes due at the two-caregiver milestone.
- **Documented outbox limits**, both harmless on one device: the board conflict guard is column-blind,
  and non-board tables replay last-write-wins (`docs/outbox.md`, "Known limits").
- `PrivacyPolicyRoute` ships a 119 kB chunk (react-markdown) to render one static document.

---

## Missing tests

The gap is not coverage percentage — it is that **every product invariant is asserted in jsdom, where
`src/lib/supabase.ts` is globally mocked** (`vitest.setup.ts`) and therefore never executed. Both
blockers B1 and B2 are invisible to the current suite by construction, and both took minutes to find
in a real browser.

1. **No browser e2e exists at all** — no Playwright/Cypress/MSW anywhere. The only e2e is
   `supabase/tests/delete_account_integration_test.sh`, at HTTP/SQL level. Highest-value addition for
   this milestone is a single smoke path: sign in → kid mode → attempt exit → offline edit → reconnect
   → assert it landed.
2. **The core product invariant is untested end-to-end**: "a kid can never land in parent UI." It is
   asserted piecemeal (`KidModeGate.test.tsx`, the route fallback split in `routes.test.tsx`) but never
   as one path — which is why B1 survived.
3. **No test asserts the offline indicator is reachable from every parent screen** — the B2 class of
   bug. A shell-level test over each `ParentShell` consumer would pin it.
4. **No build-output assertion for the service worker.** H1 would have been caught by asserting the
   runtime route matches a cross-origin storage URL, in the spirit of `verify-build-css.mjs`.
5. **Untested non-trivial files**, ranked: `src/ui/icons/index.tsx` (216 LOC, no test and no indirect
   reference) · `src/lib/outbox/drain.ts` (175, indirect only) · `src/lib/outbox/index.ts` (148,
   indirect only) · `src/features/parent-home/ParentHome.tsx` (134, indirect only) ·
   `src/app/routes/KidChoiceRoute.tsx` (25, the only route with **zero** coverage path) ·
   `StepTile.tsx` (79), `LibraryTab.tsx` (77), `BoardCard.tsx` (52) — no sibling and no indirect
   reference at all.
6. **pgTAP gaps**: `template_pictograms` / `template_boards` are the only RLS-enabled tables with no
   role-switched policy assertion (grants only); the `kids_owner_write` negative path is unasserted
   while the parallel `pictograms_owner_write` case is; `private.set_updated_at` is pinned structurally
   but nothing asserts `updated_at` actually advances on UPDATE.

---

## Missing functionality for this milestone

1. **No documented iPad setup.** Epic 13 lists "Document the recommended iPad setup (Add to Home
   Screen + Guided Access) for parents" as an unfiled candidate. For a single-device family test this
   *is* the deployment procedure, and Guided Access is the actual containment mechanism that B1's PIN
   gate only approximates. Write it before handover.
2. **Nothing records that the test happened.** Epic 17: no kid taps are logged. After the test there
   will be no data on which boards were used or which options were chosen — only what the parent
   remembers. Make this a deliberate decision (even "we collect nothing, we debrief verbally") rather
   than discovering it afterwards. Given the audience, "collect nothing" is a defensible answer, but
   it should be chosen.
3. Deferred correctly, listed so they stay deliberate: kid-initiated requesting (E15) and sentence
   building (E16) are real PECS gaps, but neither is a first-test blocker; the app covers PECS phases
   3–4 and that is what one family will exercise.

---

## Corrections to the repo's own account of itself

- **`docs/user-stories.md` Epic 18 is factually wrong.** It states "Demo boards exist in the local seed
  but a fresh production account starts empty," and the whole first-run epic rests on that premise.
  A fresh account created through the real flow got **1 kid, 4 boards, 17 pictograms** (3 sequence +
  1 choice; 4 stock photos + 13 glyphs). Production's `template_pictograms` / `template_boards` are
  seeded identically to local (17 / 4, verified read-only). First-run is already solved — the epic's
  premise should be corrected rather than acted on. Screenshot: `01-fresh-account-home.png`.
- **`openwiki/quickstart.md` claims "There are no deferred backlog items"** while `docs/user-stories.md`
  lists five future epics and five `prod-hedge` issues.
- `docs/storage.md` cites `src/ui/PictoTile/PictogramMedia.tsx`; it now lives in `src/widgets/PictoTile/`.

## What I verified as working correctly

Worth stating plainly, because these are the load-bearing claims and they hold:

- **The outbox is sound.** Twice: edit offline → optimistic UI → reconnect → write lands
  (6→5→4→3 steps, confirmed in Postgres each time). No data loss.
- **Kid mode works offline** in a production build with the service worker active — routes load,
  glyphs render, the board is usable. Screenshot: `06-kid-mode-offline-works.png`.
- **The upload pipeline works end-to-end**: PNG → client-side square crop → JPEG → Storage under an
  owner-prefixed path → DB row → renders. The owner prefix is the RLS boundary and it was correct.
- **Route-level error boundaries do their job** — a route that failed to load offline in dev showed
  "Couldn't load this screen / Your work is saved" with Retry and Go home, not a white screen.
- Migration state is clean; `supabase db reset` applies all 22 migrations; the full gate is green.

## Already fixed — #368

Local dev sign-in was broken for anyone following the README, which is how I hit it in the first
place: `config.toml` interpolated `SUPABASE_AUTH_SITE_URL` / `SUPABASE_AUTH_REDIRECT_URL`, the README
never mentioned them, and `supabase start` warned they were unset — leaving `site_url` empty and the
emailed link dead.

Chasing it surfaced the underlying design problem, fixed in #368: `config.toml` described **both**
local and production through env interpolation, which made a chain of trivia load-bearing (the
Supabase CLI reads `.env` but never `.env.local`; Vite prefers `.env.local` over `.env`; shell beats
both) and left `supabase config push` next to production as an all-or-nothing write. That is the same
mechanism behind #215, where a push meant to change `site_url` silently weakened prod auth.

Each concern now has one source of truth per environment: `config.toml` is a local-only fixture with
hardcoded localhost values, production auth is dashboard-managed, `npm run dev` is always local, and
Cloud access is an explicit `npm run dev:cloud`. A CI step pins the invariant so it cannot rot back.

Two findings in this report were fixed there rather than filed: the README's stale 6-digit-OTP
instruction, and its claim that Cloudflare Pages build env vars matter (Pages never builds — CI does,
then uploads `dist`).

## Suggested order

1. B1, B2 — small, self-contained, and both are "the product does not do what the README says."
2. B4, H1 — one-line and one-regex, but each restores a guarantee that is currently fiction.
3. B3 — blocked on Nicolai's operator details.
4. M1–M5 — copy and telemetry, an afternoon.
5. Tests 1–3 — the smoke path is what stops B1/B2-shaped bugs recurring.
6. Everything under Low — after the family test, informed by what actually broke.
