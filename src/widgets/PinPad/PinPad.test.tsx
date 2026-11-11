import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PinPad } from './PinPad';

const renderPad = (props: Partial<Parameters<typeof PinPad>[0]> = {}): void => {
  render(
    <PinPad
      title="Enter PIN"
      subtitle="Parents only"
      onSubmit={() => Promise.resolve(false)}
      onCancel={vi.fn()}
      {...props}
    />,
  );
};

describe('PinPad announcements (#683)', () => {
  it('announces a wrong PIN', async () => {
    const user = userEvent.setup();
    renderPad();
    for (const d of '1111') await user.click(screen.getByRole('button', { name: d }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
  });

  it('gives the count of entered digits', async () => {
    const user = userEvent.setup();
    renderPad();
    expect(screen.getByRole('img', { name: '0 of 4 digits entered' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('img', { name: '2 of 4 digits entered' })).toBeInTheDocument();
  });

  // A countdown in the alert would be read aloud again on each tick.
  it('shows the lock countdown as a timer, not as an alert', () => {
    renderPad({ lock: { until: Date.now() + 30_000, message: (s) => `Wait ${s}s` } });
    expect(screen.getByRole('timer')).toHaveTextContent(/Wait \d+s/);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });
});
