/**
 * Kentu Global State — pacchetto contesto per il System Prompt Gemini.
 * Aggrega nutrizione, cilindri muscolari, cilindro cardio (rolling 7d) e diario di oggi.
 */

import { addDays } from '../../../calendarDateUtils';
import { getTodayString, getLogFromStoricoTree } from '../../../coreEngine';
import { buildNutritionContextForState } from '../../../conversation/ConsultantEngine.js';
import { computeTotali } from '../../../useBiochimico.js';
import { buildFourCylinderStrategicMetrics } from '../../salaComandi/utils/fourCylinderStrategicBridge.js';
import { buildTodayDiaryIndex } from '../conversation/todayDiaryIndex.js';
import {
  calculateCardioStatus,
  CARDIO_WEEKLY_TARGET_MINUTES,
} from './cardioCylinderStatus.js';
import { sanitizeUserPortionsDict } from '../conversation/userPortionsMemory.js';

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Fase di recupero per singolo cilindro (0–1 = decay / stimolo residuo).
 * @param {number} level01
 * @returns {'pronto'|'recupero_attivo'|'stimolo_alto'}
 */
function resolveCylinderRecoveryPhase(level01) {
  const pct = Math.round(Number(level01) * 100) || 0;
  if (pct >= 70) return 'stimolo_alto';
  if (pct >= 35) return 'recupero_attivo';
  return 'pronto';
}

/**
 * @param {object} cylindersState — fourCylinder raw o metrics già calcolate
 * @param {{ fullHistory?: object, activeDate?: string }} [options]
 */
function buildMuscularCylindersBlock(cylindersState = {}, options = {}) {
  const looksLikeMetrics =
    cylindersState
    && typeof cylindersState === 'object'
    && cylindersState.hasFourCylinder != null
    && (cylindersState.chest01 != null || cylindersState.legs01 != null);

  const metrics = looksLikeMetrics
    ? cylindersState
    : buildFourCylinderStrategicMetrics(cylindersState, {
      todayIso: options.activeDate || getTodayString(),
      fullHistory: options.fullHistory || null,
    });

  const legs01 = Number(metrics?.legs01) || 0;
  const chest01 = Number(metrics?.chest01) || 0;
  const backShoulders01 = Number(metrics?.backShoulders01) || 0;
  const arms01 = Number(metrics?.arms01) || 0;
  const core01 = Number(metrics?.core01) || 0;

  return {
    Gambe: {
      fillPercent: Math.round(legs01 * 100),
      recoveryPhase: resolveCylinderRecoveryPhase(legs01),
    },
    Petto: {
      fillPercent: Math.round(chest01 * 100),
      recoveryPhase: resolveCylinderRecoveryPhase(chest01),
    },
    SchienaSpalle: {
      fillPercent: Math.round(backShoulders01 * 100),
      recoveryPhase: resolveCylinderRecoveryPhase(backShoulders01),
    },
    Braccia: {
      fillPercent: Math.round(arms01 * 100),
      recoveryPhase: resolveCylinderRecoveryPhase(arms01),
    },
    AbsCore: {
      fillPercent: Math.round(core01 * 100),
      recoveryPhase: resolveCylinderRecoveryPhase(core01),
    },
    physiologyPhase: metrics?.physiologyPhase || null,
    systemicStressPct: Math.round(Number(metrics?.systemicStressPct) || 0),
    recoveryIndexPct: Math.round((Number(metrics?.recoveryIndex01) || 0) * 100),
  };
}

/**
 * @param {object} nutritionState
 * @param {Array<object>} [activeLog]
 */
function buildNutritionContextBlock(nutritionState = {}, activeLog = []) {
  // Preferisce uno state già ricco (currentState app) via ConsultantEngine.
  const fromEngine = nutritionState?.remainingBudget
    ? null
    : (nutritionState?.activeLog || nutritionState?.userTargets
      ? buildNutritionContextForState(nutritionState)
      : null);

  const remaining = nutritionState?.remainingBudget
    || fromEngine?.remainingBudget
    || nutritionState?.delta
    || {};

  const targetsRaw = nutritionState?.targets
    || nutritionState?.dailyTargets
    || nutritionState?.userTargets
    || {};

  const log = Array.isArray(activeLog) && activeLog.length
    ? activeLog
    : (Array.isArray(nutritionState?.activeLog) ? nutritionState.activeLog : []);
  const totali = nutritionState?.consumed
    || (log.length ? computeTotali(log) : {});

  const dynamicKcal = Number(nutritionState?.dynamicDailyKcal);
  const targetKcal = Number.isFinite(dynamicKcal) && dynamicKcal > 0
    ? Math.round(dynamicKcal)
    : roundMacro(targetsRaw.kcal || 2000);
  const targetPro = roundMacro(targetsRaw.prot ?? targetsRaw.pro ?? 150);
  const targetCho = roundMacro(targetsRaw.carb ?? targetsRaw.cho ?? targetsRaw.carbo ?? 200);
  const targetFat = roundMacro(targetsRaw.fatTotal ?? targetsRaw.fat ?? 65);

  const consumedKcal = roundMacro(totali.kcal ?? totali.cal ?? 0);
  const consumedPro = roundMacro(totali.prot ?? totali.pro ?? 0);
  const consumedCho = roundMacro(totali.carb ?? totali.carbo ?? totali.cho ?? 0);
  const consumedFat = roundMacro(totali.fatTotal ?? totali.fat ?? 0);

  const deltaKcal = remaining.kcal != null
    ? roundMacro(remaining.kcal)
    : targetKcal - consumedKcal;
  const deltaPro = remaining.pro != null
    ? roundMacro(remaining.pro)
    : targetPro - consumedPro;
  const deltaCho = remaining.carbo != null
    ? roundMacro(remaining.carbo)
    : (remaining.carb != null ? roundMacro(remaining.carb) : targetCho - consumedCho);
  const deltaFat = remaining.fat != null
    ? roundMacro(remaining.fat)
    : targetFat - consumedFat;

  return {
    Budget_Target: {
      Kcal: targetKcal,
      Pro: targetPro,
      Cho: targetCho,
      Fat: targetFat,
    },
    Consumato: {
      Kcal: consumedKcal,
      Pro: consumedPro,
      Cho: consumedCho,
      Fat: consumedFat,
    },
    Delta: {
      Kcal: deltaKcal,
      Pro: deltaPro,
      Cho: deltaCho,
      Fat: deltaFat,
      note: 'Valori positivi = rimanente; negativi = sforamento',
    },
  };
}

