import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('is decorative by default', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('exposes a progressbar role when given a label', () => {
    render(<Spinner label="Loading" />);
    expect(screen.getByRole('progressbar', { name: /loading/i })).toBeInTheDocument();
  });
});
