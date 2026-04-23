import { RouterProvider } from 'react-router-dom';

import { router } from './routes';

export const App = (): React.JSX.Element => (
  <div className="tal">
    <RouterProvider router={router} />
  </div>
);
