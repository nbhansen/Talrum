import { type JSX, useEffect, useRef, useState } from 'react';

import { clearPin, hasPin, pinGateDisabled, setPin, verifyPin } from '@/lib/pin';
import { Button } from '@/ui/Button/Button';
import { Modal } from '@/ui/Modal/Modal';
import { PIN_PAD_TITLE_ID, PinPad } from '@/widgets/KidModeGate/PinPad';

import styles from './PinManagementSection.module.css';

/**
 * Both flows share these steps. Setting a first PIN starts at 'enter-new'
 * (there is no current PIN to verify); changing one starts at 'verify'.
 */
type PinStage = 'verify' | 'enter-new' | 'confirm-new';

type ModalState = { kind: 'closed' } | { kind: 'pin'; stage: PinStage };

interface PinManagementSectionProps {
  /**
   * Set when the parent landed here because a kid route bounced them for
   * having no PIN (`/settings?pin=required`) — explains the redirect instead
   * of dropping them on Settings with no idea why (#353).
   */
  pinRequiredForKidMode?: boolean;
}

export const PinManagementSection = ({
  pinRequiredForKidMode = false,
}: PinManagementSectionProps): JSX.Element => {
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
    if (ok) setModal({ kind: 'pin', stage: 'enter-new' });
    return ok;
  };

  const handleEnterNew = async (pin: string): Promise<boolean> => {
    newPinRef.current = pin;
    setModal({ kind: 'pin', stage: 'confirm-new' });
    return true;
  };

  const handleConfirmNew = async (pin: string): Promise<boolean> => {
    if (pin !== newPinRef.current) return false;
    const wasFirstPin = !hasPinNow;
    await setPin(pin);
    close();
    setFlash(wasFirstPin ? 'PIN set — kid mode is ready' : 'PIN updated');
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
      {pinRequiredForKidMode && !hasPinNow && (
        <p className={styles.notice} role="status">
          Kid mode needs a parent PIN. Set one below, then try again.
        </p>
      )}
      {!hasPinNow && (
        <p className={styles.muted}>
          No PIN set, so kid mode is unavailable. The PIN is the only way back out of a kid screen —
          without it a child could tap straight into parent mode.
        </p>
      )}
      {hasPinNow && (
        <p className={styles.muted}>
          Your 4-digit PIN unlocks parent mode from a kid screen. Forgot it? Clear it and set a new
          one here.
        </p>
      )}
      <div className={styles.actions}>
        {!hasPinNow && (
          <Button variant="ghost" onClick={() => setModal({ kind: 'pin', stage: 'enter-new' })}>
            Set a PIN
          </Button>
        )}
        {hasPinNow && (
          <Button variant="ghost" onClick={() => setModal({ kind: 'pin', stage: 'verify' })}>
            Change PIN
          </Button>
        )}
        {hasPinNow && !confirmingClear && (
          <Button variant="ghost" onClick={() => setConfirmingClear(true)}>
            Clear PIN
          </Button>
        )}
        {hasPinNow && confirmingClear && (
          <span className={styles.confirm}>
            Clear the PIN? Kid mode stays locked until you set a new one.
            <Button variant="danger" onClick={handleClear}>
              Yes, clear
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
          </span>
        )}
      </div>
      {flash && (
        <p className={styles.flash} role="status">
          {flash}
        </p>
      )}
      {modal.kind === 'pin' && (
        <Modal onClose={close} labelledBy={PIN_PAD_TITLE_ID} size="sm">
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
              title={hasPinNow ? 'Enter new PIN' : 'Set a parent PIN'}
              subtitle={
                hasPinNow
                  ? 'Choose a new 4-digit PIN.'
                  : "Choose a 4-digit PIN. You'll need it to leave kid mode."
              }
              onSubmit={handleEnterNew}
              onCancel={close}
            />
          )}
          {modal.stage === 'confirm-new' && (
            <PinPad
              title={hasPinNow ? 'Confirm new PIN' : 'Confirm your PIN'}
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
