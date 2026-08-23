import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from './Tabs';

const ITEMS = [
  { id: 'library' as const, label: 'Library', sub: '17' },
  { id: 'upload' as const, label: 'Upload', sub: 'Photo / image' },
  { id: 'generate' as const, label: 'Generate' },
];

describe('Tabs', () => {
  it('renders a tablist with the selected tab marked', () => {
    render(<Tabs items={ITEMS} value="upload" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /upload/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /library/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('fires onChange with the tab id', async () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="library" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /generate/i }));
    expect(onChange).toHaveBeenCalledWith('generate');
  });
});
