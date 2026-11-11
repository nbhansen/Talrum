import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal';

describe('Modal', () => {
  it.each(['sm', 'md', 'full'] as const)('applies the %s size class to the dialog', (size) => {
    render(
      <Modal onClose={vi.fn()} size={size}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toMatch(new RegExp(size));
  });

  it('renders children inside an aria-modal dialog', () => {
    render(
      <Modal onClose={vi.fn()} size="sm">
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
      <Modal onClose={onClose} size="sm">
        <p>Body</p>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the overlay outside the dialog is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} size="sm">
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
      <Modal onClose={onClose} size="sm">
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
      <Modal onClose={closeParent} size="full">
        <p>Parent body</p>
        <Modal onClose={closeChild} size="sm">
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
      <Modal onClose={closeParent} size="full">
        <p>Parent body</p>
        <Modal onClose={vi.fn()} size="sm">
          <p>Child body</p>
        </Modal>
      </Modal>,
    );
    rerender(
      <Modal onClose={closeParent} size="full">
        <p>Parent body</p>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(closeParent).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape after unmount', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal onClose={onClose} size="sm">
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
        <Modal onClose={() => setOpen(false)} size="sm">
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
      <Modal onClose={vi.fn()} size="sm">
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
      <Modal onClose={vi.fn()} size="full">
        <button type="button">Parent action</button>
        <Modal onClose={vi.fn()} size="sm">
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
