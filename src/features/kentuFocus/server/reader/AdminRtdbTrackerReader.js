/**
 * Lettore Admin RTDB Focus — accessi puntuali:
 * - trackerStorico_YYYY-MM-DD
 * - users/{uid}/profile_targets (1 get)
 * - users/{uid}/body_metrics (1 get)
 * Nessuna scansione di users/{uid}. Contatori letture/byte tracciabili.
 */

import {
  FOCUS_TRACKER_MAX_HISTORY_DAYS,
  trackerDayPath,
} from '../paths/trackerRtdbPaths.js';
import { bodyMetricsRootPath, profileTargetsPath } from '../paths/userDataRtdbPaths.js';
import {
  resolveFocusBodyWeight,
  resolveFocusTargetsFromProfile,
} from './resolveFocusProfileData.js';

/**
 * @param {unknown} value
 */
export function approxJsonBytes(value) {
  if (value == null) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}

function emptyStats(maxHistoryDays) {
  return {
    reads: 0,
    approxBytes: 0,
    missingDays: 0,
    presentDays: 0,
    profileReads: 0,
    bodyMetricsReads: 0,
    maxHistoryDays,
  };
}

/**
 * @param {import('firebase-admin/database').Database} db
 */
export class AdminRtdbTrackerReader {
  /**
   * @param {import('firebase-admin/database').Database} db
   * @param {{ maxHistoryDays?: number }} [opts]
   */
  constructor(db, opts = {}) {
    if (!db) throw new Error('AdminRtdbTrackerReader: db richiesto');
    this.db = db;
    this.maxHistoryDays = Number.isFinite(opts.maxHistoryDays)
      ? Math.min(FOCUS_TRACKER_MAX_HISTORY_DAYS, Math.max(1, opts.maxHistoryDays))
      : FOCUS_TRACKER_MAX_HISTORY_DAYS;
    this.stats = emptyStats(this.maxHistoryDays);
  }

  resetStats() {
    this.stats = emptyStats(this.maxHistoryDays);
  }

  /**
   * @param {string} uid
   * @param {string} dateStr
   * @returns {Promise<object|null>}
   */
  async getDayNode(uid, dateStr) {
    const path = trackerDayPath(uid, dateStr);
    const snap = await this.db.ref(path).once('value');
    this.stats.reads += 1;
    const val = snap.val();
    this.stats.approxBytes += approxJsonBytes(val);
    if (val == null) this.stats.missingDays += 1;
    else this.stats.presentDays += 1;
    return val && typeof val === 'object' ? val : null;
  }

  /**
   * @param {string} uid
   * @param {string[]} dates
   */
  async getDayNodes(uid, dates) {
    const map = new Map();
    const unique = [...new Set(dates.filter(Boolean))];
    for (const d of unique) {
      // eslint-disable-next-line no-await-in-loop
      map.set(d, await this.getDayNode(uid, d));
    }
    return map;
  }

  /**
   * Singolo get di profile_targets (non l’intero users/{uid}).
   * @param {string} uid
   */
  async getProfileTargets(uid) {
    const snap = await this.db.ref(profileTargetsPath(uid)).once('value');
    this.stats.reads += 1;
    this.stats.profileReads += 1;
    const val = snap.val();
    this.stats.approxBytes += approxJsonBytes(val);
    return val && typeof val === 'object' ? val : null;
  }

  /**
   * Singolo get del nodo body_metrics (mappa pushId → entry).
   * @param {string} uid
   */
  async getBodyMetrics(uid) {
    const snap = await this.db.ref(bodyMetricsRootPath(uid)).once('value');
    this.stats.reads += 1;
    this.stats.bodyMetricsReads += 1;
    const val = snap.val();
    this.stats.approxBytes += approxJsonBytes(val);
    return val && typeof val === 'object' ? val : null;
  }

  /**
   * Contesto utente per dossier: target + peso con provenienza.
   * Override espliciti (pipeline) vincono se forniti.
   * @param {string} uid
   * @param {string} analysisDate
   * @param {{
   *   targetsOverride?: object|null,
   *   bodyWeightKgOverride?: number|null,
   *   bodyMeasuredOnOverride?: string|null,
   * }} [overrides]
   */
  async loadFocusUserContext(uid, analysisDate, overrides = {}) {
    const profileTargets = await this.getProfileTargets(uid);
    const bodyMetrics = await this.getBodyMetrics(uid);
    const profile = profileTargets?.profile || null;

    const fromProfile = resolveFocusTargetsFromProfile(profileTargets, analysisDate);
    const fromBody = resolveFocusBodyWeight(bodyMetrics, profile, analysisDate);

    const hasTargetOverride = overrides.targetsOverride != null
      && typeof overrides.targetsOverride === 'object';
    const hasWeightOverride = overrides.bodyWeightKgOverride != null
      && Number(overrides.bodyWeightKgOverride) > 0;

    return {
      targets: hasTargetOverride ? overrides.targetsOverride : fromProfile.targets,
      bodyWeightKg: hasWeightOverride
        ? Number(overrides.bodyWeightKgOverride)
        : fromBody.bodyWeightKg,
      bodyMeasuredOn: hasWeightOverride
        ? (overrides.bodyMeasuredOnOverride ?? null)
        : fromBody.bodyMeasuredOn,
      targetsProvenance: hasTargetOverride
        ? { kcal: 'recorded', proteinG: 'recorded', source: 'pipeline_override', conflict: null }
        : fromProfile.provenance,
      bodyProvenance: hasWeightOverride
        ? { provenance: 'recorded', source: 'pipeline_override', conflict: null }
        : {
          provenance: fromBody.provenance,
          source: fromBody.source,
          conflict: fromBody.conflict,
        },
      diagnostics: {
        targets: fromProfile.diagnostics,
        body: fromBody.diagnostics,
        overrides: {
          targets: hasTargetOverride,
          bodyWeight: hasWeightOverride,
        },
      },
    };
  }

