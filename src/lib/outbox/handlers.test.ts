import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClearPictogramAudioEntry,
  CreatePhotoPictogramEntry,
  DeleteKidEntry,
  DeletePictogramEntry,
  RenameKidEntry,
  RenamePictogramEntry,
  ReplacePictogramImageEntry,
  SetPictogramAudioEntry,
  UpdateBoardEntry,
} from './types';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

const eqMock = vi.fn<(c: string, v: string) => Promise<{ error: MockPostgrestError | null }>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const insertMock = vi.fn<(row: unknown) => Promise<{ error: MockPostgrestError | null }>>();
const inMock = vi.fn<
  (
    c: string,
    vs: readonly string[],
  ) => Promise<{
    data: { id: string; step_ids: string[] }[] | null;
    error: MockPostgrestError | null;
  }>
>();
const selectMock = vi.fn((_cols: string) => ({ in: inMock }));
const deleteEqMock =
  vi.fn<(c: string, v: string) => Promise<{ error: MockPostgrestError | null }>>();
const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
const fromMock = vi.fn((_table: string) => ({
  update: updateMock,
  insert: insertMock,
  select: selectMock,
  delete: deleteMock,
}));

const uploadMock =
  vi.fn<(path: string, blob: Blob, opts?: unknown) => Promise<{ error: Error | null }>>();
const removeMock = vi.fn<(paths: string[]) => Promise<{ error: Error | null }>>();
const createSignedUrlMock = vi.fn();
const storageFromMock = vi.fn((_bucket: string) => ({
  upload: uploadMock,
  remove: removeMock,
  createSignedUrl: createSignedUrlMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    storage: { from: (bucket: string) => storageFromMock(bucket) },
  },
}));

const { runHandler, UnretryableOutboxError } = await import('./handlers');

const baseProps = {
  id: '01HZZA',
  enqueuedAt: 0,
  attemptCount: 0,
  status: 'pending' as const,
};

beforeEach(() => {
  eqMock.mockReset();
  updateMock.mockClear();
  insertMock.mockReset();
  inMock.mockReset();
  selectMock.mockClear();
  deleteEqMock.mockReset();
  deleteMock.mockClear();
  uploadMock.mockReset();
  removeMock.mockReset();
  fromMock.mockClear();
  storageFromMock.mockClear();
  // Defaults: every supabase call succeeds.
  eqMock.mockResolvedValue({ error: null });
  insertMock.mockResolvedValue({ error: null });
  inMock.mockResolvedValue({ data: [], error: null });
  deleteEqMock.mockResolvedValue({ error: null });
  uploadMock.mockResolvedValue({ error: null });
  removeMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runHandler · updateBoard', () => {
  it('passes the patch through and resolves on success', async () => {
    const entry: UpdateBoardEntry = {
      ...baseProps,
      kind: 'updateBoard',
      boardId: 'b-1',
      patch: { name: 'Sunrise' },
    };
    await runHandler(entry);
    expect(updateMock).toHaveBeenCalledWith({ name: 'Sunrise' });
    expect(eqMock).toHaveBeenCalledWith('id', 'b-1');
  });

  it('wraps coded DB errors in UnretryableOutboxError', async () => {
    eqMock.mockResolvedValue({
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    const entry: UpdateBoardEntry = {
      ...baseProps,
      kind: 'updateBoard',
      boardId: 'b-1',
      patch: { name: 'X' },
    };
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
  });
});

describe('runHandler · createPhotoPicto', () => {
  it('uploads then inserts the row', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob,
      extension: 'jpg',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalledWith(
      'o-1/p-1.jpg',
      blob,
      expect.objectContaining({ upsert: true }),
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p-1',
        owner_id: 'o-1',
        style: 'photo',
        image_path: 'o-1/p-1.jpg',
      }),
    );
  });

  it('treats a 5xx storage error as transient — not Unretryable (#32)', async () => {
    const uploadErr = Object.assign(new Error('boom'), { statusCode: 500 });
    uploadMock.mockResolvedValue({ error: uploadErr });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
    };
    let caught: unknown;
    try {
      await runHandler(entry);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(UnretryableOutboxError);
    // Lock in that the original storage error reaches the drain layer with
    // its statusCode intact — drain.ts uses this to bump attemptCount and
    // schedule a retry. A regression that re-wrapped 5xx in some other
    // custom subclass would trip this.
    expect(caught).toBe(uploadErr);
    expect((caught as { statusCode?: number }).statusCode).toBe(500);
    // Insert never ran because upload threw first; the bucket cleanup path
    // only fires when insert fails after a successful upload.
    expect(insertMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded blob if insert fails', async () => {
    insertMock.mockResolvedValue({
      error: { code: '23505', message: 'unique violation', details: '', hint: '' },
    });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
    };
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.jpg']);
  });
});

