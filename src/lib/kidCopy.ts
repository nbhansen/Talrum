/**
 * Single audit point for kid-visible strings. Add new kid-mode copy here
 * before referencing it from a component. Keep generic chrome (Cancel,
 * Delete) out — only strings the kid actually sees, plus the PIN flow
 * that gates kid-mode exit.
 */
export const kidCopy = {
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
} as const;
