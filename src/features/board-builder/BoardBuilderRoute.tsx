import { type JSX, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PictoPicker } from '@/features/pictogram-picker/PictoPicker';
import { useBoard } from '@/lib/queries/boards';

import { BoardBuilder } from './BoardBuilder';

export const BoardBuilderRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const { data: board } = useBoard(boardId);
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

  if (!board) return null;

  return (
    <>
      <BoardBuilder
        board={board}
        onBack={() => navigate('/')}
        onOpenPicker={openPicker}
        onPreview={(kind) => navigate(`/kid/${kind}/${board.id}`)}
      />
      {pickerOpen && <PictoPicker onClose={closePicker} />}
    </>
  );
};
