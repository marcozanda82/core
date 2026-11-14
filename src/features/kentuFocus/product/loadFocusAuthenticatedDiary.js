/**
 * Carica il diario tracker dell'UID autenticato dai path RTDB già usati da Sala Comandi / Centro Analisi.
 * Non inventa dataOrigin:real: costruisce uno snapshot handoff solo dopo lettura riuscita.
 *
 * Apertura Focus: prima finestra recente (mese corrente ∪ ultimi 7 giorni) in parallelo col profilo;
 * il resto dello storico arriva in background senza bloccare il render.
 */

import { query, orderByKey, startAt, endAt } from 'firebase/database';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { stashFocusDiaryForUser } from './focusDiaryHandoff.js';
import { focusOpenPerfMark } from './focusOpenPerf.js';

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
 * Finestra iniziale Focus: mese corrente ∪ mese precedente (tab Mese = ultimo completo)
 * ∪ ultimi 7 giorni. Lo storico più vecchio arriva on-demand.
 * @param {string} [todayIso]
 */
export function focusRecentDiaryWindow(todayIso = focusLocalIsoDate()) {
  const today = isIsoDateString(todayIso) ? todayIso : focusLocalIsoDate();
  const monthStart = `${today.slice(0, 8)}01`;
  const weekFrom = addCalendarDays(today, -6);
  const [year, month] = today.split('-').map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const prevMonthStart = prev.toISOString().slice(0, 10);
  const from = [weekFrom, monthStart, prevMonthStart].sort()[0];
  return { from, to: today };
}

/**
 * Estende il diario già in RAM con un intervallo di date (orderByKey), senza scaricare tutto lo storico.
 * @param {{
 *   uid: string,
 *   get: Function,
 *   ref: Function,
 *   db: object,
 *   from: string,
 *   to: string,
 *   existingHistory?: object,
 *   stash?: boolean,
 *   userTargets?: object|null,
 *   profile_targets?: object|null,
 *   analysisDate?: string|null,
 *   publicationDate?: string|null,
 * }} input
 */
export async function loadFocusDiaryDateRange(input) {
  const uid = String(input?.uid || '').trim();
  const from = isIsoDateString(input?.from) ? input.from : null;
  const to = isIsoDateString(input?.to) ? input.to : null;
  if (!uid || !from || !to || typeof input?.get !== 'function' || typeof input?.ref !== 'function' || !input?.db) {
    return { ok: false, fullHistory: input?.existingHistory || {}, days: 0 };
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const trackerRoot = input.ref(input.db, `users/${uid}/tracker_data`);
    const startKey = `trackerStorico_${from}`;
    const endKey = `trackerStorico_${to}\uf8ff`;
    let chunk = {};
    try {
      const rangeQuery = query(trackerRoot, orderByKey(), startAt(startKey), endAt(endKey));
      const snap = await input.get(rangeQuery);
      chunk = snapVal(snap) || {};
    } catch {
      const snap = await input.get(trackerRoot);
      const all = snapVal(snap) || {};
      chunk = {};
      for (const [key, value] of Object.entries(all)) {
        const m = /^trackerStorico_(\d{4}-\d{2}-\d{2})$/.exec(key);
        if (!m) {
          if (key === 'trackerFoodDatabase') chunk[key] = value;
          continue;
        }
        if (m[1] >= from && m[1] <= to) chunk[key] = value;
      }
    }
    const merged = {
      ...(input.existingHistory && typeof input.existingHistory === 'object' ? input.existingHistory : {}),
      ...chunk,
    };
    const days = countFocusTrackerDayNodes(chunk);
    focusOpenPerfMark('rtdb_diary_range', {
      from,
      to,
      days,
      ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
    });
    if (input.stash !== false) {
      stashFocusDiaryForUser(uid, {
        fullHistory: merged,
        analysisDate: input.analysisDate || to,
        publicationDate: input.publicationDate || focusLocalIsoDate(),
        userTargets: input.userTargets || null,
        profile_targets: input.profile_targets || null,
        diarySource: 'firebase_tracker_data',
        partial: true,
      });
    }
    return { ok: true, fullHistory: merged, days };
  } catch {
    focusOpenPerfMark('rtdb_diary_range_error', { from, to });
    return { ok: false, fullHistory: input?.existingHistory || {}, days: 0 };
  }
}

