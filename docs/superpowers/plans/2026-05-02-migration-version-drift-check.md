# Migration Version Drift Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a check that fails CI on PRs (and warns on local pre-push) when the linked Supabase project's `supabase_migrations.schema_migrations.version` column contains a version with no matching local migration filename — the symptom of a migration applied via the Supabase MCP `apply_migration` tool.

**Architecture:** One pure TypeScript script (`scripts/check-migration-drift.ts`) with importable parser + diff functions covered by vitest unit tests, plus a thin `main()` that shells out to `supabase migration list --linked`, parses output, and exits 0/1. Two callers: a guarded local `.husky/pre-push` hook (skip if no migration changes, soft-skip if not linked) and a hard-fail CI job in `ci.yml`.

**Tech Stack:** TypeScript, Node 24 (`--experimental-strip-types`, no compile step), vitest, Supabase CLI, Husky, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-05-02-migration-version-drift-check-design.md`

---

## File Structure

- `scripts/check-migration-drift.ts` (new) — pure parser/diff functions + `main()` entry point. `main()` runs only when invoked as a script, not when imported by tests.
- `scripts/check-migration-drift.test.ts` (new) — vitest unit tests for the pure functions. Default vitest `include` glob picks this up; not in `exclude`.
- `.husky/pre-push` (new) — shell hook with two early-exit guards before invoking the script.
- `.github/workflows/ci.yml` (modify) — add a new top-level job `migration-drift` running in parallel with `verify`.
- `package.json` (modify) — add `migrations:check-drift` npm script for parity with local invocation.

Boundaries: parser logic is the only thing under test; subprocess invocation, retries, and exit codes live in `main()` and are exercised end-to-end via the CI job's first run.

---

## Task 1: Pure parser + diff functions (TDD)

**Files:**
- Create: `scripts/check-migration-drift.ts`
- Test: `scripts/check-migration-drift.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/check-migration-drift.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import {
  parseLocalVersions,
  parseRemoteVersions,
  findOrphans,
  formatOrphanError,
} from './check-migration-drift.ts';

describe('parseLocalVersions', () => {
  it('extracts 14-digit prefixes from migration filenames', () => {
    const filenames = [
      '20260424145159_init.sql',
      '20260424145200_rls.sql',
      '20260425000000_real_auth_onboarding.sql',
    ];
    expect(parseLocalVersions(filenames)).toEqual(
      new Set(['20260424145159', '20260424145200', '20260425000000']),
    );
  });

  it('ignores files that do not match the timestamp pattern', () => {
    const filenames = ['README.md', 'not-a-migration.sql', '20260424_short.sql'];
    expect(parseLocalVersions(filenames)).toEqual(new Set());
  });

  it('returns an empty set for an empty input', () => {
    expect(parseLocalVersions([])).toEqual(new Set());
  });
});

describe('parseRemoteVersions', () => {
  it('extracts 14-digit versions from a typical CLI table', () => {
    // Delimiter is ASCII | (U+007C), verified against CLI output 2026-05-02.
    const stdout = [
      '   Local          | Remote         | Time (UTC)      ',
      '  ----------------+----------------+-----------------',
      '   20260424145159 | 20260424145159 | 2026-04-24 14:51:59',
      '                  | 20260501123456 | 2026-05-01 12:34:56',
      '   20260502000000 |                |                 ',
    ].join('\n');
    expect(parseRemoteVersions(stdout)).toEqual(
      new Set(['20260424145159', '20260501123456']),
    );
  });

  it('returns an empty set when no rows are present', () => {
    const stdout = [
      '   Local          | Remote         | Time (UTC)      ',
      '  ----------------+----------------+-----------------',
    ].join('\n');
    expect(parseRemoteVersions(stdout)).toEqual(new Set());
  });

  it('ignores non-timestamp content in the Remote column', () => {
    const stdout = [
      '   20260424145159 | abc            | garbage         ',
    ].join('\n');
    expect(parseRemoteVersions(stdout)).toEqual(new Set());
  });
});

