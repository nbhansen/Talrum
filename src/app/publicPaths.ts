// Routes AuthGate lets through without a session. A new one needs an entry
// here and in routes.tsx; routes.test.tsx pins both directions. A component
// rendered on this branch must not call useSession() — there is no provider.
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/account-deleted', '/privacy-policy']);
