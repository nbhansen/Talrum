import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BoardBuilder } from '@/features/board-builder/BoardBuilder';
import { BoardNotFound } from '@/features/board-builder/BoardNotFound';
import { useSessionUser } from '@/lib/auth/session';
import { kidPathFor } from '@/lib/lastBoard';
import { isNotFoundError, useBoard } from '@/lib/queries/boards';

export const BoardBuilderRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const boardQuery = useBoard(boardId);
  const board = boardQuery.data;
  const navigate = useNavigate();
  const me = useSessionUser();

  // `.single()` raises PGRST116 when a row is missing or hidden by RLS
  // (e.g. a pasted URL from another account) — terminal, surface as
  // not-found. Any other error is transient (network, Supabase down);
  // offer Retry rather than mis-attributing to a not-found.
  if (boardQuery.isError) {
    return (
      <BoardNotFound
        variant={isNotFoundError(boardQuery.error) ? 'not-found' : 'error'}
        onBack={() => navigate('/')}
        onRetry={() => void boardQuery.refetch()}
      />
    );
  }

  if (!board) return null;

  return (
    <BoardBuilder
      key={board.id}
      board={board}
      isOwner={board.ownerId === me.id}
      onBack={() => navigate('/')}
      onRemoved={() => navigate('/', { replace: true })}
      onKidMode={() => navigate(kidPathFor(board.id))}
    />
  );
};
