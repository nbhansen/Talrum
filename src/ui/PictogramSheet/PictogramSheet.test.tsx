import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board, Pictogram } from '@/types/domain';

const renameMock = vi.fn<(input: { pictogramId: string; label: string }) => Promise<void>>();
const replaceMock =
  vi.fn<
    (input: {
      pictogramId: string;
      blob: Blob;
      extension: string;
      previousPath?: string;
    }) => Promise<void>
  >();
const deleteMock =
  vi.fn<
    (input: {
      pictogramId: string;
      scrubFromBoardIds: string[];
      previousImagePath?: string;
      previousAudioPath?: string;
    }) => Promise<void>
  >();
const useBoardsMock = vi.fn<() => { data: Board[] | undefined }>();

vi.mock('@/lib/queries/pictograms', () => ({
  useRenamePictogram: () => ({ mutateAsync: renameMock, isPending: false }),
  useReplacePictogramImage: () => ({ mutateAsync: replaceMock, isPending: false }),
  useDeletePictogram: () => ({ mutateAsync: deleteMock, isPending: false }),
  useReferencingBoardIds: (pictogramId: string, boards: readonly Board[] | undefined) =>
    (boards ?? []).filter((b: Board) => b.stepIds.includes(pictogramId)).map((b: Board) => b.id),
}));

vi.mock('@/lib/queries/boards.read', () => ({
  useBoards: () => useBoardsMock(),
}));

vi.mock('@/lib/image', () => ({
  cropToSquareJpeg: vi.fn(async (_file: File) => ({
    blob: new Blob(['cropped'], { type: 'image/jpeg' }),
    extension: 'jpg' as const,
    previewUrl: 'blob:preview',
  })),
}));

vi.mock('@/lib/useSignedUrl', () => ({
  useSignedUrl: () => null,
}));

const { PictogramSheet } = await import('./PictogramSheet');

const illusPicto: Pictogram = {
  id: 'p1',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: '#fff',
};

const photoPicto: Pictogram = {
  id: 'p2',
  label: 'Park',
  style: 'photo',
  imagePath: 'stock:park',
};

const board = (id: string, stepIds: string[]): Board => ({
  id,
  ownerId: 'o',
  kidId: 'k',
  name: 'Saturday',
  kind: 'choice',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds,
  kidReorderable: false,
  accent: 'sage',
  accentInk: 'sage-ink',
  updatedLabel: 'today',
});

beforeEach(() => {
  renameMock.mockReset();
  replaceMock.mockReset();
  deleteMock.mockReset();
  useBoardsMock.mockReset();
  renameMock.mockResolvedValue(undefined);
  replaceMock.mockResolvedValue(undefined);
  deleteMock.mockResolvedValue(undefined);
  useBoardsMock.mockReturnValue({ data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PictogramSheet', () => {
  it('saves a renamed label and closes', async () => {
    const onClose = vi.fn();
    render(<PictogramSheet picto={illusPicto} onClose={onClose} />);
    const input = screen.getByDisplayValue('Apple');
    fireEvent.change(input, { target: { value: 'Big apple' } });
    fireEvent.click(screen.getByRole('button', { name: /save label/i }));
    // Drain the awaited mutateAsync.
    await Promise.resolve();
    await Promise.resolve();
    expect(renameMock).toHaveBeenCalledWith({ pictogramId: 'p1', label: 'Big apple' });
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Save when the label is unchanged or empty', () => {
    render(<PictogramSheet picto={illusPicto} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: /save label/i })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('Apple'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /save label/i })).toBeDisabled();
  });

  it('does not show the photo section for illustrated pictos', () => {
    render(<PictogramSheet picto={illusPicto} onClose={() => undefined} />);
    expect(screen.queryByRole('button', { name: /replace photo/i })).toBeNull();
  });

  it('shows the photo section for photo pictos', () => {
    render(<PictogramSheet picto={photoPicto} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: /replace photo/i })).toBeInTheDocument();
    // Replace is disabled until a file is picked.
    expect(screen.getByRole('button', { name: /replace photo/i })).toBeDisabled();
  });

  it('requires a confirmation tap before deleting and forwards the snapshot', async () => {
    useBoardsMock.mockReturnValue({
      data: [board('b1', ['p1', 'p2']), board('b2', ['p1'])],
    });
    const onClose = vi.fn();
    render(<PictogramSheet picto={illusPicto} onClose={onClose} />);
    // First click → confirm pill.
    fireEvent.click(screen.getByRole('button', { name: /^delete pictogram$/i }));
    expect(deleteMock).not.toHaveBeenCalled();
    // Second click confirms.
    fireEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(deleteMock).toHaveBeenCalledWith({
      pictogramId: 'p1',
      scrubFromBoardIds: ['b1', 'b2'],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a "used on N boards" hint when the picto is referenced', () => {
    useBoardsMock.mockReturnValue({ data: [board('b1', ['p1'])] });
    render(<PictogramSheet picto={illusPicto} onClose={() => undefined} />);
    expect(screen.getByText(/used on 1 board/i)).toBeInTheDocument();
  });
});