describe('runHandler · setPictoAudio', () => {
  it('uploads, updates the row, and removes the previous recording', async () => {
    const blob = new Blob(['x'], { type: 'audio/webm' });
    const entry: SetPictogramAudioEntry = {
      ...baseProps,
      kind: 'setPictoAudio',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob,
      extension: 'webm',
      previousPath: 'o-1/p-1.m4a',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalledWith(
      'o-1/p-1.webm',
      blob,
      expect.objectContaining({ upsert: true }),
    );
    expect(updateMock).toHaveBeenCalledWith({ audio_path: 'o-1/p-1.webm' });
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.m4a']);
  });
});

describe('runHandler · clearPictoAudio', () => {
  it('removes the file and nulls audio_path', async () => {
    const entry: ClearPictogramAudioEntry = {
      ...baseProps,
      kind: 'clearPictoAudio',
      pictogramId: 'p-1',
      path: 'o-1/p-1.webm',
    };
    await runHandler(entry);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.webm']);
    expect(updateMock).toHaveBeenCalledWith({ audio_path: null });
  });
});

describe('runHandler · renamePicto', () => {
  it('updates the label column scoped to the pictogram id', async () => {
    const entry: RenamePictogramEntry = {
      ...baseProps,
      kind: 'renamePicto',
      pictogramId: 'p-1',
      label: 'Local park',
    };
    await runHandler(entry);
    expect(fromMock).toHaveBeenCalledWith('pictograms');
    expect(updateMock).toHaveBeenCalledWith({ label: 'Local park' });
    expect(eqMock).toHaveBeenCalledWith('id', 'p-1');
  });
});

describe('runHandler · replacePictoImage', () => {
  it('uploads the new blob, points the row at it, and removes the prior upload', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const entry: ReplacePictogramImageEntry = {
      ...baseProps,
      kind: 'replacePictoImage',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob,
      extension: 'jpg',
      previousPath: 'o-1/p-1.webp',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalledWith(
      'o-1/p-1.jpg',
      blob,
      expect.objectContaining({ upsert: true }),
    );
    expect(updateMock).toHaveBeenCalledWith({ image_path: 'o-1/p-1.jpg' });
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.webp']);
  });

  it('skips removeFromBucket when the previous path is a stock sentinel', async () => {
    const entry: ReplacePictogramImageEntry = {
      ...baseProps,
      kind: 'replacePictoImage',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
      previousPath: 'stock:park',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('skips removeFromBucket when the new path matches the previous path', async () => {
    const entry: ReplacePictogramImageEntry = {
      ...baseProps,
      kind: 'replacePictoImage',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
      previousPath: 'o-1/p-1.jpg',
    };
    await runHandler(entry);
    // Same key — upsert overwrote the bytes; deleting it would lose the new image.
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('runHandler · deletePicto', () => {
  it('scrubs the id from referenced boards, deletes the row, and cleans up uploads', async () => {
    inMock.mockResolvedValue({
      data: [
        { id: 'b-1', step_ids: ['p-1', 'p-2'] },
        { id: 'b-2', step_ids: ['p-2'] }, // already not referenced — no update
      ],
      error: null,
    });
    const entry: DeletePictogramEntry = {
      ...baseProps,
      kind: 'deletePicto',
      pictogramId: 'p-1',
      previousImagePath: 'o-1/p-1.jpg',
      previousAudioPath: 'o-1/p-1.webm',
      scrubFromBoardIds: ['b-1', 'b-2'],
    };
    await runHandler(entry);
    expect(selectMock).toHaveBeenCalledWith('id, step_ids');
    expect(inMock).toHaveBeenCalledWith('id', ['b-1', 'b-2']);
    // Only b-1 had a step_ids change.
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ step_ids: ['p-2'] });
    expect(eqMock).toHaveBeenCalledWith('id', 'b-1');
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'p-1');
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.jpg']);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.webm']);
  });

  it('skips storage cleanup for stock-prefixed previous paths', async () => {
    const entry: DeletePictogramEntry = {
      ...baseProps,
      kind: 'deletePicto',
      pictogramId: 'p-1',
      previousImagePath: 'stock:park',
      scrubFromBoardIds: [],
    };
    await runHandler(entry);
    expect(deleteMock).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('skips the boards round-trip when scrubFromBoardIds is empty', async () => {
    const entry: DeletePictogramEntry = {
      ...baseProps,
      kind: 'deletePicto',
      pictogramId: 'p-1',
      scrubFromBoardIds: [],
    };
    await runHandler(entry);
    expect(selectMock).not.toHaveBeenCalled();
    expect(inMock).not.toHaveBeenCalled();
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'p-1');
  });
});

describe('runHandler · renameKid', () => {
  it('updates the name column scoped to the kid id', async () => {
    const entry: RenameKidEntry = {
      ...baseProps,
      kind: 'renameKid',
      kidId: 'k-1',
      name: 'Mia',
    };
    await runHandler(entry);
    expect(fromMock).toHaveBeenCalledWith('kids');
    expect(updateMock).toHaveBeenCalledWith({ name: 'Mia' });
    expect(eqMock).toHaveBeenCalledWith('id', 'k-1');
  });

  it('wraps coded DB errors in UnretryableOutboxError', async () => {
    eqMock.mockResolvedValue({
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    const entry: RenameKidEntry = {
      ...baseProps,
      kind: 'renameKid',
      kidId: 'k-1',
      name: 'Mia',
    };
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
  });
});

describe('runHandler · deleteKid', () => {
  it('deletes the kid row by id', async () => {
    const entry: DeleteKidEntry = {
      ...baseProps,
      kind: 'deleteKid',
      kidId: 'k-1',
    };
    await runHandler(entry);
    expect(fromMock).toHaveBeenCalledWith('kids');
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'k-1');
  });

  it('does not touch boards or storage — server-side cascade handles them', async () => {
    const entry: DeleteKidEntry = {
      ...baseProps,
      kind: 'deleteKid',
      kidId: 'k-1',
    };
    await runHandler(entry);
    // No boards SELECT/UPDATE — the FK cascade strips boards on the server.
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
