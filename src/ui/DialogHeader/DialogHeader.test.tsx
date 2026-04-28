import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DialogHeader } from './DialogHeader';

describe('DialogHeader', () => {
  it('renders title and subtitle and wires the close button', async () => {
    const onClose = vi.fn();
    render(
      <DialogHeader
        title="Add a kid"
        subtitle="Each kid has their own boards."
        titleId="t1"
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading', { name: /add a kid/i })).toHaveAttribute('id', 't1');
    expect(screen.getByText(/each kid has their own boards/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits subtitle when not provided', () => {
    const noop = vi.fn();
    render(<DialogHeader title="Plain" titleId="t2" onClose={noop} />);
    expect(screen.getByRole('heading', { name: /plain/i })).toBeInTheDocument();
    expect(screen.queryByText(/each kid/i)).not.toBeInTheDocument();
  });
});
