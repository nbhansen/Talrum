import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppLanguage, getLanguagePref, setLanguagePref } from './language';

const stubDeviceLocale = (locale: string): void => {
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(locale);
};

beforeEach(() => {
  window.localStorage.removeItem('talrum:language');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('language pref storage', () => {
  it('round-trips an explicit choice', () => {
    setLanguagePref('da');
    expect(getLanguagePref()).toBe('da');
  });

  it('defaults to null when nothing is stored', () => {
    expect(getLanguagePref()).toBeNull();
  });

  it('treats an unknown stored value as unset', () => {
    window.localStorage.setItem('talrum:language', 'klingon');
    expect(getLanguagePref()).toBeNull();
  });

  it('setLanguagePref(null) clears the stored choice', () => {
    setLanguagePref('da');
    setLanguagePref(null);
    expect(getLanguagePref()).toBeNull();
    expect(window.localStorage.getItem('talrum:language')).toBeNull();
  });
});

describe('getAppLanguage()', () => {
  it('returns the explicit pref regardless of device locale', () => {
    stubDeviceLocale('en-US');
    setLanguagePref('da');
    expect(getAppLanguage()).toBe('da');
  });

  it('follows a Danish device locale when unset', () => {
    stubDeviceLocale('da-DK');
    expect(getAppLanguage()).toBe('da');
  });

  it('falls back to English for locales without copy', () => {
    stubDeviceLocale('nl-NL');
    expect(getAppLanguage()).toBe('en');
  });
});
