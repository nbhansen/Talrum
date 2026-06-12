import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getKidCopy } from './kidCopy';
import { setLanguagePref } from './language';

beforeEach(() => {
  window.localStorage.removeItem('talrum:language');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getKidCopy', () => {
  it('serves English copy by default (en device locale, no pref)', () => {
    expect(getKidCopy().choice.title).toBe('Pick one');
  });

  it('serves Danish copy when the language pref is da (#304)', () => {
    setLanguagePref('da');
    expect(getKidCopy().emptyBoard.title).toBe('Denne tavle er tom');
  });

  it('serves Danish copy on a Danish-locale device with no pref', () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('da-DK');
    expect(getKidCopy().choice.title).toBe('Vælg ét');
  });

  it('interpolates the picked label into the confirm CTA in both languages', () => {
    expect(getKidCopy().choice.letsGoTo('Park')).toBe("Let's go to Park");
    setLanguagePref('da');
    expect(getKidCopy().choice.letsGoTo('Park')).toBe('Lad os gå til Park');
  });

  it('interpolates the picked label into the re-speak aria label in both languages', () => {
    expect(getKidCopy().choice.hearAgain('Park')).toBe('Hear Park again');
    setLanguagePref('da');
    expect(getKidCopy().choice.hearAgain('Park')).toBe('Hør Park igen');
  });
});
