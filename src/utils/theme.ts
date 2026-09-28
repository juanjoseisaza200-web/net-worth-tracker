/**
 * Appearance preference (System / Light / Dark). Stored per device in
 * localStorage — like iOS, a phone and a laptop can differ — and applied as
 * `data-theme` on <html>, which index.css reads. "system" removes the
 * attribute so the prefers-color-scheme media query decides.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'net-worth-tracker-theme';

export const getThemePref = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

export const applyTheme = (pref: ThemePref): void => {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
};

export const setThemePref = (pref: ThemePref): void => {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Private mode / blocked storage: still apply for this session.
  }
  applyTheme(pref);
};
