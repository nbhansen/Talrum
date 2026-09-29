import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BoardBuilder } from '@/features/board-builder/BoardBuilder';
import { BoardNotFound } from '@/features/board-builder/BoardNotFound';
import { PictoPicker } from '@/features/board-builder/pictogram-picker/PictoPicker';
import { ShareModal } from '@/features/board-builder/ShareModal';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';
import { useSessionUser } from '@/lib/auth/session';
import { isNotFoundError, useBoard, useSetStepIds } from '@/lib/queries/boards';
import { useSearchParamFlag } from '@/lib/useSearchParamFlag';

export const BoardBuilderRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const boardQuery = useBoard(boardId);
  const fallbackKidMode = useKidModeNav();
  const setStepIds = useSetStepIds();
  const board = boardQuery.data;
  const navigate = useNavigate();
  const onNav = useParentNav();
  const me = useSessionUser();
  const picker = useSearchParamFlag('picker');
  const share = useSearchParamFlag('share');

  // `.single()` raises PGRST116 when a row is missing or hidden by RLS
  // (e.g. a pasted URL from another account) — terminal, surface as
  // not-found. Any other error is transient (network, Supabase down);
  // offer Retry rather than mis-attributing to a not-found.
  if (boardQuery.isError || (boardQuery.isSuccess && !board)) {
    const variant =
      isNotFoundError(boardQuery.error) || (boardQuery.isSuccess && !board) ? 'not-found' : 'error';
    return (
      <BoardNotFound
        variant={variant}
        onBack={() => navigate('/')}
        onRetry={() => void boardQuery.refetch()}
        {...(fallbackKidMode ? { onKidMode: fallbackKidMode } : {})}
        onNav={onNav}
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
        setStepIds={setStepIds}
        onBack={() => navigate('/')}
        onOpenPicker={picker.open}
        onOpenShare={share.open}
        onDeleted={() => navigate('/', { replace: true })}
        onKidMode={() => navigate(`/kid/${board.kind}/${board.id}`)}
        onNav={onNav}
      />
      {picker.isOpen && (
        <PictoPicker
          ownerId={board.ownerId}
          onClose={picker.close}
          onConfirm={(ids) => {
            if (ids.length === 0) return;
            setStepIds.mutate({ boardId: board.id, update: (prev) => [...prev, ...ids] });
          }}
        />
      )}
      {share.isOpen && <ShareModal boardId={board.id} isOwner={isOwner} onClose={share.close} />}
    </>
  );
};
