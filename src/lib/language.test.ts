import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetLanguageForTests,
  getAppLanguage,
  getLanguagePref,
  setLanguagePref,
} from './language';

beforeEach(() => {
  __resetLanguageForTests();
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

  it('keeps the choice for this page when only the write fails (#747)', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    setLanguagePref('da');
    expect(getLanguagePref()).toBe('da');
  });

  it('lets a failed write of a new choice win over the stored choice', () => {
    setLanguagePref('en');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    setLanguagePref('da');
    expect(getLanguagePref()).toBe('da');
  });
});

describe('getAppLanguage()', () => {
  it('returns the stored choice', () => {
    setLanguagePref('da');
    expect(getAppLanguage()).toBe('da');
  });

  it('is English before a choice', () => {
    expect(getAppLanguage()).toBe('en');
  });
});
