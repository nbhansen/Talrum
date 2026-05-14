import { type JSX, useEffect, useRef, useState } from 'react';

import { clearPin, hasPin, pinGateDisabled, setPin, verifyPin } from '@/lib/pin';
import { PinPad } from '@/ui/KidModeGate/PinPad';
import { Modal } from '@/ui/Modal/Modal';

import styles from './PinManagementSection.module.css';

type ChangeStage = 'verify' | 'enter-new' | 'confirm-new';

type ModalState = { kind: 'closed' } | { kind: 'change'; stage: ChangeStage };

export const PinManagementSection = (): JSX.Element => {
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const newPinRef = useRef<string>('');
  const hasPinNow = hasPin();

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const close = (): void => {
    setModal({ kind: 'closed' });
    newPinRef.current = '';
  };

  const handleVerify = async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) setModal({ kind: 'change', stage: 'enter-new' });
    return ok;
  };

  const handleEnterNew = async (pin: string): Promise<boolean> => {
    newPinRef.current = pin;
    setModal({ kind: 'change', stage: 'confirm-new' });
    return true;
  };

  const handleConfirmNew = async (pin: string): Promise<boolean> => {
    if (pin !== newPinRef.current) return false;
    await setPin(pin);
    close();
    setFlash('PIN updated');
    return true;
  };

  const handleClear = (): void => {
    clearPin();
    setConfirmingClear(false);
    setFlash('PIN cleared');
  };

  if (pinGateDisabled()) {
    return (
      <section>
        <h2>Parent PIN</h2>
        <p className={styles.muted}>
          PIN gate is disabled in this build (<code>VITE_DISABLE_PIN=1</code>).
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>Parent PIN</h2>
      {!hasPinNow && (
        <p className={styles.muted}>
          No PIN set. You'll be prompted to choose one the first time you exit kid mode.
        </p>
      )}
      {hasPinNow && (
        <p className={styles.muted}>
          Your 4-digit PIN unlocks parent mode. Forgot it? Clear it and set a new one next time you
          leave kid mode.
        </p>
      )}
      <div className={styles.actions}>
        {hasPinNow && (
          <button
            type="button"
            className={styles.button}
            onClick={() => setModal({ kind: 'change', stage: 'verify' })}
          >
            Change PIN
          </button>
        )}
        {hasPinNow && !confirmingClear && (
          <button type="button" className={styles.button} onClick={() => setConfirmingClear(true)}>
            Clear PIN
          </button>
        )}
        {hasPinNow && confirmingClear && (
          <span className={styles.confirm}>
            Clear the PIN?
            <button type="button" className={styles.danger} onClick={handleClear}>
              Yes, clear
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => setConfirmingClear(false)}
            >
              Cancel
            </button>
          </span>
        )}
      </div>
      {flash && (
        <p className={styles.flash} role="status">
          {flash}
        </p>
      )}
      {modal.kind === 'change' && (
        <Modal onClose={close}>
          {modal.stage === 'verify' && (
            <PinPad
              title="Enter current PIN"
              subtitle="Verify it's you before setting a new one."
              onSubmit={handleVerify}
              onCancel={close}
            />
          )}
          {modal.stage === 'enter-new' && (
            <PinPad
              title="Enter new PIN"
              subtitle="Choose a new 4-digit PIN."
              onSubmit={handleEnterNew}
              onCancel={close}
            />
          )}
          {modal.stage === 'confirm-new' && (
            <PinPad
              title="Confirm new PIN"
              subtitle="Enter the same 4 digits again."
              onSubmit={handleConfirmNew}
              onCancel={close}
              errorMessage="PINs don't match"
            />
          )}
        </Modal>
      )}
    </section>
  );
};
