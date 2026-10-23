/** Must not exceed the PostgREST `max_rows`, which cuts a response with no error (#641). */
export const PAGE_SIZE = 1000;

interface PageResult<R> {
  data: R[] | null;
  error: unknown;
}

interface PageQuery<R> {
  gt(column: 'id', value: string): PageQuery<R>;
  order(column: 'id'): { limit(count: number): PromiseLike<PageResult<R>> };
}

/** Keyset pages on the immutable `id`, so a concurrent edit cannot skip a row. */
export const fetchAllRows = async <R extends { id: string }>(
  select: () => PageQuery<R>,
): Promise<R[]> => {
  const rows: R[] = [];
  for (;;) {
    const last = rows.at(-1);
    const query = last === undefined ? select() : select().gt('id', last.id);
    const { data, error } = await query.order('id').limit(PAGE_SIZE);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
};

interface Stamped {
  id: string;
  created_at: string;
}

export const byCreatedAt = (a: Stamped, b: Stamped): number =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
