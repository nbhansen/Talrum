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

  it('keeps the choice for this page when storage is blocked', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    setLanguagePref('da');
    expect(getLanguagePref()).toBe('da');
  });
});

describe('getAppLanguage()', () => {
  it('returns the explicit pref regardless of device locale', () => {
    stubDeviceLocale('en-US');
    setLanguagePref('da');
    expect(getAppLanguage()).toBe('da');
  });

  it('does not read the device language when unset', () => {
    stubDeviceLocale('da-DK');
    expect(getAppLanguage()).toBe('en');
  });
});
