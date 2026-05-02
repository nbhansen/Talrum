import { describe, expect, it } from 'vitest';

import {
  findOrphans,
  formatOrphanError,
  parseLocalVersions,
  parseRemoteVersions,
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
    const stdout = [
      '   Local          | Remote         | Time (UTC)      ',
      '  ----------------+----------------+-----------------',
      '   20260424145159 | 20260424145159 | 2026-04-24 14:51:59',
      '                  | 20260501123456 | 2026-05-01 12:34:56',
      '   20260502000000 |                |                 ',
    ].join('\n');
    expect(parseRemoteVersions(stdout)).toEqual(new Set(['20260424145159', '20260501123456']));
  });

  it('returns an empty set when no rows are present', () => {
    const stdout = [
      '   Local          | Remote         | Time (UTC)      ',
      '  ----------------+----------------+-----------------',
    ].join('\n');
    expect(parseRemoteVersions(stdout)).toEqual(new Set());
  });

  it('ignores non-timestamp content in the Remote column', () => {
    const stdout = ['   20260424145159 | abc            | garbage         '].join('\n');
    expect(parseRemoteVersions(stdout)).toEqual(new Set());
  });
});

describe('findOrphans', () => {
  it('returns versions in remote but not in local, sorted ascending', () => {
    const remote = new Set(['20260501123456', '20260424145159', '20260501134522']);
    const local = new Set(['20260424145159']);
    expect(findOrphans(remote, local)).toEqual(['20260501123456', '20260501134522']);
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
