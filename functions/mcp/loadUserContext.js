import path from 'node:path';
import { existsSync } from 'node:fs';
import { todayInRome } from './dates.js';

function resolveRepoRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'public', 'kentu_smart_master_db.json'))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), '..');
}

/**
 * Carica il contesto Focus per un uid (sola lettura Admin).
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
    db.ref(`users/${id}/cylinders/forza/enabled`).get(),
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

  const { loadFocusCatalogsFromPublic } = await import(
    '../../src/features/kentuFocus/product/loadFocusCatalogsNode.js'
  );
  const catalogs = await loadFocusCatalogsFromPublic(resolveRepoRoot());
  catalogs.personalDb = personalDb;

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
    forzaEnabled: forzaSnap.val() !== false,
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
