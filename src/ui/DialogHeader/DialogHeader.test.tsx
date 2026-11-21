import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '@/ui/Modal/Modal';

import { DialogHeader } from './DialogHeader';

describe('DialogHeader', () => {
  it('renders title and subtitle, names the dialog, and closes it', async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} size="sm">
        <DialogHeader title="Add a kid" subtitle="Each kid has their own boards." />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: /add a kid/i })).toBeInTheDocument();
    expect(screen.getByText(/each kid has their own boards/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits subtitle when not provided', () => {
    render(
      <Modal onClose={vi.fn()} size="sm">
        <DialogHeader title="Plain" />
      </Modal>,
    );
    expect(screen.getByRole('heading', { name: /plain/i })).toBeInTheDocument();
    expect(screen.queryByText(/each kid/i)).not.toBeInTheDocument();
  });
});
