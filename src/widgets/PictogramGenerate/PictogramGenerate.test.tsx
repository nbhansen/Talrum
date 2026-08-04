import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { ProcessedImage } from '@/lib/image';

interface MockError {
  code?: string;
  message: string;
}
interface MockResult {
  error: MockError | null;
}

// Boundary mock, same floor as PictogramUpload.test.tsx: the create-photo
// mutation runs for real through the outbox (enqueueAndDrain → handler →
// storage upload, then row upsert); the generate mutation runs for real
// through functions.invoke.
const invokeMock = vi.fn<(name: string, opts: unknown) => Promise<unknown>>();
const uploadMock = vi.fn<(path: string, blob: Blob, opts: unknown) => Promise<MockResult>>();
const upsertMock = vi.fn<(row: Record<string, unknown>, opts?: unknown) => Promise<MockResult>>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ upsert: upsertMock }),
    storage: {
      from: () => ({ upload: uploadMock }),
    },
    functions: { invoke: (name: string, opts: unknown) => invokeMock(name, opts) },
  },
}));

// The crop pipeline has its own tests (image.test.ts); this seam steers
// outcomes without a canvas.
vi.mock('@/lib/image', () => ({
  cropToSquareJpeg: vi.fn(),
}));

vi.mock('@/lib/platform/telemetry', () => ({
  captureException: vi.fn(),
}));

const { cropToSquareJpeg } = await import('@/lib/image');
const { GenerateImageError } = await import('@/lib/queries/generateImage');
const { PictogramGenerate } = await import('./PictogramGenerate');

const cropMock = vi.mocked(cropToSquareJpeg);

let cropped: ProcessedImage;

const generatedEnvelope = (): { data: unknown; error: null } => ({
  data: { ok: true, mimeType: 'image/jpeg', imageBase64: btoa('generated-jpeg') },
  error: null,
});

const renderGenerate = (opts: { strict?: boolean } = {}): ReturnType<typeof render> => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={qc}>
      <TestSessionProvider>
        <PictogramGenerate />
      </TestSessionProvider>
    </QueryClientProvider>
  );
  return render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree);
};

const typeAndGenerate = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText('Label'), '  Vente  ');
  await user.click(screen.getByRole('button', { name: /Generate image/ }));
};

beforeEach(() => {
  invokeMock.mockReset().mockResolvedValue(generatedEnvelope());
  uploadMock.mockReset().mockResolvedValue({ error: null });
  upsertMock.mockReset().mockResolvedValue({ error: null });
  cropped = {
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    extension: 'jpg',
    previewUrl: 'blob:preview',
  };
  cropMock.mockReset().mockImplementation(() => Promise.resolve(cropped));
  URL.createObjectURL = vi.fn(() => 'blob:optimistic');
  URL.revokeObjectURL = vi.fn();
});

describe('PictogramGenerate · generate flow', () => {
  it('keeps Generate disabled until a label is typed', () => {
    renderGenerate();
    expect(screen.getByRole('button', { name: /Generate image/ })).toBeDisabled();
  });

  it('sends the trimmed label, crops the returned image, and previews it without saving anything (StrictMode)', async () => {
    const user = userEvent.setup();
    const { container } = renderGenerate({ strict: true });

    await typeAndGenerate(user);

    await waitFor(() => {
      expect(container.querySelector('img[src="blob:preview"]')).toBeInTheDocument();
    });
    expect(invokeMock).toHaveBeenCalledWith('generate-image', { body: { label: 'Vente' } });
    // The crop input is the decoded generated blob, not the raw envelope.
    const cropInput = cropMock.mock.calls[0]?.[0] as Blob;
    expect(cropInput.type).toBe('image/jpeg');
    expect(await cropInput.text()).toBe('generated-jpeg');
    // Preview writes nothing: no storage upload, no row.
    expect(uploadMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('saves the previewed blob through the normal create-photo path and resets', async () => {
    const user = userEvent.setup();
    const { container } = renderGenerate();

    await typeAndGenerate(user);
    await screen.findByRole('button', { name: 'Add to library' });
    await user.click(screen.getByRole('button', { name: 'Add to library' }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
    const [path, blob] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\.jpg$/);
    expect(blob).toBe(cropped.blob);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id: expect.any(String) as unknown,
        owner_id: expect.any(String) as unknown,
        label: 'Vente',
        style: 'photo',
        image_path: path,
      },
      { ignoreDuplicates: true },
    );
    // Back to the form for the next pictogram.
    expect(await screen.findByText('Generate a pictogram image')).toBeInTheDocument();
    expect(container.querySelector('img[src="blob:preview"]')).not.toBeInTheDocument();
  });

  it('discards the preview without writing anything and keeps the label for another try', async () => {
    const user = userEvent.setup();
    const { container } = renderGenerate();

    await typeAndGenerate(user);
    await screen.findByRole('button', { name: 'Discard' });
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(container.querySelector('img[src="blob:preview"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('  Vente  ');
    expect(uploadMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does not carry a save-failure message past Discard (#437 review)', async () => {
    const user = userEvent.setup();
    upsertMock.mockResolvedValue({ error: { code: '42501', message: 'row-level-security' } });
    renderGenerate();

    await typeAndGenerate(user);
    await screen.findByRole('button', { name: 'Add to library' });
    await user.click(screen.getByRole('button', { name: 'Add to library' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    // Back on the form, with no stale error next to an empty preview.
    expect(await screen.findByText('Generate a pictogram image')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the server-failure copy for a generation_failed response', async () => {
    const user = userEvent.setup();
    // A pre-mapped error, not a real 502 envelope: building a
    // FunctionsHttpError here would need a value import from
    // @supabase/supabase-js, which the boundary lint restricts to lib/.
    // The 502-body → generation_failed mapping is covered in
    // generateImage.test.ts; this test covers the widget's copy split.
    invokeMock.mockRejectedValue(new GenerateImageError('generation_failed', 'azure down'));
    renderGenerate();

    await typeAndGenerate(user);

    expect(
      await screen.findByText('Image generation failed. Try again in a moment.'),
    ).toBeInTheDocument();
  });

  it('shows the retry copy, not the connection copy, when the returned bytes cannot be decoded', async () => {
    const user = userEvent.setup();
    cropMock.mockRejectedValue(new Error('could not decode image'));
    renderGenerate();

    await typeAndGenerate(user);

    // A crop/decode failure is not the connection's fault; "check your
    // connection" would send the parent chasing wifi that is fine.
    expect(
      await screen.findByText('Image generation failed. Try again in a moment.'),
    ).toBeInTheDocument();
  });

  it('shows the connection copy only when the request never got a response', async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue({ data: null, error: new Error('fetch failed') });
    renderGenerate();

    await typeAndGenerate(user);

    expect(
      await screen.findByText('Could not generate an image. Check your connection and try again.'),
    ).toBeInTheDocument();
  });
});
