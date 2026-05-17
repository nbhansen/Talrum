import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Segmented } from './Segmented';

const OPTIONS = [
  { value: 'a' as const, label: 'A' },
  { value: 'b' as const, label: 'B' },
];

describe('Segmented', () => {
  it('fires onChange when an inactive tab is clicked', async () => {
    const onChange = vi.fn();
    render(<Segmented value="a" onChange={onChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not fire onChange when the already-active tab is clicked (#245)', async () => {
    const onChange = vi.fn();
    render(<Segmented value="a" onChange={onChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole('tab', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
