/**
 * Cache locale (Stale-While-Revalidate) per punteggi Longevità/Progressione e referti salute.
 * Zero-latency cold start: idratazione immediata da localStorage prima dei fetch Firebase.
 */

const ENGINE_SNAPSHOT_PREFIX = 'kentu_engine_snapshot_';
const HEALTH_REPORT_PREFIX = 'kentu_health_report_';
const HEALTH_SCORES_INDEX_PREFIX = 'kentu_health_scores_index_';
const PROFILE_TARGETS_PREFIX = 'kentu_profile_targets_';

const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 giorni

function safeParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStorage(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return safeParse(window.localStorage.getItem(key));
}

function writeStorage(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[longevityBootstrapCache] write failed:', err);
  }
}

function isFresh(savedAt, maxAgeMs = MAX_AGE_MS) {
  const ts = Number(savedAt) || 0;
  if (!ts) return false;
  return Date.now() - ts < maxAgeMs;
}

function engineKey(uid) {
  return `${ENGINE_SNAPSHOT_PREFIX}${String(uid || '').trim()}`;
}

function healthReportKey(uid, analysisDate) {
  return `${HEALTH_REPORT_PREFIX}${String(uid || '').trim()}_${String(analysisDate || '').slice(0, 10)}`;
}

function healthScoresIndexKey(uid) {
  return `${HEALTH_SCORES_INDEX_PREFIX}${String(uid || '').trim()}`;
}

export function profileTargetsCacheKey(uid) {
  return `${PROFILE_TARGETS_PREFIX}${String(uid || '').trim()}`;
}

/** Snapshot Longevità + Progressione per data. */
export function readEngineSnapshot(uid, scoreDate) {
  const doc = readStorage(engineKey(uid));
  if (!doc || typeof doc !== 'object') return null;
  const date = String(scoreDate || doc.scoreDate || '').slice(0, 10);
  if (doc.scoreDate && doc.scoreDate !== date) return null;
  if (!isFresh(doc.savedAt)) return null;
  return doc;
}

export function writeEngineSnapshot(uid, scoreDate, payload = {}) {
  if (!uid || !scoreDate) return;
  writeStorage(engineKey(uid), {
    scoreDate: String(scoreDate).slice(0, 10),
    savedAt: Date.now(),
    longevityScore: payload.longevityScore ?? null,
    longevityResult: payload.longevityResult ?? null,
    longevityNutrition: payload.longevityNutrition ?? null,
    recentNutritionScores: Array.isArray(payload.recentNutritionScores)
      ? payload.recentNutritionScores
      : [],
    progressionScore: payload.progressionScore ?? null,
  });
}

/** Referto salute giornaliero (Firebase health_reports/{date}). */
export function readHealthReportCache(uid, analysisDate) {
  const doc = readStorage(healthReportKey(uid, analysisDate));
  if (!doc || typeof doc !== 'object') return null;
  if (!isFresh(doc.savedAt)) return null;
  return doc;
}

export function writeHealthReportCache(uid, analysisDate, payload = {}) {
  if (!uid || !analysisDate) return;
  writeStorage(healthReportKey(uid, analysisDate), {
    savedAt: Date.now(),
    report: payload.report ?? null,
    recentNutritionScores: Array.isArray(payload.recentNutritionScores)
      ? payload.recentNutritionScores
      : undefined,
  });
  if (Array.isArray(payload.recentNutritionScores)) {
    writeStorage(healthScoresIndexKey(uid), {
      savedAt: Date.now(),
      scores: payload.recentNutritionScores,
    });
  }
}

export function readHealthScoresIndexCache(uid) {
  const doc = readStorage(healthScoresIndexKey(uid));
  if (!doc || !Array.isArray(doc.scores) || !isFresh(doc.savedAt)) return null;
  return doc.scores;
}

export function readProfileTargetsCache(uid) {
  const doc = readStorage(profileTargetsCacheKey(uid));
  if (!doc || typeof doc !== 'object') return null;
  if (!isFresh(doc.savedAt, MAX_AGE_MS * 2)) return null;
  return doc.payload ?? doc;
}

export function writeProfileTargetsCache(uid, payload) {
  if (!uid || !payload || typeof payload !== 'object') return;
  writeStorage(profileTargetsCacheKey(uid), {
    savedAt: Date.now(),
    payload,
  });
}
