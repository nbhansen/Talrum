/**
 * Device-local app language (#304), stored per device like speechPrefs and pin.
 * Move it with them if settings ever become per-account.
 */

const STORAGE_KEY = 'talrum:language';

const APP_LANGUAGES = ['en', 'da'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const isAppLanguage = (v: unknown): v is AppLanguage =>
  typeof v === 'string' && (APP_LANGUAGES as readonly string[]).includes(v);

/** Primary BCP-47 subtag, lowercased: 'da-DK', 'da_DK' (Android), 'da' → 'da'. */
export const primarySubtag = (lang: string): string => lang.toLowerCase().split(/[-_]/)[0] ?? '';

// Set only after a failed write, so the choice still applies for this page.
let pagePref: AppLanguage | null = null;

/** The parent's choice, or null before the first choice on this device. */
export const getLanguagePref = (): AppLanguage | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isAppLanguage(raw)) return raw;
  } catch {
    // Unreadable storage: use the page copy.
  }
  return pagePref;
};

export const setLanguagePref = (lang: AppLanguage): void => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
    pagePref = null;
  } catch {
    pagePref = lang;
  }
};

export const __resetLanguageForTests = (): void => {
  pagePref = null;
};

/**
 * The one language for kid copy, the reading voice and generated media. The
 * device locale never decides it; LanguageGate asks after sign-in (#745).
 * English covers the screens before that choice.
 */
export const getAppLanguage = (): AppLanguage => getLanguagePref() ?? 'en';
