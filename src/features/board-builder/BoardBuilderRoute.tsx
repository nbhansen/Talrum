import { type JSX, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PictoPicker } from '@/features/pictogram-picker/PictoPicker';
import { isNotFoundError, useBoard, useBoards } from '@/lib/queries/boards';

import { BoardBuilder } from './BoardBuilder';
import { BoardNotFound } from './BoardNotFound';

export const BoardBuilderRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const boardQuery = useBoard(boardId);
  const boardsQuery = useBoards();
  const board = boardQuery.data;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pickerOpen = searchParams.get('picker') === '1';

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

  return (
    <>
      <BoardBuilder
        board={board}
        onBack={() => navigate('/')}
        onOpenPicker={openPicker}
        onKidMode={() => navigate(`/kid/${board.kind}/${board.id}`)}
      />
      {pickerOpen && <PictoPicker onClose={closePicker} />}
    </>
  );
};