describe('findOrphans', () => {
  it('returns versions in remote but not in local, sorted ascending', () => {
    const remote = new Set(['20260501123456', '20260424145159', '20260501134522']);
    const local = new Set(['20260424145159']);
    expect(findOrphans(remote, local)).toEqual([
      '20260501123456',
      '20260501134522',
    ]);
  });

  it('returns an empty array when remote is a subset of local', () => {
    const remote = new Set(['20260424145159']);
    const local = new Set(['20260424145159', '20260502000000']);
    expect(findOrphans(remote, local)).toEqual([]);
  });

  it('returns an empty array when both are empty', () => {
    expect(findOrphans(new Set(), new Set())).toEqual([]);
  });
});

describe('formatOrphanError', () => {
  it('includes each orphan and the CLAUDE.md reference', () => {
    const msg = formatOrphanError(['20260501123456', '20260501134522']);
    expect(msg).toContain('Migration drift detected.');
    expect(msg).toContain('  - 20260501123456');
    expect(msg).toContain('  - 20260501134522');
    expect(msg).toContain('CLAUDE.md');
    expect(msg).toContain('MCP');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/check-migration-drift.test.ts`
Expected: FAIL with module-not-found / cannot-resolve `./check-migration-drift.ts` errors.

- [ ] **Step 3: Write minimal implementation of the pure functions**

Create `scripts/check-migration-drift.ts`:

```ts
/**
 * Detects drift between supabase/migrations/*.sql filename prefixes and the
 * linked Supabase project's supabase_migrations.schema_migrations.version
 * column. The classic symptom of a migration applied via the Supabase MCP
 * apply_migration tool, which stamps apply-time timestamps instead of the
 * filename prefix.
 *
 * Run with:
 *   npm run migrations:check-drift
 *
 * See docs/superpowers/specs/2026-05-02-migration-version-drift-check-design.md
 */

const TIMESTAMP_RE = /^\d{14}$/;
const FILENAME_RE = /^(\d{14})_.*\.sql$/;

export function parseLocalVersions(filenames: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const name of filenames) {
    const m = FILENAME_RE.exec(name);
    if (m) out.add(m[1]);
  }
  return out;
}

export function parseRemoteVersions(stdout: string): Set<string> {
  const out = new Set<string>();
  for (const line of stdout.split('\n')) {
    // Rows are pipe-separated: Local | Remote | Time. Delimiter is ASCII | (U+007C),
    // verified against CLI output 2026-05-02. We only care about Remote (col 1, 0-indexed).
    const parts = line.split('|');
    if (parts.length < 2) continue;
    const remote = parts[1].trim();
    if (TIMESTAMP_RE.test(remote)) out.add(remote);
  }
  return out;
}

export function findOrphans(remote: Set<string>, local: Set<string>): string[] {
  const orphans: string[] = [];
  for (const v of remote) if (!local.has(v)) orphans.push(v);
  return orphans.sort();
}

export function formatOrphanError(orphans: readonly string[]): string {
  const list = orphans.map((v) => `  - ${v}`).join('\n');
  return [
    'Migration drift detected.',
    'Remote DB has versions with no matching local file:',
    list,
    '',
    'Likely cause: a migration was applied via the Supabase MCP server',
    '(apply_migration stamps the apply-time timestamp instead of the filename',
    'prefix). See CLAUDE.md §11.',
    'Fix: identify the offending migration, rename the local file to match the',
    'remote stamp, or re-stamp the remote row. Do NOT use MCP for schema work.',
  ].join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/check-migration-drift.test.ts`
Expected: PASS — all 10 test cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-migration-drift.ts scripts/check-migration-drift.test.ts
git commit -m "feat(scripts): pure parser/diff for migration version drift (#133)"
```

---

## Task 2: Wire main() — CLI subprocess, retry, exit codes

**Files:**
- Modify: `scripts/check-migration-drift.ts` (append `main()` and entrypoint guard)

- [ ] **Step 1: Add main() and the entrypoint guard**

Append to `scripts/check-migration-drift.ts`:

```ts
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';

function runSupabaseMigrationList(): { ok: true; stdout: string } | { ok: false; reason: string } {
  // Single retry with 5s backoff. CI flakes on transient network errors are common enough
  // that a one-shot retry is worth it; deeper than that and the failure is real.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    const res = spawnSync('supabase', ['migration', 'list', '--linked'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.status === 0) return { ok: true, stdout: res.stdout };
    if (attempt === 1) {
      const stderr = (res.stderr ?? '').trim();
      return { ok: false, reason: stderr || `supabase CLI exited with ${res.status}` };
    }
  }
  /* istanbul ignore next */ return { ok: false, reason: 'unreachable' };
}

export function main(): number {
  const root = process.cwd();
  const migrationsAbs = path.join(root, MIGRATIONS_DIR);
  const filenames = readdirSync(migrationsAbs).filter((f) => f.endsWith('.sql'));
  const local = parseLocalVersions(filenames);

  const result = runSupabaseMigrationList();
  if (!result.ok) {
    console.error(`[migration-drift] supabase migration list --linked failed: ${result.reason}`);
    return 1;
  }

  const remote = parseRemoteVersions(result.stdout);

  // Defensive: if remote parses to zero rows but the CLI succeeded with non-empty stdout,
  // the table format may have changed. Warn loudly but don't block — db push remains the
  // hard backstop. CI's first run on this PR will surface format breaks via the unit tests
  // when someone updates the CLI version.
  if (remote.size === 0 && result.stdout.trim().length > 0 && !/no migrations/i.test(result.stdout)) {
    const looksLikeRows = result.stdout.split('\n').some((l) => l.includes('|'));
    if (looksLikeRows) {
      console.error(
        '[migration-drift] WARNING: parsed zero remote versions from non-empty CLI output. ' +
          'Supabase CLI table format may have changed. Failing open; investigate parser.',
      );
      return 0;
    }
  }

  const orphans = findOrphans(remote, local);
  if (orphans.length === 0) {
    console.log(`[migration-drift] OK — ${remote.size} remote version(s), no drift.`);
    return 0;
  }

  console.error(formatOrphanError(orphans));
  return 1;
}

// Entrypoint guard: only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
```

- [ ] **Step 2: Verify tests still pass (main is dormant under import)**

Run: `npx vitest run scripts/check-migration-drift.test.ts`
Expected: PASS — same 10 test cases. The entrypoint guard prevents `main()` from running under vitest.

- [ ] **Step 3: Verify the script runs (without a linked project, expect non-zero exit and a clear error)**

Run: `node --experimental-strip-types scripts/check-migration-drift.ts; echo "exit=$?"`
Expected: stderr contains `[migration-drift] supabase migration list --linked failed: ...` and `exit=1`. (If your local env is linked and in sync, expect `[migration-drift] OK — N remote version(s), no drift.` and `exit=0`.)

- [ ] **Step 4: Replace the busy-wait sleep with a portable one**

The `Atomics.wait` trick works but is unidiomatic. Replace it with a synchronous wait via `spawnSync('sleep', ['5'])` for clarity. Edit the retry block:

```ts
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) spawnSync('sleep', ['5']);
    // ... rest unchanged
```

- [ ] **Step 5: Run tests once more to confirm nothing regressed**

Run: `npx vitest run scripts/check-migration-drift.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-migration-drift.ts
git commit -m "feat(scripts): main() for migration drift check with CLI invocation (#133)"
```

---

## Task 3: Add npm script

**Files:**
- Modify: `package.json` (add to `"scripts"`)

- [ ] **Step 1: Add the migrations:check-drift script**

Edit `package.json`'s `"scripts"` block, adding the new entry alphabetically near `types:db`:

```json
    "migrations:check-drift": "node --experimental-strip-types scripts/check-migration-drift.ts",
```

Final block (preserve existing entries, only this line is new):

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "lint": "eslint . --max-warnings 0",
    "lint:css": "stylelint \"src/**/*.module.css\"",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:db": "supabase test db",
    "test:functions": "cd supabase/functions/delete-account && deno test --allow-env",
    "test:e2e:delete-account": "bash supabase/tests/delete_account_integration_test.sh",
    "icons:gen": "node --experimental-strip-types scripts/gen-icons.ts",
    "migrations:check-drift": "node --experimental-strip-types scripts/check-migration-drift.ts",
    "types:db": "supabase gen types typescript --local > src/types/supabase.ts",
    "prepare": "husky"
  },
```

- [ ] **Step 2: Verify the script wires up**

Run: `npm run migrations:check-drift; echo "exit=$?"`
Expected: same behavior as Task 2 Step 3 — error or OK based on local link state, with the `[migration-drift]` prefix.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add migrations:check-drift npm script (#133)"
```

---

## Task 4: Local pre-push hook with guards

**Files:**
- Create: `.husky/pre-push`

- [ ] **Step 1: Create the pre-push hook**

Create `.husky/pre-push`:

```bash
#!/usr/bin/env bash
# Migration drift guard. See #133 and CLAUDE.md §11.
# Fast feedback only — CI is the unskippable enforcement layer.

set -e

# Husky calls pre-push with stdin lines: "<local_ref> <local_sha> <remote_ref> <remote_sha>".
# We don't need them; we use git's @{u} reference for the upstream comparison.

# Guard 1: skip if no migration files in this push.
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  CHANGED=$(git diff --name-only '@{u}..HEAD' -- supabase/migrations/ 2>/dev/null || true)
else
  # No upstream yet (first push of a new branch). Compare against origin/main as a heuristic;
  # if that doesn't exist either, skip — the check will run in CI on the PR regardless.
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    CHANGED=$(git diff --name-only origin/main..HEAD -- supabase/migrations/ 2>/dev/null || true)
  else
    CHANGED=""
  fi
fi

if [ -z "$CHANGED" ]; then
  exit 0
fi

# Guard 2: soft-skip if the local env isn't linked.
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo -e "\033[33m[migration-drift] skipping — SUPABASE_ACCESS_TOKEN not set; CI will enforce.\033[0m"
  exit 0
fi
if ! supabase status --linked >/dev/null 2>&1; then
  echo -e "\033[33m[migration-drift] skipping — local CLI not linked; CI will enforce.\033[0m"
  exit 0
fi

# Run the check.
npm run migrations:check-drift
```

Make it executable:

```bash
chmod +x .husky/pre-push
```

- [ ] **Step 2: Smoke-test the no-migration fast path**

Make a trivial non-migration change and verify the hook exits fast:

```bash
echo "" >> README.md
git add README.md
git commit -m "test: trivial readme change for pre-push smoke"
git push --dry-run 2>&1 | head -20
```

Expected: `git push` runs the hook, the hook hits Guard 1, exits 0 silently. `--dry-run` won't actually push but the hook still fires.
Cleanup: `git reset --hard HEAD~1` to drop the smoke commit.

- [ ] **Step 3: Smoke-test the not-linked soft-skip**

Create a fake migration file to trigger Guard 1 falling through, then run with the env var unset:

```bash
touch supabase/migrations/29990101000000_smoke_test.sql
git add supabase/migrations/29990101000000_smoke_test.sql
git commit -m "test: smoke migration for hook test"
SUPABASE_ACCESS_TOKEN="" git push --dry-run 2>&1 | tail -10
```

Expected: yellow `[migration-drift] skipping — SUPABASE_ACCESS_TOKEN not set; CI will enforce.`
Cleanup: `git reset --hard HEAD~1 && rm -f supabase/migrations/29990101000000_smoke_test.sql`

- [ ] **Step 4: Commit**

```bash
git add .husky/pre-push
git commit -m "feat(husky): add pre-push migration drift hook (#133)"
```

---

## Task 5: CI job

**Files:**
- Modify: `.github/workflows/ci.yml` (add a new job `migration-drift` after `verify`)

- [ ] **Step 1: Add the new job**

Append to `.github/workflows/ci.yml`, at the same indentation level as the existing `verify:` job (i.e., a sibling under `jobs:`):

```yaml
  migration-drift:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - uses: supabase/setup-cli@v2
        with:
          version: latest
      - run: supabase link --project-ref "$PROJECT_REF"
      - run: npm run migrations:check-drift
```

The full `jobs:` section should now have two top-level keys: the existing `verify` and the new `migration-drift`. They run in parallel; both must pass for the workflow to succeed.

- [ ] **Step 2: Verify YAML syntax locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no output, exit 0.

(If `python3-yaml` isn't available, use `npx yaml-lint .github/workflows/ci.yml` or just open the file and visually confirm the indentation matches `verify:`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add migration-drift job (#133)"
```

---

## Task 6: End-to-end smoke test on a PR

**Files:** none (verification only)

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin <branch-name>
gh pr create --fill --base main
```

- [ ] **Step 2: Watch the CI run**

Run: `gh pr checks --watch`
Expected: `migration-drift` job appears in the check list and passes (assuming the linked DB is currently in sync with `supabase/migrations/`).

- [ ] **Step 3: Synthetic-orphan smoke (optional, recommended once)**

To prove the check fails when it should, on a throwaway branch:

```bash
git checkout -b smoke/drift-trip
mv supabase/migrations/$(ls supabase/migrations/ | tail -1) supabase/migrations/29990101000000_smoke_renamed.sql
git add -A
git commit -m "smoke: rename to trigger drift"
git push -u origin smoke/drift-trip
gh pr create --fill --base main --title "[smoke] trip drift check"
gh pr checks --watch
```

Expected: `migration-drift` job FAILS with the orphan error message naming the original timestamp.
Cleanup: `gh pr close smoke/drift-trip --delete-branch && git checkout - && git branch -D smoke/drift-trip`.

- [ ] **Step 4: Close the loop on issue #133**

After the real PR merges, comment on #133:

```bash
gh issue close 133 --comment "Closed by <PR-URL>. Pre-push hook + CI job in place; synthetic-orphan smoke verified the check trips on remote-only versions."
```

---

## Self-Review

- **Spec coverage:**
  - "Pure script script + two callers" → Task 1+2 (script), Task 4 (pre-push), Task 5 (CI). ✓
  - "Skip if no migration changes" → Task 4 Guard 1. ✓
  - "Soft-skip if not linked" → Task 4 Guard 2. ✓
  - "Remote ⊆ Local semantics" → `findOrphans` (Task 1). ✓
  - "Single retry with 5s backoff" → Task 2 `runSupabaseMigrationList`. ✓
  - "Failure message format" → `formatOrphanError` test asserts content (Task 1). ✓
  - "Defensive: malformed CLI output → warn but exit 0" → Task 2 `main()` defensive branch. ✓
  - "Files touched" matches spec. ✓
  - "No live-DB integration test" → Task 1 covers parser; live behavior surfaces in Task 6. ✓
- **Placeholder scan:** No TBD/TODO/etc. All steps include exact code or commands.
- **Type consistency:** `parseLocalVersions`, `parseRemoteVersions`, `findOrphans`, `formatOrphanError`, `main` — names match across tests, implementation, and the entrypoint guard. CI env vars (`SUPABASE_ACCESS_TOKEN`, `PROJECT_REF`) match `deploy-migrations.yml`.
