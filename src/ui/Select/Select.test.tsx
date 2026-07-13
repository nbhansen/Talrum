import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

const OPTIONS = [
  { value: 'tts' as const, label: 'Read aloud (TTS)' },
  { value: 'parent' as const, label: 'Recorded voice' },
  { value: 'none' as const, label: 'No sound' },
];

describe('Select', () => {
  it('shows the label and the current selection', () => {
    render(<Select label="Voice" value="tts" onChange={vi.fn()} options={OPTIONS} />);
    expect(screen.getByText('Voice:')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('tts');
    expect(screen.getByRole('option', { name: 'Read aloud (TTS)', selected: true })).toBeDefined();
  });

  it('fires onChange with the picked value', async () => {
    const onChange = vi.fn();
    render(<Select label="Voice" value="tts" onChange={onChange} options={OPTIONS} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'No sound');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('none');
  });
});
