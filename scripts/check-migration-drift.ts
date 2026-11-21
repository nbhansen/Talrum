/**
 * Detects drift between the migration filename prefixes and the linked
 * project's `schema_migrations.version`, the symptom of a migration applied
 * through the Supabase MCP tool. Run with `npm run migrations:check-drift`.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

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
    'prefix). See AGENTS.md §12.',
    'Fix: identify the offending migration, rename the local file to match the',
    'remote stamp, or re-stamp the remote row. Do NOT use MCP for schema work.',
  ].join('\n');
}

const MIGRATIONS_DIR = 'supabase/migrations';

export function migrationListArgs(dbUrl: string | undefined): string[] {
  // With SUPABASE_DB_URL set (session-pooler connection string, IPv4), connect
  // through the pooler. Without it, `--linked` lets the CLI pick — which can
  // fall back to the direct db.<ref>.supabase.co address (IPv6-only) while the
  // project is paused or freshly resumed, unreachable from GitHub-hosted runners.
  return dbUrl ? ['migration', 'list', '--db-url', dbUrl] : ['migration', 'list', '--linked'];
}

const IPV6_FALLBACK_RE = /IPv6 is not supported|network is unreachable/i;

export function connectivityHint(reason: string): string | null {
  if (!IPV6_FALLBACK_RE.test(reason)) return null;
  return [
    '[migration-drift] The CLI dialed the direct IPv6 connection, which',
    'GitHub-hosted runners cannot reach. This happens when the Supabase project',
    'is paused (free tier pauses after ~1 week idle) — resume it in the',
    'dashboard and re-run this job. To make the check pause-proof, set a',
    'SUPABASE_DB_URL repo secret with the session-pooler (IPv4) connection',
    'string from the dashboard.',
  ].join('\n');
}

function runSupabaseMigrationList(): { ok: true; stdout: string } | { ok: false; reason: string } {
  const args = migrationListArgs(process.env.SUPABASE_DB_URL || undefined);
  const run = () =>
    spawnSync('supabase', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let res = run();
  if (res.status !== 0) {
    // One retry: transient network errors are common in CI.
    spawnSync('sleep', ['5']);
    res = run();
  }
  if (res.status === 0) return { ok: true, stdout: res.stdout };
  const stderr = (res.stderr ?? '').trim();
  return { ok: false, reason: stderr || `supabase CLI exited with ${res.status}` };
}

function main(): number {
  const local = parseLocalVersions(readdirSync(MIGRATIONS_DIR));

  const result = runSupabaseMigrationList();
  if (!result.ok) {
    console.error(`[migration-drift] supabase migration list failed: ${result.reason}`);
    const hint = connectivityHint(result.reason);
    if (hint) console.error(hint);
    return 1;
  }

  const remote = parseRemoteVersions(result.stdout);

  // Zero parsed rows from output that has table rows: the table format may have
  // changed. Warn but do not block; `db push` is the hard backstop.
  if (
    remote.size === 0 &&
    !/no migrations/i.test(result.stdout) &&
    result.stdout.split('\n').some((l) => l.includes('|'))
  ) {
    console.error(
      '[migration-drift] WARNING: parsed zero remote versions from non-empty CLI output. ' +
        'Supabase CLI table format may have changed. Failing open; investigate parser.',
    );
    return 0;
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
