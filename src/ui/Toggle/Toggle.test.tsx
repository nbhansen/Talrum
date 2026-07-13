import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('renders a labelled switch reflecting the current value', () => {
    render(<Toggle label="Labels" value={true} onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Labels' })).toBeChecked();
  });

  it('fires onChange(false) when clicked while on', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Labels" value={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Labels' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('fires onChange(true) when clicked while off', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Labels" value={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Labels' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
