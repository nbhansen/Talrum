import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export type ParentNavKey = 'home' | 'library' | 'kids' | 'settings';

const PATHS: Record<ParentNavKey, string> = {
  home: '/',
  library: '/library',
  kids: '/kids',
  settings: '/settings',
};

export const useParentNav = (): ((id: ParentNavKey) => void) => {
  const navigate = useNavigate();
  return useCallback((id: ParentNavKey) => navigate(PATHS[id]), [navigate]);
};
