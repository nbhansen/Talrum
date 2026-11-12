import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { getLanguagePref } from '@/lib/language';

import { LanguageGate } from './LanguageGate';

beforeEach(() => {
  window.localStorage.removeItem('talrum:language');
});

describe('LanguageGate', () => {
  it('asks for the language before the app when none is stored (#745)', async () => {
    render(
      <LanguageGate>
        <div>app body</div>
      </LanguageGate>,
    );
    expect(screen.queryByText('app body')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dansk' }));

    expect(getLanguagePref()).toBe('da');
    expect(screen.getByText('app body')).toBeInTheDocument();
  });

  it('shows the app at once when a language is stored', () => {
    window.localStorage.setItem('talrum:language', 'en');
    render(
      <LanguageGate>
        <div>app body</div>
      </LanguageGate>,
    );
    expect(screen.getByText('app body')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dansk' })).not.toBeInTheDocument();
  });
});
