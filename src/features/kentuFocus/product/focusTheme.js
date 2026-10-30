/**
 * Preferenza tema Focus: system | light | dark.
 * localStorage per anti-flash; RTDB users/{uid}/ui_preferences/focusTheme per sync dispositivi.
 * Legacy (migrato una volta): users/{uid}/profile_targets/profile/focusTheme
 */

export const FOCUS_THEME_LS_KEY = 'kentu_focus_theme';

/** @typedef {'system'|'light'|'dark'} FocusThemePreference */
/** @typedef {'light'|'dark'} FocusColorScheme */

/**
 * @param {string} uid
 * @returns {string}
 */
export function focusThemeRtdbPath(uid) {
  return `users/${uid}/ui_preferences/focusTheme`;
}

/**
 * Path legacy (pre-migrazione). Solo lettura + migrazione.
 * @param {string} uid
 * @returns {string}
 */
export function focusThemeLegacyRtdbPath(uid) {
  return `users/${uid}/profile_targets/profile/focusTheme`;
}

/**
 * @param {unknown} raw
 * @returns {FocusThemePreference|null}
 */
export function normalizeFocusTheme(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'system' || v === 'light' || v === 'dark') return v;
  return null;
}

/**
 * @returns {FocusThemePreference}
 */
export function readFocusThemeLocal() {
  try {
    if (typeof localStorage === 'undefined') return 'system';
    return normalizeFocusTheme(localStorage.getItem(FOCUS_THEME_LS_KEY)) || 'system';
  } catch {
    return 'system';
  }
}

/**
 * @param {FocusThemePreference} pref
 */
export function writeFocusThemeLocal(pref) {
  try {
    if (typeof localStorage === 'undefined') return;
    const n = normalizeFocusTheme(pref) || 'system';
    localStorage.setItem(FOCUS_THEME_LS_KEY, n);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @returns {FocusColorScheme}
 */
export function getSystemColorScheme() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
  } catch {
    /* ignore */
  }
  return 'dark';
}

/**
 * @param {FocusThemePreference} pref
 * @param {FocusColorScheme} systemScheme
 * @returns {FocusColorScheme}
 */
export function resolveFocusColorScheme(pref, systemScheme) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return systemScheme === 'light' ? 'light' : 'dark';
}

/**
 * Carica tema da RTDB; migra da path legacy se presente.
 * @param {{
 *   uid: string,
 *   get: Function,
 *   set: Function,
 *   ref: Function,
 *   db: object,
 * }} deps
 * @returns {Promise<FocusThemePreference|null>}
 */
export async function loadFocusThemeFromRtdb(deps) {
  const { uid, get: getFn, set: setFn, ref: refFn, db: database } = deps || {};
  if (!uid || !getFn || !refFn || !database) return null;

  try {
    const freshSnap = await getFn(refFn(database, focusThemeRtdbPath(uid)));
    const fresh = normalizeFocusTheme(freshSnap?.val?.() ?? freshSnap?.val);
    if (fresh) return fresh;
  } catch {
    /* fall through to legacy */
  }

  try {
    const legacySnap = await getFn(refFn(database, focusThemeLegacyRtdbPath(uid)));
    const legacy = normalizeFocusTheme(legacySnap?.val?.() ?? legacySnap?.val);
    if (!legacy) return null;

    if (typeof setFn === 'function') {
      try {
        await setFn(refFn(database, focusThemeRtdbPath(uid)), legacy);
      } catch {
        /* keep local migration even if remote write fails */
      }
      try {
        await setFn(refFn(database, focusThemeLegacyRtdbPath(uid)), null);
      } catch {
        /* legacy cleanup best-effort */
      }
    }
    return legacy;
  } catch {
    return null;
  }
}

/**
 * Scrive solo sul path nuovo (ui_preferences).
 * @param {{
 *   uid: string,
 *   pref: FocusThemePreference,
 *   set: Function,
 *   ref: Function,
 *   db: object,
 * }} deps
 * @returns {Promise<boolean>}
 */
export async function writeFocusThemeToRtdb(deps) {
  const { uid, pref, set: setFn, ref: refFn, db: database } = deps || {};
  const next = normalizeFocusTheme(pref);
  if (!uid || !next || !setFn || !refFn || !database) return false;
  try {
    await setFn(refFn(database, focusThemeRtdbPath(uid)), next);
    return true;
  } catch {
    return false;
  }
}
