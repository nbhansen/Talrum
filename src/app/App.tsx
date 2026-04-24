import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { ensureStubSession } from '@/lib/supabase';

import { router } from './routes';

export const App = (): React.JSX.Element => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureStubSession().then(() => setReady(true));
  }, []);

  if (!ready) return <div className="tal" />;

  return (
    <div className="tal">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </div>
  );
};
