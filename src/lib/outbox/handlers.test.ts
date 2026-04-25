import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClearPictogramAudioEntry,
  CreatePhotoPictogramEntry,
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
const fromMock = vi.fn((_table: string) => ({ update: updateMock, insert: insertMock }));

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
  uploadMock.mockReset();
  removeMock.mockReset();
  fromMock.mockClear();
  storageFromMock.mockClear();
  // Defaults: every supabase call succeeds.
  eqMock.mockResolvedValue({ error: null });
  insertMock.mockResolvedValue({ error: null });
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
