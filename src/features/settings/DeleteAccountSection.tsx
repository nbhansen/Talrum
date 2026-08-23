import { type JSX, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/ui/Button/Button';
import { TrashIcon } from '@/ui/icons';

import { DeleteAccountDialog } from './DeleteAccountDialog';
import styles from './DeleteAccountSection.module.css';

/**
 * The navigation runs through `onPreSignOut` so it happens before signOut
 * unmounts the dialog, and `replace` keeps Back off a 401 page.
 */
export const DeleteAccountSection = (): JSX.Element => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <section>
      <h2>Account</h2>
      <p className={styles.line}>
        Talrum keeps your data until you delete your account.{' '}
        <Link to="/privacy-policy">Read the privacy policy.</Link>
      </p>
      <Button variant="ghost" icon={<TrashIcon size={14} />} onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      {open && (
        <DeleteAccountDialog
          onCancel={() => setOpen(false)}
          onPreSignOut={() => navigate('/account-deleted', { replace: true })}
        />
      )}
    </section>
  );
};
