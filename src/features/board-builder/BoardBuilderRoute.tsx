import { type JSX, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getBoard } from '@/data/boards';
import { PictoPicker } from '@/features/pictogram-picker/PictoPicker';

import { BoardBuilder } from './BoardBuilder';

export const BoardBuilderRoute = (): JSX.Element => {
  const { boardId = '' } = useParams();
  const board = getBoard(boardId);
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
