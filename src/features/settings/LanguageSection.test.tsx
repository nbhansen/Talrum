import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { getLanguagePref } from '@/lib/language';

import { LanguageSection } from './LanguageSection';

beforeEach(() => {
  window.localStorage.removeItem('talrum:language');
});

describe('LanguageSection', () => {
  it('defaults to Automatic when no pref is stored', () => {
    render(<LanguageSection />);
    const select = screen.getByLabelText(/language/i) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: /automatic/i })).toBeInTheDocument();
  });

  it('persists an explicit choice', async () => {
    const user = userEvent.setup();
    render(<LanguageSection />);

    await user.selectOptions(screen.getByLabelText(/language/i), 'da');

    expect(getLanguagePref()).toBe('da');
  });

  it('reflects a stored pref on mount and can return to Automatic', async () => {
    window.localStorage.setItem('talrum:language', 'da');
    const user = userEvent.setup();
    render(<LanguageSection />);

    const select = screen.getByLabelText(/language/i) as HTMLSelectElement;
    expect(select.value).toBe('da');

    await user.selectOptions(select, '');

    expect(getLanguagePref()).toBeNull();
    expect(window.localStorage.getItem('talrum:language')).toBeNull();
  });
});
