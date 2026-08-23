import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Slider } from './Slider';

describe('Slider', () => {
  it('is a labelled range with the current value read out', () => {
    render(<Slider label="Rate" value={0.95} min={0.5} max={1.5} step={0.05} onChange={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Rate' });
    expect(slider).toHaveValue('0.95');
    expect(screen.getByText('0.95')).toBeInTheDocument();
  });

  it('fires onChange with a number', () => {
    const onChange = vi.fn();
    render(
      <Slider label="Rate" value={0.95} min={0.5} max={1.5} step={0.05} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Rate' }), { target: { value: '1.2' } });
    expect(onChange).toHaveBeenCalledWith(1.2);
  });
});
