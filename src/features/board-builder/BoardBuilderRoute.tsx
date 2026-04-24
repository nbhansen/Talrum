import { type JSX, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PictoPicker } from '@/features/pictogram-picker/PictoPicker';
import { useBoard, useBoards } from '@/lib/queries/boards';
import { supabase } from '@/lib/supabase';
import { useUserInitial } from '@/lib/useUserInitial';

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
  const userInitial = useUserInitial();

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

  // `.single()` in useBoard returns a 406 when RLS hides the row (e.g. a
  // pasted URL from another account). Treat any settled query without a
  // row as not-found rather than rendering a blank screen.
  if (boardQuery.isError || (boardQuery.isSuccess && !board)) {
    const fallbackKid = boardsQuery.data?.find((b) => b.kind === 'sequence');
    return (
      <BoardNotFound
        onBack={() => navigate('/')}
        onKidMode={() => {
          if (fallbackKid) navigate(`/kid/sequence/${fallbackKid.id}`);
        }}
        userInitial={userInitial}
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
        onPreview={(kind) => navigate(`/kid/${kind}/${board.id}`)}
        onKidMode={() => navigate(`/kid/${board.kind}/${board.id}`)}
        onSignOut={() => {
          void supabase.auth.signOut();
        }}
        userInitial={userInitial}
      />
      {pickerOpen && <PictoPicker onClose={closePicker} />}
    </>
  );
};
