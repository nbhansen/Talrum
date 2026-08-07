/**
 * Device-local app language (#304), stored per device like speechPrefs and pin.
 * Move it with them if settings ever become per-account.
 */

const STORAGE_KEY = 'talrum:language';

export const APP_LANGUAGES = ['en', 'da'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const isAppLanguage = (v: unknown): v is AppLanguage =>
  typeof v === 'string' && (APP_LANGUAGES as readonly string[]).includes(v);

/** Primary BCP-47 subtag, lowercased: 'da-DK', 'da_DK' (Android), 'da' → 'da'. */
export const primarySubtag = (lang: string): string => lang.toLowerCase().split(/[-_]/)[0] ?? '';

/** The explicit user choice, or null when following the device locale. */
export const getLanguagePref = (): AppLanguage | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isAppLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
};

/** null = follow the device locale again. */
export const setLanguagePref = (lang: AppLanguage | null): void => {
  try {
    if (lang === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore quota / privacy mode errors — feature is best-effort
  }
};

/**
 * Resolved language for kid-facing copy: explicit pref, else the device
 * locale when we have copy for it, else English.
 */
export const getAppLanguage = (): AppLanguage => {
  const pref = getLanguagePref();
  if (pref) return pref;
  const device = primarySubtag(navigator.language);
  return isAppLanguage(device) ? device : 'en';
};

/**
 * Not clamped to APP_LANGUAGES, unlike `getAppLanguage`: a voice can match any
 * device locale even where there is no copy for it.
 */
export const getVoiceLanguage = (): string =>
  getLanguagePref() ?? primarySubtag(navigator.language);
