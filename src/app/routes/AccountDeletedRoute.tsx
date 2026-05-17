import type { JSX } from 'react';

/**
 * Post-deletion landing. AuthGate's PUBLIC_PATHS allowlist routes signed-out
 * users here directly so the confirmation isn't masked by the Login screen.
 * Static — no session-dependent hooks (none are available in this branch).
 *
 * NOTE: the "Sign up again" link is a plain `<a href="/">`, not `<Link>`.
 * AuthGate is not subscribed to URL changes, so a SPA-style History API push
 * would not re-evaluate PUBLIC_PATHS — the router would still mount inside
 * AuthGate's signed-out children branch and try to render the protected
 * home route, which calls `useSessionUser()` and throws into the
 * ErrorBoundary. A real anchor triggers a full page reload, AuthGate
 * remounts, sees the new pathname `/`, and renders <Login /> as expected.
 */
export const AccountDeletedRoute = (): JSX.Element => (
  <main role="main" data-testid="account-deleted-route">
    <h1>Your account has been deleted</h1>
    <p>
      All your data — kids, boards, pictograms, and recordings — has been removed. This cannot be
      undone.
    </p>
    <p>
      <a href="/">Sign up again</a>
    </p>
  </main>
);
