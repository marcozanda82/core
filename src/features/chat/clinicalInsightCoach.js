/**
 * Insight Clinico — payload dati + direttive sistema per Gemini (Medico dello Sport).
 */

import { addDays } from '../../calendarDateUtils';
import {
  getTodayString,
  getLogFromStoricoTree,
  TRACKER_STORICO_KEY,
} from '../../coreEngine';
import { computeTotali } from '../../useBiochimico.js';
import {
  extractSleepEntries,
  sleepHoursFromEntry,
  pickMainNightSleepEntry,
} from '../../hooks/useSleepEngine.js';
import { computeStrengthScore } from '../../components/MuscleStimulusWidget';
import {
  MUSCLE_CYLINDER_DEFS,
  clamp01,
} from '../salaComandi/engines/fourCylinderEngine';
import { buildFourCylinderTelemetrySeries } from '../salaComandi/utils/fourCylinderTelemetryHistory';
import { computeRollingCalorieDebt } from '../../utils/rollingCalorieBank';
import { HYPERTROPHY_DECAY_HORIZON_DAYS } from '../../utils/hypertrophyMath';

const MEAL_LABELS = Object.freeze({
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  spuntino: 'Spuntino',
  snack: 'Spuntino',
  merenda: 'Merenda',
});

/**
 * @param {object | null | undefined} entry
 * @returns {boolean}
 */
function isFoodEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isGhost === true) return false;
  const type = String(entry.type || '').toLowerCase();
  return type === 'food' || type === 'recipe';
}

/**
 * @param {object} entry
 * @returns {string}
 */
function resolveMealKey(entry) {
  const raw = String(entry?.mealType || entry?.meal || entry?.slot || 'pasto')
    .trim()
    .toLowerCase()
    .split('_')[0];
  if (MEAL_LABELS[raw]) return raw;
  if (raw.includes('cola')) return 'colazione';
  if (raw.includes('pran')) return 'pranzo';
  if (raw.includes('cen')) return 'cena';
  if (raw.includes('spunt') || raw.includes('snack') || raw.includes('merend')) return 'spuntino';
  return raw || 'pasto';
}

/**
 * @param {unknown} n
 * @param {number} [digits]
 * @returns {number}
 */