/**
 * Raccoglie workout degli ultimi ~8 giorni di calendario da fullHistory + activeLog
 * (poi filtrati a 168h esatte da calculateCardioStatus).
 *
 * @param {object} fullHistory
 * @param {Array<object>} activeLog
 * @param {string} activeDate
 * @returns {{ cardioLogs: object[], workoutLogs: object[] }}
 */
export function collectRecentWorkoutLogs(fullHistory = {}, activeLog = [], activeDate = '') {
  const anchor = asTrimmedString(activeDate).slice(0, 10) || getTodayString();
  const byId = new Map();

  const ingestDay = (dateKey, log) => {
    (Array.isArray(log) ? log : []).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const kind = asTrimmedString(entry.type).toLowerCase();
      if (kind && kind !== 'workout') return;
      const id = asTrimmedString(entry.id) || `${dateKey}:${entry.desc || entry.name || Math.random()}`;
      if (byId.has(id)) return;
      byId.set(id, { ...entry, type: 'workout', __dateKey: dateKey });
    });
  };

  for (let back = 0; back <= 8; back += 1) {
    let dateKey = anchor;
    try {
      dateKey = addDays(anchor, -back);
    } catch {
      break;
    }
    if (back === 0 && Array.isArray(activeLog) && activeLog.length) {
      ingestDay(dateKey, activeLog);
    } else {
      try {
        ingestDay(dateKey, getLogFromStoricoTree(fullHistory, dateKey) || []);
      } catch {
        // ignore missing days
      }
    }
  }

  const all = [...byId.values()];
  const cardioLogs = [];
  const workoutLogs = [];
  all.forEach((entry) => {
    const typeId = asTrimmedString(
      entry.workoutType ?? entry.subType ?? entry.activityType ?? '',
    ).toLowerCase();
    if (['cardio', 'hiit', 'liss'].includes(typeId)) {
      cardioLogs.push(entry);
    } else {
      workoutLogs.push(entry);
    }
  });

  return { cardioLogs, workoutLogs, all };
}

/**
 * @param {object|Array} diaryState
 * @returns {Array<object>}
 */
function buildDiaryContextBlock(diaryState = {}) {
  if (Array.isArray(diaryState)) {
    return diaryState;
  }
  if (Array.isArray(diaryState?.TODAY_DIARY_INDEX)) {
    return diaryState.TODAY_DIARY_INDEX;
  }
  if (Array.isArray(diaryState?.meals)) {
    return diaryState.meals;
  }
  const activeLog = Array.isArray(diaryState?.activeLog) ? diaryState.activeLog : [];
  return buildTodayDiaryIndex(activeLog, {
    fullHistory: diaryState?.fullHistory || {},
    activeDate: diaryState?.activeDate || null,
  });
}

/**
 * Costruisce l'oggetto strutturato Kentu Global State.
 *
 * @param {object} nutritionState
 * @param {object} cylindersState
 * @param {Array<object>} cardioLogs
 * @param {Array<object>} workoutLogs
 * @param {object|Array} diaryState
 * @param {{ nowMs?: number, weeklyTargetMinutes?: number }} [options]
 * @returns {object}
 */
