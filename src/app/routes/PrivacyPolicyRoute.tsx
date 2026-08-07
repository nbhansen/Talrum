import type { JSX } from 'react';
import ReactMarkdown from 'react-markdown';

// `?raw` inlines the file at build time, so docs/privacy-policy.md stays the
// single source of truth.
import policyMarkdown from '../../../docs/privacy-policy.md?raw';

export const PrivacyPolicyRoute = (): JSX.Element => (
  <main role="main" data-testid="privacy-policy-route">
    <ReactMarkdown>{policyMarkdown}</ReactMarkdown>
  </main>
);
