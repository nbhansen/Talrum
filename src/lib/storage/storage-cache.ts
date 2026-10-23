// Hot-path in-process cache backing `signedUrlFor`. Lives in its own module
// (no Supabase import) so vitest.setup.ts can dynamic-import the reset hook
// without dragging the runtime client through tsconfig.node.json.
export interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

export const signedUrlMemCache = new Map<string, SignedUrlEntry>();

// Also called by vitest.setup.ts after each test, so module-level state cannot
// leak between tests.
export const clearSignedUrlMemCache = (): void => {
  signedUrlMemCache.clear();
};
