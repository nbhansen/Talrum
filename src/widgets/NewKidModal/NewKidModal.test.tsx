import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn();
const resetMock = vi.fn();
const useCreateKidMock = vi.fn(() => ({
  mutate: mutateMock,
  reset: resetMock,
  isPending: false,
  isError: false,
}));

vi.mock('@/lib/queries/kids', () => ({
  useCreateKid: () => useCreateKidMock(),
}));

const { NewKidModal } = await import('./NewKidModal');

const renderModal = (onClose: () => void = vi.fn()): void => {
  render(<NewKidModal onClose={onClose} />);
};

afterEach(() => {
  mutateMock.mockReset();
  resetMock.mockReset();
  // mockClear (not mockReset) preserves the factory implementation; mockReset
  // would drop it back to `vi.fn(() => undefined)` and the next render would
  // crash with "cannot read property 'mutate' of undefined".
  useCreateKidMock.mockClear();
});

describe('NewKidModal', () => {
  it('renders an empty form with Save disabled', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: /new kid/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled();
  });

  it('Save calls useCreateKid with the trimmed name and closes on success', async () => {
    const onClose = vi.fn();
    mutateMock.mockImplementation((_input: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });

    const user = userEvent.setup();
    renderModal(onClose);

    await user.type(screen.getByRole('textbox', { name: /name/i }), '  Mira  ');
    await user.click(screen.getByRole('button', { name: /save/i }));

    // Modal trims the input before calling the mutation — the query layer is
    // a thin DB wrapper and trusts what the modal passes.
    expect(mutateMock).toHaveBeenCalledWith({ name: 'Mira' }, expect.any(Object));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Save stays disabled when the input is whitespace-only', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByRole('textbox', { name: /name/i }), '   ');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('shows an inline error when the mutation fails, until the user types', async () => {
    useCreateKidMock.mockReturnValue({
      mutate: mutateMock,
      reset: resetMock,
      isPending: false,
      isError: true,
    });
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t add the kid/i);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'M');
    expect(resetMock).toHaveBeenCalled();
  });

  it('Cancel calls onClose without saving', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal(onClose);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mutateMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
