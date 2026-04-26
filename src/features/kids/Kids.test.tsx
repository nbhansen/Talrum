import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Kid } from '@/types/domain';

const useKidsMock = vi.fn<() => { data: Kid[] | undefined; isPending: boolean }>();

vi.mock('@/lib/queries/kids', () => ({
  useKids: () => useKidsMock(),
}));

const { Kids } = await import('./Kids');

const KIDS: Kid[] = [
  { id: 'k1', ownerId: 'owner', name: 'Liam' },
  { id: 'k2', ownerId: 'owner', name: 'Mira' },
];

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
});
