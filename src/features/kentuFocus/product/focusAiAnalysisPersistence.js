/**
 * Persistenza analisi AI Kentu Focus — multidispositivo per UID.
 * Path client sotto users/{uid}/… (compatibile con regole users esistenti).
 * Memory store per test; adapter RTDB reale via createFirebaseFocusAiAnalysisStore.
 *
 * Conservazione (client-side):
 * - ieri: 30 giorni
 * - settimana: 90 giorni
 * - mese: 365 giorni
 */

export const FOCUS_AI_ANALYSIS_RETENTION_DAYS = Object.freeze({
  ieri: 30,
  settimana: 90,
  mese: 365,
});

export const FOCUS_AI_ANALYSIS_ALLOWED_PERIODS = Object.freeze(['ieri', 'settimana', 'mese']);

/**
 * @param {string} uid
 * @param {string} periodId
 * @param {string} windowKey — tipicamente analysisDate
 */
export function focusAiAnalysisBasePath(uid, periodId, windowKey) {
  return `users/${uid}/kentu_focus_ai/${periodId}/${windowKey}`;
}

export function focusAiAnalysisIndexPath(uid) {
  return `users/${uid}/kentu_focus_ai_index`;
}

/**
 * @param {string} periodId
 * @param {number} generatedAtMs
 * @param {number} [nowMs]
 */
export function isFocusAiAnalysisExpired(periodId, generatedAtMs, nowMs = Date.now()) {
  const days = FOCUS_AI_ANALYSIS_RETENTION_DAYS[periodId] ?? 30;
  const ageDays = (nowMs - Number(generatedAtMs || 0)) / (24 * 60 * 60 * 1000);
  return ageDays > days;
}

/**
 * @param {object} record
 * @param {string} currentDataVersion
 */
export function markFocusAiAnalysisFreshness(record, currentDataVersion) {
  if (!record) return null;
  const stale = Boolean(
    currentDataVersion
    && record.dataVersion
    && String(record.dataVersion) !== String(currentDataVersion),
  );
  return {
    ...record,
    diaryStale: stale,
    freshnessNote: stale
      ? 'Analisi riferita a una versione precedente del diario: consultabile, non generata sui dati attuali.'
      : 'Allineata alla versione dati corrente al momento della generazione.',
  };
}

/**
 * Gate client prima di scrivere su RTDB/memory.
 * @param {string} uid
 * @param {string} periodId
 * @param {object} record
 */
export function assertFocusAiAnalysisWritable(uid, periodId, record) {
  if (!uid || !record || typeof record !== 'object') {
    return { ok: false, reason: 'invalid_record' };
  }
  if (!FOCUS_AI_ANALYSIS_ALLOWED_PERIODS.includes(String(periodId))) {
    return { ok: false, reason: 'invalid_period' };
  }
  if (record.notDemo !== true) {
    return { ok: false, reason: 'demo_forbidden' };
  }
  if (record.source !== 'kentu_focus_ai_coach') {
    return { ok: false, reason: 'invalid_source' };
  }
  if (record.notHealthReports !== true) {
    return { ok: false, reason: 'health_reports_forbidden' };
  }
  if (String(record.uid) !== String(uid)) {
    return { ok: false, reason: 'uid_mismatch' };
  }
  if (String(record.periodId) !== String(periodId)) {
    return { ok: false, reason: 'period_mismatch' };
  }
  if (!record.analysis || typeof record.analysis !== 'object') {
    return { ok: false, reason: 'missing_analysis' };
  }
  return { ok: true, reason: null };
}

/**
 * Firebase RTDB rifiuta `undefined`; normalizza a null / omit.
 * @param {unknown} value
 */
function sanitizeForRtdb(value) {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v)));
}

/**
 * Store in-memory condividibile fra «client» di test.
 */
