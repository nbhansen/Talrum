import { type JSX, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useSessionUser } from '@/app/session';
import { PictoPicker } from '@/features/pictogram-picker/PictoPicker';
import { isNotFoundError, useBoard, useBoards } from '@/lib/queries/boards';

import { BoardBuilder } from './BoardBuilder';
import { BoardNotFound } from './BoardNotFound';
import { ShareModal } from './ShareModal';

export const BoardBuilderRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const boardQuery = useBoard(boardId);
  const boardsQuery = useBoards();
  const board = boardQuery.data;
  const navigate = useNavigate();
  const me = useSessionUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const pickerOpen = searchParams.get('picker') === '1';
  const shareOpen = searchParams.get('share') === '1';

  const openPicker = useCallback((): void => {
    const next = new URLSearchParams(searchParams);
    next.set('picker', '1');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closePicker = useCallback((): void => {
    const next = new URLSearchParams(searchParams);
    next.delete('picker');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openShare = useCallback((): void => {
    const next = new URLSearchParams(searchParams);
    next.set('share', '1');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeShare = useCallback((): void => {
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // `.single()` raises PGRST116 when a row is missing or hidden by RLS
  // (e.g. a pasted URL from another account) — terminal, surface as
  // not-found. Any other error is transient (network, Supabase down);
  // offer Retry rather than mis-attributing to a not-found.
  if (boardQuery.isError || (boardQuery.isSuccess && !board)) {
    const variant =
      isNotFoundError(boardQuery.error) || (boardQuery.isSuccess && !board)
        ? 'not-found'
        : 'error';
    const fallbackKid = boardsQuery.data?.find((b) => b.kind === 'sequence');
    return (
      <BoardNotFound
        variant={variant}
        onBack={() => navigate('/')}
        onRetry={() => void boardQuery.refetch()}
        onKidMode={() => {
          if (fallbackKid) navigate(`/kid/sequence/${fallbackKid.id}`);
        }}
      />
    );
  }

  if (!board) return null;

  const isOwner = board.ownerId === me.id;

  return (
    <>
      <BoardBuilder
        board={board}
        isOwner={isOwner}
        onBack={() => navigate('/')}
        onOpenPicker={openPicker}
        onOpenShare={openShare}
        onKidMode={() => navigate(`/kid/${board.kind}/${board.id}`)}
      />
      {pickerOpen && <PictoPicker onClose={closePicker} />}
      {shareOpen && (
        <ShareModal boardId={board.id} isOwner={isOwner} onClose={closeShare} />
      )}
    </>
  );
};
