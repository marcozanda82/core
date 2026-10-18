/**
 * Risoluzione pura target/peso per Focus (I4-G) — nessuna dipendenza React/coreEngine.
 *
 * Precedenza target (per analysisDate):
 * 1. Solo voci di targetHistory con effectiveDate (o timestamp→data) verificabile ≤ analysisDate.
 * 2. Nessun merge da targets.kcal/prot “correnti” come base storica.
 * 3. profile.targetCalories / proteinTarget: senza data → NON storicamente validi
 *    (solo conflitto diagnostico se differiscono dal risultato storico).
 * 4. Se nessuna storia datata → missing (niente default inventati).
 *
 * Peso:
 * 1. Preferire body_metrics con date ≤ analysisDate.
 * 2. Conservare measuredOn; flag sameDay vs lastAvailable.
 * 3. profile.weight: NON attribuito al giorno analizzato (solo diagnostica).
 */

import { isIsoDateString } from '../../normalize/focusDateUtils.js';
import { finiteNumber } from '../../normalize/logUtils.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} value
 */
function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const iso = value.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Data verificabile da entry — senza fallback silenzioso ad analysisDate.
 * @param {{ date?: unknown, effectiveDate?: unknown, timestamp?: unknown }} entry
 */
export function resolveVerifiableDate(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = typeof entry.effectiveDate === 'string'
    ? entry.effectiveDate.trim().slice(0, 10)
    : (typeof entry.date === 'string' ? entry.date.trim().slice(0, 10) : '');
  if (isValidIsoDate(candidate)) return candidate;
  const ts = Number(entry.timestamp);
  if (Number.isFinite(ts) && ts > 0) {
    const fromTs = new Date(ts).toISOString().slice(0, 10);
    if (isValidIsoDate(fromTs)) return fromTs;
  }
  return null;
}

/**
 * Timeline datata fino a analysisDate (incluso). Nessuna base da targets correnti.
 * @param {object|null|undefined} targetsNode
 * @param {string} analysisDate
 */
export function resolveTargetsForAnalysisDate(targetsNode, analysisDate) {
  if (!isIsoDateString(analysisDate)) {
    return {
      resolved: {},
      timelineApplied: 0,
      lastEffectiveDate: null,
      skippedUndated: 0,
    };
  }
  const history = Array.isArray(targetsNode?.targetHistory) ? targetsNode.targetHistory : [];
  let skippedUndated = 0;
  const timeline = history
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const effectiveDate = resolveVerifiableDate(entry);
      if (!effectiveDate) {
        skippedUndated += 1;
        return null;
      }
      return {
        effectiveDate,
        targets: entry.targets && typeof entry.targets === 'object' ? entry.targets : {},
        source: entry.source || 'targetHistory',
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));

  /** @type {Record<string, unknown>} */
  let resolved = {};
  let timelineApplied = 0;
  /** @type {string|null} */
  let lastEffectiveDate = null;
  for (const entry of timeline) {
    if (entry.effectiveDate > analysisDate) break;
    resolved = { ...resolved, ...entry.targets };
    timelineApplied += 1;
    lastEffectiveDate = entry.effectiveDate;
  }
  return { resolved, timelineApplied, lastEffectiveDate, skippedUndated };
}

/**
 * @param {object|null|undefined} profileTargetsRoot
 * @param {string} analysisDate
 */
