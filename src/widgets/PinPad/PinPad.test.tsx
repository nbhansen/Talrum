import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';
import { tapDigits } from './pinPad.test-utils';

type PadProps = Partial<Parameters<typeof PinPad>[0]>;

const view = (props: PadProps = {}): JSX.Element => (
  <Modal onClose={vi.fn()} size="sm">
    <PinPad
      title="Enter PIN"
      subtitle="Parents only"
      onSubmit={() => Promise.resolve(false)}
      {...props}
    />
  </Modal>
);

const renderPad = (props?: PadProps): ReturnType<typeof render> => render(view(props));

describe('PinPad announcements (#683)', () => {
  it('announces a wrong PIN', async () => {
    const user = userEvent.setup();
    renderPad();
    await tapDigits(user, '1111');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
  });

  it('reads the count of entered digits after each key (#727)', async () => {
    const user = userEvent.setup();
    renderPad();
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 4 digits entered');
  });

  it('does not show a wrong PIN again when the lock ends (#726)', async () => {
    const user = userEvent.setup();
    const message = (s: number): string => `Wait ${s}s`;
    const { rerender } = renderPad();
    await tapDigits(user, '1111');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');

    rerender(view({ lock: { until: Date.now() + 300, message } }));
    expect(screen.getByRole('timer')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument());

    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  // A countdown in the alert would be read aloud again on each tick.
  it('shows the lock countdown as a timer, not as an alert', () => {
    renderPad({ lock: { until: Date.now() + 30_000, message: (s) => `Wait ${s}s` } });
    expect(screen.getByRole('timer')).toHaveTextContent(/Wait \d+s/);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });
});
