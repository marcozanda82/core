import { todayInRome } from './dates.js';

function emptyCatalogs(personalDb = {}) {
  return {
    personalDb,
    kentuItDb: {},
    globalDb: {},
    offDb: {},
    offReady: false,
    offExcluded: true,
    warnings: [],
  };
}

/**
 * Carica il contesto Focus per un uid (sola lettura Admin).
 * I cataloghi CREA/USDA sono lazy e non bloccano il contesto se mancano:
 * pasti/notte restano leggibili dal diario.
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 */
export async function loadUserFocusContext(db, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid mancante');

  const [
    trackerSnap,
    profileSnap,
    dayStatusSnap,
    checkinSnap,
    forzaSnap,
  ] = await Promise.all([
    db.ref(`users/${id}/tracker_data`).get(),
    db.ref(`users/${id}/profile_targets`).get(),
    db.ref(`users/${id}/day_status`).get(),
    db.ref(`users/${id}/movement_checkin`).get(),
    db.ref(`users/${id}/cylinders/forza`).get(),
  ]);

  const tracker = trackerSnap.val() && typeof trackerSnap.val() === 'object'
    ? trackerSnap.val()
    : {};
  const personalDb = tracker.trackerFoodDatabase && typeof tracker.trackerFoodDatabase === 'object'
    ? tracker.trackerFoodDatabase
    : {};
  const fullHistory = { ...tracker };
  delete fullHistory.trackerFoodDatabase;

  const profile_targets = profileSnap.val() && typeof profileSnap.val() === 'object'
    ? profileSnap.val()
    : {};
  const userTargets = profile_targets.targets && typeof profile_targets.targets === 'object'
    ? profile_targets.targets
    : (profile_targets.profile || {});

  const warnings = [];
  let catalogs = emptyCatalogs(personalDb);
  try {
    const { loadServerCatalogs } = await import('./loadServerCatalogs.js');
    const loaded = await loadServerCatalogs();
    catalogs = {
      ...loaded,
      personalDb,
    };
    for (const w of loaded.warnings || []) warnings.push(w);
  } catch (error) {
    const msg = String(error?.message || error).slice(0, 160);
    warnings.push(
      `Cataloghi CREA/USDA non caricati (${msg}). `
      + 'Dettaglio pasti/notte dal diario; classificazione cibo limitata al DB personale.',
    );
    console.warn('[kentuMcp] catalogs degrade', msg);
    catalogs = emptyCatalogs(personalDb);
  }

  return {
    today: todayInRome(),
    fullHistory,
    userTargets,
    profile_targets,
    records: dayStatusSnap.val() && typeof dayStatusSnap.val() === 'object'
      ? dayStatusSnap.val()
      : {},
    movementCheckins: checkinSnap.val() && typeof checkinSnap.val() === 'object'
      ? checkinSnap.val()
      : {},
    catalogs,
    catalogWarnings: warnings,
    // Abilitata solo se esplicitamente true (nodo boolean o { enabled: true }).
    forzaEnabled: (() => {
      const raw = forzaSnap.val();
      if (raw === true) return true;
      if (raw && typeof raw === 'object' && raw.enabled === true) return true;
      return false;
    })(),
    personalDb,
  };
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {string} date
 */
export async function readStoredDayScore(db, uid, date) {
  const snap = await db.ref(`users/${uid}/focus_day_scores/${date}`).get();
  if (!snap.exists()) return null;
  const { decodeDayScoreFromRtdb } = await import(
    '../../src/features/kentuFocus/score/dayScoreRecord.js'
  );
  return decodeDayScoreFromRtdb(snap.val());
}
