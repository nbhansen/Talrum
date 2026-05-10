import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sweepStaleAuthTokens } from './sweepStaleAuthTokens';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('sweepStaleAuthTokens', () => {
  it('removes sb-*-auth-token keys for hosts other than the current Supabase URL', () => {
    localStorage.setItem('sb-127-auth-token', '{"current":1}');
    localStorage.setItem('sb-wcwkxjjhribuecvcdenm-auth-token', '{"stale":1}');
    localStorage.setItem('sb-anotherproject-auth-token', '{"stale":2}');

    sweepStaleAuthTokens('http://127.0.0.1:54321');

    expect(localStorage.getItem('sb-127-auth-token')).toBe('{"current":1}');
    expect(localStorage.getItem('sb-wcwkxjjhribuecvcdenm-auth-token')).toBeNull();
    expect(localStorage.getItem('sb-anotherproject-auth-token')).toBeNull();
  });

  it('preserves the current cloud project key', () => {
    localStorage.setItem('sb-projectref-auth-token', '{"current":1}');
    localStorage.setItem('sb-127-auth-token', '{"stale":1}');

    sweepStaleAuthTokens('https://projectref.supabase.co');

    expect(localStorage.getItem('sb-projectref-auth-token')).toBe('{"current":1}');
    expect(localStorage.getItem('sb-127-auth-token')).toBeNull();
  });

  it('leaves unrelated keys untouched', () => {
    localStorage.setItem('talrum:pin-hash', 'abc');
    localStorage.setItem('talrum:last-board', '{"id":"x","kind":"sequence"}');
    localStorage.setItem('sb-stale-auth-token', '{"stale":1}');

    sweepStaleAuthTokens('http://127.0.0.1:54321');

    expect(localStorage.getItem('talrum:pin-hash')).toBe('abc');
    expect(localStorage.getItem('talrum:last-board')).toBe('{"id":"x","kind":"sequence"}');
    expect(localStorage.getItem('sb-stale-auth-token')).toBeNull();
  });

  it('is a no-op when there are no stale keys', () => {
    localStorage.setItem('sb-127-auth-token', '{"current":1}');

    sweepStaleAuthTokens('http://127.0.0.1:54321');

    expect(localStorage.getItem('sb-127-auth-token')).toBe('{"current":1}');
    expect(localStorage.length).toBe(1);
  });

  it('does nothing on a malformed Supabase URL rather than throwing', () => {
    localStorage.setItem('sb-stale-auth-token', '{"stale":1}');

    expect(() => sweepStaleAuthTokens('not a url')).not.toThrow();
    expect(localStorage.getItem('sb-stale-auth-token')).toBe('{"stale":1}');
  });
});
