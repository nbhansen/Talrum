import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => ({ data: [], isPending: false }),
  useCreatePhotoPictogram: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/useSignedUrl', () => ({
  useSignedUrl: () => null,
}));

vi.mock('@/lib/image', () => ({
  cropToSquareJpeg: vi.fn(),
}));

const { NewPictogramModal } = await import('./NewPictogramModal');

describe('NewPictogramModal', () => {
  it('renders the upload flow inside a labelled dialog', () => {
    render(<NewPictogramModal onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /add a pictogram/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tap to choose a photo/i })).toBeInTheDocument();
  });

  it('Close calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewPictogramModal onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
