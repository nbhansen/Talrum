import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board, Kid } from '@/types/domain';

const useKidsMock = vi.fn<() => { data: Kid[] | undefined; isPending: boolean }>();
const useBoardsMock = vi.fn<() => { data: Board[] | undefined }>();
const useActiveKidMock = vi.fn<() => Kid | null>();

vi.mock('@/lib/queries/kids', () => ({
  useKids: () => useKidsMock(),
  useActiveKid: () => useActiveKidMock(),
  useRenameKid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteKid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  setActiveKidId: vi.fn(),
}));

vi.mock('@/lib/queries/boards', () => ({
  useBoards: () => useBoardsMock(),
}));

const { Kids } = await import('./Kids');

const KIDS: Kid[] = [
  { id: 'k1', ownerId: 'owner', name: 'Liam' },
  { id: 'k2', ownerId: 'owner', name: 'Mira' },
];

const board = (id: string, kidId: string): Board => ({
  id,
  ownerId: 'owner',
  kidId,
  name: 'B',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: [],
  kidReorderable: false,
  accent: 'sage',
  updatedLabel: 'today',
});

beforeEach(() => {
  useKidsMock.mockReset();
  useBoardsMock.mockReset();
  useActiveKidMock.mockReset();
  useBoardsMock.mockReturnValue({ data: [] });
  useActiveKidMock.mockReturnValue(KIDS[0] ?? null);
});

describe('Kids', () => {
  it('renders a row for each kid', () => {
    useKidsMock.mockReturnValue({ data: KIDS, isPending: false });
    render(<Kids />);
    expect(screen.getByText('Liam')).toBeInTheDocument();
    expect(screen.getByText('Mira')).toBeInTheDocument();
  });

  it('shows the empty state with an Add CTA when no kids', () => {
    useKidsMock.mockReturnValue({ data: [], isPending: false });
    render(<Kids />);
    expect(screen.getByRole('heading', { name: /no kids yet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add your first kid/i })).toBeInTheDocument();
  });

  it('clicking the empty-state CTA invokes onNewKid', async () => {
    useKidsMock.mockReturnValue({ data: [], isPending: false });
    const onNewKid = vi.fn();
    render(<Kids onNewKid={onNewKid} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add your first kid/i }));
    expect(onNewKid).toHaveBeenCalledTimes(1);
  });

  it('shows board count and "Active" badge on the active kid', () => {
    useKidsMock.mockReturnValue({ data: KIDS, isPending: false });
    useBoardsMock.mockReturnValue({
      data: [board('b1', 'k1'), board('b2', 'k1'), board('b3', 'k2')],
    });
    useActiveKidMock.mockReturnValue(KIDS[0] ?? null);
    render(<Kids />);
    expect(screen.getByText('2 boards')).toBeInTheDocument();
    expect(screen.getByText('1 board')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('clicking a kid row opens the edit sheet', async () => {
    useKidsMock.mockReturnValue({ data: KIDS, isPending: false });
    render(<Kids />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /edit liam/i }));
    expect(screen.getByRole('heading', { name: /edit kid/i })).toBeInTheDocument();
  });
});
