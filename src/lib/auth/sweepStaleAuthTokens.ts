/**
 * Supabase stores its session under `sb-<host-first-segment>-auth-token` in
 * localStorage. When VITE_SUPABASE_URL points at a different project than a
 * previous boot (cloud → staging → local rotation, or any env switch), the
 * old key sticks around forever — see #184.
 *
 * Sweep removes any `sb-*-auth-token` whose host differs from the currently
 * configured Supabase URL. Idempotent and safe: Supabase recreates its key
 * on the next sign-in. On a malformed URL we leave everything alone rather
 * than risk wiping a live session.
 */
const TOKEN_KEY_PATTERN = /^sb-.+-auth-token$/;

const currentTokenKey = (supabaseUrl: string): string | null => {
  let host: string;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    return null;
  }
  // "127.0.0.1:54321" → "127", "<ref>.supabase.co" → "<ref>".
  const firstSegment = host.split(':')[0]?.split('.')[0];
  if (!firstSegment) return null;
  return `sb-${firstSegment}-auth-token`;
};

export const sweepStaleAuthTokens = (supabaseUrl: string): void => {
  const keep = currentTokenKey(supabaseUrl);
  if (!keep) return;
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key !== keep && TOKEN_KEY_PATTERN.test(key)) {
      stale.push(key);
    }
  }
  for (const key of stale) {
    localStorage.removeItem(key);
  }
};
