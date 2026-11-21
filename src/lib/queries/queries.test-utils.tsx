import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Board } from '@/types/domain';

export const makeClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

interface TestProvidersProps {
  children: ReactNode;
  client?: QueryClient;
}

/** A query client with retries off and a fake session. Pass `client` to seed or inspect the cache. */
export const TestProviders = ({ children, client }: TestProvidersProps): JSX.Element => (
  <QueryClientProvider client={client ?? makeClient()}>
    <TestSessionProvider>{children}</TestSessionProvider>
  </QueryClientProvider>
);

export const makeWrapper = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <TestProviders client={client}>{children}</TestProviders>
  );
  return Wrapper;
};

export interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

export const rlsError: MockPostgrestError = {
  code: '42501',
  message: 'row-level-security',
  details: '',
  hint: '',
};

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

export const makeBoard = (over: Partial<Board> = {}): Board => ({
  id: 'board-uuid',
  ownerId: 'owner',
  kidId: 'kid',
  name: 'Saturday',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: [],
  kidReorderable: false,
  accent: 'sky',
  ...over,
});
