import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';

import { AuthGate } from './AuthGate';
import { router } from './routes';

export const App = (): React.JSX.Element => (
  <div className="tal">
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AuthGate>
    </QueryClientProvider>
  </div>
);
