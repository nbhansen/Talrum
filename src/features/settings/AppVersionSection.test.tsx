import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppVersionSection } from './AppVersionSection';

describe('AppVersionSection', () => {
  it('shows the package version and the build commit', () => {
    render(<AppVersionSection />);
    expect(screen.getByText(`${__APP_VERSION__} (${__APP_COMMIT__})`)).toBeInTheDocument();
    expect(__APP_COMMIT__).not.toBe('');
  });
});
