import { describe, expect, it, vi } from 'vitest';

import config from '../../../supabase/config.toml?raw';
import { fetchAllRows, PAGE_SIZE } from './fetchAllRows';

interface Row {
  id: string;
}

const ids = (prefix: string, n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(4, '0')}` }));

const fakeTable = (pages: Row[][]) => {
  const afters: (string | null)[] = [];
  const query = (after: string | null) => {
    const q = {
      gt: (_col: 'id', value: string) => query(value),
      order: (_col: 'id') => ({
        limit: vi.fn((n: number) => {
          afters.push(after);
          return Promise.resolve({
            data: (pages[afters.length - 1] ?? []).slice(0, n),
            error: null,
          });
        }),
      }),
    };
    return q;
  };
  return { select: () => query(null), afters };
};

describe('fetchAllRows', () => {
  it('reads pages until a short page, keyed on the last id of each page', async () => {
    const [first, second, third] = [ids('a', PAGE_SIZE), ids('b', PAGE_SIZE), ids('c', 3)];
    const table = fakeTable([first, second, third]);

    const rows = await fetchAllRows(table.select);

    expect(rows).toHaveLength(2 * PAGE_SIZE + 3);
    expect(table.afters).toEqual([null, first.at(-1)?.id, second.at(-1)?.id]);
  });

  it('throws the error of a failed page', async () => {
    const error = { message: 'boom' };
    const select = () => ({
      gt: () => select(),
      order: () => ({ limit: () => Promise.resolve({ data: null, error }) }),
    });

    await expect(fetchAllRows(select)).rejects.toBe(error);
  });

  it('uses a page size no larger than the PostgREST max_rows', () => {
    // A larger page comes back cut to max_rows, and the loop reads it as the last page.
    const maxRows = Number(/^max_rows\s*=\s*(\d+)/m.exec(config)?.[1]);
    expect(PAGE_SIZE).toBeLessThanOrEqual(maxRows);
  });
});
