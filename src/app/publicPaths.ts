// Single source of truth for routes that AuthGate lets through without a
// session. Lives in its own module so AuthGate doesn't duplicate the list
// from routes.tsx. Adding a new public route requires editing this file
// AND the corresponding entry in routes.tsx; routes.test.tsx pins both
// directions so the two can't drift.
//
// Components rendered while signed-out MUST NOT call useSession() — there
// is no SessionProvider in scope on the public path branch.
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/account-deleted', '/privacy-policy']);
