import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Segmented } from './Segmented';

const OPTIONS = [
  { value: 'a' as const, label: 'A' },
  { value: 'b' as const, label: 'B' },
];

describe('Segmented', () => {
  it('fires onChange when an inactive option is clicked', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Letter" value="a" onChange={onChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not fire onChange when the already-active option is clicked (#245)', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Letter" value="a" onChange={onChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole('radio', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a named radio group with the active option checked (#682)', () => {
    render(<Segmented label="Letter" value="a" onChange={vi.fn()} options={OPTIONS} />);
    expect(screen.getByRole('radiogroup', { name: 'Letter' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'B' })).not.toBeChecked();
  });

  it('selects the next option with an arrow key', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Segmented label="Letter" value="a" onChange={onChange} options={OPTIONS} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'A' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus();
  });
});
