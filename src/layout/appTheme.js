export const APP_THEME_STORAGE_KEY = 'kentu_app_theme';

export const APP_THEMES = Object.freeze([
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'warm', label: 'Caldo', icon: '☀️' },
  { id: 'clinical', label: 'Clinico', icon: '⬜' },
]);

const THEME_IDS = new Set(APP_THEMES.map((theme) => theme.id));

export function isAppThemeId(value) {
  return THEME_IDS.has(value);
}

export function readStoredAppTheme() {
  try {
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    return isAppThemeId(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyAppTheme(themeId) {
  const next = isAppThemeId(themeId) ? themeId : 'dark';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', next);
  }
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, next);
  } catch {
    /* private mode / storage blocked */
  }
  return next;
}

export function cycleAppTheme(currentId) {
  const index = APP_THEMES.findIndex((theme) => theme.id === currentId);
  const next = APP_THEMES[(index + 1) % APP_THEMES.length];
  return applyAppTheme(next.id);
}
