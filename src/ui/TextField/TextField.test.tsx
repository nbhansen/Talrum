import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from './TextField';

describe('TextField', () => {
  it('renders label associated with the input', async () => {
    render(<TextField label="Name" placeholder="Liam" />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Liam')).toBeInTheDocument();
  });

  it('forwards onChange and value', async () => {
    const onChange = vi.fn();
    render(<TextField label="Name" value="" onChange={onChange} />);
    await userEvent.setup().type(screen.getByLabelText('Name'), 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
