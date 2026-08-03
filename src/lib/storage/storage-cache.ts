// Hot-path in-process cache backing `signedUrlFor`. Lives in its own module
// (no Supabase import) so vitest.setup.ts can dynamic-import the reset hook
// without dragging the runtime client through tsconfig.node.json.
export interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

export const signedUrlMemCache = new Map<string, SignedUrlEntry>();

// Test-only: vitest.setup.ts calls this in a global afterEach so module-level
// state cannot leak between tests. Pairs with idb-keyval's `clear()`.
export const __resetSignedUrlCache = (): void => {
  signedUrlMemCache.clear();
};