function snapVal(snap) {
  if (!snap) return null;
  if (typeof snap.val === 'function') {
    return snap.exists?.() ? snap.val() : null;
  }
  return snap.exists?.() ? snap.val() : snap;
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
 *   mode?: 'recent'|'full',
 *   onBackgroundFull?: (snapshot: object) => void,
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

  const mode = input.mode === 'full' ? 'full' : 'recent';
  const publicationDate = isIsoDateString(input.publicationDate)
    ? input.publicationDate
    : focusLocalIsoDate();
  const analysisDate = isIsoDateString(input.analysisDate)
    ? input.analysisDate
    : addCalendarDays(publicationDate, -1);

  try {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const profileRef = refFn(db, `users/${uid}/profile_targets`);
    const trackerRoot = refFn(db, `users/${uid}/tracker_data`);

    let fullHistory = {};
    let rawProfile = null;
    let requests = 0;
    let parallel = true;
    let sequence = [];

    if (mode === 'full' || typeof query !== 'function') {
      sequence = ['users/{uid}/tracker_data', 'users/{uid}/profile_targets'];
      requests = 2;
      const [trackerSnap, profileSnap] = await Promise.all([
        get(trackerRoot),
        get(profileRef),
      ]);
      const rawTree = snapVal(trackerSnap) || {};
      fullHistory = rawTree && typeof rawTree === 'object' ? rawTree : {};
      rawProfile = snapVal(profileSnap);
    } else {
      const window = focusRecentDiaryWindow(publicationDate);
      const startKey = `trackerStorico_${window.from}`;
      const endKey = `trackerStorico_${window.to}\uf8ff`;
      sequence = [
        'users/{uid}/profile_targets',
        `tracker_data orderByKey ${window.from}…${window.to}`,
        'tracker_data/trackerFoodDatabase',
      ];
      requests = 3;
      let recentSnap;
      let foodDbSnap;
      let profileSnap;
      try {
        const recentQuery = query(trackerRoot, orderByKey(), startAt(startKey), endAt(endKey));
        [profileSnap, recentSnap, foodDbSnap] = await Promise.all([
          get(profileRef),
          get(recentQuery),
          get(refFn(db, `users/${uid}/tracker_data/trackerFoodDatabase`)),
        ]);
      } catch {
        // Emulator/harness senza indici: fallback al tree intero in parallelo.
        parallel = true;
        sequence = ['users/{uid}/tracker_data (fallback)', 'users/{uid}/profile_targets'];
        requests = 2;
        const [trackerSnap, profileSnapFb] = await Promise.all([
          get(trackerRoot),
          get(profileRef),
        ]);
        const rawTree = snapVal(trackerSnap) || {};
        fullHistory = rawTree && typeof rawTree === 'object' ? rawTree : {};
        rawProfile = snapVal(profileSnapFb);
        recentSnap = null;
        foodDbSnap = null;
        profileSnap = profileSnapFb;
      }

      if (recentSnap) {
        const recentTree = snapVal(recentSnap) || {};
        fullHistory = recentTree && typeof recentTree === 'object' ? { ...recentTree } : {};
        const foodDb = snapVal(foodDbSnap);
        if (foodDb && typeof foodDb === 'object') {
          fullHistory.trackerFoodDatabase = foodDb;
        }
        rawProfile = snapVal(profileSnap);
      }
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const userTargets = extractFocusUserTargetsFromProfile(rawProfile);
    const dayNodeCount = countFocusTrackerDayNodes(fullHistory);
    const partial = mode === 'recent' && dayNodeCount > 0;

    focusOpenPerfMark('rtdb_diary_read', {
      requests,
      parallel,
      sequence,
      totalMs: Math.round(t1 - t0),
      days: dayNodeCount,
      mode,
      partial,
    });

    const snapshot = {
      uid,
      fullHistory,
      analysisDate,
      publicationDate,
      userTargets,
      profile_targets: rawProfile && typeof rawProfile === 'object' ? rawProfile : null,
      stashedAt: new Date().toISOString(),
      diarySource: 'firebase_tracker_data',
      partial,
    };

    if (input.stash !== false) {
      stashFocusDiaryForUser(uid, snapshot);
    }

    // Non scaricare tutto lo storico (centinaia di giorni) in apertura:
    // blocca il main thread su snap.val(). Estensioni on-demand via loadFocusDiaryDateRange.

    return {
      ok: true,
      status: dayNodeCount > 0 ? 'ready' : 'ready_empty',
      snapshot,
      error: null,
      dayNodeCount,
      diarySource: 'firebase_tracker_data',
      partial,
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
