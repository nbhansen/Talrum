import type { JSX } from 'react';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

// Stub: real implementation lands in the next commit. Exists so typecheck
// passes alongside the failing-on-purpose test file. Mirrors the
// red-then-green pattern used in Phase F (mutation client).
export const DeleteAccountDialog = (_props: Props): JSX.Element => {
  throw new Error('DeleteAccountDialog: not yet implemented');
};
