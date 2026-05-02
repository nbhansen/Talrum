# Migration Version Drift Check — Design

**Issue:** [#133](https://github.com/nbhansen/Talrum/issues/133) — Pre-push hook to detect MCP-stamped migration version mismatches
**Date:** 2026-05-02
**Status:** Approved (brainstorming)

## Problem

`CLAUDE.md` §11 codifies "Supabase CLI, not MCP, for schema work." The rule is enforced by agent attention only. If a migration is ever applied via the Supabase MCP `apply_migration` tool, it stamps `supabase_migrations.schema_migrations.version` with the apply-time timestamp instead of the filename's 14-digit prefix. Subsequent `supabase db push --linked` then sees local files as "missing" and tries to re-apply, causing schema conflicts.

The cloud project is live and has been hit by this once already. Tooling-level enforcement is now warranted.

## Goal

Detect drift between the linked cloud project's migration versions and the local `supabase/migrations/*.sql` filenames, and block the change before it reaches `main`.

Success criteria:

1. A migration row in the remote DB whose version has no matching local file fails CI on the PR that introduces (or fails to clean up) the drift.
2. The same check is available locally as a pre-push hook for fast feedback.
3. Pushes that don't touch migrations pay zero runtime cost.
4. Local hook degrades gracefully when the dev environment isn't linked; CI is the unskippable enforcement layer.

## Non-goals

- Detecting *content* drift (a local file's SQL differing from what was applied). Out of scope; `supabase db diff` covers this separately.
- Auto-fixing drift. The script reports and exits non-zero; remediation is a human decision (rename file vs. re-stamp DB row).
- Hardening against `git push --no-verify`. The local hook is fast feedback, not enforcement.

## Architecture

One pure check script, two callers.

```
scripts/check-migration-drift.ts   ← pure logic, exits 0/1
        ▲                ▲
        │                │
.husky/pre-push       .github/workflows/ci.yml
  (soft, guarded)        (hard, enforced)
```

### `scripts/check-migration-drift.ts`

Pure check. Side-effect-free except stdout/stderr and exit code.

Steps:

1. Read `supabase/migrations/*.sql` filenames. Extract 14-digit prefixes via `^(\d{14})_.*\.sql$`. Build `localVersions: Set<string>`.
2. Run `supabase migration list --linked`. Parse stdout: each row has `|` separators (ASCII `|` U+007C, verified against CLI output 2026-05-02 — not Unicode box-drawing `│`); rows whose second column matches `^\d{14}$` are migration entries. Read the "Remote" column (index 1). Build `remoteVersions: Set<string>`.
3. `orphans = remoteVersions \ localVersions`.
4. If `orphans` is non-empty: print error message (see below), exit 1. Otherwise exit 0.
5. On `supabase migration list --linked` non-zero exit or transient error: retry once with 5s backoff, then fail with a clear message. Not silent.
6. On malformed CLI output (header only, zero data rows parsed when remote is known to be non-empty): print a loud warning to stderr but exit 0. CI's existing `db push` step in `deploy-migrations.yml` is the hard backstop; the drift check failing open here is acceptable because of that.

Failure message format:

```
Migration drift detected.
Remote DB has versions with no matching local file:
  - 20260501123456
  - 20260501134522
Likely cause: a migration was applied via the Supabase MCP server (apply_migration
stamps the apply-time timestamp instead of the filename prefix). See CLAUDE.md §11.
Fix: identify the offending migration, rename the local file to match the remote
stamp, or re-stamp the remote row. Do NOT use MCP for schema work.
```

### `.husky/pre-push`

Two guards before invoking the script:

1. **Skip if no migration changes in this push:** `git diff --name-only @{u}..HEAD -- supabase/migrations/` empty → `exit 0`.
2. **Soft-skip if local env isn't linked:** if `$SUPABASE_ACCESS_TOKEN` is unset or `supabase status --linked` fails, print yellow `[migration drift check] skipping — not linked locally; CI will enforce` and `exit 0`.

If both guards pass, invoke `node --experimental-strip-types scripts/check-migration-drift.ts`. Exit code propagates. Same runner style as the existing `icons:gen` script in `package.json`.

### `.github/workflows/ci.yml`

New job `migration-drift`, runs on `pull_request` and `push: main`. No guards; runs on every change.

Steps:

1. `actions/checkout@v4`.
2. Setup node (match repo version).
3. Install Supabase CLI (use the version pinned in `deploy-migrations.yml` — single source of truth).
4. `supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}` with `SUPABASE_ACCESS_TOKEN` from secrets (same names as `deploy-migrations.yml`).
5. `node --experimental-strip-types scripts/check-migration-drift.ts`. Hard fail.

Job is non-blocking on `npm install` (no app deps needed). Adds a new `package.json` script `migrations:check-drift` for local invocation parity.

## Testing

- **`scripts/check-migration-drift.test.ts`** (vitest, matches existing project test setup):
  - Parser: sample CLI output → correct version extraction.
  - Diff: remote ⊆ local → exit 0.
  - Diff: remote has orphan → exit 1, error message includes the orphan timestamp.
  - Diff: empty local + empty remote → exit 0.
  - Defensive: malformed CLI output (header only, no rows) → exit 0 with stderr warning, not a crash.
- **No live-DB integration test.** Parser + diff are unit-covered; live CLI behavior is exercised by CI itself on every PR.
- **Manual smoke (one-time during implementation):**
  - Push branch with no migration changes → fast skip.
  - Push branch with a migration change, env linked → check runs.
  - Unset `SUPABASE_ACCESS_TOKEN`, push migration change → soft-skip with warning.
  - Construct a synthetic orphan (rename a local migration to a non-matching prefix) → CI fails with the expected message.

## Files touched

- `scripts/check-migration-drift.ts` (new)
- `scripts/check-migration-drift.test.ts` (new)
- `.husky/pre-push` (new)
- `.github/workflows/ci.yml` (add `migration-drift` job)
- `package.json` (add `migrations:check-drift` script)

No changes to existing migration files, no schema changes, no new secrets.

## Failure modes & rollback

- **CLI output format changes between Supabase versions.** Unit tests catch on CLI bump in `deploy-migrations.yml`. Local push can use `--no-verify`. CI job can be disabled by deleting/commenting the workflow step — clean rollback, no migration touched.
- **Network flake on `supabase migration list --linked` in CI.** Single retry with 5s backoff, then fail loudly. Re-run job to recover.
- **Pre-push hook latency complaint.** Migration-changed guard means the typical push pays zero cost. Linked-call cost is one CLI invocation against Supabase, ~1–2s.

## Open questions

None at design time. Implementation may surface CLI parsing edge cases that need adjustment; those are local to the parser and don't affect this design.
