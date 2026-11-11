import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal';

describe('Modal', () => {
  it.each(['sm', 'md', 'full'] as const)('applies the %s size class to the dialog', (size) => {
    render(
      <Modal onClose={vi.fn()} labelledBy="t1" size={size}>
        <h2 id="t1">Dialog 1</h2>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toMatch(new RegExp(size));
  });

  it('renders children inside an aria-modal dialog', () => {
    render(
      <Modal onClose={vi.fn()} labelledBy="t2" size="sm">
        <h2 id="t2">Dialog 2</h2>
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Body');
  });

  it('labels the dialog via labelledBy', () => {
    render(
      <Modal onClose={vi.fn()} labelledBy="my-title" size="sm">
        <h2 id="my-title">Edit thing</h2>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit thing' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} labelledBy="t3" size="sm">
        <h2 id="t3">Dialog 3</h2>
        <p>Body</p>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the overlay outside the dialog is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} labelledBy="t4" size="sm">
        <h2 id="t4">Dialog 4</h2>
        <p>Body</p>
      </Modal>,
    );
    const overlay = screen.getByRole('dialog').parentElement;
    expect(overlay).not.toBeNull();
    if (overlay) await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when content inside the dialog is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} labelledBy="t5" size="sm">
        <h2 id="t5">Dialog 5</h2>
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes only the top modal when modals nest', async () => {
    // PictogramSheet and PictoPicker render VoiceRecorderDialog inside their
    // own Modal. Esc on the recorder must not also close the parent.
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    render(
      <Modal onClose={closeParent} labelledBy="t6" size="full">
        <h2 id="t6">Dialog 6</h2>
        <p>Parent body</p>
        <Modal onClose={closeChild} labelledBy="t7" size="sm">
          <h2 id="t7">Dialog 7</h2>
          <p>Child body</p>
        </Modal>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
  });

  it('Escape reaches the parent again once the top modal is gone', async () => {
    const closeParent = vi.fn();
    const { rerender } = render(
      <Modal onClose={closeParent} labelledBy="t8" size="full">
        <h2 id="t8">Dialog 8</h2>
        <p>Parent body</p>
        <Modal onClose={vi.fn()} labelledBy="t9" size="sm">
          <h2 id="t9">Dialog 9</h2>
          <p>Child body</p>
        </Modal>
      </Modal>,
    );
    rerender(
      <Modal onClose={closeParent} labelledBy="t10" size="full">
        <h2 id="t10">Dialog 10</h2>
        <p>Parent body</p>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(closeParent).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape after unmount', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal onClose={onClose} labelledBy="t11" size="sm">
        <h2 id="t11">Dialog 11</h2>
        <p>Body</p>
      </Modal>,
    );
    unmount();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

const Harness = ({ autoFocus = false }: { autoFocus?: boolean }): JSX.Element => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy="t12" size="sm">
          <h2 id="t12">Dialog 12</h2>
          <button type="button" autoFocus={autoFocus}>
            First
          </button>
          <button type="button">Last</button>
        </Modal>
      )}
    </>
  );
};

describe('Modal focus (#680)', () => {
  it('moves focus into the dialog on open', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('leaves focus on a child that took it on mount', () => {
    render(
      <Modal onClose={vi.fn()} labelledBy="t13" size="sm">
        <h2 id="t13">Dialog 13</h2>
        <input aria-label="Name" autoFocus />
      </Modal>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('keeps Tab inside the top dialog when modals nest', async () => {
    render(
      <Modal onClose={vi.fn()} labelledBy="t14" size="full">
        <h2 id="t14">Dialog 14</h2>
        <button type="button">Parent action</button>
        <Modal onClose={vi.fn()} labelledBy="t15" size="sm">
          <h2 id="t15">Dialog 15</h2>
          <button type="button">Child action</button>
        </Modal>
      </Modal>,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Child action' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Child action' })).toHaveFocus();
  });

  it.each([false, true])('returns focus to the trigger on close (autoFocus %s)', async (auto) => {
    render(<Harness autoFocus={auto} />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
