import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from 'react-router-dom';

import { persistOptions, queryClient } from '@/lib/queryClient';

import { AuthGate } from './AuthGate';
import { router } from './routes';
import { SwUpdatePrompt } from './SwUpdatePrompt';

export const App = (): React.JSX.Element => (
  <div className="tal">
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthGate>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AuthGate>
      <SwUpdatePrompt />
    </PersistQueryClientProvider>
  </div>
);
