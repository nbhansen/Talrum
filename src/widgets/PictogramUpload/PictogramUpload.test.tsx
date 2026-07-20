import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { ProcessedImage } from '@/lib/image';
import type { Pictogram } from '@/types/domain';

interface MockError {
  code?: string;
  statusCode?: number;
  message: string;
}
interface MockResult {
  error: MockError | null;
}

// Boundary mock: useCreatePhotoPictogram runs for real through the outbox
// (enqueueAndDrain → createPhotoPicto handler → storage upload, then row
// insert). usePictograms' queryFn finds no `select` here, rejects, and the
// seeded cache survives — same floor-mock philosophy as vitest.setup.ts.
const uploadMock = vi.fn<(path: string, blob: Blob, opts: unknown) => Promise<MockResult>>();
const removeMock = vi.fn<(paths: string[]) => Promise<MockResult>>();
const insertMock = vi.fn<(row: Record<string, unknown>) => Promise<MockResult>>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: insertMock }),
    storage: {
      from: () => ({ upload: uploadMock, remove: removeMock }),
    },
  },
}));

// The crop pipeline has its own tests (image.test.ts); this seam steers
// processed-vs-unreadable outcomes without a canvas.
vi.mock('@/lib/image', () => ({
  cropToSquareJpeg: vi.fn(),
}));

const { cropToSquareJpeg } = await import('@/lib/image');
const { pictogramsQueryKey } = await import('@/lib/queries/pictograms.read');
const { PictogramUpload } = await import('./PictogramUpload');

const cropMock = vi.mocked(cropToSquareJpeg);

let cropped: ProcessedImage;

const mkPhoto = (id: string, label: string, imagePath?: string): Pictogram => ({
  id,
  label,
  style: 'photo',
  ...(imagePath ? { imagePath } : {}),
});

const renderUpload = (seed?: Pictogram[]): ReturnType<typeof render> => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (seed) qc.setQueryData(pictogramsQueryKey, seed);
  return render(
    <QueryClientProvider client={qc}>
      <TestSessionProvider>
        <PictogramUpload />
      </TestSessionProvider>
    </QueryClientProvider>,
  );
};

const pickPhoto = async (
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
): Promise<void> => {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input not rendered');
  await user.upload(input, new File(['raw'], 'cereal.jpg', { type: 'image/jpeg' }));
};

beforeEach(() => {
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  insertMock.mockReset().mockResolvedValue({ error: null });
  cropped = {
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    extension: 'jpg',
    previewUrl: 'blob:preview',
  };
  cropMock.mockReset().mockImplementation(() => Promise.resolve(cropped));
  // jsdom lacks both; the mutation plants an optimistic blob URL and the
  // settle sweep revokes it.
  URL.createObjectURL = vi.fn(() => 'blob:optimistic');
  URL.revokeObjectURL = vi.fn();
});

describe('PictogramUpload · upload flow', () => {
  it('shows the cropped preview after picking and keeps upload disabled until a label is typed', async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();

    await pickPhoto(user, container);

    // The preview img is decorative (alt="") so it carries no img role —
    // find it by the cropped blob's preview URL.
    await waitFor(() => {
      expect(container.querySelector('img[src="blob:preview"]')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Add to library' })).toBeDisabled();

    await user.type(screen.getByLabelText('Label'), '  Cereal bowl  ');
    expect(screen.getByRole('button', { name: 'Add to library' })).toBeEnabled();
  });

  it('uploads the cropped blob, inserts the row with the trimmed label, and resets', async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();

    await pickPhoto(user, container);
    await user.type(await screen.findByLabelText('Label'), '  Cereal bowl  ');
    await user.click(screen.getByRole('button', { name: 'Add to library' }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
    const [path, blob] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\.jpg$/);
    expect(blob).toBe(cropped.blob);
    expect(insertMock).toHaveBeenCalledWith({
      id: expect.any(String) as unknown,
      owner_id: expect.any(String) as unknown,
      label: 'Cereal bowl',
      style: 'photo',
      image_path: path,
    });
    // Success returns to the dropzone for the next photo, and the optimistic
    // row from the create mutation shows up under "Your uploads".
    expect(await screen.findByText('Tap to choose a photo')).toBeInTheDocument();
    expect(container.querySelector('img[src="blob:preview"]')).not.toBeInTheDocument();
    expect(screen.getByText('Your uploads')).toBeInTheDocument();
    expect(screen.getByText('Cereal bowl')).toBeInTheDocument();
  });

  it('keeps the preview and shows the error when the insert is rejected', async () => {
    const user = userEvent.setup();
    insertMock.mockResolvedValue({ error: { code: '42501', message: 'row-level-security' } });
    const { container } = renderUpload();

    await pickPhoto(user, container);
    await user.type(await screen.findByLabelText('Label'), 'Cereal bowl');
    await user.click(screen.getByRole('button', { name: 'Add to library' }));

    expect(await screen.findByText(/42501/)).toBeInTheDocument();
    // The failed-insert cleanup removes the just-uploaded orphan blob.
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
    // The preview stays so the user can retry without re-picking.
    expect(container.querySelector('img[src="blob:preview"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to library' })).toBeEnabled();
  });

  it('reports an unreadable image and stays on the dropzone', async () => {
    const user = userEvent.setup();
    cropMock.mockRejectedValue(new Error('bad image'));
    const { container } = renderUpload();

    await pickPhoto(user, container);

    expect(
      await screen.findByText('Could not read that image. Try a JPG or PNG.'),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});

describe('PictogramUpload · YOUR UPLOADS section', () => {
  it('hides the section entirely when only stock + null-image photos exist', () => {
    renderUpload([
      mkPhoto('p1', 'Park', 'stock:park'),
      mkPhoto('p2', 'Store', 'stock:store'),
      mkPhoto('p3', 'Empty'), // null imagePath
    ]);
    expect(screen.queryByText(/your uploads/i)).toBeNull();
  });

  it('shows only photos the user has actually uploaded', () => {
    renderUpload([
      mkPhoto('p1', 'Park', 'stock:park'),
      mkPhoto('p2', 'My cereal', 'owner-id/p2.jpg'),
      mkPhoto('p3', 'My shoes', 'owner-id/p3.jpg'),
      { id: 'i1', label: 'Tooth', style: 'illus', glyph: 'tooth', tint: 'oklch(88% 0.06 90)' },
    ]);
    expect(screen.getByText(/your uploads/i)).toBeInTheDocument();
    expect(screen.getByText('My cereal')).toBeInTheDocument();
    expect(screen.getByText('My shoes')).toBeInTheDocument();
    expect(screen.queryByText('Park')).toBeNull();
    expect(screen.queryByText('Tooth')).toBeNull();
  });
});
