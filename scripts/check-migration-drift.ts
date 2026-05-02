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

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

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
    // Rows are pipe-separated: Local | Remote | Time. We only care about Remote (col 1, 0-indexed).
    // Delimiter is ASCII | (U+007C), verified against CLI output 2026-05-02.
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

const MIGRATIONS_DIR = 'supabase/migrations';

function runSupabaseMigrationList(): { ok: true; stdout: string } | { ok: false; reason: string } {
  // Single retry with 5s backoff. CI flakes on transient network errors are common enough
  // that a one-shot retry is worth it; deeper than that and the failure is real.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) spawnSync('sleep', ['5']);
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
  if (
    remote.size === 0 &&
    result.stdout.trim().length > 0 &&
    !/no migrations/i.test(result.stdout)
  ) {
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
