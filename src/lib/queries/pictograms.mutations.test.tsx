import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProcessedImage } from '@/lib/image';
import type { Board, Pictogram } from '@/types/domain';

import {
  deferred,
  makeBoard,
  makeClient,
  makeWrapper,
  type MockPostgrestError,
  rlsError,
} from './queries.test-utils';

/** Supabase Storage errors carry an HTTP statusCode instead of a PG code. */
interface MockStorageError {
  statusCode: number;
  message: string;
}
interface MockResult {
  error: MockPostgrestError | MockStorageError | null;
}

// Rename / clear-audio row updates: from('pictograms').update({...}).eq('id', ...)
// — the eq call is the awaited terminal.
const eqMock = vi.fn<(col: string, val: string) => Promise<MockResult>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
// Photo creation upserts the row after the storage upload (#393).
const upsertMock = vi.fn<(row: Record<string, unknown>, opts?: unknown) => Promise<MockResult>>();
// Delete: from('pictograms').delete().eq('id', ...) — a trigger scrubs the boards.
const deleteEqMock = vi.fn<(col: string, val: string) => Promise<MockResult>>();
// Blob-planting mutations upload through the outbox before touching the row.
const uploadMock = vi.fn<(path: string, blob: Blob, opts: unknown) => Promise<MockResult>>();
// Clear-audio best-effort removes the recording from storage before the row update.
const removeMock = vi.fn<(paths: string[]) => Promise<MockResult>>();

// Row-path reads (#418): handlers derive storage cleanup from the row, so
// blob/clear/delete mutations issue select(...).eq(...).maybeSingle() first.
const maybeSingleMock = vi.fn<
  () => Promise<{
    data: { image_path: string | null; audio_path: string | null } | null;
    error: MockPostgrestError | null;
  }>
>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: updateMock,
      upsert: upsertMock,
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      delete: () => ({ eq: deleteEqMock }),
    }),
    storage: { from: () => ({ remove: removeMock, upload: uploadMock }) },
  },
}));

// Import after the mock is registered.
const { pictogramsQueryKey } = await import('./pictograms.read');
const { boardsQueryKey } = await import('./boards.read');
const {
  useClearPictogramAudio,
  useAddPhotoPictogram,
  useDeletePictogram,
  useRenamePictogram,
  useReplacePictogramImage,
  useSetPictogramAudio,
} = await import('./pictograms.mutations');

const pictogramSeed = (): Pictogram[] => [
  {
    id: 'p1',
    label: 'Brush teeth',
    style: 'illus',
    glyph: 'tooth',
    tint: 'oklch(88% 0.06 90)',
    audioPath: 'owner-uuid/p1.webm',
  },
  { id: 'p2', label: 'Bed', style: 'illus', glyph: 'bed', tint: 'oklch(88% 0.06 200)' },
];

const boardSeed = (): Board[] => [
  makeBoard({ id: 'morning', stepIds: ['p1', 'p2'] }),
  makeBoard({ id: 'evening', stepIds: ['p2'] }),
];

beforeEach(() => {
  eqMock.mockReset();
  updateMock.mockClear();
  upsertMock.mockReset();
  deleteEqMock.mockReset();
  uploadMock.mockReset();
  removeMock.mockReset();
  // Default: the row exists with no prior uploads — no storage cleanup.
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
  // Fresh per test: later describes spyOn/assert these, and a mock carried
  // across tests would leak call history into their counts.
  URL.createObjectURL = vi.fn(() => 'blob:planted');
  URL.revokeObjectURL = vi.fn();
});

describe('useRenamePictogram', () => {
  it('applies an optimistic label patch before the DB responds', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());

    const write = deferred<MockResult>();
    eqMock.mockReturnValue(write.promise);

    const { result } = renderHook(() => useRenamePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1', label: 'Floss' });
    });

    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      expect(list?.find((p) => p.id === 'p1')?.label).toBe('Floss');
    });
    expect(
      qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.find((p) => p.id === 'p2')?.label,
    ).toBe('Bed');

    write.resolve({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the cache on a non-retryable DB error (RLS denial)', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    eqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useRenamePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1', label: 'Floss' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
  });
});

