import { type JSX, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DeleteAccountDialog } from './DeleteAccountDialog';

/**
 * Settings entry-point for permanent account deletion. Visually segregated
 * (HR + 'Account' header) from the rest of the page so the destructive
 * action isn't adjacent to benign preferences. Navigation to
 * /account-deleted (replace:true) happens via the dialog's onPreSignOut
 * callback so it runs BEFORE supabase.auth.signOut — otherwise AuthGate's
 * synchronous SIGNED_OUT listener unmounts the dialog and the user lands
 * on Login instead. replace:true keeps the back button from returning to
 * a settings page that would 401 on every fetch.
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
