import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Board, Kid } from '@/types/domain';

const KID_1: Kid = { id: 'k1', ownerId: 'owner', name: 'Liam' };
const KID_2: Kid = { id: 'k2', ownerId: 'owner', name: 'Mira' };

const useKidsMock = vi.fn(() => ({ data: [KID_1] as Kid[], isPending: false }));
const createBoardMutateMock = vi.fn();
const useCreateBoardMock = vi.fn(() => ({
  mutate: createBoardMutateMock,
  isPending: false,
}));

vi.mock('@/lib/queries/kids', () => ({
  useKids: () => useKidsMock(),
}));
vi.mock('@/lib/queries/boards', () => ({
  useCreateBoard: () => useCreateBoardMock(),
}));

const { NewBoardModal } = await import('./NewBoardModal');

afterEach(() => {
  createBoardMutateMock.mockReset();
  useCreateBoardMock.mockReset();
  useCreateBoardMock.mockReturnValue({ mutate: createBoardMutateMock, isPending: false });
  useKidsMock.mockReset();
  useKidsMock.mockReturnValue({ data: [KID_1], isPending: false });
});

describe('NewBoardModal', () => {
  it('renders an empty form with default kind=sequence and Save disabled', () => {
    render(<NewBoardModal onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /new board/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('');
    expect(screen.getByRole('radio', { name: /sequence/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /choice/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('saves with name + kind + sole kid when only one kid exists, calls onCreated, and closes', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const board: Partial<Board> = { id: 'b-new' };
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (b: Partial<Board>) => void }) => {
        opts?.onSuccess?.(board);
      },
    );

    const user = userEvent.setup();
    render(<NewBoardModal onClose={onClose} onCreated={onCreated} />);

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Morning routine');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(createBoardMutateMock).toHaveBeenCalledWith(
      { name: 'Morning routine', kind: 'sequence', kidId: 'k1' },
      expect.any(Object),
    );
    expect(onCreated).toHaveBeenCalledWith('b-new');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a kid picker when multiple kids exist and saves with the selected kid', async () => {
    useKidsMock.mockReturnValue({ data: [KID_1, KID_2], isPending: false });
    const onClose = vi.fn();
    const onCreated = vi.fn();
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (b: Partial<Board>) => void }) => {
        opts?.onSuccess?.({ id: 'b-new' });
      },
    );

    const user = userEvent.setup();
    render(<NewBoardModal onClose={onClose} onCreated={onCreated} />);

    expect(screen.getByRole('combobox', { name: /kid/i })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Bedtime');
    await user.selectOptions(screen.getByRole('combobox', { name: /kid/i }), 'k2');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(createBoardMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ kidId: 'k2', name: 'Bedtime' }),
      expect.any(Object),
    );
  });

  it('switches kind to choice when the choice radio is selected', async () => {
    const user = userEvent.setup();
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (b: Partial<Board>) => void }) => {
        opts?.onSuccess?.({ id: 'b-new' });
      },
    );
    render(<NewBoardModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Choices');
    await user.click(screen.getByRole('radio', { name: /choice/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(createBoardMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'choice' }),
      expect.any(Object),
    );
  });

  it('Save stays disabled when the name is whitespace-only', async () => {
    const user = userEvent.setup();
    render(<NewBoardModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: /name/i }), '   ');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('renders an inline error when the mutation fails', async () => {
    const onCreated = vi.fn();
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onError?: (e: Error) => void }) => {
        opts?.onError?.(new Error('boom'));
      },
    );

    const user = userEvent.setup();
    render(<NewBoardModal onClose={vi.fn()} onCreated={onCreated} />);

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'X');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t create the board/i);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('Cancel calls onClose without saving', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewBoardModal onClose={onClose} onCreated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(createBoardMutateMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a "no kids" message and disables Save when the user has zero kids', () => {
    useKidsMock.mockReturnValue({ data: [], isPending: false });
    render(<NewBoardModal onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByText(/add a kid first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