describe('useDeletePictogram', () => {
  it('optimistically removes the pictogram and scrubs it from referencing boards', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());

    const write = deferred<MockResult>();
    deleteEqMock.mockReturnValue(write.promise);

    const { result } = renderHook(() => useDeletePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.map((p) => p.id)).toEqual(['p2']);
    });
    const boards = qc.getQueryData<Board[]>(boardsQueryKey);
    expect(boards?.find((b) => b.id === 'morning')?.stepIds).toEqual(['p2']);
    // A board that never referenced the pictogram keeps its steps untouched.
    expect(boards?.find((b) => b.id === 'evening')?.stepIds).toEqual(['p2']);

    write.resolve({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'p1');
  });

  it('rolls back both caches on a non-retryable DB error', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    deleteEqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useDeletePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
    expect(qc.getQueryData<Board[]>(boardsQueryKey)).toEqual(boardSeed());
  });
});

describe('useClearPictogramAudio', () => {
  it('optimistically drops audioPath on the target pictogram only', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());

    removeMock.mockResolvedValue({ error: null });
    // The recording to remove comes from the row read, not the input (#418).
    maybeSingleMock.mockResolvedValue({
      data: { image_path: null, audio_path: 'owner-uuid/p1.webm' },
      error: null,
    });
    const write = deferred<MockResult>();
    eqMock.mockReturnValue(write.promise);

    const { result } = renderHook(() => useClearPictogramAudio(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1' });
    });

    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      expect(list?.find((p) => p.id === 'p1')?.audioPath).toBeUndefined();
    });
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.find((p) => p.id === 'p2')).toEqual(
      pictogramSeed()[1],
    );

    write.resolve({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeMock).toHaveBeenCalledWith(['owner-uuid/p1.webm']);
  });

  it('restores audioPath on a non-retryable DB error (RLS denial)', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    removeMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useClearPictogramAudio(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
  });
});

describe('useSetPictogramAudio', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:planted-audio');
    URL.revokeObjectURL = vi.fn();
  });

  it('plants a blob URL optimistically, uploads, points the row at the path, then revokes', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());

    const write = deferred<MockResult>();
    uploadMock.mockReturnValue(write.promise);
    eqMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeWrapper(qc),
    });

    const blob = new Blob(['voice'], { type: 'audio/webm' });
    act(() => {
      result.current.mutate({ pictogramId: 'p2', blob, extension: 'webm' });
    });

    // Optimistic window: tile plays the local blob before the upload lands.
    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      expect(list?.find((p) => p.id === 'p2')?.audioPath).toBe('blob:planted-audio');
    });

    write.resolve({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, uploadedBlob] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\/p2-[0-9A-HJKMNP-TV-Z]{26}\.webm$/);
    expect(uploadedBlob).toBe(blob);
    expect(updateMock).toHaveBeenCalledWith({ audio_path: path });
    expect(eqMock).toHaveBeenCalledWith('id', 'p2');
    // No previous recording → no storage cleanup.
    expect(removeMock).not.toHaveBeenCalled();
    // p1 holds a real storage path, which the sweep must not revoke (#28).
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:planted-audio');
  });

  it('cleans up the recording the row pointed at', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    uploadMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    maybeSingleMock.mockResolvedValue({
      data: { image_path: null, audio_path: 'owner-uuid/p1.m4a' },
      error: null,
    });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'p1',
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        extension: 'webm',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeMock).toHaveBeenCalledWith(['owner-uuid/p1.m4a']);
  });

  it('still revokes the planted blob URL when the upload fails permanently', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    uploadMock.mockResolvedValue({ error: { statusCode: 403, message: 'not allowed' } });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'p2',
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        extension: 'webm',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateMock).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-audio');
  });

  it('restores the previous audioPath when the upload fails permanently', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    uploadMock.mockResolvedValue({ error: { statusCode: 403, message: 'not allowed' } });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'p1',
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        extension: 'webm',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // The blob URL is gone and p1 plays its prior recording again.
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-audio');
  });
});

