import type { JSX } from 'react';
import { Link } from 'react-router-dom';

/**
 * Post-deletion landing. AuthGate's PUBLIC_PATHS allowlist routes signed-out
 * users here directly so the confirmation isn't masked by the Login screen.
 * Static — no session-dependent hooks (none are available in this branch).
 */
export const AccountDeletedRoute = (): JSX.Element => (
  <main role="main" className="tal" data-testid="account-deleted-route">
    <h1>Your account has been deleted</h1>
    <p>
      All your data — kids, boards, pictograms, and recordings — has been removed. This cannot be
      undone.
    </p>
    <p>
      <Link to="/">Sign up again</Link>
    </p>
  </main>
);
