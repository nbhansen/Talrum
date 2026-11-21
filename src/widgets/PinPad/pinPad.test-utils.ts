import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

export const tapDigits = async (
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
): Promise<void> => {
  for (const d of digits) {
    await user.click(screen.getByRole('button', { name: d }));
  }
};