describe('useAddPhotoPictogram', () => {
  const image = (): ProcessedImage => ({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    extension: 'jpg',
    previewUrl: 'blob:preview',
  });

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:planted-photo');
    URL.revokeObjectURL = vi.fn();
  });

  it('appends an optimistic row, then uploads and inserts under a versioned path', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());

    const write = deferred<MockResult>();
    uploadMock.mockReturnValue(write.promise);
    upsertMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAddPhotoPictogram(), {
      wrapper: makeWrapper(qc),
    });

    let done = false;
    act(() => {
      void result.current.add('  Cereal bowl  ', image()).then(() => (done = true));
    });

    // Optimistic window: the new tile renders from the local blob, trimmed label.
    let id = '';
    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      const optimistic = list?.find((p) => p.label === 'Cereal bowl');
      expect(optimistic).toMatchObject({ style: 'photo', imagePath: 'blob:planted-photo' });
      id = optimistic?.id ?? '';
    });

    write.resolve({ error: null });
    await waitFor(() => expect(done).toBe(true));

    // Versioned path (#415): owner/<id>-<ulid>.jpg, unique per upload.
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id,
        owner_id: expect.any(String) as unknown,
        label: 'Cereal bowl',
        style: 'photo',
        image_path: expect.stringMatching(
          new RegExp(`/${id}-[0-9A-HJKMNP-TV-Z]{26}\\.jpg$`),
        ) as unknown,
      },
      { ignoreDuplicates: true },
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-photo');
  });

  it('leaves the uploaded blob in storage when the row insert fails', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    uploadMock.mockResolvedValue({ error: null });
    upsertMock.mockResolvedValue({ error: rlsError });
    removeMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAddPhotoPictogram(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await expect(result.current.add('Cereal bowl', image())).rejects.toBeDefined();
    });

    // No rollback delete (#414 review): a run abandoned by the handler
    // timeout could delete the blob its own retry just re-uploaded. The
    // orphaned object is the accepted, cheaper failure.
    expect(removeMock).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-photo');
    // Rollback removes the optimistic row — the failed create leaves no tile.
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
  });
});

describe('useReplacePictogramImage', () => {
  const photoSeed = (): Pictogram[] => [
    { id: 'ph1', label: 'Cereal', style: 'photo', imagePath: 'owner-uuid/ph1.jpg' },
    ...pictogramSeed(),
  ];

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:planted-replace');
    URL.revokeObjectURL = vi.fn();
  });

  it('optimistically swaps only photo-style rows to the local blob URL', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, photoSeed());
    uploadMock.mockReturnValue(new Promise(() => undefined)); // hold the optimistic window open

    const { result } = renderHook(() => useReplacePictogramImage(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'ph1',
        blob: new Blob(['jpeg']),
        extension: 'jpg',
      });
    });

    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      const ph1 = list?.find((p) => p.id === 'ph1');
      expect(ph1?.style === 'photo' && ph1.imagePath).toBe('blob:planted-replace');
    });
    // Illustrated rows are guarded — an id mixup must not graft an imagePath
    // onto an illus pictogram.
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.find((p) => p.id === 'p1')).toEqual(
      pictogramSeed()[0],
    );
  });

  it.each(['p1', 'missing'])(
    'mints no blob URL when the patch cannot use it (%s) (#597)',
    async (pictogramId) => {
      const qc = makeClient();
      qc.setQueryData(pictogramsQueryKey, photoSeed());
      uploadMock.mockReturnValue(new Promise(() => undefined));

      const { result } = renderHook(() => useReplacePictogramImage(), {
        wrapper: makeWrapper(qc),
      });

      act(() => {
        result.current.mutate({ pictogramId, blob: new Blob(['jpeg']), extension: 'jpg' });
      });

      await waitFor(() => expect(uploadMock).toHaveBeenCalled());
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    },
  );

  it('uploads, updates the row, and removes the replaced image on success', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, photoSeed());
    uploadMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    maybeSingleMock.mockResolvedValue({
      data: { image_path: 'owner-uuid/ph1.jpg', audio_path: null },
      error: null,
    });

    const { result } = renderHook(() => useReplacePictogramImage(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'ph1',
        blob: new Blob(['jpeg']),
        extension: 'png',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\/ph1-[0-9A-HJKMNP-TV-Z]{26}\.png$/);
    expect(updateMock).toHaveBeenCalledWith({ image_path: path });
    expect(removeMock).toHaveBeenCalledWith(['owner-uuid/ph1.jpg']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-replace');
  });

  it('restores the previous image path and revokes the planted blob on a permanent error', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, photoSeed());
    uploadMock.mockResolvedValue({ error: { statusCode: 403, message: 'not allowed' } });

    const { result } = renderHook(() => useReplacePictogramImage(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'ph1',
        blob: new Blob(['jpeg']),
        extension: 'jpg',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(photoSeed());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-replace');
  });
});