function roundN(n, digits = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/**
 * @param {Array} log
 * @param {object | null | undefined} targets
 * @param {number | null | undefined} dynamicDailyKcal
 */
function summarizeNutritionDay(log, targets, dynamicDailyKcal) {
  const list = Array.isArray(log) ? log : [];
  const foodLog = list.filter(isFoodEntry);
  const totali = computeTotali(foodLog) || {};
  const kcal = roundN(totali.kcal);
  const prot = roundN(totali.prot, 1);
  const carb = roundN(totali.carb, 1);
  const fat = roundN(totali.fatTotal ?? totali.fat, 1);
  const targetKcal = Math.round(
    Number(dynamicDailyKcal)
    || Number(targets?.kcal)
    || Number(targets?.baseKcal)
    || 0,
  ) || null;
  const targetProt = Math.round(Number(targets?.prot) || 0) || null;
  const targetCarb = Math.round(Number(targets?.carb) || 0) || null;
  const targetFat = Math.round(Number(targets?.fatTotal ?? targets?.fat) || 0) || null;

  /** @type {Record<string, { kcal: number, prot: number, carb: number, fat: number, items: string[] }>} */
  const byMeal = {};
  foodLog.forEach((entry) => {
    const key = resolveMealKey(entry);
    const bucket = byMeal[key] || {
      kcal: 0,
      prot: 0,
      carb: 0,
      fat: 0,
      items: [],
    };
    bucket.kcal += Number(entry.kcal ?? entry.cal) || 0;
    bucket.prot += Number(entry.prot) || 0;
    bucket.carb += Number(entry.carb) || 0;
    bucket.fat += Number(entry.fatTotal ?? entry.fat) || 0;
    const name = String(entry.desc || entry.name || '').trim();
    if (name && bucket.items.length < 8) bucket.items.push(name);
    byMeal[key] = bucket;
  });

  const meals = Object.entries(byMeal).map(([key, m]) => ({
    meal: MEAL_LABELS[key] || key,
    mealKey: key,
    kcal: roundN(m.kcal),
    prot: roundN(m.prot, 1),
    carb: roundN(m.carb, 1),
    fat: roundN(m.fat, 1),
    items: m.items,
  }));

  const cena = meals.find((m) => m.mealKey === 'cena') || null;

  return {
    kcal,
    prot,
    carb,
    fat,
    targetKcal,
    targetProt,
    targetCarb,
    targetFat,
    deltaKcal: targetKcal != null ? kcal - targetKcal : null,
    meals,
    cena,
    foodEntryCount: foodLog.length,
  };
}

/**
 * @param {Array} log
 */
function summarizeSleep(log) {
  const entries = extractSleepEntries(log);
  const main = pickMainNightSleepEntry(entries);
  if (!main) {
    return {
      hours: null,
      quality: null,
      recoveryHint: 'n/d',
      entryCount: 0,
    };
  }
  const hours = roundN(sleepHoursFromEntry(main), 2);
  const quality = String(main.quality || main.sleepQuality || '').trim() || null;
  let recoveryHint = 'parziale';
  if (hours >= 7.5) recoveryHint = 'buono';
  else if (hours > 0 && hours < 6) recoveryHint = 'scarso';
  return {
    hours,
    quality,
    recoveryHint,
    entryCount: entries.length,
  };
}

/**
 * @param {object | null | undefined} fourCylinder
 * @param {object | null | undefined} fullHistory
 * @param {string} todayIso
 */
function summarizeMuscleCylinders(fourCylinder, fullHistory, todayIso) {
  const day = String(todayIso || getTodayString()).slice(0, 10);
  const peak = computeStrengthScore(fourCylinder, fullHistory, day);
  /** @type {Array<{ id: string, label: string, percent: number }>} */
  let cylinders = [];
  try {
    if (fullHistory && typeof fullHistory === 'object' && Object.keys(fullHistory).length > 0) {
      const series = buildFourCylinderTelemetrySeries(fullHistory, {
        daysBack: Math.max(14, HYPERTROPHY_DECAY_HORIZON_DAYS + 1),
        endDate: day,
        fourCylinder,
      });
      const last = series[series.length - 1];
      if (last) {
        cylinders = MUSCLE_CYLINDER_DEFS.map((cyl) => ({
          id: cyl.id,
          label: cyl.shortLabel || cyl.label,
          percent: Math.round(clamp01(last[cyl.id]) * 100),
        }));
      }
    }
  } catch (error) {
    console.warn('[clinicalInsight] muscle cylinders failed', error);
  }
  if (!cylinders.length) {
    cylinders = MUSCLE_CYLINDER_DEFS.map((cyl) => ({
      id: cyl.id,
      label: cyl.shortLabel || cyl.label,
      percent: 0,
    }));
  }
  return {
    peakPercent: peak.percent,
    peakLabel: peak.peakLabel,
    cylinders,
  };
}

/**
 * Risolve il log di un giorno: oggi usa activeLog se la data coincide.
 * @param {object} fullHistory
 * @param {Array} activeLog
 * @param {string} dateIso
 * @param {string} todayIso
 */
function resolveDayLog(fullHistory, activeLog, dateIso, todayIso) {
  const day = String(dateIso || '').slice(0, 10);
  if (day === todayIso && Array.isArray(activeLog)) {
    return activeLog;
  }
  try {
    return getLogFromStoricoTree(fullHistory || {}, day) || [];
  } catch {
    const node = fullHistory?.[TRACKER_STORICO_KEY(day)];
    return Array.isArray(node?.log) ? node.log : [];
  }
}

/**
 * Pacchetto dati clinici (ieri + oggi) per il prompt Gemini.
 * @param {object} [currentState]
 * @returns {{ object: object, text: string }}
 */
export function buildClinicalInsightPayload(currentState = {}) {
  const state = currentState && typeof currentState === 'object' ? currentState : {};
  const todayIso = String(state.activeDate || getTodayString()).slice(0, 10);
  const yesterdayIso = addDays(todayIso, -1);
  const fullHistory = state.fullHistory && typeof state.fullHistory === 'object'
    ? state.fullHistory
    : {};
  const activeLog = Array.isArray(state.activeLog) ? state.activeLog : [];
  const targets = state.userTargets && typeof state.userTargets === 'object'
    ? state.userTargets
    : {};
  const dynamicDailyKcal = Number(state.dynamicDailyKcal) || null;
  const fourCylinder = state.fourCylinder
    || state.userModel?.fourCylinder
    || null;

  const todayLog = resolveDayLog(fullHistory, activeLog, todayIso, todayIso);
  const yesterdayLog = resolveDayLog(fullHistory, activeLog, yesterdayIso, todayIso);

  const todayNutrition = summarizeNutritionDay(todayLog, targets, dynamicDailyKcal);
  const yesterdayNutrition = summarizeNutritionDay(yesterdayLog, targets, dynamicDailyKcal);

  // Sonno della notte appena trascorsa: tipicamente loggato sul giorno "oggi" (sveglia).
  const sleepTonight = summarizeSleep(todayLog);
  const sleepFallback = summarizeSleep(yesterdayLog);
  const sleep = sleepTonight.hours != null ? sleepTonight : sleepFallback;

  const muscles = summarizeMuscleCylinders(fourCylinder, fullHistory, todayIso);

  let rollingDebt = null;
  try {
    rollingDebt = computeRollingCalorieDebt({
      fullHistory,
      userTargets: targets,
      settingsBaseKcal: dynamicDailyKcal
        || Number(state.healthScoreMetrics?.dailyKcalTarget)
        || Number(targets?.kcal)
        || null,
      asOfDate: todayIso,
    });
  } catch (error) {
    console.warn('[clinicalInsight] rolling debt failed', error);
  }

  const object = {
    generatedAt: new Date().toISOString(),
    todayIso,
    yesterdayIso,
    nutrition: {
      today: todayNutrition,
      yesterday: yesterdayNutrition,
      yesterdayDinner: yesterdayNutrition.cena,
    },
    sleep: {
      ...sleep,
      sourceDate: sleepTonight.hours != null ? todayIso : yesterdayIso,
    },
    muscles,
    compensation: {
      netDebt48h: Math.round(Number(rollingDebt?.netDebt48h) || 0),
      autoCompensationDelta: Math.round(Number(rollingDebt?.autoCompensationDelta) || 0),
      remainingDebtAfterCap: Math.round(Number(rollingDebt?.remainingDebtAfterCap) || 0),
      autoCapKcal: Math.round(Number(rollingDebt?.autoCapKcal) || 0),
      dayBalances: Array.isArray(rollingDebt?.dayBalances)
        ? rollingDebt.dayBalances.map((d) => ({
          date: d.date,
          intakeKcal: Math.round(Number(d.intakeKcal) || 0),
          targetKcal: Math.round(Number(d.targetKcal) || 0),
          balance: Math.round(Number(d.balance) || 0),
          surplusDebt: Math.round(Number(d.surplusDebt) || 0),
          hasTrackable: Boolean(d.hasTrackable),
        }))
        : [],
    },
    readinessHints: {
      isTrainingDay: state.isTrainingDay === true,
      recoveryScore: Number(state.dailyStats?.recoveryScore) || null,
      bodyBatteryPercent: Number(state.dailyStats?.bodyBatteryPercent) || null,
    },
  };

  const text = formatClinicalInsightContextBlock(object);
  return { object, text };
}

/**
 * Blocco testo strutturato per il system prompt / user prompt.
 * @param {object} pack
 * @returns {string}
 */
export function formatClinicalInsightContextBlock(pack) {
  if (!pack || typeof pack !== 'object') return '[CLINICAL_INSIGHT_DATA]\n(n/d)';
  const y = pack.nutrition?.yesterday || {};
  const t = pack.nutrition?.today || {};
  const dinner = pack.nutrition?.yesterdayDinner;
  const sleep = pack.sleep || {};
  const muscles = pack.muscles || {};
  const comp = pack.compensation || {};

  const lines = [
    '[CLINICAL_INSIGHT_DATA]',
    `today=${pack.todayIso || 'n/d'} · yesterday=${pack.yesterdayIso || 'n/d'}`,
    '',
    '## NUTRIZIONE IERI',
    `kcal=${y.kcal ?? 'n/d'} / target=${y.targetKcal ?? 'n/d'} (delta=${y.deltaKcal ?? 'n/d'})`,
    `macro P/C/F=${y.prot ?? 0}/${y.carb ?? 0}/${y.fat ?? 0} g`
      + ` · target P/C/F=${y.targetProt ?? 'n/d'}/${y.targetCarb ?? 'n/d'}/${y.targetFat ?? 'n/d'}`,
    dinner
      ? `CENA IERI: ${dinner.kcal} kcal · P ${dinner.prot}g · C ${dinner.carb}g · F ${dinner.fat}g`
        + (dinner.items?.length ? ` · piatti: ${dinner.items.join(', ')}` : '')
      : 'CENA IERI: non registrata',
    '',
    '## NUTRIZIONE OGGI (in corso)',
    `kcal=${t.kcal ?? 'n/d'} / target=${t.targetKcal ?? 'n/d'} (delta=${t.deltaKcal ?? 'n/d'})`,
    `macro P/C/F=${t.prot ?? 0}/${t.carb ?? 0}/${t.fat ?? 0} g`
      + ` · target P/C/F=${t.targetProt ?? 'n/d'}/${t.targetCarb ?? 'n/d'}/${t.targetFat ?? 'n/d'}`,
    '',
    '## SONNO / RECUPERO',
    `ore=${sleep.hours ?? 'n/d'} · qualità=${sleep.quality || 'n/d'} · hint=${sleep.recoveryHint || 'n/d'} · fonte=${sleep.sourceDate || 'n/d'}`,
    '',
    '## CILINDRI MUSCOLARI (stimolo residuo %)',
    `picco=${muscles.peakPercent ?? 0}% (${muscles.peakLabel || '—'})`,
    ...(Array.isArray(muscles.cylinders)
      ? muscles.cylinders.map((c) => `- ${c.label}: ${c.percent}%`)
      : ['- n/d']),
    '',
    '## COMPENSAZIONE / DEBITO CALORICO (Rolling 48h · Ghost Car)',
    `netDebt48h=${comp.netDebt48h ?? 0} kcal`,
    `autoCompensationDelta=${comp.autoCompensationDelta ?? 0} kcal`,
    `remainingDebtAfterCap=${comp.remainingDebtAfterCap ?? 0} kcal`,
    `autoCapKcal=${comp.autoCapKcal ?? 0}`,
    '',
    '## READINESS CONTEXT',
    `isTrainingDay=${pack.readinessHints?.isTrainingDay === true}`,
    `recoveryScore=${pack.readinessHints?.recoveryScore ?? 'n/d'}`,
    `bodyBatteryPercent=${pack.readinessHints?.bodyBatteryPercent ?? 'n/d'}`,
  ];
  return lines.join('\n');
}

export const CLINICAL_INSIGHT_SYSTEM_BLOCK = [
  '### INTENT REQUEST_CLINICAL_INSIGHT (INSIGHT CLINICO)',
  'Agisci come un Medico dello Sport, Dietista Clinico e Preparatore Atletico d\'élite.',
  'Analizza i dati in [CLINICAL_INSIGHT_DATA] incrociando questi assi:',
  '- Digestione vs Sonno: Trova correlazioni tra la cena di ieri (Kcal/Grassi) e la qualità del sonno.',
  '- Recupero vs Stress: Valuta lo stato dei muscoli rispetto al sonno e al debito calorico.',
  '- Readiness (Prontezza): Dimmi esplicitamente se oggi il corpo è pronto per un allenamento intenso (Semaforo Verde), se deve fare scarico/cardio (Semaforo Giallo) o se deve riposare (Semaforo Rosso).',
  '- Fueling (Nutrizione): Dammi una direttiva nutrizionale per oggi (es. come gestire i macro a cena per recuperare o per preparare l\'allenamento di domani).',
  'RISPONDI CON UN REFERTO CLINICO DIRETTO E CRUDO. Zero premesse. Usa elenchi puntati. Massima competenza biochimica.',
  'Struttura obbligatoria del referto:',
  '1) Semaforo Readiness (Verde / Giallo / Rosso) in una riga.',
  '2) Digestione vs Sonno (bullet).',
  '3) Recupero vs Stress muscolare (bullet).',
  '4) Fueling di oggi (bullet concreti: kcal/macro o regole operative).',
  'commandType obbligatorio: CHAT_RESPONSE. requiresConfirmation=false.',
].join('\n');

/**
 * Prompt utente (invisibile / sintetico) per la chiamata LLM.
 * @param {object} pack
 * @param {string} [userText]
 * @returns {string}
 */
export function generateClinicalInsightPrompt(pack, userText = '') {
  const note = String(userText || '').trim();
  return [
    'Esegui ora l\'Insight Clinico sul pacchetto dati allegato.',
    'Produci il referto clinico secondo le direttive di sistema (semaforo + 3 sezioni a bullet).',
    formatClinicalInsightContextBlock(pack),
    note && !/^insight\s*clinico/i.test(note) ? `Nota utente: ${note}` : '',
  ].filter(Boolean).join('\n\n');
}

export default {
  buildClinicalInsightPayload,
  formatClinicalInsightContextBlock,
  generateClinicalInsightPrompt,
  CLINICAL_INSIGHT_SYSTEM_BLOCK,
};
