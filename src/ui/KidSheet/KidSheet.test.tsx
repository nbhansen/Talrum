import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board, Kid } from '@/types/domain';

const renameMock = vi.fn<(input: { kidId: string; name: string }) => Promise<void>>();
const deleteMock = vi.fn<(input: { kidId: string }) => Promise<void>>();
const useKidsMock = vi.fn<() => { data: Kid[] | undefined }>();
const useBoardsMock = vi.fn<() => { data: Board[] | undefined }>();
const useActiveKidMock = vi.fn<() => Kid | null>();
const setActiveKidIdMock = vi.fn<(id: string | null) => void>();

vi.mock('@/lib/queries/kids', () => ({
  useRenameKid: () => ({ mutateAsync: renameMock, isPending: false }),
  useDeleteKid: () => ({ mutateAsync: deleteMock, isPending: false }),
  useKids: () => useKidsMock(),
  useActiveKid: () => useActiveKidMock(),
  setActiveKidId: (id: string | null) => setActiveKidIdMock(id),
}));

vi.mock('@/lib/queries/boards', () => ({
  useBoards: () => useBoardsMock(),
}));

const { KidSheet } = await import('./KidSheet');

const kid = (id: string, name: string): Kid => ({ id, ownerId: 'o', name });

const board = (id: string, kidId: string): Board => ({
  id,
  ownerId: 'o',
  kidId,
  name: 'B',
  kind: 'choice',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: [],
  kidReorderable: false,
  accent: 'sage',
  accentInk: 'sage-ink',
  updatedLabel: 'today',
});

const liam = kid('k1', 'Liam');
const mia = kid('k2', 'Mia');

beforeEach(() => {
  renameMock.mockReset();
  deleteMock.mockReset();
  useKidsMock.mockReset();
  useBoardsMock.mockReset();
  useActiveKidMock.mockReset();
  setActiveKidIdMock.mockReset();
  renameMock.mockResolvedValue(undefined);
  deleteMock.mockResolvedValue(undefined);
  useKidsMock.mockReturnValue({ data: [liam, mia] });
  useBoardsMock.mockReturnValue({ data: [] });
  useActiveKidMock.mockReturnValue(liam);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('KidSheet', () => {
  it('saves a renamed kid and closes', async () => {
    const onClose = vi.fn();
    render(<KidSheet kid={liam} onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue('Liam'), { target: { value: 'Liam Jr.' } });
    fireEvent.click(screen.getByRole('button', { name: /save name/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(renameMock).toHaveBeenCalledWith({ kidId: 'k1', name: 'Liam Jr.' });
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Save when the name is unchanged or empty', () => {
    render(<KidSheet kid={liam} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('Liam'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();
  });

  it('hides "set as active" when this kid is already active', () => {
    useActiveKidMock.mockReturnValue(liam);
    render(<KidSheet kid={liam} onClose={() => undefined} />);
    expect(screen.queryByRole('button', { name: /set as active/i })).toBeNull();
  });

  it('shows "set as active" when another kid is active and forwards the click', () => {
    useActiveKidMock.mockReturnValue(mia);
    render(<KidSheet kid={liam} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /set as active/i }));
    expect(setActiveKidIdMock).toHaveBeenCalledWith('k1');
  });

  it('hides the active section entirely when there is only one kid', () => {
    useKidsMock.mockReturnValue({ data: [liam] });
    useActiveKidMock.mockReturnValue(liam);
    render(<KidSheet kid={liam} onClose={() => undefined} />);
    expect(screen.queryByText(/active kid/i)).toBeNull();
  });

  it('disables the Delete button when this is the last kid', () => {
    useKidsMock.mockReturnValue({ data: [liam] });
    render(<KidSheet kid={liam} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: /^delete kid$/i })).toBeDisabled();
    expect(screen.getByText(/at least one kid/i)).toBeInTheDocument();
  });

  it('shows the board count and requires confirm before deleting', async () => {
    useBoardsMock.mockReturnValue({
      data: [board('b1', 'k1'), board('b2', 'k1'), board('b3', 'k2')],
    });
    const onClose = vi.fn();
    render(<KidSheet kid={liam} onClose={onClose} />);
    expect(screen.getByText(/also deletes 2 boards/i)).toBeInTheDocument();
    // First click → confirm pill.
    fireEvent.click(screen.getByRole('button', { name: /^delete kid$/i }));
    expect(deleteMock).not.toHaveBeenCalled();
    // Second click confirms.
    fireEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(deleteMock).toHaveBeenCalledWith({ kidId: 'k1' });
    expect(onClose).toHaveBeenCalled();
  });
});
