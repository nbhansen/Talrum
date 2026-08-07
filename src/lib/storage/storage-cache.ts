// Hot-path in-process cache backing `signedUrlFor`. Lives in its own module
// (no Supabase import) so vitest.setup.ts can dynamic-import the reset hook
// without dragging the runtime client through tsconfig.node.json.
export interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

export const signedUrlMemCache = new Map<string, SignedUrlEntry>();

// Called by vitest.setup.ts in a global afterEach, beside idb-keyval's clear().
export const __resetSignedUrlCache = (): void => {
  signedUrlMemCache.clear();
};
