/**
 * Carica il diario tracker dell'UID autenticato dai path RTDB già usati da Sala Comandi / Centro Analisi.
 * Non inventa dataOrigin:real: costruisce uno snapshot handoff solo dopo lettura riuscita.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { stashFocusDiaryForUser } from './focusDiaryHandoff.js';

/**
 * Data calendario locale YYYY-MM-DD (noon-safe via componenti locali).
 * @param {Date} [now]
 */
export function focusLocalIsoDate(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {object|null|undefined} profileRoot — users/{uid}/profile_targets
 * @returns {{ kcal: number|null, prot: number|null, carb: number|null, fat: number|null }|null}
 */
export function extractFocusUserTargetsFromProfile(profileRoot) {
  if (!profileRoot || typeof profileRoot !== 'object') return null;
  const targets = profileRoot.targets && typeof profileRoot.targets === 'object'
    ? profileRoot.targets
    : {};
  const profile = profileRoot.profile && typeof profileRoot.profile === 'object'
    ? profileRoot.profile
    : {};

  let kcal = targets.kcal != null ? Number(targets.kcal) : null;
  let prot = targets.prot != null
    ? Number(targets.prot)
    : (targets.protein != null ? Number(targets.protein) : null);
  let carb = targets.carb != null ? Number(targets.carb) : null;
  let fat = targets.fat != null ? Number(targets.fat) : null;

  if (profile.targetCalories != null && Number.isFinite(Number(profile.targetCalories))) {
    kcal = Math.round(Number(profile.targetCalories));
  }
  if (profile.proteinTarget != null && profile.proteinTarget !== ''
    && Number.isFinite(Number(profile.proteinTarget))) {
    prot = Math.round(Number(profile.proteinTarget));
  }

  if (kcal == null && prot == null && carb == null && fat == null) return null;
  return {
    kcal: Number.isFinite(kcal) ? Math.round(kcal) : null,
    prot: Number.isFinite(prot) ? Math.round(prot) : null,
    carb: Number.isFinite(carb) ? Math.round(carb) : null,
    fat: Number.isFinite(fat) ? Math.round(fat) : null,
  };
}

/**
 * Conta nodi giorno trackerStorico_* (esclude trackerFoodDatabase e simili).
 * @param {object} fullHistory
 */
export function countFocusTrackerDayNodes(fullHistory) {
  if (!fullHistory || typeof fullHistory !== 'object') return 0;
  return Object.keys(fullHistory).filter((k) => /^trackerStorico_\d{4}-\d{2}-\d{2}$/.test(k)).length;
}

/**
 * @param {{
 *   uid: string,
 *   get: Function,
 *   ref: Function,
 *   db: object,
 *   publicationDate?: string|null,
 *   analysisDate?: string|null,
 *   stash?: boolean,
 * }} input
 */
export async function loadFocusAuthenticatedDiary(input) {
  const uid = String(input?.uid || '').trim();
  if (!uid) {
    return {
      ok: false,
      status: 'unauthenticated',
      snapshot: null,
      error: null,
      dayNodeCount: 0,
    };
  }

  const get = input.get;
  const refFn = input.ref;
  const db = input.db;
  if (typeof get !== 'function' || typeof refFn !== 'function' || !db) {
    return {
      ok: false,
      status: 'no_database',
      snapshot: null,
      error: null,
      dayNodeCount: 0,
    };
  }

  try {
    const trackerSnap = await get(refFn(db, `users/${uid}/tracker_data`));
    const profileSnap = await get(refFn(db, `users/${uid}/profile_targets`));

    const rawTree = typeof trackerSnap?.val === 'function'
      ? (trackerSnap.exists?.() ? trackerSnap.val() : {})
      : (trackerSnap?.exists?.() ? trackerSnap.val() : (trackerSnap || {}));
    const fullHistory = rawTree && typeof rawTree === 'object' ? rawTree : {};

    const rawProfile = typeof profileSnap?.val === 'function'
      ? (profileSnap.exists?.() ? profileSnap.val() : null)
      : (profileSnap?.exists?.() ? profileSnap.val() : profileSnap);
    const userTargets = extractFocusUserTargetsFromProfile(rawProfile);

    const publicationDate = isIsoDateString(input.publicationDate)
      ? input.publicationDate
      : focusLocalIsoDate();
    const analysisDate = isIsoDateString(input.analysisDate)
      ? input.analysisDate
      : addCalendarDays(publicationDate, -1);

    const snapshot = {
      uid,
      fullHistory,
      analysisDate,
      publicationDate,
      userTargets,
      stashedAt: new Date().toISOString(),
      diarySource: 'firebase_tracker_data',
    };

    const dayNodeCount = countFocusTrackerDayNodes(fullHistory);
    if (input.stash !== false) {
      stashFocusDiaryForUser(uid, snapshot);
    }

    return {
      ok: true,
      status: dayNodeCount > 0 ? 'ready' : 'ready_empty',
      snapshot,
      error: null,
      dayNodeCount,
      diarySource: 'firebase_tracker_data',
    };
  } catch (err) {
    return {
      ok: false,
      status: 'read_error',
      snapshot: null,
      error: err,
      dayNodeCount: 0,
    };
  }
}
