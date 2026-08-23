import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('exposes aria-label as the accessible name', () => {
    render(
      <IconButton aria-label="Close">
        <span>x</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('defaults type to "button" and forwards onClick', async () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Close" onClick={onClick}>
        <span>x</span>
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the icon inside the button', () => {
    render(
      <IconButton aria-label="Close">
        <span data-testid="icon">x</span>
      </IconButton>,
    );
    expect(screen.getByRole('button')).toContainElement(screen.getByTestId('icon'));
  });
});
