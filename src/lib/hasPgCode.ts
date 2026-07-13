/**
 * True when `err` carries the given Postgres/PostgREST error code.
 * supabase-js surfaces these as plain objects with a string `code`, not
 * Error subclasses — so narrow structurally.
 */
export const hasPgCode = (err: unknown, code: string): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === code;
