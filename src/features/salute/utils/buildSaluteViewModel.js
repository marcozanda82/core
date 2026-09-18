/**
 * Adapter di presentazione per `/salute`.
 * Non contiene formule: legge `longevityResult` / `longevityWindow`
 * e `buildLongevityPagellaInsight` già esistenti.
 */

import { MUSCLE_CYLINDER_DEFS } from '../../salaComandi/engines/fourCylinderEngine';
import { buildLongevityPagellaInsight } from '../../trendHub/utils/longevityInsightGenerator';
import { muscleStimulusTriageLabel } from '../../trendHub/utils/muscleSpillover';
import {
  LONGEVITY_CARDIO_TARGET_MIN,
  LONGEVITY_PILLAR_MAX,
  LONGEVITY_SLEEP_TARGET_H,
} from '../../trendHub/utils/saluteDashboardMetrics';
import { LONGEVITY_WINDOW_DAYS } from '../../trendHub/utils/saluteHistorySeries';

const PILLAR_MAX = LONGEVITY_PILLAR_MAX;
const CARDIO_TARGET_MIN = LONGEVITY_CARDIO_TARGET_MIN;
const SLEEP_TARGET_H = LONGEVITY_SLEEP_TARGET_H;
const DISTRICTS_TARGET = 5;

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumber(value) {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

function roundDisplay(value) {
  const n = finiteNumber(value);
  return n == null ? null : Math.round(n);
}

function formatHoursIt(hours) {
  const n = finiteNumber(hours);
  if (n == null || n <= 0) return null;
  return `${n.toFixed(1).replace('.', ',')} h`;
}

function proteinStatusLabel(status) {
  const raw = String(status || '').trim().toUpperCase();
  if (raw === 'OPTIMAL') return 'Proteine ottimali';
  if (raw === 'MODERATE') return 'Proteine moderate';
  if (raw === 'LOW') return 'Proteine basse';
  return null;
}

function fastingStatusLabel(evaluation) {
  const raw = String(evaluation || '').trim().toUpperCase();
  if (raw === 'OPTIMAL') return 'Digiuno ottimale';
  if (raw === 'GOOD') return 'Digiuno buono';
  if (raw === 'POOR') return 'Digiuno corto';
  return null;
}

function nutritionSourceLabel(source, sampleSize) {
  const raw = String(source || '').trim();
  if (raw === 'ai_average') {
    const n = Number(sampleSize);
    return Number.isFinite(n) && n > 0
      ? `Media Focus Metabolico · ${n} referti`
      : 'Media Focus Metabolico';
  }
  if (raw === 'ai_single') return 'Referto singolo';
  if (raw === 'deterministic_fallback') return 'Stima dai log (senza AI)';
  return raw || null;
}

function buildDistricts(muscleStimulusPillars) {
  const map = muscleStimulusPillars && typeof muscleStimulusPillars === 'object'
    ? muscleStimulusPillars
    : null;
  if (!map) return [];
  return MUSCLE_CYLINDER_DEFS.map((def) => {
    const total = finiteNumber(map[def.id]?.total) ?? 0;
    return {
      id: def.id,
      label: def.label,
      total,
      triage: muscleStimulusTriageLabel(total),
    };
  });
}

function buildMetabolic({ waistCm, heightCm, thresholdCm, multiplier, baseScore, finalScore }) {
  if (waistCm == null) {
    return {
      hasWaist: false,
      isCutting: false,
      multiplier: finiteNumber(multiplier),
      heightCm,
      waistCm: null,
      thresholdCm,
      title: 'Stato metabolico',
      body: 'Vita non registrata',
    };
  }

  const m = finiteNumber(multiplier);
  const isCutting = m != null && m < 0.98;
  if (!isCutting) {
    return {
      hasWaist: true,
      isCutting: false,
      multiplier: m,
      heightCm,
      waistCm,
      thresholdCm,
      title: 'Stato metabolico',
      body: 'Nessuna correzione applicata',
    };
  }

  const from = roundDisplay(baseScore);
  const to = roundDisplay(finalScore);
  return {
    hasWaist: true,
    isCutting: true,
    multiplier: m,
    heightCm,
    waistCm,
    thresholdCm,
    title: 'Stato metabolico',
    body: `Il rapporto vita/altezza riduce il punteggio da ${from ?? '—'} a ${to ?? '—'}.`,
  };
}

function shortInsightLine(item) {
  const title = String(item?.title || '').trim();
  if (title) return title;
  const body = String(item?.body || '').trim();
  if (!body) return '';
  const sentence = body.split(/(?<=[.!?])\s+/)[0] || body;
  return sentence.trim();
}

function operationalFareText({ todayAction, cta }) {
  const today = String(todayAction || '').trim();
  if (today) return today;

  const body = String(cta?.body || '').trim();
  const cleaned = body
    .replace(/^Per passare da \d+ a \d+\+ punti questa settimana:\s*/i, '')
    .replace(/^Per consolidare i \d+ punti:\s*/i, '')
    .trim();
  if (
    cleaned
    && !/passare verso \d+/i.test(cleaned)
    && !/porta(?:re)? il punteggio/i.test(cleaned)
  ) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return '';
}

function pickAnalysis(pagella, todayAction) {
  if (!pagella || typeof pagella !== 'object') {
    const fareOnly = operationalFareText({ todayAction, cta: null });
    return fareOnly
      ? [{ id: 'fare', kind: 'action', label: 'Fare', text: fareOnly }]
      : [];
  }
  const items = [];
  const strength = Array.isArray(pagella.strengths) ? pagella.strengths[0] : null;
  const strengthText = shortInsightLine(strength);
  if (strengthText) {
    items.push({
      id: strength.id || 'strength',
      kind: 'strength',
      label: 'Va bene',
      text: strengthText,
    });
  }
  const penalty = Array.isArray(pagella.penalties) ? pagella.penalties[0] : null;
  const penaltyText = shortInsightLine(penalty);
  if (penaltyText) {
    items.push({
      id: penalty.id || 'penalty',
      kind: 'penalty',
      label: 'Frena',
      text: penaltyText,
    });
  }
  const fareText = operationalFareText({ todayAction, cta: pagella.cta });
  if (fareText) {
    items.push({
      id: 'fare',
      kind: 'action',
      label: 'Fare',
      text: fareText,
    });
  }
  return items.slice(0, 3);
}

/**
 * @param {{
 *   longevityResult?: object|null,
 *   longevityWindow?: object|null,
 *   longevityNutrition?: object|null,
 *   profileHeightCm?: number|null,
 *   todayActionText?: string|null,
 * }} input
 */
export function buildSaluteViewModel(input = {}) {
  const longevityResult = input.longevityResult && typeof input.longevityResult === 'object'
    ? input.longevityResult
    : null;
  const longevityWindow = input.longevityWindow && typeof input.longevityWindow === 'object'
    ? input.longevityWindow
    : {};
  const breakdown = longevityResult?.breakdown && typeof longevityResult.breakdown === 'object'
    ? longevityResult.breakdown
    : {};
  const nutrition = (breakdown.longevityNutrition && typeof breakdown.longevityNutrition === 'object')
    ? breakdown.longevityNutrition
    : (input.longevityNutrition && typeof input.longevityNutrition === 'object'
      ? input.longevityNutrition
      : null);

  const finalScore = roundDisplay(longevityResult?.finalScore);
  const baseScore = finiteNumber(longevityResult?.baseScore);
  const hasScore = finalScore != null;

  const cardioScore = finiteNumber(breakdown.cardioScore);
  const weightsScore = finiteNumber(breakdown.weightsScore);
  const sleepScore = finiteNumber(breakdown.sleepScore);
  const nutritionScore = finiteNumber(breakdown.nutritionScore) ?? finiteNumber(nutrition?.score);

  const cardioMins = roundDisplay(breakdown.cardioMins ?? longevityWindow.cardioMinutesTotal) ?? 0;
  const uniqueGroups = Math.max(0, Math.min(
    DISTRICTS_TARGET,
    roundDisplay(breakdown.uniqueGroups ?? longevityWindow.uniqueMuscleGroups) ?? 0,
  ));
  const sleepAvg = positiveNumber(breakdown.sleepAvg ?? longevityWindow.sleepAvgHours);
  const sleepNights = roundDisplay(longevityWindow.sleepNights) ?? 0;
  const cardioDays = roundDisplay(longevityWindow.cardioDays);
  const pesiSessionCount = roundDisplay(longevityWindow.pesiSessionCount);
  const windowDays = LONGEVITY_WINDOW_DAYS;

  const waistCm = positiveNumber(longevityWindow.waistCm);
  const heightCm = positiveNumber(breakdown.userHeight) ?? positiveNumber(input.profileHeightCm);
  const thresholdCm = positiveNumber(breakdown.criticalThreshold);
  const multiplier = finiteNumber(breakdown.whtrMultiplier);

  const pagella = hasScore
    ? buildLongevityPagellaInsight(finalScore, {
      cardioMins,
      uniqueGroups,
      sleepAvg,
      whtrMultiplier: multiplier,
      criticalThreshold: thresholdCm,
      userHeight: heightCm,
      cardioScore,
      weightsScore,
      sleepScore,
      nutritionScore,
      longevityNutrition: nutrition,
    })
    : null;

  const proteinLabel = proteinStatusLabel(nutrition?.proteinStatus);
  const fastingLabel = fastingStatusLabel(nutrition?.fastingWindowEvaluation);
  const sourceLabel = nutritionSourceLabel(nutrition?.source, nutrition?.sampleSize);
  const clinicalNote = [
    String(nutrition?.clinicalNoteStrength || '').trim(),
    String(nutrition?.clinicalNoteBottleneck || '').trim(),
  ].filter(Boolean)[0] || null;

  const todayAction = String(input.todayActionText || '').trim() || null;

  return {
    score: {
      finalScore,
      baseScore,
      hasScore,
    },
    metabolic: buildMetabolic({
      waistCm,
      heightCm,
      thresholdCm,
      multiplier,
      baseScore,
      finalScore,
    }),
    pillars: {
      cardio: {
        id: 'cardio',
        label: 'Cardio',
        score: cardioScore,
        max: PILLAR_MAX,
        context: hasScore
          ? `${cardioMins} min · ultimi ${windowDays} giorni`
          : 'Dato non disponibile',
        minutes: cardioMins,
        targetMinutes: CARDIO_TARGET_MIN,
        windowDays,
        days: cardioDays,
        trendAvailable: false,
      },
      strength: {
        id: 'strength',
        label: 'Forza',
        score: weightsScore,
        max: PILLAR_MAX,
        context: hasScore
          ? `${uniqueGroups}/${DISTRICTS_TARGET} distretti`
          : 'Dato non disponibile',
        covered: uniqueGroups,
        targetDistricts: DISTRICTS_TARGET,
        sessions: pesiSessionCount,
        districts: buildDistricts(breakdown.muscleStimulusPillars || longevityWindow.muscleStimulusPillars),
      },
      sleep: {
        id: 'sleep',
        label: 'Sonno',
        score: sleepScore,
        max: PILLAR_MAX,
        context: sleepAvg != null
          ? `${formatHoursIt(sleepAvg)} media`
          : 'Notti non registrate',
        averageHours: sleepAvg,
        averageLabel: formatHoursIt(sleepAvg),
        targetHours: SLEEP_TARGET_H,
        nights: sleepNights,
        series: Array.isArray(longevityWindow.sleepSeries) ? longevityWindow.sleepSeries : [],
      },
      nutrition: {
        id: 'nutrition',
        label: 'Nutrizione',
        score: nutritionScore,
        max: PILLAR_MAX,
        context: sourceLabel || (hasScore ? 'Fonte non disponibile' : 'Dato non disponibile'),
        proteinLabel,
        fastingLabel,
        sourceLabel,
        source: nutrition?.source || null,
        sampleSize: nutrition?.sampleSize ?? null,
        clinicalNote,
        proteinStatus: nutrition?.proteinStatus || null,
        fastingWindowEvaluation: nutrition?.fastingWindowEvaluation || null,
      },
    },
    analysis: pickAnalysis(pagella, todayAction),
    action: {
      fare: operationalFareText({ todayAction, cta: pagella?.cta }) || null,
    },
  };
}

export {
  CARDIO_TARGET_MIN,
  DISTRICTS_TARGET,
  PILLAR_MAX,
  SLEEP_TARGET_H,
};
