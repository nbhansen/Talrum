import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useSearchParamFlag } from './useSearchParamFlag';

const renderFlag = (initial: string) =>
  renderHook(
    () => ({
      flag: useSearchParamFlag('picker'),
      search: useLocation().search,
      navType: useNavigationType(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }): JSX.Element => (
        <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
      ),
    },
  );

describe('useSearchParamFlag', () => {
  it('reads the flag from the URL', () => {
    expect(renderFlag('/b?picker=1').result.current.flag.isOpen).toBe(true);
    expect(renderFlag('/b').result.current.flag.isOpen).toBe(false);
  });

  it('opens with a new history entry and keeps the other params', () => {
    const { result } = renderFlag('/b?share=1');
    act(() => result.current.flag.open());
    expect(result.current.flag.isOpen).toBe(true);
    expect(result.current.search).toBe('?share=1&picker=1');
    expect(result.current.navType).toBe('PUSH');
  });

  it('closes in place and keeps the other params', () => {
    const { result } = renderFlag('/b?share=1&picker=1');
    act(() => result.current.flag.close());
    expect(result.current.flag.isOpen).toBe(false);
    expect(result.current.search).toBe('?share=1');
    expect(result.current.navType).toBe('REPLACE');
  });
});
