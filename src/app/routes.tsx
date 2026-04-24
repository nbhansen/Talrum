import { createBrowserRouter, Navigate } from 'react-router-dom';

import { BoardBuilderRoute } from '@/features/board-builder/BoardBuilderRoute';
import { KidChoiceRoute } from '@/features/kid-choice/KidChoiceRoute';
import { KidSequenceRoute } from '@/features/kid-sequence/KidSequenceRoute';
import { ParentHomeRoute } from '@/features/parent-home/ParentHomeRoute';

export const router = createBrowserRouter(
  [
    { path: '/', element: <ParentHomeRoute /> },
    { path: '/boards/:boardId/edit', element: <BoardBuilderRoute /> },
    { path: '/kid/sequence/:boardId', element: <KidSequenceRoute /> },
    { path: '/kid/choice/:boardId', element: <KidChoiceRoute /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  {
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
