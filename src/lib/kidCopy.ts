/**
 * Single audit point for kid-visible strings, in every supported language.
 * Add new kid-mode copy here — to both tables — before referencing it from a
 * component. Keep generic chrome (Cancel, Delete) out — only strings the kid
 * actually sees, plus the PIN flow that gates kid-mode exit.
 *
 * Components call getKidCopy() during render, so a language change in
 * settings applies on the next render without a reload (#304).
 */

import { type AppLanguage, getAppLanguage } from './language';

export interface KidCopy {
  exitButton: string;
  emptyBoard: {
    title: string;
    body: string;
  };
  choice: {
    title: string;
    tapPlaceholder: string;
    letsGoTo: (label: string) => string;
    hearAgain: (label: string) => string;
  };
  pin: {
    verifyTitle: string;
    verifySubtitle: string;
    setupNewTitle: string;
    setupNewSubtitle: string;
    setupConfirmTitle: string;
    setupConfirmSubtitle: string;
    mismatchError: string;
    wrongPin: string;
  };
}

const copy: Record<AppLanguage, KidCopy> = {
  en: {
    exitButton: 'Exit kid mode',
    emptyBoard: {
      title: 'This board is empty',
      body: 'Ask a grown-up to add some pictograms.',
    },
    choice: {
      title: 'Pick one',
      tapPlaceholder: 'Tap one to choose ✨',
      letsGoTo: (label: string): string => `Let's go to ${label}`,
      hearAgain: (label: string): string => `Hear ${label} again`,
    },
    pin: {
      verifyTitle: 'Enter PIN to exit',
      verifySubtitle: 'Enter your 4-digit parent PIN.',
      setupNewTitle: 'Set a parent PIN',
      setupNewSubtitle: 'Choose a 4-digit PIN for exiting kid mode.',
      setupConfirmTitle: 'Confirm your PIN',
      setupConfirmSubtitle: 'Enter the same 4 digits again.',
      mismatchError: "PINs don't match",
      wrongPin: 'Wrong PIN',
    },
  },
  da: {
    exitButton: 'Afslut børnetilstand',
    emptyBoard: {
      title: 'Denne tavle er tom',
      body: 'Bed en voksen om at tilføje nogle piktogrammer.',
    },
    choice: {
      title: 'Vælg ét',
      tapPlaceholder: 'Tryk på ét for at vælge ✨',
      letsGoTo: (label: string): string => `Lad os gå til ${label}`,
      hearAgain: (label: string): string => `Hør ${label} igen`,
    },
    pin: {
      verifyTitle: 'Indtast PIN for at afslutte',
      verifySubtitle: 'Indtast din 4-cifrede forældre-PIN.',
      setupNewTitle: 'Vælg en forældre-PIN',
      setupNewSubtitle: 'Vælg en 4-cifret PIN til at afslutte børnetilstand.',
      setupConfirmTitle: 'Bekræft din PIN',
      setupConfirmSubtitle: 'Indtast de samme 4 cifre igen.',
      mismatchError: 'PIN-koderne er ikke ens',
      wrongPin: 'Forkert PIN',
    },
  },
};

/** Kid copy for the resolved app language, resolved at call time. */
export const getKidCopy = (): KidCopy => copy[getAppLanguage()];
