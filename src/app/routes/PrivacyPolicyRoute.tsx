import type { JSX } from 'react';
import ReactMarkdown from 'react-markdown';

// Vite's ?raw query loads the file's text as a string at build time, making
// docs/privacy-policy.md the single source of truth. If the docs file is
// updated, the rendered route picks up the change on next build/dev reload.
import policyMarkdown from '../../../docs/privacy-policy.md?raw';

export const PrivacyPolicyRoute = (): JSX.Element => (
  <main role="main" data-testid="privacy-policy-route">
    <ReactMarkdown>{policyMarkdown}</ReactMarkdown>
  </main>
);
