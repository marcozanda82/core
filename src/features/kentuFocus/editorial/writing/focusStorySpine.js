/**
 * storySpine — fatti centrali autorizzati per centerpiece (P6.6.2).
 * Gemini non seleziona notizie: deve preservare il fatto principale.
 *
 * Distingue: media di livello, Δ, periodi, copertura — tutti già autorizzati.
 * Il validatore richiede solo il fatto principale (Δ/path), non ogni collaterale.
 */

import { normalizeCautionText } from './focusCautionContract.js';

/**
 * @param {object} item — news item / candidate
 * @param {object} spine
 */
export function attachStorySpine(item, spine) {
  if (!item || !spine?.mainFactId || !spine?.mainMetricPath) return item;
  return {
    ...item,
    storySpine: freezeSpine(spine),
  };
}

function freezeSpine(spine) {
  return {
    mainFactId: spine.mainFactId,
    mainMetricPath: spine.mainMetricPath,
    mainMetricValue: spine.mainMetricValue,
    mainUnit: spine.mainUnit ?? null,
    periodFrom: spine.periodFrom || null,
    periodTo: spine.periodTo || null,
    comparisonFrom: spine.comparisonFrom || null,
    comparisonTo: spine.comparisonTo || null,
    /** Media di livello (es. 145.06 g) — distinta dal Δ. */
    levelMetricPath: spine.levelMetricPath || null,
    levelMetricValue: spine.levelMetricValue ?? null,
    levelUnit: spine.levelUnit ?? null,
    /** Copertura alimentare equivalente (es. 7 giorni). */
    coverageMetricPath: spine.coverageMetricPath || null,
    coverageMetricValue: spine.coverageMetricValue ?? null,
    coverageUnit: spine.coverageUnit ?? null,
    essentialContextIds: Array.isArray(spine.essentialContextIds)
      ? spine.essentialContextIds
      : [],
  };
}

/**
 * Costruisce spine da dominantFact + finestre (week/month composers).
 */