export function createMemoryFocusAiAnalysisStore(seed = null) {
  /** @type {Map<string, object>} */
  const db = seed instanceof Map ? seed : new Map();

  return {
    kind: 'memory',
    _db: db,
    async saveRevision({ uid, periodId, windowKey, record }) {
      const gate = assertFocusAiAnalysisWritable(uid, periodId, record);
      if (!gate.ok) return { ok: false, reason: gate.reason, revisionId: null };
      const base = focusAiAnalysisBasePath(uid, periodId, windowKey);
      const revId = String(record.revisionId);
      db.set(`${base}/revisions/${revId}`, { ...record });
      db.set(`${base}/current`, {
        revisionId: revId,
        dataVersion: record.dataVersion,
        generatedAt: record.generatedAt,
        periodId,
        windowKey,
        windowLabel: record.windowLabel || null,
      });
      const indexKey = focusAiAnalysisIndexPath(uid);
      const index = db.get(indexKey) || {};
      index[`${periodId}_${windowKey}`] = {
        periodId,
        windowKey,
        revisionId: revId,
        dataVersion: record.dataVersion,
        generatedAt: record.generatedAt,
        windowLabel: record.windowLabel || null,
      };
      db.set(indexKey, index);
      return { ok: true, revisionId: revId };
    },
    async readCurrent({ uid, periodId, windowKey, currentDataVersion = null }) {
      const base = focusAiAnalysisBasePath(uid, periodId, windowKey);
      const cur = db.get(`${base}/current`);
      if (!cur?.revisionId) return { ok: false, reason: 'not_found', record: null };
      const record = db.get(`${base}/revisions/${cur.revisionId}`);
      if (!record) return { ok: false, reason: 'revision_missing', record: null };
      if (isFocusAiAnalysisExpired(periodId, record.generatedAt)) {
        return { ok: false, reason: 'expired', record: null };
      }
      return {
        ok: true,
        reason: null,
        record: markFocusAiAnalysisFreshness(record, currentDataVersion),
      };
    },
    async listIndex({ uid, periodId = null }) {
      const index = db.get(focusAiAnalysisIndexPath(uid)) || {};
      let rows = Object.values(index);
      if (periodId) rows = rows.filter((r) => r.periodId === periodId);
      rows = rows
        .filter((r) => !isFocusAiAnalysisExpired(r.periodId, r.generatedAt))
        .sort((a, b) => Number(b.generatedAt) - Number(a.generatedAt));
      return { ok: true, rows };
    },
    async readRevision({ uid, periodId, windowKey, revisionId, currentDataVersion = null }) {
      const base = focusAiAnalysisBasePath(uid, periodId, windowKey);
      const record = db.get(`${base}/revisions/${revisionId}`);
      if (!record) return { ok: false, reason: 'not_found', record: null };
      if (isFocusAiAnalysisExpired(periodId, record.generatedAt)) {
        return { ok: false, reason: 'expired', record: null };
      }
      return {
        ok: true,
        record: markFocusAiAnalysisFreshness(record, currentDataVersion),
      };
    },
  };
}

/** Store di default per test (condiviso nel processo). */
let defaultMemoryStore = createMemoryFocusAiAnalysisStore();

export function __resetFocusAiAnalysisPersistenceForTests() {
  defaultMemoryStore = createMemoryFocusAiAnalysisStore();
}

export function getDefaultMemoryFocusAiAnalysisStore() {
  return defaultMemoryStore;
}

/**
 * Adapter Firebase RTDB (client SDK). Usa ref/set/get iniettati.
 * @param {{ db: import('firebase/database').Database, ref: Function, set: Function, get: Function }} firebaseApi
 */
