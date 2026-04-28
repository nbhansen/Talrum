# Delete-my-account flow + retention/privacy spec

**Date:** 2026-04-28
**Issue:** [#100](https://github.com/nbhansen/Talrum/issues/100)
**Status:** Draft (awaiting user review before plan)

## Problem

Talrum is a pre-launch AAC app for caregivers of autistic kids. User-generated data is sensitive PII: kid names, voice recordings, custom pictogram labels, daily-routine boards. Today there is **no in-app deletion flow**, **no retention policy**, **no privacy policy**, and **no operator runbook for deletion requests**. Once a real caregiver signs up, the absence of these becomes a legal exposure (GDPR Art. 17) and an ethical baseline failure.

This spec covers the engineering deliverable in full (in-app deletion flow + retention semantics that shape it) and provides text scaffolding for the privacy-policy and operator-runbook deliverables. Lawyer review of policy text is a follow-up gate before public launch.

## Decisions (locked during brainstorming)

| Q | Decision | Rationale (short) |
|---|---|---|
| Q1 retention | **Hard-delete; backup-only undelete via operator** | No soft-delete state pollutes RLS; GDPR-clean; upgrade path to grace-period model is additive |
| Q2 executor | **Supabase Edge Function with service-role admin client** | Uses official `auth.admin.deleteUser` API; service-role stays server-side; future-proof against Supabase upgrades |
| Q3 step-up | **Typed-phrase confirmation modal** ("delete my account") | Defeats realistic accidental-tap vector; matches industry standard (Apple, Google, GitHub); fresh-OTP re-auth deferred (additive) |
| Q4 inactivity cleanup | **Defer; reserve right in privacy policy** | No real users yet; pg_cron + email infrastructure speculative; future cron path can reuse the deletion helper |

## Out of scope

- Soft-delete state machine, `account_deletion_requests` table, undelete UI flow.
- Inactivity-driven scheduled deletion (pg_cron + warning email).
- In-app data export (Art. 20 portability) — deferred to follow-up issue; runbook covers manual export until then.
- Sentry / production error tracking integration (#45) — spec calls out the integration point but does not implement.
- Trigger-function failure observability (#102) — separate issue.
- Lawyer review of privacy policy text — process gate before public launch, not engineering work.
- Fresh-OTP re-auth before deletion — deferred; additive upgrade if threat model demands.

## Architecture

### Component map

```
src/features/settings/
├── SettingsRoute.tsx          (existing stub — extended with deletion section)
├── DeleteAccountSection.tsx   (NEW — destructive link + dialog host)
└── DeleteAccountDialog.tsx    (NEW — typed-phrase modal)

src/lib/queries/
└── account.ts                 (NEW — useDeleteMyAccount mutation)

src/app/
└── routes.tsx                 (MODIFIED — adds /account-deleted, ungated)

src/features/account-deleted/
└── AccountDeletedRoute.tsx    (NEW — static "your account is gone" page)

supabase/functions/delete-account/   (NEW — first edge function)
├── index.ts                   (HTTP handler: verify JWT, orchestrate, format response)
├── deleteAccount.ts           (pure deletion logic, takes admin client + uid)
├── deleteAccount.test.ts      (Deno unit tests with stub client)
├── handler.test.ts            (Deno tests for HTTP wiring)
└── deno.json                  (deps: supabase-js, std/http)

supabase/migrations/
└── <timestamp>_add_owner_fk_cascades.sql   (NEW — prerequisite)

supabase/tests/
└── delete_account_integration_test.sh      (NEW — E2E against local supabase)

docs/
├── privacy-policy.md          (NEW — draft text, awaits lawyer review)
└── runbooks/
    └── account-deletion.md    (NEW — operator runbook)

.github/workflows/
└── deploy-functions.yml       (NEW — deploys edge functions on push to main)
```

### Why these boundaries (SOLID)

- **SRP:** `DeleteAccountDialog` owns confirmation UX only. `useDeleteMyAccount` owns the network/cache contract only. `index.ts` owns request/response wiring only. `deleteAccount.ts` owns the deletion sequence only — and is the *single* place that knows the storage-then-auth ordering.
- **OCP:** Future cron-driven cleanup adds a sibling entrypoint (`cleanup-inactive-accounts/index.ts`) that imports and calls `deleteAccount(adminClient, uid)`. Core deletion code is closed for modification, open for new callers.
- **DIP:** `deleteAccount(client, uid)` depends on the `SupabaseClient` abstraction (`auth.admin.deleteUser`, `storage.from(...).list/remove`), not on `auth.users` schema layout or `storage.objects` internals.
- **LSP:** Tests pass a `FakeSupabaseClient` with the same call signatures the real client exposes; production passes the real one. Same contract.
- **ISP:** The function consumes only the admin methods it needs. No fat interface.

## Prerequisite: FK cascade migration

**Finding during spec authoring (load-bearing):** The current schema has *no* foreign keys from app tables to `auth.users`. `owner_id` columns are bare `uuid not null`. Verified by inspection of `supabase/migrations/20260425000000_real_auth_onboarding.sql` (kids:29, pictograms:36, boards:55, board_members:72).

Consequences if not fixed:
- Deleting an `auth.users` row leaves orphan rows in `kids`, `pictograms`, `boards`, `board_members`.
- The deletion edge function would have to delete from each app table explicitly, duplicating responsibility (the cascade already does this conceptually; encoding it in code AND requiring it of the schema-cascade is two sources of truth).
- Latent bug independent of this work: orphans are hidden by RLS (`owner_id = auth.uid()`), but they exist on disk.

**Migration:**

```sql
-- supabase/migrations/<timestamp>_add_owner_fk_cascades.sql

alter table public.kids
  add constraint kids_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.pictograms
  add constraint pictograms_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.boards
  add constraint boards_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.board_members
  add constraint board_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Note: boards.kid_id -> kids(id) ON DELETE CASCADE already exists (init.sql:56).
-- Note: board_members.board_id -> boards(id) ON DELETE CASCADE already exists.
-- After this migration, deleting auth.users.<uid> cascades to:
--   kids   -> boards (via boards.kid_id) -> board_members (via board_members.board_id)
--   pictograms (direct)
--   boards (direct, redundant with kids path; idempotent under cascade semantics)
--   board_members (direct as user_id, redundant with boards path; same)
```

Pre-launch context: cloud has no real users, so adding the FK with default validation is safe. If validation ever fails (e.g., a future replay against populated data), the failure surfaces orphans for manual cleanup before deploy — by design.

The pgTAP suite gains an FK-existence test asserting all four constraints exist with `ON DELETE CASCADE` action.

## Edge function: contracts

### Request

```
POST /functions/v1/delete-account
Authorization: Bearer <user JWT>     (set by supabase-js)
Content-Type: application/json
Body: {}                              (intentionally empty)
```

The body is empty by design. `user_id` comes from the verified JWT, never from the body. Non-empty bodies are rejected with HTTP 400 to make the contract explicit.

### Response

Success (200):
```json
{ "ok": true }
```

Failure (4xx/5xx):
```json
{ "ok": false, "error": "<code>", "message": "<human-readable>" }
```

Error codes (closed set):

| Code | HTTP | Meaning | Client action |
|---|---|---|---|
| `unauthorized` | 401 | Missing or invalid JWT | Redirect to login |
| `method_not_allowed` | 405 | Method other than POST | Should not occur in production; logs as bug |
| `bad_request` | 400 | Non-empty body that is not `{}` | Should not occur in production; logs as bug |
| `storage_purge_failed` | 500 | `storage.list` or `storage.remove` errored after retries | Retry button; auth row still intact |
| `auth_delete_failed` | 500 | `auth.admin.deleteUser` errored (and not "user not found") | Retry button; storage already empty |
| `internal_error` | 500 | Unanticipated | Contact support |

### Internal flow

```
1. Read SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from Deno.env.
   Construct supabaseAdmin: SupabaseClient (service-role).

2. Method check.
   if (req.method !== 'POST') -> 405 method_not_allowed.

3. Body check (consume body once; cache the result).
   const raw = (await req.text()).trim();
   if (raw !== '' && raw !== '{}') -> 400 bad_request.

4. Auth gate.
   const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
   const { data, error } = await supabaseAdmin.auth.getUser(jwt);
   if (!data.user) -> 401 unauthorized.
   const userId = data.user.id;

5. Storage purge — pictogram-audio.
   loop:
     const { data: objects } = await supabase.storage
       .from('pictogram-audio')
       .list(userId, { limit: 1000 });
     if (objects.length === 0) break;
     await supabase.storage
       .from('pictogram-audio')
       .remove(objects.map(o => `${userId}/${o.name}`));
   On error after 3 retries -> throw storage_purge_failed.

6. Storage purge — pictogram-images. Same pattern.

7. Auth deletion.
   const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
   if (error?.message?.includes('not found')) return ok;  (idempotent)
   if (error) throw auth_delete_failed.
   Cascades to kids, pictograms, boards, board_members via the FKs added in the prerequisite migration.

8. Log structured success record. Return { ok: true }.
```

### Why storage-first

If auth deletion succeeds but storage purge fails, the orphan files are keyed by a `user_id` that no longer exists in `auth.users`. No JWT will ever match that uid again, so the normal RLS path can't clean them up. They persist as cost + privacy debt.

If storage purge succeeds and auth deletion fails, the user account still exists with empty media. Bad state, but recoverable: client retries, storage operations are idempotent (already-empty prefixes succeed silently), auth deletion gets another shot.

Storage-first is recoverable; auth-first is not.

### Idempotency

- `storage.remove(paths)` succeeds with empty result on already-deleted paths.
- `auth.admin.deleteUser(uid)` returns "User not found" on already-deleted users — handled as success.
- Retry from any partial-failure state converges to "deleted" without double-effects.

### Bounded retries

Storage operations retry up to 3× immediately, no backoff. Reasoning:
- Edge functions have a 60-second wall-clock limit. Long backoff burns budget.
- Network blips are typically <1s; three immediate retries cover them.
- Persistent failure is faster to surface to the user than to retry around. The user is watching a spinner; a 2-second failure with a retry button beats a 30-second silent loop.

Auth deletion does not retry inside the function — its non-idempotency-on-other-errors makes "already partially gone, retry" a worse outcome than fail-fast.

### Concurrency

Two browser tabs both clicking "Delete forever" race. The first wins; the second receives `auth_delete_failed` ("user not found") which the function maps to success. Either way, the user sees deletion complete on both tabs. No distributed lock needed.

## Client mutation: `useDeleteMyAccount`

```ts
// src/lib/queries/account.ts
export const useDeleteMyAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<DeleteResponse>(
        'delete-account',
        { body: {} },
      );
      if (error) throw error;
      if (!data?.ok) throw mapErrorCode(data);
      return data;
    },
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut();
    },
    // No onError handler here — caller decides toast wording per error code.
    // No retry: user just clicked "delete forever"; we do not silently re-fire it.
  });
};
```

`mapErrorCode` translates the closed-set error codes into typed errors the dialog can switch on. Cache clearing precedes sign-out so no stale query refires against a session that's about to die.

## UI: settings entry + dialog

### `DeleteAccountSection` (lives inside `SettingsRoute`)

- Visually segregated: horizontal rule above; section header in normal weight; the link itself in destructive color.
- Single link/button: "Delete my account."
- Below the link: "This permanently deletes your account, all kids, all boards, all pictograms, and all recordings. [Read the privacy policy.]"
- Click opens `DeleteAccountDialog`.

### `DeleteAccountDialog`

- Full-screen modal (not a small popup — gravity matches consequence).
- a11y: focus trap on open; default focus is the **Cancel** button (Enter does not fire deletion); `aria-modal=true`; `Escape` closes.
- Body: enumerated list of what will be deleted (auth, kids, boards, pictograms, recordings, images, sharing relationships).
- Phrase prompt: "Type **delete my account** to confirm."
- Text input below the prompt. Comparison: trim, `toLowerCase()`, equality with `"delete my account"`. No regex — too permissive.
- Two buttons: **Cancel** (default focus, primary visual weight) and **Delete forever** (destructive style, disabled until phrase matches).
- States:
  - Idle: cancel enabled, destructive disabled.
  - Phrase matches: both enabled.
  - Mutating: both disabled, destructive shows spinner.
  - Error: toast with message keyed off error code; both buttons re-enable so user can retry or cancel.
  - Success: parent component navigates; dialog unmounts.

### Toast messages

| Error code | Toast |
|---|---|
| `unauthorized` | "Your session expired. Please sign in again." (then redirect to login) |
| `storage_purge_failed` | "We couldn't delete your media files. Try again, or contact support if it keeps failing." |
| `auth_delete_failed` | "We couldn't complete the deletion. Try again, or contact support if it keeps failing." |
| `internal_error` / unknown | "Something went wrong. Please contact support at <email>." |

## `/account-deleted` route

- Path: `/account-deleted`. Not gated by `AuthGate` (a deleted user has no session).
- Static page: title "Your account has been deleted", body explaining data is gone, link "Sign up again" → `/login`.
- Direct navigation works (a saved bookmark still lands somewhere sane).
- Implementation: small lazy-loaded route component, registered in `src/app/routes.tsx` outside the `AuthGate` boundary.

## Observability

Inside `index.ts`:

- Every failure path logs structured JSON via `console.error`:
  ```json
  { "event": "delete_account_failed", "user_id": "<uid>", "step": "storage_purge|auth_delete|...", "error": "<msg>" }
  ```
- Every success logs:
  ```json
  { "event": "delete_account_success", "user_id": "<uid>", "audio_count": N, "image_count": M, "duration_ms": T }
  ```
- Supabase Edge Functions stream `console.error` and `console.log` to the dashboard Logs surface.

This is the integration point for #45 (Sentry): the `catch` blocks in `index.ts` add `Sentry.captureException(err, { extra: { user_id, step } })` once Sentry lands. The spec does not require Sentry; it requires the structured-log shape so the migration is one-line.

## Testing strategy

### Surface 1: pure deletion logic — `deleteAccount.test.ts`

Tier: **Deno unit tests with `FakeSupabaseClient` stub.**

The pure function takes `(adminClient, userId)` and returns `Promise<void>` or throws typed errors. No `Deno.env`, no HTTP. Stub records call order and returns scripted responses.

Tests:
1. Happy path, both buckets empty → `auth.admin.deleteUser` called once.
2. Audio bucket has 5 objects → list+remove called with exact paths; auth then deleted.
3. Audio bucket has 1500 objects → list+remove looped twice; auth then deleted.
4. `storage.list` errors → throws `storage_purge_failed`; `auth.admin.deleteUser` NOT called.
5. `storage.remove` errors persistent → throws after 3 retries; auth NOT called.
6. `auth.admin.deleteUser` returns "user not found" → resolves OK (idempotent).
7. `auth.admin.deleteUser` returns other error → throws `auth_delete_failed`; storage call log proves storage already purged.
8. Ordering invariant — stub's call log shows all storage calls before any auth call.

### Surface 2: HTTP handler — `handler.test.ts`

Tier: **Deno tests invoking `index.ts`'s exported handler with mock `Request`.**

Tests:
1. Valid POST + valid Bearer → 200 `{ok:true}`.
2. No Authorization header → 401 `unauthorized`.
3. Invalid Bearer → 401 `unauthorized`.
4. Non-empty body → 400 `bad_request`.
5. GET / DELETE / PUT → 405 method not allowed.
6. Internal `deleteAccount` throws → response shape matches contract; HTTP code maps correctly.

### Surface 3: end-to-end against local Supabase

Tier: **shell integration test: `supabase/tests/delete_account_integration_test.sh`.**

This is the test that catches real bugs (FK cascades, storage RLS, service-role permissions). Pure unit tests can pass while production breaks if these system-level assumptions are wrong.

Script:
1. `supabase start` (assumed running in CI; explicit in local).
2. `supabase functions serve --no-verify-jwt=false --env-file .env.local` (function under test).
3. Sign up a fresh user via auth API → capture JWT and user_id.
4. Insert kids, boards, pictograms via the user's JWT (real RLS path).
5. Upload real Blobs to `pictogram-audio/<uid>/...` and `pictogram-images/<uid>/...` (a few of each).
6. Pre-deletion assertions: 1 auth row; N kids; M boards; etc.; expected storage objects.
7. Invoke `POST /functions/v1/delete-account` with the user's JWT.
8. Response 200.
9. Post-deletion assertions: 0 auth row; 0 kids; 0 boards; 0 pictograms; 0 board_members; 0 storage objects under `<uid>/` in either bucket.
10. Sign-in attempt with the deleted user's credentials returns `Invalid login credentials`.

Steps 9–10 are the real acceptance: they fail if FK cascade is missing, if storage RLS blocks the service-role purge, or if `auth.admin.deleteUser` doesn't fully clean up auth.

`package.json` gets a script: `"test:e2e:delete-account": "bash supabase/tests/delete_account_integration_test.sh"`. CI runs it as part of the existing test job.

### Surface 4: React UI — Vitest + React Testing Library

`DeleteAccountDialog.test.tsx`:
1. Initial render — destructive button disabled.
2. Wrong phrase typed → button stays disabled.
3. "delete my account" → button enables.
4. "DELETE MY ACCOUNT" → button enables (case-insensitive).
5. "  delete my account  " → button enables (whitespace trim).
6. Click destructive → mutation fired.
7. Mutation pending → spinner shown, both buttons disabled.
8. Mutation success → `onSuccess` prop called.
9. Each error code → correct toast; buttons re-enable.
10. Cancel → no mutation; modal closes.
11. Default focus is Cancel; Escape closes; tab-trap holds focus inside.

`DeleteAccountSection.test.tsx`:
1. Renders link with destructive styling.
2. Click opens dialog.
3. Dialog `onSuccess` triggers `useNavigate('/account-deleted', {replace:true})`.

`account.test.ts` (mutation):
1. Calls `supabase.functions.invoke('delete-account', {body: {}})`.
2. On success → `queryClient.clear()` then `auth.signOut()`, in that order.
3. On error → does NOT clear cache or sign out.
4. Each closed-set error code → mapped to the typed error class.

### Surface 5: routing

`routes.test.tsx` extension:
1. `/account-deleted` is *not* gated by `AuthGate`.
2. Renders the static page.
3. "Sign up again" link points to `/login`.

### pgTAP — FK invariants

Add to existing pgTAP suite:
- `kids_owner_id_fkey` exists with `ON DELETE CASCADE`.
- Same for `pictograms_owner_id_fkey`, `boards_owner_id_fkey`, `board_members_user_id_fkey`.

This catches any future migration that drops or alters the constraint.

### Out of scope (testing)

- Load testing the deletion path: not the bottleneck; one-shot per user. (#101 covers signup load.)
- Cross-browser manual: standard form inputs; no browser-specific code.
- JWT-verify pen testing: Supabase verifies; we test that the verified user is used, not the request body.

## CI/CD changes

### New workflow: `.github/workflows/deploy-functions.yml`

Triggers on push to `main` for paths under `supabase/functions/**`. Steps:
1. Checkout.
2. `supabase/setup-cli@<latest>`.
3. `supabase functions deploy delete-account --project-ref ${SUPABASE_PROJECT_REF}`.

Required GH secrets (added to existing list documented in #95):
- `SUPABASE_ACCESS_TOKEN` (already exists for migrations).
- `SUPABASE_PROJECT_REF` (already exists).
- `SUPABASE_SERVICE_ROLE_KEY` — **NEW**. Required by the function at runtime via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. Set as a function secret via `supabase secrets set`, not as workflow env var. The workflow itself does not read the service-role key.

### Function-secret bootstrap (one-time, documented)

```bash
supabase secrets set --project-ref <ref> \
  SUPABASE_SERVICE_ROLE_KEY=<value-from-dashboard>
```

This is documented in `docs/runbooks/deploy.md` (or extends #95's deploy doc) so a future maintainer can stand it up cold. The workflow does not handle this; it's a manual one-shot per project (prod, future staging).

### CI test job extension

The integration test (`supabase/tests/delete_account_integration_test.sh`) runs in the existing CI job that already does `supabase start`. Adds ~30s to CI time.

## Privacy policy (draft text — to be reviewed by counsel before launch)

Lives at `docs/privacy-policy.md`. Drafted by engineering; **not a legal document until reviewed**. Spec acceptance is "draft exists in repo," not "lawyer-approved."

Sections:

1. **Who we are.** Operator name + contact email. (Placeholder until you fill in.)
2. **What we collect.**
   - Account: email and authentication metadata via Supabase.
   - Caregiver-created content: kid names, board names + structures, pictogram labels, custom pictogram images, voice recordings.
   - Technical: sign-in timestamps; error reports once #45 lands. No analytics tracking.
3. **What we don't collect.** No third-party trackers; no ad IDs; no location; no device fingerprinting.
4. **Where it lives.** Supabase as data processor; region [TBD — fill in based on actual project region]. Subject to Supabase's GDPR compliance posture.
5. **Who has access.**
   - The caregiver themselves (via JWT/RLS).
   - Board co-caregivers explicitly invited via the sharing flow.
   - The operator for support purposes only; access is logged.
6. **Retention.** "We keep your account data until you delete it. We may, in the future, automatically delete accounts that have been inactive for a period to be determined; if we do so, we will email you at least 30 days before deletion." (Q4 deferral: forward-compatible promise.)
7. **Deletion rights (Art. 17).**
   - In-app: Settings → Delete my account. Effective immediately and irreversibly.
   - Email: a contact address. Operator commits to a 30-day response window.
8. **Operator-side restore.** "Supabase retains daily backups for [TBD days — based on plan]. If you email us within that window, restore is *possible at our discretion* but not promised. After the backup window expires, deletion is final."
9. **Data export (Art. 20).** "Email [address]; we'll respond within 30 days." (Manual until in-app export ships.)
10. **Children's data.** Caregiver is the data subject. Content describes a child but the child is not the account holder. Special-sensitivity language without claiming COPPA/equivalent jurisdiction (depends on launch markets — counsel to refine).
11. **Changes to this policy.** Standard "we'll notify materially" clause.
12. **Effective date.**

In-app linkage:
- Settings page near the deletion link: "Talrum keeps your data until you delete your account. [Read the privacy policy.]"
- Inside the deletion modal: explicit list of deletion scope.
- A `/privacy-policy` route that renders `docs/privacy-policy.md`. (If no markdown-rendering pattern exists in the app, add one — small dependency or a manual `react-markdown` pull. Decision deferred to plan.)

## Operator runbook (`docs/runbooks/account-deletion.md`)

Short doc covering operator-side scenarios:

### Scenario 1: user emails "please delete my account"

1. Verify the request comes from the email on the account (reply-from-same-address).
2. Run via Supabase dashboard SQL: `select id, email, created_at from auth.users where email = $1;` to confirm.
3. Two paths:
   - **(a)** If the user can sign in: instruct them to use Settings → Delete my account.
   - **(b)** If they can't (lost password, broken account): execute server-side. Concretely: call the same edge function from your local terminal using a session JWT for that user (operator can mint one via the dashboard's "Send magic link" flow if needed), OR run a SQL sequence of `delete from storage.objects where bucket_id in (...) and (storage.foldername(name))[1] = '<uid>'` then `delete from auth.users where id = '<uid>'`. The runbook documents both with copy-paste-ready commands.
4. Email confirmation back to the user.
5. Log the request: append a row to a private ops log (TBD — Linear ticket, CSV in private storage, or whatever the operator prefers; flagged for decision).

### Scenario 2: "I deleted my account by mistake, please restore"

1. Check Supabase backup retention window (set in dashboard; document the current value).
2. Within window: discuss feasibility. Restore is project-level, not per-user — implications for other users' data and active sessions. Decision factors: how recently did they delete? Are there other active users? Acceptable to roll the whole project back?
3. Outside window: respond apologetically; deletion is final.
4. Document the *factors*, not a SLA.

### Scenario 3: "please export my data"

1. Until the in-app export ships (separate follow-up issue), manually:
   - SQL dump scoped to `where owner_id = '<uid>'` for kids, pictograms, boards. `where user_id = '<uid>'` for board_members.
   - `supabase storage download` for `pictogram-audio/<uid>/` and `pictogram-images/<uid>/`.
   - Bundle as zip; send via email.
2. Document the exact commands so any future operator can repeat without re-deriving them.

## Acceptance criteria (mapped to issue #100)

- [ ] Prerequisite migration ships: `kids`, `pictograms`, `boards`, `board_members` have FK cascades to `auth.users`. pgTAP verifies.
- [ ] Edge function `supabase/functions/delete-account/` exists, deploys via new `deploy-functions.yml`, passes Surface 1 + 2 unit tests.
- [ ] E2E integration test (`supabase/tests/delete_account_integration_test.sh`) passes locally and in CI.
- [ ] `SettingsRoute` extended with `DeleteAccountSection` + `DeleteAccountDialog`. UI tests pass.
- [ ] `/account-deleted` route exists, ungated by `AuthGate`. Routing test verifies.
- [ ] `useDeleteMyAccount` mutation handles all closed-set error codes and clears cache + signs out on success only.
- [ ] `docs/privacy-policy.md` draft committed (not lawyer-approved; flagged for review).
- [ ] In-app `/privacy-policy` route renders the markdown.
- [ ] `docs/runbooks/account-deletion.md` covers the three operator scenarios with copy-paste commands.
- [ ] CI gates pass: lint, typecheck, all unit tests, all integration tests, all pgTAP.
- [ ] Follow-up issues filed (see below).

## Follow-up issues to file (not part of this implementation)

- "Inactivity-triggered account cleanup — implement at ~100 active users" (deferred from Q4).
- "In-app data export flow (GDPR Art. 20)" — manual via runbook until then.
- "Privacy policy lawyer review before public launch" — process gate.
- "Optional: fresh-OTP re-auth before deletion (Q3 stronger tier)" — add only if threat model evolves.

## Risks & open questions for plan-time decisions

- **Markdown rendering for `/privacy-policy`.** Repo has no markdown-rendering dependency today. Plan-time decision: pull `react-markdown` (small, well-maintained) vs. ship privacy policy as static HTML. I lean `react-markdown` because the privacy policy will be edited as markdown by humans, but it's a plan decision.
- **Function deploy authorization.** Confirm `supabase functions deploy` requires `SUPABASE_ACCESS_TOKEN` only and does not need additional secrets beyond what #95 already documents. Verifiable during plan.
- **pgTAP coverage for FK cascade behavior.** Asserting the constraint exists is cheap. Asserting cascade *behavior* end-to-end (insert auth row, insert app rows, delete auth row, assert app rows gone) is costlier but proves the chain works. Recommend including the behavioral test; final decision in plan.
- **`SUPABASE_SERVICE_ROLE_KEY` rotation.** Supabase rotates this key on demand; the function reads from `Deno.env`, which is sourced from `supabase secrets`. Document rotation procedure in `docs/runbooks/deploy.md` so a future rotation doesn't silently break the function.

---

**Status: ready for user review. Implementation plan to be authored after sign-off.**
