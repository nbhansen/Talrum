import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => ({ data: [], isPending: false }),
  useCreatePhotoPictogram: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/queries/generateImage', () => ({
  useGenerateImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  GenerateImageError: class extends Error {},
}));

vi.mock('@/lib/storage/useSignedUrl', () => ({
  useSignedUrl: () => null,
}));

vi.mock('@/lib/image', () => ({
  cropToSquareJpeg: vi.fn(),
}));

const { NewPictogramModal } = await import('./NewPictogramModal');

describe('NewPictogramModal', () => {
  it('renders the upload flow inside a labelled dialog', () => {
    render(<NewPictogramModal onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /new pictogram/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tap to choose a photo/i })).toBeInTheDocument();
  });

  it('offers a Generate tab that switches to the AI image panel (#524)', async () => {
    const user = userEvent.setup();
    render(<NewPictogramModal onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /upload/i })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: /generate/i }));
    expect(screen.getByRole('button', { name: /generate image/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tap to choose a photo/i })).not.toBeInTheDocument();
  });

  it('Close calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewPictogramModal onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
