import { afterEach, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'sb-127-auth-token';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('keeps the stored session when the URL has an #access_token fragment (#632)', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  const expiresAt = Math.round(Date.now() / 1000) + 3600;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: 'stored-at',
      refresh_token: 'stored-rt',
      expires_in: 3600,
      expires_at: expiresAt,
      token_type: 'bearer',
      user: { id: 'stored-user', aud: 'authenticated' },
    }),
  );
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })));
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(
    null,
    '',
    `/#access_token=other-at&refresh_token=other-rt&expires_in=3600&expires_at=${expiresAt}&token_type=bearer`,
  );

  vi.doUnmock('@/lib/supabase');
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.auth.getSession();

  expect(data.session?.user.id).toBe('stored-user');
  expect(fetchMock).not.toHaveBeenCalled();
});
