/**
 * One audit point for every string a kid sees, plus the PIN exit flow. Add copy
 * to both tables before a component references it. Components call
 * `getKidCopy()` during render, so a language change needs no reload (#304).
 */

import { type AppLanguage, getAppLanguage } from './language';

export interface KidCopy {
  exitButton: string;
  /** The only action on the kid-route crash screen a child is meant to take. */
  crashRetry: string;
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
  // Verification only: a kid must never be shown a way to create the PIN that
  // contains them, so the setup copy lives in parent UI (#353).
  pin: {
    verifyTitle: string;
    verifySubtitle: string;
    wrongPin: string;
    /** Throttle-lock countdown after repeated wrong entries (#372). */
    locked: (secondsLeft: number) => string;
  };
}

const copy: Record<AppLanguage, KidCopy> = {
  en: {
    exitButton: 'Exit kid mode',
    crashRetry: 'Tap to try again',
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
      wrongPin: 'Wrong PIN',
      locked: (secondsLeft: number): string =>
        secondsLeft === 1
          ? 'Too many tries. Wait 1 second.'
          : `Too many tries. Wait ${secondsLeft} seconds.`,
    },
  },
  da: {
    exitButton: 'Afslut børnetilstand',
    crashRetry: 'Tryk for at prøve igen',
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
      wrongPin: 'Forkert PIN',
      locked: (secondsLeft: number): string =>
        secondsLeft === 1
          ? 'For mange forsøg. Vent 1 sekund.'
          : `For mange forsøg. Vent ${secondsLeft} sekunder.`,
    },
  },
};

/** Kid copy for the resolved app language, resolved at call time. */
export const getKidCopy = (): KidCopy => copy[getAppLanguage()];
