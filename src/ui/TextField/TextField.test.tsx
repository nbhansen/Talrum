import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectField, TextField } from './TextField';

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

describe('SelectField', () => {
  it('labels the select and reports the chosen value', async () => {
    const onChange = vi.fn();
    render(
      <SelectField label="Kid" value="a" onChange={(e) => onChange(e.target.value)}>
        <option value="a">Liam</option>
        <option value="b">Ada</option>
      </SelectField>,
    );
    await userEvent.setup().selectOptions(screen.getByLabelText('Kid'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
