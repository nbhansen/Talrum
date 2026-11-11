import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Kid } from '@/types/domain';

import { KidSwitcher } from './KidSwitcher';

const KIDS = [
  { id: 'k1', name: 'Ada' },
  { id: 'k2', name: 'Bo' },
] as Kid[];

describe('KidSwitcher (#682)', () => {
  it('is a radio group with the active kid checked', () => {
    render(<KidSwitcher kids={KIDS} activeKidId="k2" onSelect={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Switch active kid' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Bo' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Ada' })).not.toBeChecked();
  });

  it('selects the next kid with an arrow key and wraps', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<KidSwitcher kids={KIDS} activeKidId="k2" onSelect={onSelect} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Bo' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenCalledWith('k1');
    expect(screen.getByRole('radio', { name: 'Ada' })).toHaveFocus();
  });

  it('keeps the first kid in the Tab order when no kid is active', async () => {
    render(<KidSwitcher kids={KIDS} activeKidId={null} onSelect={vi.fn()} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Ada' })).toHaveFocus();
  });
});