export function buildKentuGlobalStateObject(
  nutritionState = {},
  cylindersState = {},
  cardioLogs = [],
  workoutLogs = [],
  diaryState = {},
  options = {},
) {
  const activeLog = Array.isArray(nutritionState?.activeLog)
    ? nutritionState.activeLog
    : (Array.isArray(diaryState?.activeLog) ? diaryState.activeLog : []);

  const cardio = calculateCardioStatus(cardioLogs, workoutLogs, {
    nowMs: options.nowMs,
    weeklyTargetMinutes: options.weeklyTargetMinutes || CARDIO_WEEKLY_TARGET_MINUTES,
  });

  const userPortions = sanitizeUserPortionsDict(
    options.userPortions
    || nutritionState?.userPortions
    || diaryState?.userPortions
    || {},
  );

  return {
    User_Profile: {
      displayName: asTrimmedString(
        options.userDisplayName
        || nutritionState?.userDisplayName
        || nutritionState?.userProfile?.displayName
        || nutritionState?.userProfile?.name
        || diaryState?.userDisplayName
        || '',
      ) || null,
    },
    Nutrition_Context: buildNutritionContextBlock(nutritionState, activeLog),
    Muscular_Cylinders: buildMuscularCylindersBlock(cylindersState, {
      fullHistory: diaryState?.fullHistory || nutritionState?.fullHistory,
      activeDate: diaryState?.activeDate || nutritionState?.activeDate,
    }),
    Cardio_Cylinder: {
      window: 'rolling_7_days_168h',
      pureCardioMinutes: cardio.pureCardioMinutes,
      spilloverFromStrengthMinutes: cardio.spilloverMinutes,
      strengthMinutesInWindow: cardio.strengthMinutes,
      accumulatedMinutes: cardio.accumulatedMinutes,
      weeklyTargetMinutes: cardio.weeklyTargetMinutes,
      fillPercent: cardio.fillPercent,
      remainingMinutes: cardio.remainingMinutes,
      spilloverRule: '30% della durata pesi conta come cardio (1h ipertrofia ≈ 18 min cardio)',
    },
    User_Portions_Dictionary: userPortions,
    Diary_Context: {
      scope: 'today_only',
      meals: buildDiaryContextBlock(diaryState),
    },
  };
}

/**
 * Pacchetto testuale (JSON pretty) da appendere al system prompt Gemini.
 *
 * @param {object} nutritionState
 * @param {object} cylindersState
 * @param {Array<object>} cardioLogs
 * @param {Array<object>} workoutLogs
 * @param {object|Array} diaryState
 * @param {{ nowMs?: number, weeklyTargetMinutes?: number }} [options]
 * @returns {string}
 */
export function buildKentuGlobalState(
  nutritionState,
  cylindersState,
  cardioLogs,
  workoutLogs,
  diaryState,
  options = {},
) {
  const pack = buildKentuGlobalStateObject(
    nutritionState,
    cylindersState,
    cardioLogs,
    workoutLogs,
    diaryState,
    options,
  );
  return JSON.stringify(pack, null, 2);
}

/**
 * Convenience: costruisce Global State dal currentState del Command Terminal.
 * @param {object} currentState
 * @param {{ nowMs?: number }} [options]
 * @returns {{ text: string, object: object }}
 */
export function buildKentuGlobalStateFromAppState(currentState = {}, options = {}) {
  const state = currentState && typeof currentState === 'object' ? currentState : {};
  const activeLog = Array.isArray(state.activeLog) ? state.activeLog : [];
  const activeDate = asTrimmedString(state.activeDate).slice(0, 10) || getTodayString();
  const fullHistory = state.fullHistory || {};

  const { cardioLogs, workoutLogs } = collectRecentWorkoutLogs(
    fullHistory,
    activeLog,
    activeDate,
  );

  const cylindersState =
    state.fourCylinder
    || state.userModel?.fourCylinder
    || state.cylindersState
    || null;

  const object = buildKentuGlobalStateObject(
    {
      activeLog,
      userTargets: state.userTargets,
      dynamicDailyKcal: state.dynamicDailyKcal,
      fullHistory,
      activeDate,
      remainingBudget: buildNutritionContextForState(state)?.remainingBudget,
      userPortions: state.userPortions,
      userProfile: state.userProfile,
      userDisplayName: state.userDisplayName,
    },
    cylindersState,
    cardioLogs,
    workoutLogs,
    {
      activeLog,
      fullHistory,
      activeDate,
      userPortions: state.userPortions,
      userDisplayName: state.userDisplayName,
    },
    {
      ...options,
      userPortions: state.userPortions,
      userDisplayName: state.userDisplayName
        || state.userProfile?.displayName
        || state.userProfile?.name
        || '',
    },
  );

  return {
    object,
    text: JSON.stringify(object, null, 2),
  };
}

/** Intestazione richiesta per l'iniezione nel system_instruction. */
export const KENTU_GLOBAL_STATE_PROMPT_HEADER = '\n\n--- STATO ATTUALE DELL\'UTENTE ---\n';

/**
 * Accoda il Global State a una system instruction esistente.
 * @param {string} systemInstruction
 * @param {string} globalStateText
 * @returns {string}
 */
export function appendKentuGlobalStateToSystemInstruction(systemInstruction, globalStateText) {
  const base = asTrimmedString(systemInstruction);
  const pack = asTrimmedString(globalStateText);
  if (!pack) return base;
  if (!base) return `${KENTU_GLOBAL_STATE_PROMPT_HEADER.trimStart()}${pack}`;
  return `${base}${KENTU_GLOBAL_STATE_PROMPT_HEADER}${pack}`;
}
