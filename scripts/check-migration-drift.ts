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
    const parts = line.split('│');
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