export function createFirebaseFocusAiAnalysisStore(firebaseApi) {
  if (!firebaseApi?.db || typeof firebaseApi.ref !== 'function'
    || typeof firebaseApi.set !== 'function' || typeof firebaseApi.get !== 'function') {
    throw new Error('createFirebaseFocusAiAnalysisStore: firebaseApi incompleto');
  }
  const { db, ref, set, get } = firebaseApi;

  return {
    kind: 'firebase',
    async saveRevision({ uid, periodId, windowKey, record }) {
      const gate = assertFocusAiAnalysisWritable(uid, periodId, record);
      if (!gate.ok) return { ok: false, reason: gate.reason, revisionId: null };
      const base = focusAiAnalysisBasePath(uid, periodId, windowKey);
      const revId = String(record.revisionId);
      const cleanRecord = sanitizeForRtdb(record);
      const current = sanitizeForRtdb({
        revisionId: revId,
        dataVersion: record.dataVersion,
        generatedAt: record.generatedAt,
        periodId,
        windowKey,
        windowLabel: record.windowLabel || null,
      });
      const indexRow = sanitizeForRtdb({
        periodId,
        windowKey,
        revisionId: revId,
        dataVersion: record.dataVersion,
        generatedAt: record.generatedAt,
        windowLabel: record.windowLabel || null,
      });
      try {
        await set(ref(db, `${base}/revisions/${revId}`), cleanRecord);
        await set(ref(db, `${base}/current`), current);
        await set(ref(db, `${focusAiAnalysisIndexPath(uid)}/${periodId}_${windowKey}`), indexRow);
        return { ok: true, revisionId: revId, reason: null };
      } catch (err) {
        return {
          ok: false,
          reason: 'network_error',
          revisionId: null,
          error: err?.message || String(err),
        };
      }
    },
    async readCurrent({ uid, periodId, windowKey, currentDataVersion = null }) {
      const base = focusAiAnalysisBasePath(uid, periodId, windowKey);
      try {
        const curSnap = await get(ref(db, `${base}/current`));
        if (!curSnap.exists()) return { ok: false, reason: 'not_found', record: null };
        const cur = curSnap.val();
        const revSnap = await get(ref(db, `${base}/revisions/${cur.revisionId}`));
        if (!revSnap.exists()) return { ok: false, reason: 'revision_missing', record: null };
        const record = revSnap.val();
        if (isFocusAiAnalysisExpired(periodId, record.generatedAt)) {
          return { ok: false, reason: 'expired', record: null };
        }
        return {
          ok: true,
          reason: null,
          record: markFocusAiAnalysisFreshness(record, currentDataVersion),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'network_error',
          record: null,
          error: err?.message || String(err),
        };
      }
    },
    async listIndex({ uid, periodId = null }) {
      try {
        const snap = await get(ref(db, focusAiAnalysisIndexPath(uid)));
        if (!snap.exists()) return { ok: true, rows: [], reason: null };
        let rows = Object.values(snap.val() || {});
        if (periodId) rows = rows.filter((r) => r.periodId === periodId);
        rows = rows
          .filter((r) => !isFocusAiAnalysisExpired(r.periodId, r.generatedAt))
          .sort((a, b) => Number(b.generatedAt) - Number(a.generatedAt));
        return { ok: true, rows, reason: null };
      } catch (err) {
        return {
          ok: false,
          rows: [],
          reason: 'network_error',
          error: err?.message || String(err),
        };
      }
    },
    async readRevision({ uid, periodId, windowKey, revisionId, currentDataVersion = null }) {
      const base = focusAiAnalysisBasePath(uid, periodId, windowKey);
      try {
        const snap = await get(ref(db, `${base}/revisions/${revisionId}`));
        if (!snap.exists()) return { ok: false, reason: 'not_found', record: null };
        const record = snap.val();
        if (isFocusAiAnalysisExpired(periodId, record.generatedAt)) {
          return { ok: false, reason: 'expired', record: null };
        }
        return {
          ok: true,
          record: markFocusAiAnalysisFreshness(record, currentDataVersion),
        };
      } catch (err) {
        return {
          ok: false,
          reason: 'network_error',
          record: null,
          error: err?.message || String(err),
        };
      }
    },
  };
}

/**
 * @param {object} binding
 * @param {object} analysis
 * @param {object} dossier
 * @param {number} [revisionSeq]
 */
export function buildFocusAiAnalysisRecord(binding, analysis, dossier, revisionSeq = 1) {
  const generatedAt = Date.now();
  const revisionId = `r${revisionSeq}_${generatedAt.toString(36)}`;
  return {
    schema: 'kentu.focusAiAnalysisRecord.v1',
    revisionId,
    revisionSeq,
    uid: binding.uid,
    periodId: binding.periodId,
    windowKey: binding.windowKey || binding.analysisDate,
    analysisDate: binding.analysisDate,
    publicationDate: binding.publicationDate,
    dataVersion: binding.dataVersion,
    windowLabel: dossier?.windowLabel || null,
    generatedAt,
    retentionDays: FOCUS_AI_ANALYSIS_RETENTION_DAYS[binding.periodId] ?? 30,
    analysis,
    dossierDigest: {
      schema: dossier?.schema || null,
      compassAvailable: Boolean(dossier?.compassSignals?.available),
      mealCount: (dossier?.nutrition?.meals || []).length,
      workoutCount: (dossier?.exercise?.workouts || []).length,
    },
    source: 'kentu_focus_ai_coach',
    notHealthReports: true,
    notDemo: true,
  };
}
