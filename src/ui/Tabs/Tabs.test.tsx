import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TabPanel, Tabs } from './Tabs';

const ITEMS = [
  { id: 'library' as const, label: 'Library', sub: '17' },
  { id: 'upload' as const, label: 'Upload', sub: 'Photo / image' },
  { id: 'generate' as const, label: 'Generate' },
];

describe('Tabs', () => {
  it('renders a tablist with the selected tab marked', () => {
    render(<Tabs id="t" items={ITEMS} value="upload" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /upload/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /library/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('fires onChange with the tab id', async () => {
    const onChange = vi.fn();
    render(<Tabs id="t" items={ITEMS} value="library" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /generate/i }));
    expect(onChange).toHaveBeenCalledWith('generate');
  });

  const Harness = (): JSX.Element => {
    const [tab, setTab] = useState<(typeof ITEMS)[number]['id']>('library');
    return (
      <>
        <Tabs id="t" items={ITEMS} value={tab} onChange={setTab} />
        <TabPanel tabsId="t" value={tab}>
          Panel {tab}
        </TabPanel>
      </>
    );
  };

  it('moves between tabs with the arrow, Home and End keys (#682)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole('tab', { name: /library/i })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /upload/i })).toHaveFocus();
    expect(screen.getByRole('tab', { name: /upload/i })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /generate/i })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: /library/i })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /generate/i })).toHaveFocus();
  });

  it('puts only the selected tab in the Tab order', () => {
    render(<Tabs id="t" items={ITEMS} value="upload" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /upload/i })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /library/i })).toHaveAttribute('tabindex', '-1');
  });

  it('names the panel after the selected tab', async () => {
    render(<Harness />);
    expect(screen.getByRole('tabpanel', { name: /library/i })).toHaveTextContent('Panel library');
    await userEvent.click(screen.getByRole('tab', { name: /generate/i }));
    expect(screen.getByRole('tabpanel', { name: /generate/i })).toHaveTextContent('Panel generate');
  });
});
