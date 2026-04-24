/**
 * Phase 2 auth stub. The client signs in anonymously and the resulting
 * user's id is pinned to this uuid via the seed data's `owner_id` column,
 * so RLS (written against auth.uid()) is satisfied without a real login UI.
 *
 * Phase 3 removes this constant and wires real sign-in. Grep for
 * `LOCAL_PARENT_ID` or `TODO(phase 3): auth` to find every stub site.
 */
export const LOCAL_PARENT_ID = '00000000-0000-0000-0000-0000000000a1';

export const LOCAL_KID_ID = 'liam';
