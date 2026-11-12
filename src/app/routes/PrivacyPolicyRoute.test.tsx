import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyPolicyRoute } from './PrivacyPolicyRoute';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PrivacyPolicyRoute', () => {
  it('names the configured contact address at each contact point (#685)', () => {
    vi.stubEnv('VITE_PRIVACY_CONTACT_EMAIL', 'operator@example.org');
    render(<PrivacyPolicyRoute />);
    const links = screen.getAllByRole('link', { name: 'operator@example.org' });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute('href', 'mailto:operator@example.org');
  });

  it('names no address when the build has no contact address', () => {
    vi.stubEnv('VITE_PRIVACY_CONTACT_EMAIL', '');
    render(<PrivacyPolicyRoute />);
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(/the operator of this site/)).toHaveLength(3);
  });
});
