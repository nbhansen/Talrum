import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';

import { clearPin, hasPin, pinGateDisabled, setPin, subscribePin, verifyPin } from '@/lib/pin';
import { captureException } from '@/lib/platform/telemetry';
import { Button } from '@/ui/Button/Button';
import { Modal } from '@/ui/Modal/Modal';
import { PinPad } from '@/widgets/PinPad/PinPad';

import styles from './PinManagementSection.module.css';
import shared from './settings.module.css';

/**
 * Both flows share these steps. Setting a first PIN starts at 'enter-new'
 * (there is no current PIN to verify); changing one starts at 'verify'.
 */
type PinFlow =
  | { stage: 'verify' }
  | { stage: 'enter-new' }
  | { stage: 'confirm-new'; newPin: string };

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
  const [flow, setFlow] = useState<PinFlow | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const hasPinNow = useSyncExternalStore(subscribePin, hasPin, () => false);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const close = (): void => setFlow(null);

  const handleVerify = async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin).catch((err: unknown) => {
      captureException(err, { tags: { component: 'PinManagementSection', op: 'verifyPin' } });
      throw new Error('Talrum cannot check the PIN on this device. Reload the page and try again.');
    });
    if (ok) setFlow({ stage: 'enter-new' });
    return ok;
  };

  const handleEnterNew = async (pin: string): Promise<boolean> => {
    setFlow({ stage: 'confirm-new', newPin: pin });
    return true;
  };

  const handleConfirmNew = async (pin: string, newPin: string): Promise<boolean> => {
    if (pin !== newPin) return false;
    const wasFirstPin = !hasPinNow;
    try {
      await setPin(pin);
    } catch {
      throw new Error(
        "Couldn't save the PIN on this device. Allow site data for Talrum in the browser settings, then try again.",
      );
    }
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
        <p className={shared.muted}>
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
        <p className={shared.muted}>
          No PIN set, so kid mode is unavailable. The PIN is the only way back out of a kid screen —
          without it a child could tap straight into parent mode.
        </p>
      )}
      {hasPinNow && (
        <p className={shared.muted}>
          Your 4-digit PIN unlocks parent mode from a kid screen. Forgot it? Clear it and set a new
          one here.
        </p>
      )}
      <div className={`${shared.actions} ${shared.row}`}>
        {!hasPinNow && (
          <Button variant="ghost" onClick={() => setFlow({ stage: 'enter-new' })}>
            Set a PIN
          </Button>
        )}
        {hasPinNow && (
          <Button variant="ghost" onClick={() => setFlow({ stage: 'verify' })}>
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
      {flow && (
        <Modal onClose={close} size="sm">
          {flow.stage === 'verify' && (
            <PinPad
              title="Enter current PIN"
              subtitle="Verify it's you before setting a new one."
              onSubmit={handleVerify}
            />
          )}
          {flow.stage === 'enter-new' && (
            <PinPad
              title={hasPinNow ? 'Enter new PIN' : 'Set a parent PIN'}
              subtitle={
                hasPinNow
                  ? 'Choose a new 4-digit PIN.'
                  : "Choose a 4-digit PIN. You'll need it to leave kid mode."
              }
              onSubmit={handleEnterNew}
            />
          )}
          {flow.stage === 'confirm-new' && (
            <PinPad
              title={hasPinNow ? 'Confirm new PIN' : 'Confirm your PIN'}
              subtitle="Enter the same 4 digits again."
              onSubmit={(pin) => handleConfirmNew(pin, flow.newPin)}
              errorMessage="PINs don't match"
            />
          )}
        </Modal>
      )}
    </section>
  );
};
