import type { JSX } from 'react';

/**
 * "Sign up again" must stay a plain `<a>`: AuthGate does not watch URL changes,
 * so a History API push would keep the signed-out branch mounted and render the
 * protected home route.
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
