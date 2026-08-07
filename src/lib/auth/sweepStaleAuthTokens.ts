/**
 * Supabase keys its session by host, so switching VITE_SUPABASE_URL strands the
 * old key forever (#184). On a malformed URL, leave everything alone rather
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