  getStats() {
    return { ...this.stats, maxHistoryDays: this.maxHistoryDays };
  }
}

/**
 * Twin in-memory per test offline (stessa interfaccia).
 */
export class MemoryTrackerReader {
  /**
   * @param {Record<string, object|null>} daysByDate
   * @param {{
   *   maxHistoryDays?: number,
   *   profileTargets?: object|null,
   *   bodyMetrics?: object|null,
   * }} [opts]
   */
  constructor(daysByDate = {}, opts = {}) {
    this.daysByDate = daysByDate;
    this.profileTargets = opts.profileTargets ?? null;
    this.bodyMetrics = opts.bodyMetrics ?? null;
    this.maxHistoryDays = Number.isFinite(opts.maxHistoryDays)
      ? Math.min(FOCUS_TRACKER_MAX_HISTORY_DAYS, Math.max(1, opts.maxHistoryDays))
      : FOCUS_TRACKER_MAX_HISTORY_DAYS;
    this.stats = emptyStats(this.maxHistoryDays);
  }

  resetStats() {
    this.stats = emptyStats(this.maxHistoryDays);
  }

  async getDayNode(_uid, dateStr) {
    this.stats.reads += 1;
    const val = this.daysByDate[dateStr] ?? null;
    this.stats.approxBytes += approxJsonBytes(val);
    if (val == null) this.stats.missingDays += 1;
    else this.stats.presentDays += 1;
    return val;
  }

  async getDayNodes(uid, dates) {
    const map = new Map();
    for (const d of new Set(dates.filter(Boolean))) {
      // eslint-disable-next-line no-await-in-loop
      map.set(d, await this.getDayNode(uid, d));
    }
    return map;
  }

  async getProfileTargets() {
    this.stats.reads += 1;
    this.stats.profileReads += 1;
    this.stats.approxBytes += approxJsonBytes(this.profileTargets);
    return this.profileTargets;
  }

  async getBodyMetrics() {
    this.stats.reads += 1;
    this.stats.bodyMetricsReads += 1;
    this.stats.approxBytes += approxJsonBytes(this.bodyMetrics);
    return this.bodyMetrics;
  }

  async loadFocusUserContext(uid, analysisDate, overrides = {}) {
    const profileTargets = await this.getProfileTargets(uid);
    const bodyMetrics = await this.getBodyMetrics(uid);
    const profile = profileTargets?.profile || null;
    const fromProfile = resolveFocusTargetsFromProfile(profileTargets, analysisDate);
    const fromBody = resolveFocusBodyWeight(bodyMetrics, profile, analysisDate);

    const hasTargetOverride = overrides.targetsOverride != null
      && typeof overrides.targetsOverride === 'object';
    const hasWeightOverride = overrides.bodyWeightKgOverride != null
      && Number(overrides.bodyWeightKgOverride) > 0;

    return {
      targets: hasTargetOverride ? overrides.targetsOverride : fromProfile.targets,
      bodyWeightKg: hasWeightOverride
        ? Number(overrides.bodyWeightKgOverride)
        : fromBody.bodyWeightKg,
      bodyMeasuredOn: hasWeightOverride
        ? (overrides.bodyMeasuredOnOverride ?? null)
        : fromBody.bodyMeasuredOn,
      targetsProvenance: hasTargetOverride
        ? { kcal: 'recorded', proteinG: 'recorded', source: 'pipeline_override', conflict: null }
        : fromProfile.provenance,
      bodyProvenance: hasWeightOverride
        ? { provenance: 'recorded', source: 'pipeline_override', conflict: null }
        : {
          provenance: fromBody.provenance,
          source: fromBody.source,
          conflict: fromBody.conflict,
        },
      diagnostics: {
        targets: fromProfile.diagnostics,
        body: fromBody.diagnostics,
        overrides: { targets: hasTargetOverride, bodyWeight: hasWeightOverride },
      },
    };
  }

  getStats() {
    return { ...this.stats, maxHistoryDays: this.maxHistoryDays };
  }
}
