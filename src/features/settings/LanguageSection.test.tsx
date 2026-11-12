import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { getLanguagePref } from '@/lib/language';

import { LanguageSection } from './LanguageSection';

beforeEach(() => {
  window.localStorage.removeItem('talrum:language');
});

describe('LanguageSection', () => {
  it('offers only Dansk and English (#745)', () => {
    window.localStorage.setItem('talrum:language', 'da');
    render(<LanguageSection />);
    const select = screen.getByLabelText(/language/i) as HTMLSelectElement;
    expect(select.value).toBe('da');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Dansk', 'English']);
  });

  it('persists a new choice', async () => {
    window.localStorage.setItem('talrum:language', 'da');
    const user = userEvent.setup();
    render(<LanguageSection />);

    await user.selectOptions(screen.getByLabelText(/language/i), 'en');

    expect(getLanguagePref()).toBe('en');
  });
});
