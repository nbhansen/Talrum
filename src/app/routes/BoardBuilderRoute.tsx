import { type JSX, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BoardBuilder } from '@/features/board-builder/BoardBuilder';
import { BoardErrorBanner } from '@/features/board-builder/BoardErrorBanner';
import { BoardNotFound } from '@/features/board-builder/BoardNotFound';
import { PictoPicker } from '@/features/board-builder/pictogram-picker/PictoPicker';
import { ShareModal } from '@/features/board-builder/ShareModal';
import { useParentNav } from '@/layouts/useParentNav';
import { useSessionUser } from '@/lib/auth/session';
import { isNotFoundError, useBoard, useBoards, useSetStepIds } from '@/lib/queries/boards';

export const BoardBuilderRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const boardQuery = useBoard(boardId);
  const boardsQuery = useBoards();
  const setStepIds = useSetStepIds();
  const board = boardQuery.data;
  const navigate = useNavigate();
  const onNav = useParentNav();
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
      isNotFoundError(boardQuery.error) || (boardQuery.isSuccess && !board) ? 'not-found' : 'error';
    const fallbackKid = boardsQuery.data?.find((b) => b.kind === 'sequence');
    return (
      <BoardNotFound
        variant={variant}
        onBack={() => navigate('/')}
        onRetry={() => void boardQuery.refetch()}
        onKidMode={() => {
          if (fallbackKid) navigate(`/kid/sequence/${fallbackKid.id}`);
        }}
        onNav={onNav}
      />
    );
  }

  if (!board) return null;

  const isOwner = board.ownerId === me.id;

  return (
    <>
      <BoardErrorBanner mutation={setStepIds} message="Couldn't save your picks. Try again." />
      <BoardBuilder
        board={board}
        isOwner={isOwner}
        onBack={() => navigate('/')}
        onOpenPicker={openPicker}
        onOpenShare={openShare}
        onKidMode={() => navigate(`/kid/${board.kind}/${board.id}`)}
        onNav={onNav}
      />
      {pickerOpen && (
        <PictoPicker
          onClose={closePicker}
          onConfirm={(ids) => {
            if (ids.length === 0) return;
            setStepIds.mutate({ boardId: board.id, update: (prev) => [...prev, ...ids] });
          }}
        />
      )}
      {shareOpen && <ShareModal boardId={board.id} isOwner={isOwner} onClose={closeShare} />}
    </>
  );
};