export function resolveFocusTargetsFromProfile(profileTargetsRoot, analysisDate) {
  const root = profileTargetsRoot && typeof profileTargetsRoot === 'object'
    ? profileTargetsRoot
    : null;
  if (!root) {
    return {
      targets: null,
      provenance: {
        kcal: 'missing',
        proteinG: 'missing',
        kcalSource: null,
        proteinSource: null,
        referenceDate: null,
        conflict: null,
      },
      diagnostics: { reason: 'profile_targets_absent', policy: 'i4g_dated_history_only' },
    };
  }

  const profile = root.profile && typeof root.profile === 'object' ? root.profile : {};
  const {
    resolved,
    timelineApplied,
    lastEffectiveDate,
    skippedUndated,
  } = resolveTargetsForAnalysisDate(root.targets, analysisDate);

  let kcal = finiteNumber(resolved.kcal ?? resolved.targetKcal);
  let proteinG = finiteNumber(resolved.prot ?? resolved.proteinG);

  if (kcal != null && !(kcal > 0)) kcal = null;
  if (proteinG != null && !(proteinG > 0)) proteinG = null;

  // Override profilo senza data: NON applicati come valori storici
  const profileKcal = finiteNumber(profile.targetCalories);
  const profileProt = finiteNumber(profile.proteinTarget);
  const currentKcal = finiteNumber(root.targets?.kcal ?? root.targets?.targetKcal);
  const currentProt = finiteNumber(root.targets?.prot ?? root.targets?.proteinG);

  /** @type {string[]} */
  const conflict = [];
  if (skippedUndated > 0) {
    conflict.push('targetHistory_undated_entries_skipped');
  }
  if (
    timelineApplied > 0
    && profileKcal != null && profileKcal > 0
    && kcal != null
    && Math.abs(profileKcal - kcal) >= 50
  ) {
    conflict.push('undated_profile.targetCalories_vs_historical');
  }
  if (
    timelineApplied > 0
    && profileProt != null && profileProt > 0
    && proteinG != null
    && Math.abs(profileProt - proteinG) >= 10
  ) {
    conflict.push('undated_profile.proteinTarget_vs_historical');
  }
  if (
    timelineApplied === 0
    && (
      (profileKcal != null && profileKcal > 0)
      || (currentKcal != null && currentKcal > 0)
      || (profileProt != null && profileProt > 0)
      || (currentProt != null && currentProt > 0)
    )
  ) {
    conflict.push('only_undated_current_targets_available');
  }

  if (timelineApplied === 0) {
    return {
      targets: null,
      provenance: {
        kcal: 'missing',
        proteinG: 'missing',
        kcalSource: null,
        proteinSource: null,
        referenceDate: null,
        conflict: conflict.length ? conflict : null,
      },
      diagnostics: {
        reason: 'no_dated_target_history_for_analysisDate',
        policy: 'i4g_dated_history_only',
        skippedUndated,
        undatedProfileKcal: profileKcal,
        undatedCurrentKcal: currentKcal,
      },
    };
  }

  return {
    targets: (kcal != null || proteinG != null)
      ? {
        ...(kcal != null ? { kcal: Math.round(kcal) } : {}),
        ...(proteinG != null ? { proteinG: Math.round(proteinG) } : {}),
      }
      : null,
    provenance: {
      kcal: kcal != null ? 'recorded' : 'missing',
      proteinG: proteinG != null ? 'recorded' : 'missing',
      kcalSource: kcal != null ? 'targets.targetHistory' : null,
      proteinSource: proteinG != null ? 'targets.targetHistory' : null,
      referenceDate: lastEffectiveDate,
      conflict: conflict.length ? conflict : null,
    },
    diagnostics: {
      timelineApplied,
      lastEffectiveDate,
      skippedUndated,
      policy: 'i4g_dated_history_only',
    },
  };
}

/**
 * @param {Record<string, object>|object[]|null|undefined} bodyMetrics
 * @param {object|null|undefined} profile
 * @param {string} analysisDate
 */
export function resolveFocusBodyWeight(bodyMetrics, profile, analysisDate) {
  const entries = normalizeBodyMetricsList(bodyMetrics);
  const eligible = entries
    .filter((e) => e.date && e.date <= analysisDate)
    .filter((e) => e.weight != null && e.weight > 0);

  eligible.sort((a, b) => {
    const d = String(b.date).localeCompare(String(a.date));
    if (d !== 0) return d;
    return (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
  });

  const futureIgnored = entries.filter((e) => e.date && e.date > analysisDate).length;
  const best = eligible[0] || null;
  const profileWeight = finiteNumber(profile?.weight);
  const profileOk = profileWeight != null && profileWeight > 0;

  /** @type {string|null} */
  let conflict = null;
  if (best && profileOk && Math.abs(best.weight - profileWeight) >= 2) {
    conflict = 'body_metrics_vs_profile.weight';
  }

  if (best) {
    const sameDay = best.date === analysisDate;
    return {
      bodyWeightKg: best.weight,
      bodyMeasuredOn: best.date,
      provenance: 'recorded',
      source: 'body_metrics',
      attribution: sameDay ? 'recorded_on_analysis_date' : 'last_available_on_or_before',
      conflict,
      profileWeightKg: profileOk ? profileWeight : null,
      diagnostics: {
        entriesConsidered: eligible.length,
        futureIgnored,
        sameDay,
      },
    };
  }

  // profile.weight: disponibile ma NON attribuito al giorno analizzato
  return {
    bodyWeightKg: null,
    bodyMeasuredOn: null,
    provenance: 'missing',
    source: null,
    attribution: profileOk ? 'profile_weight_not_attributed_to_day' : 'missing',
    conflict: null,
    profileWeightKg: profileOk ? profileWeight : null,
    diagnostics: {
      entriesConsidered: 0,
      futureIgnored,
      reason: profileOk
        ? 'profile_weight_undated_not_used_for_analysis_day'
        : 'no_positive_weight',
    },
  };
}

/**
 * @param {unknown} raw
 */
function normalizeBodyMetricsList(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter((e) => e && typeof e === 'object')
    .map((entry) => {
      const date = resolveVerifiableDate(entry);
      const weight = finiteNumber(entry.weight);
      return {
        date,
        timestamp: Number(entry.timestamp) || 0,
        weight: weight != null && weight > 0 ? weight : null,
      };
    })
    .filter((e) => e.date);
}

/** Documentazione macchina della policy I4-G. */
export const FOCUS_TARGET_WEIGHT_POLICY = Object.freeze({
  targets: [
    'targetHistory con effectiveDate|timestamp verificabile ≤ analysisDate',
    'nessuna base da targets correnti non datati',
    'profile.targetCalories/proteinTarget senza data → non storici',
    'assenza storia datata → missing',
  ],
  weight: [
    'body_metrics date ≤ analysisDate',
    'attribution: recorded_on_analysis_date | last_available_on_or_before',
    'profile.weight non attribuito al giorno',
    'mai zero silenzioso',
  ],
});
