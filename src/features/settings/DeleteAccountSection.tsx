import { type JSX, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DeleteAccountDialog } from './DeleteAccountDialog';

/**
 * Separated from the benign preferences above it, because the action is
 * destructive. The navigation runs through `onPreSignOut` so it happens before
 * signOut unmounts the dialog, and `replace` keeps Back off a 401 page.
 */
export const DeleteAccountSection = (): JSX.Element => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <section>
      <hr />
      <h2>Account</h2>
      <p>
        Talrum keeps your data until you delete your account.{' '}
        <Link to="/privacy-policy">Read the privacy policy.</Link>
      </p>
      <button type="button" onClick={() => setOpen(true)}>
        Delete my account
      </button>
      {open && (
        <DeleteAccountDialog
          onCancel={() => setOpen(false)}
          onPreSignOut={() => navigate('/account-deleted', { replace: true })}
        />
      )}
    </section>
  );
};