export function buildCenterpieceStorySpine({
  scale,
  dominant,
  agg,
  comparison,
}) {
  if (!dominant?.fact || !agg) return null;
  const theme = dominant.theme || 'story';
  const metric = dominant.fact.metric || null;
  let mainMetricPath = null;
  let mainMetricValue = dominant.fact.absoluteDelta ?? dominant.fact.current ?? null;
  let mainUnit = null;
  let levelMetricPath = null;
  let levelMetricValue = null;
  let levelUnit = null;

  if (metric === 'avgProteinG' && dominant.fact.absoluteDelta != null) {
    mainMetricPath = `edition.${scale}.comparison.deltas.avgProteinG`;
    mainMetricValue = dominant.fact.absoluteDelta;
    mainUnit = 'g';
    levelMetricPath = `edition.${scale}.nutrition.avgProteinG`;
    levelMetricValue = dominant.fact.current ?? agg.nutrition?.avgProteinG ?? null;
    levelUnit = 'g';
  } else if (metric === 'avgKcal' && dominant.fact.absoluteDelta != null) {
    mainMetricPath = `edition.${scale}.comparison.deltas.avgKcal`;
    mainMetricValue = dominant.fact.absoluteDelta;
    mainUnit = 'kcal';
    levelMetricPath = `edition.${scale}.nutrition.avgKcal`;
    levelMetricValue = dominant.fact.current ?? agg.nutrition?.avgKcal ?? null;
    levelUnit = 'kcal';
  } else if (metric === 'strengthDaysLogged' && dominant.fact.absoluteDelta != null) {
    mainMetricPath = `edition.${scale}.comparison.deltas.strengthDaysLogged`;
    mainMetricValue = dominant.fact.absoluteDelta;
    mainUnit = 'days';
    levelMetricPath = `edition.${scale}.activity.strengthDaysLogged`;
    levelMetricValue = dominant.fact.current ?? agg.activity?.strengthDaysLogged ?? null;
    levelUnit = 'days';
  } else if (metric === 'avgSleepHours' && dominant.fact.absoluteDelta != null) {
    mainMetricPath = `edition.${scale}.comparison.deltas.avgSleepHours`;
    mainMetricValue = dominant.fact.absoluteDelta;
    mainUnit = 'h';
    levelMetricPath = `edition.${scale}.sleep.avgHours`;
    levelMetricValue = dominant.fact.current ?? agg.sleep?.avgHours ?? null;
    levelUnit = 'h';
  } else if (metric === 'strengthDaysLogged') {
    mainMetricPath = `edition.${scale}.activity.strengthDaysLogged`;
    mainMetricValue = dominant.fact.current ?? agg.activity?.strengthDaysLogged;
    mainUnit = 'days';
  } else if (metric === 'avgSleepHours') {
    mainMetricPath = `edition.${scale}.sleep.avgHours`;
    mainMetricValue = dominant.fact.current ?? agg.sleep?.avgHours;
    mainUnit = 'h';
  } else if (metric === 'avgProteinG') {
    mainMetricPath = `edition.${scale}.nutrition.avgProteinG`;
    mainMetricValue = dominant.fact.current ?? agg.nutrition?.avgProteinG;
    mainUnit = 'g';
  }

  if (mainMetricPath == null || mainMetricValue == null) return null;

  const essentialContextIds = [];
  if (comparison?.available && comparison.comparisonKind === 'equal_length_prior_window') {
    essentialContextIds.push('equal_length_window_not_calendar_month');
  }
  // protein_delta_not_proven_deficit NON è contesto da stampare obbligatoriamente:
  // è proibizione/condizionale (vedi evaluateProteinDeltaDeficitGuard).

  return freezeSpine({
    mainFactId: `${scale}_${theme}`,
    mainMetricPath,
    mainMetricValue,
    mainUnit,
    periodFrom: agg.fromDate,
    periodTo: agg.toDate,
    comparisonFrom: comparison?.previousFrom || null,
    comparisonTo: comparison?.previousTo || null,
    levelMetricPath,
    levelMetricValue,
    levelUnit,
    coverageMetricPath: agg.nutrition?.daysWithFood != null
      ? `edition.${scale}.nutrition.daysWithFood`
      : null,
    coverageMetricValue: agg.nutrition?.daysWithFood ?? null,
    coverageUnit: agg.nutrition?.daysWithFood != null ? 'days' : null,
    essentialContextIds,
  });
}

/**
 * Il fatto principale (Δ o metrica spine) deve apparire in prosa o metricsCited.
 * Non richiede la citazione di level/coverage collaterali.
 *
 * @param {object} storySpine
 * @param {string} title
 * @param {string} body
 * @param {object[]} metricsCited
 * @returns {{ ok: boolean, error: string|null }}
 */
export function validateStorySpinePreserved(storySpine, title, body, metricsCited) {
  if (!storySpine?.mainMetricPath) return { ok: true, error: null };

  const corpus = normalizeCautionText(`${title}\n${body}`);
  const valueStr = String(storySpine.mainMetricValue);
  const valueAlt = valueStr.replace('.', ',');
  const abs = String(Math.abs(Number(storySpine.mainMetricValue)));
  const absAlt = abs.replace('.', ',');

  const cited = (metricsCited || []).some(
    (m) => m?.path === storySpine.mainMetricPath
      && String(m.value) === valueStr,
  );
  const inProse = corpus.includes(normalizeCautionText(valueStr))
    || corpus.includes(normalizeCautionText(valueAlt))
    || corpus.includes(normalizeCautionText(abs))
    || corpus.includes(normalizeCautionText(absAlt))
    || `${title}\n${body}`.includes(`{{${storySpine.mainMetricPath}}}`);

  if (!cited && !inProse) {
    return { ok: false, error: 'main_story_fact_missing' };
  }

  const isDelta = /comparison\.deltas\./.test(storySpine.mainMetricPath);
  if (isDelta) {
    const hasCompareCue = /\b(meno|pi[uù]|calo|aumento|rispetto|precedente|delta|scostamento|variazione|↓|↑|-)\b/i
      .test(`${title} ${body}`);
    if (!hasCompareCue && !cited) {
      return { ok: false, error: 'main_story_fact_missing' };
    }
  }

  return { ok: true, error: null };
}
