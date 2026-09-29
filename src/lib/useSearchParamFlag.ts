import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

interface SearchParamFlag {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** A `?name=1` flag: open pushes, so Back closes; close replaces in place. */
export const useSearchParamFlag = (name: string): SearchParamFlag => {
  const [searchParams, setSearchParams] = useSearchParams();

  const open = useCallback((): void => {
    const next = new URLSearchParams(searchParams);
    next.set(name, '1');
    setSearchParams(next);
  }, [name, searchParams, setSearchParams]);

  const close = useCallback((): void => {
    const next = new URLSearchParams(searchParams);
    next.delete(name);
    setSearchParams(next, { replace: true });
  }, [name, searchParams, setSearchParams]);

  return { isOpen: searchParams.get(name) === '1', open, close };
};
