/**
 * SalaComandi.jsx — Porting React da index stabile (HTML).
 * MOTORE BIOCHIMICO (logica pura in useBiochimico.js):
 * - 40+ parametri: TARGETS + computeTotali (amino, vit, min, omega dal DB cibi).
 * - Delta correction: calcolaObiettiviPastoConArray in useMemo (target pasti a cascata).
 * - Firebase: intero albero tracker_data scaricato (get), poi onValue solo per oggi.
 * - Completamento AI: getDefaultNutrientValue ovunque un valore manca; mai 0 né blocco.
 * 
 * FIX CRITICO: Retrocompatibilità mealType - 'spuntino' e 'snack' sono equivalenti
 */
import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ComposedChart, LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid, Area, BarChart, Bar, Tooltip, ReferenceArea, PieChart, Pie, Cell, Sector } from 'recharts';

import { ref, get, set, push, onValue, update, remove } from 'firebase/database';

import {
  calculateConsolidatedAverageScore,
  calculateProjectedAge,
  buildKentuAiVitalsContextParagraph,
  buildKentuAiMetabolicRecompositionContext,
} from './longevityStats';
import { calculateMetabolicVariance } from './metabolicEngine';

import { useFirebase } from './useFirebase';
import { useFoodDb } from './useFoodDb';
import { searchFoods } from './foodSearch';
import { getCreaFusionPayload, fuseUsdaIntoCrea } from './foodSourceFusion';
import { recordMealFoodCooccurrence } from './foodCooccurrence';
import { recordMealSuggestionHabits } from './mealSuggestionHabits';
import {
  buildFoodUnits,
  enrichDbRowWithFoodUnits,
  enrichPortionItemWithDbUnits,
  recordMealFoodUnitUsageFromItems,
} from './foodUnits';
import ChartModal from './ChartModal';
import TimelineNodi from './TimelineNodi';
import { applyTimelineStripHourToPreviewInputs } from './timelineDragPreview';
import AiCluster from './AiCluster';
import { UserNutritionGoalsProvider } from './UserNutritionGoalsContext';
import { mergeProfileNutritionFromServer, buildNutritionGoalsSnapshot } from './userNutritionGoals';
import {
  getTimePositionPercent,
  getWallClockDecimalHour,
  CHART_AXIS_GUTTER_LEFT_PX,
  CHART_AXIS_GUTTER_RIGHT_PX,
} from './timeLayout';
import NowVerticalLineOverlay from './NowVerticalLineOverlay';
import TimeAlignmentChartDebugOverlay from './TimeAlignmentDebugOverlay';
import DailyMacroSheet from './DailyMacroSheet';
import FoodLabelModal from './FoodLabelModal';
import LongevityView from './LongevityView';
import HomeView from './components/HomeView';
import MetabolicPhaseCompact from './components/MetabolicPhaseCompact';
import { takeNextKentuIntroPhrase } from './kentuIntroPhrases';
import {
  WORKOUT_ACTIVITY_SELECTOR_IDS,
  getWorkoutActivityTypeDef,
  getWorkoutActivityLogDescription,
  getCognitiveMetForActivity,
  WORKOUT_MUSCLE_GROUP_DEFS,
  normalizeMuscleGroupArray,
  resolveWorkoutActivityTypeId,
} from './activityCatalog';
import {
  createInitialWeeklyPlan,
  getWeekStartMondayKeyLocal,
  sanitizeWeeklyPlanFromFirebase,
  weeklyPlanStableJson,
  weeklyPlanToFirebasePayload,
} from './weeklyPlanning';
import AddEventMenuGrid from './components/AddEventMenuGrid';
import WeeklyPlanning from './components/WeeklyPlanning';
import PastoDrawer from './components/drawers/PastoDrawer';
import BottomChrome from './features/salaComandi/BottomChrome';
import MenuDrawerShell from './features/salaComandi/MenuDrawerShell';
import OverlayHost from './features/salaComandi/OverlayHost';
import MetabolicUnifiedView from './MetabolicUnifiedView';
import { buildMetabolicCompassDailyHistory } from './metabolicCompassDailyHistory';
import { recalculateUserTargets, buildMacroSplitFromKcal } from './targetsEngine';
import { computeDataDrivenTdeeWithCoach, goalFromProfile, averageFoodKcalOver14d } from './dataDrivenTdee';
import { computeMetabolicNotification } from './notificationEngine';
import { mergeDuplicateBiometrics } from './biometricHistory';
import { getBarcodeNutritionOverride, setBarcodeNutritionOverride as setBarcodeNutritionOverrideStorage } from './barcodeFoodOverrides';
import {
  evaluateAiDayCoach,
  consumeCoachPeriod,
  recordCoachIgnore,
  recordCoachAccept,
} from './aiDayCoach';
import {
  useSmartKentuTriggers,
  checkMorningBriefing,
  checkEveningBriefing,
  getMorningBriefingVerdict,
  getYesterdayCalorieStatus,
  buildPostWorkoutCoachMessage,
  markMorningBriefingShown,
  markEveningBriefingShown,
} from './useSmartKentuTriggers';
import { TARGETS, DEFAULT_TARGETS, useBiochimico, computeTotali, getDefaultNutrientValue, getTargetForNutrient } from './useBiochimico';
import {
  RADIAN,
  DEFAULT_NO_SLEEP_ENERGY,
  getTodayString,
  getYesterdayString,
  getSleepStatus,
  getMondayOfWeek,
  addDays,
  MEAL_TYPE_GROUPS,
  MEAL_TYPE_TO_CANONICAL,
  areMealTypesEquivalent,
  toCanonicalMealType,
  getEquivalentMealTypes,
  getMealIcon,
  getGhostMealType,
  getSlotKey,
  decimalToTimeStr,
  computeDigestiveLoad,
  responseCurve,
  PHYSIOLOGY_CONFIG,
  computeWaterHydrationAutoPilot,
  computeAccumuloSNC,
  generateRealEnergyData,
  computeMetabolicStress,
  generateAnabolicCurve,
  generateCortisolCurve,
  getWorkoutTrafficLight,
  generateCalorieTimeline,
  buildAIPrompt,
  buildGlobalAIPrompt,
  SLEEP_AI_MI_FITNESS_INSTRUCTIONS,
  AI_KEYWORD_TO_HIGHLIGHT,
  AI_KEYWORDS_ORDERED,
  InteractiveAIText,
  TRACKER_STORICO_KEY,
  DESC_TO_MEAL_ID,
  inferMealType,
  normalizeLogData,
  MEAL_ORDER_SAVE,
  MEAL_LABELS_SAVE,
  NODE_IMPORTANCE,
  NODE_TYPE_ICON,
  ADD_EVENT_MENU_DEFAULT_ORDER,
  denormalizeLogForFirebase,
  applyMealTimes,
  getLogFromStoricoTree,
  STRATEGY_PROFILES,
  PIANO_SETTIMANALE,
  CustomChartTooltip,
  MealPieTooltip,
  DEFAULT_USER_MODEL,
  clampModelValue,
  calibrateUserModel,
  buildWeeklyDataFromHistory,
  computeDayEvaluations,
  computeEvaluationTrend,
  computeRiskMatrix,
  computeLongevityMasterScoreFromMatrix,
  computeLongevityScore,
  buildLongevityExplanation,
  calculateBodyBattery,
  metricEntryToIsoDay,
  getLastMealMacrosForTrainingWave,
  getTrainingWaveCurves,
  buildTrainingWaveContextSnippet,
  getDynamicMealTargets,
  normalizeMealFoodItem,
  normalizeMealFoodsArray,
  buildSmartMealPhysioContextSnippet,
  parseKentuInvisibleCmd,
  normalizeCalorieStrategyTarget,
  applyCalorieStrategyToProfileKcal,
  calorieStrategyShortLabelIt,
  generateLocalNutritionalAudit,
  generateLocalTrainingAdvice,
  generateLocalMonthlyAudit,
  generateLocalHabitScanner,
} from './coreEngine';

/** Pesi: gruppi muscolari via chip (nessun campo testuale obbligatorio). Altri strength: nota opzionale legacy. */
function workoutActivityRequiresStrengthDetailNote(typeId) {
  const def = getWorkoutActivityTypeDef(typeId);
  if (typeId === 'pesi') return false;
  if (def?.category === 'strength') return true;
  const raw = String(typeId || '').toLowerCase();
  return raw.includes('strength') || raw.includes('bodybuilding');
}

function migrateIdealStrategy(raw) {
  const defaults = {
    colazione: 400,
    snack: 250,
    pranzo: 700,
    cena: 500,
    allenamento: 300,
  };
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const legacySnack =
    Number(raw.snack ?? raw.merenda_pm ?? raw.merenda_am ?? raw.spuntino) || 250;
  const next = { ...defaults, ...raw };
  if (next.snack == null || Number.isNaN(Number(next.snack))) next.snack = legacySnack;
  delete next.merenda_am;
  delete next.merenda_pm;
  delete next.spuntino;
  return next;
}

/** Tab principali per swipe laterale (stesso ordine della bottom navigation, senza «Menu»). */
const MAIN_BOTTOM_TAB_ORDER = ['oggi', 'analisi', 'bussola', 'longevita'];

/** Voci barra inferiore (sempre tutte visibili; non condizionare al caricamento dati). */
const BOTTOM_NAV_ITEMS = [
  { id: 'oggi', label: 'Oggi', icon: '🏠' },
  { id: 'analisi', label: 'Timeline', icon: '🕒' },
  { id: 'bussola', label: 'Salute', icon: '❤️' },
  { id: 'longevita', label: 'Progressi', icon: '📈' },
  { id: 'menu', label: 'Menu', icon: '≡' },
];

const ACTIVE_BOTTOM_TAB_LS_KEY = 'kentu_active_bottom_tab';
const AI_COACH_DISMISSED_INSIGHTS_LS_KEY = 'kentu_ai_coach_dismissed_insights_v1';
const EVENT_USAGE_LS_KEY = 'kentu_event_usage';
const EVENT_USAGE_DEFAULT = {
  pasto: 0,
  allenamento: 0,
  acqua: 0,
  nap: 0,
  supplements: 0,
};

/** Movimento prima del long-press su nodo timeline: oltre soglia → annulla drag e lascia swipe/scroll (allineato a `MOVE_THRESHOLD_PX` in TimelineNodi). */
const NODE_DRAG_ARM_CANCEL_MOVE_PX = 6;

function readPersistedActiveBottomTab() {
  if (typeof localStorage === 'undefined') return 'oggi';
  try {
    const v = localStorage.getItem(ACTIVE_BOTTOM_TAB_LS_KEY);
    if (v && MAIN_BOTTOM_TAB_ORDER.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return 'oggi';
}

function readPersistedEventUsage() {
  if (typeof localStorage === 'undefined') return { ...EVENT_USAGE_DEFAULT };
  try {
    const raw = localStorage.getItem(EVENT_USAGE_LS_KEY);
    if (!raw) return { ...EVENT_USAGE_DEFAULT };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EVENT_USAGE_DEFAULT };
    return {
      pasto: Math.max(0, Number(parsed.pasto) || 0),
      allenamento: Math.max(0, Number(parsed.allenamento) || 0),
      acqua: Math.max(0, Number(parsed.acqua) || 0),
      nap: Math.max(0, Number(parsed.nap) || 0),
      supplements: Math.max(0, Number(parsed.supplements) || 0),
    };
  } catch {
    return { ...EVENT_USAGE_DEFAULT };
  }
}

function readDismissedAiCoachInsights() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(AI_COACH_DISMISSED_INSIGHTS_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Match migliore sul database alimenti: esatto > bidirezionale (includes) con score da differenza di lunghezza.
 * @param {string} searchQuery
 * @param {Record<string, { desc?: string, name?: string }>} db
 * @returns {string|null} chiave dell'entry nel db o null
 */
function findBestFoodMatch(searchQuery, db) {
  if (!searchQuery || !db) return null;
  const query = searchQuery.toLowerCase().trim();
  if (!query) return null;
  let bestMatchKey = null;
  let bestScore = -1;

  for (const key in db) {
    if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
    const item = db[key];
    const dbName = (item.desc || item.name || '').toLowerCase().trim();
    if (!dbName) continue;

    if (dbName === query) return key;

    if (dbName.includes(query) || query.includes(dbName)) {
      const lengthDiff = Math.abs(dbName.length - query.length);
      const score = 1000 - lengthDiff;

      if (score > bestScore) {
        bestScore = score;
        bestMatchKey = key;
      }
    }
  }
  return bestMatchKey;
}

/**
 * Abitudine / recency: match su foodDb + ultima grammatura usata nello storico (log più recenti per primi).
 * @param {string} query
 * @param {Record<string, object>} foodDb
 * @param {Array} flatLog — es. dailyLog (+ simulated) già normalizzato; ordine [più recente, …]
 */
function findRecentFoodHabit(query, foodDb, flatLog) {
  if (!query || !foodDb) return null;
  const bestKey = findBestFoodMatch(query, foodDb);
  if (!bestKey) return null;
  const item = foodDb[bestKey];
  if (!item) return null;
  const logArr = Array.isArray(flatLog) ? flatLog : [];
  let lastQty = null;
  for (let i = 0; i < logArr.length; i++) {
    const e = logArr[i];
    if (e.type !== 'food' && e.type !== 'recipe') continue;
    const nm = e.desc || e.name;
    if (!nm || typeof nm !== 'string') continue;
    const k = findBestFoodMatch(nm.trim(), foodDb);
    if (k === bestKey) {
      const q = Number(e.qta ?? e.weight);
      if (Number.isFinite(q) && q > 0) {
        lastQty = Math.round(q);
        break;
      }
    }
  }
  const dq = Number(item.defaultQty);
  const defaultQty =
    lastQty != null ? lastQty : Number.isFinite(dq) && dq > 0 ? Math.round(dq) : 150;
  return {
    dbKey: bestKey,
    name: item.desc || item.name || query,
    qty: defaultQty,
  };
}

/** Pasto / nodo piano: `foods` sempre array, mai undefined. */
function mealFoodsRead(meal) {
  const f = meal?.foods;
  return Array.isArray(f) ? f : [];
}

/** Chiave stabile pasto pianificato (mealType canonico + mealTime) per `planning/{uid}/{date}`. */
function planningMealSlotKeyForFirebase(row) {
  const mt = toCanonicalMealType(String(row?.mealType || '').split('_')[0]) || 'snack';
  const t = typeof row?.mealTime === 'number' && !Number.isNaN(row.mealTime) ? row.mealTime : 0;
  return `${mt}_${t.toFixed(3)}`;
}

const PLANNING_TIMING_SLOT_IDS = new Set(['mattina', 'pomeriggio', 'sera']);

/** `timingByMacro` su RTDB: array di fasce per macro (migrazione da stringa singola). */
function normalizeTimingByMacroForPlanningDoc(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      const arr = [];
      for (const x of v) {
        const s = String(x).trim();
        if (PLANNING_TIMING_SLOT_IDS.has(s) && !arr.includes(s)) arr.push(s);
      }
      out[k] = arr;
    } else if (typeof v === 'string' && PLANNING_TIMING_SLOT_IDS.has(v)) {
      out[k] = [v];
    } else {
      out[k] = [];
    }
  }
  return out;
}

/**
 * Documento RTDB `planning/{userId}/{date}` — separato da tracker_data.
 * @param {object} payload — output PlanningWizard (ghostMeals + wizardMeta + workout flags)
 */
function buildPlanningFirebaseDoc(payload) {
  const ghostList = Array.isArray(payload?.ghostMeals) ? payload.ghostMeals : [];
  const meta = payload?.wizardMeta || {};
  const stagingDraftBySlot = {};
  const draftMap = meta.stagingDraftById && typeof meta.stagingDraftById === 'object' ? meta.stagingDraftById : {};
  for (const g of ghostList) {
    const key = planningMealSlotKeyForFirebase(g);
    const fromMeta = draftMap[g.id];
    if (Array.isArray(fromMeta) && fromMeta.length > 0) {
      stagingDraftBySlot[key] = fromMeta.map((x) =>
        typeof x === 'string' ? x : `${Math.round(Number(x?.qty ?? x?.weight) || 0) || '?'}g ${String(x?.name || x?.desc || '').trim()}`.trim()
      );
    } else if (mealFoodsRead(g).length > 0) {
      stagingDraftBySlot[key] = mealFoodsRead(g).map((f) =>
        typeof f === 'string'
          ? f
          : `${Math.round(Number(f?.qty) || 0) || '?'}g ${String(f?.name || '').trim()}`.trim()
      );
    }
  }
  const meals = ghostList.map((g) => ({
    mealType: toCanonicalMealType(String(g.mealType || '').split('_')[0]) || 'snack',
    mealTime: typeof g.mealTime === 'number' && !Number.isNaN(g.mealTime) ? g.mealTime : null,
    time: g.time != null ? String(g.time) : undefined,
    title: String(g.title || '').trim(),
    microDesc: String(g.microDesc || '').trim(),
    draftFoods: Array.isArray(g.draftFoods) ? g.draftFoods : [],
    foods: normalizeMealFoodsArray(mealFoodsRead(g)),
    target: g.target != null ? g.target : undefined,
    source: g.source || undefined,
  }));
  const workoutTimesDecPersist = (Array.isArray(payload.workoutTimesDec)
    ? payload.workoutTimesDec
    : typeof payload.workoutTimeDec === 'number' && !Number.isNaN(payload.workoutTimeDec)
      ? [payload.workoutTimeDec]
      : []
  ).filter((x) => typeof x === 'number' && !Number.isNaN(x));
  const activities = {
    macros: Array.isArray(meta.macros) ? [...meta.macros] : [],
    muscles: Array.isArray(meta.muscles) ? [...meta.muscles] : [],
    timingByMacro: normalizeTimingByMacroForPlanningDoc(meta.timingByMacro),
    addGhostWorkout: Boolean(payload.addGhostWorkout),
    workoutTimeDec:
      typeof payload.workoutTimeDec === 'number' && !Number.isNaN(payload.workoutTimeDec)
        ? payload.workoutTimeDec
        : workoutTimesDecPersist[0] ?? null,
    workoutTimesDec: workoutTimesDecPersist,
    stagingDraftBySlot,
  };
  return { meals, activities, createdAt: Date.now() };
}

/** Rimuove il prefisso iniettato per l'API dalla cronologia conversazione inviata all'API. */
function stripInvisibleContextFromVisibleUserText(text) {
  if (text == null || typeof text !== 'string') return text;
  return text
    .replace(/\[CONTEXT_LIVE:[^\]]*\]\s*/gi, '')
    .replace(/\[CONTESTO DI SISTEMA INVISIBILE:[^\]]*\]\s*/gi, '')
    .trim();
}

/**
 * Ultimi N alimenti/ricette distinti dai log degli ultimi `numDays` giorni (più recenti per primi).
 */
function collectDispensaProbableFoods(fullHistory, anchorDateStr, maxDistinct, numDays) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr || maxDistinct <= 0) return 'n/d';
  const seen = new Set();
  const out = [];
  const days = Math.max(1, Math.min(14, numDays || 4));
  for (let d = 0; d < days; d++) {
    const dStr = addDays(anchorDateStr, -d);
    const rawLog = getLogFromStoricoTree(fullHistory, dStr) || [];
    const log = normalizeLogData(Array.isArray(rawLog) ? rawLog : Object.values(rawLog));
    for (let i = 0; i < log.length; i++) {
      const item = log[i];
      if (!item || (item.type !== 'food' && item.type !== 'recipe')) continue;
      const raw = (item.desc || item.name || '').trim();
      if (!raw) continue;
      const key = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(raw.length > 48 ? `${raw.slice(0, 45)}…` : raw);
      if (out.length >= maxDistinct) return out.join(', ');
    }
  }
  return out.length ? out.join(', ') : 'nessun dato recente';
}

/**
 * Contesto live iniettato nell'ultimo messaggio utente verso l'API (non mostrato in UI se non salvato nel testo).
 */
function getInvisibleContext({
  bodyBatteryPercent,
  dynamicDailyKcal,
  totali,
  userTargets,
  fullHistory,
  anchorDateStr,
  trainingWaveSnippet,
  mealTypeForSmart,
  dailyLogForSmart,
  kentuCalorieStrategy,
}) {
  const bb = Math.round(Number(bodyBatteryPercent) || 0);
  const dynK = Number(dynamicDailyKcal) || 0;
  const eatenK = Number(totali?.kcal) || 0;
  const kcalSurplus = eatenK > dynK ? Math.round(eatenK - dynK) : 0;
  const resKcal = Math.round(Math.max(0, dynK - eatenK));
  const kcalBalanceSnippet =
    kcalSurplus > 0 ? `SURPLUS +${kcalSurplus} kcal` : `Residuo: ${resKcal}kcal`;
  const tProt = Number(userTargets?.prot ?? 150);
  const tCarb = Number(userTargets?.carb ?? 200);
  const tFat = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 65);
  const eProt = Number(totali?.prot) || 0;
  const eCarb = Number(totali?.carb) || 0;
  const eFat = Number(totali?.fatTotal ?? totali?.fat) || 0;
  const rProt = Math.max(0, Math.round((tProt - eProt) * 10) / 10);
  const rCarb = Math.max(0, Math.round((tCarb - eCarb) * 10) / 10);
  const rFat = Math.max(0, Math.round((tFat - eFat) * 10) / 10);
  const dispensa = collectDispensaProbableFoods(fullHistory, anchorDateStr, 10, 4);
  const nota =
    'L\'utente soffre di problemi di cortisolo alto quando chiede consigli sulla cena.';
  const wave = trainingWaveSnippet ? ` ${trainingWaveSnippet}` : '';
  const smartPhysio =
    mealTypeForSmart && dailyLogForSmart && userTargets
      ? buildSmartMealPhysioContextSnippet(mealTypeForSmart, dailyLogForSmart, userTargets)
      : '';
  const smartPart = smartPhysio ? ` Smart: ${smartPhysio}.` : '';
  const stratPart =
    kentuCalorieStrategy != null && String(kentuCalorieStrategy).trim() !== ''
      ? ` Strategia kcal oggi: ${calorieStrategyShortLabelIt(kentuCalorieStrategy)}.`
      : '';
  return `[CONTEXT_LIVE: BB: ${bb}%, ${kcalBalanceSnippet}, ${rProt}P/${rCarb}C/${rFat}F. Dispensa: ${dispensa}. Nota: ${nota}.${smartPart}${stratPart}${wave}]`;
}

/** Totali kcal/P/C/F solo da voci food/recipe nel log giornaliero. */
function aggregateFoodRecipeDayTotals(log) {
  const list = normalizeLogData(Array.isArray(log) ? log : Object.values(log || {}));
  let kcal = 0;
  let prot = 0;
  let carb = 0;
  let fat = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || (item.type !== 'food' && item.type !== 'recipe')) continue;
    kcal += Number(item.kcal ?? item.cal) || 0;
    prot += Number(item.prot ?? item.proteine) || 0;
    carb += Number(item.carb ?? item.carboidrati) || 0;
    fat += Number(item.fatTotal ?? item.fat ?? item.grassi) || 0;
  }
  return { kcal, prot, carb, fat };
}

/**
 * Prompt nascosto per Quick Action "Briefing": solo numeri locali, niente domanda generica.
 */
function buildQuickBriefingSecretPrompt({
  bodyBatteryPercent,
  dynamicDailyKcal,
  totali,
  userTargets,
}) {
  const bb = Math.round(Number(bodyBatteryPercent) || 0);
  const dynK = Math.round(Number(dynamicDailyKcal) || 0);
  const eatenK = Math.round(Number(totali?.kcal) || 0);
  const kcalSurplus = eatenK > dynK ? Math.round(eatenK - dynK) : 0;
  const resKcal = Math.max(0, dynK - eatenK);
  const kcalBalanceSnippet =
    kcalSurplus > 0 ? `SURPLUS +${kcalSurplus} kcal` : `residuo ~${resKcal}kcal`;
  const tProt = Number(userTargets?.prot ?? 150);
  const tCarb = Number(userTargets?.carb ?? 200);
  const tFat = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 65);
  const eProt = Number(totali?.prot) || 0;
  const eCarb = Number(totali?.carb) || 0;
  const eFat = Number(totali?.fatTotal ?? totali?.fat) || 0;
  const rProt = Math.max(0, Math.round((tProt - eProt) * 10) / 10);
  const rCarb = Math.max(0, Math.round((tCarb - eCarb) * 10) / 10);
  const rFat = Math.max(0, Math.round((tFat - eFat) * 10) / 10);
  return (
    `QUICK_ACTION=BRIEFING. Sintesi operativa solo da questi dati (non chiedere altri dati): ` +
    `BB ${bb}% · budget kcal giornaliero ~${dynK} · assunte ${eatenK}kcal · ${kcalBalanceSnippet} · ` +
    `macro residui ${rProt}g P / ${rCarb}g C / ${rFat}g F. ` +
    `Applica REGOLE DI STILE Quick Action (Lavagna, max 3 elenchi, zero intro/outro).`
  );
}

/**
 * Prompt nascosto "Analisi ieri": solo scostamenti vs target da log storico (local-first).
 */
function buildYesterdayGapSecretPrompt(fullHistory, anchorDateStr, userTargets) {
  const anchor = anchorDateStr || getTodayString();
  const yStr = addDays(anchor, -1);
  const rawLog = getLogFromStoricoTree(fullHistory, yStr) || [];
  const agg = aggregateFoodRecipeDayTotals(rawLog);
  const tK = Number(userTargets?.kcal ?? 2000);
  const tP = Number(userTargets?.prot ?? 150);
  const tC = Number(userTargets?.carb ?? 200);
  const tF = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 65);
  const thin = agg.kcal < 5 && agg.prot < 1 && agg.carb < 1 && agg.fat < 1;
  const gaps = [];
  if (thin) {
    gaps.push('log alimenti vuoto o quasi per quel giorno');
  } else {
    const dk = agg.kcal - tK;
    if (Math.abs(dk) > 120) gaps.push(`kcal ${Math.round(agg.kcal)} vs target ${Math.round(tK)} (${dk > 0 ? '+' : ''}${Math.round(dk)})`);
    const dp = agg.prot - tP;
    if (Math.abs(dp) > 15) gaps.push(`prot ${Math.round(agg.prot)}g vs ${Math.round(tP)}g (${dp > 0 ? '+' : ''}${Math.round(dp)}g)`);
    const dc = agg.carb - tC;
    if (Math.abs(dc) > 30) gaps.push(`carb ${Math.round(agg.carb)}g vs ${Math.round(tC)}g (${dc > 0 ? '+' : ''}${Math.round(dc)}g)`);
    const df = agg.fat - tF;
    if (Math.abs(df) > 15) gaps.push(`grassi ${Math.round(agg.fat)}g vs ${Math.round(tF)}g (${df > 0 ? '+' : ''}${Math.round(df)}g)`);
  }
  if (gaps.length === 0) gaps.push('nessuno scostamento macro/kcal rilevante vs target');
  return (
    `QUICK_ACTION=ANALISI_IERI. Giorno ${yStr}. Solo questi fatti (non inventare, non elencare ogni pasto): ${gaps.join(' · ')}. ` +
    `Interpreta come coach: cosa correggere oggi. REGOLE DI STILE Quick Action (Lavagna, max 3 elenchi, zero intro/outro).`
  );
}

/** Quick Action "Idea pasto": forza solo MEAL_PROPOSAL; Dispensa e macro sono in [CONTEXT_LIVE]. */
function buildMealIdeaFromDispensaSecretPrompt() {
  return (
    `QUICK_ACTION=IDEA_PASTO. Usa ESCLUSIVAMENTE [CONTEXT_LIVE] per macro residui e Dispensa probabile. ` +
    `Rispetta i vincoli Smart in [CONTEXT_LIVE] (pranzo: tetto zuccheri semplici e fibre minime; cena: tetto grassi fisso). ` +
    `Priorità ingredienti: pranzo = verdure fibrose e proteine magre; cena = carboidrati complessi e proteine magre, grassi bassi. ` +
    `Se nessun alimento in Dispensa è ideale, stima quantità con macro credibili (fallback) e non bloccare la proposta. ` +
    `Proponi UN pasto con ingredienti prioritariamente dalla Dispensa. ` +
    `Rispondi SOLO con il blocco [MEAL_PROPOSAL:{...}] su una riga (CARTA MENU), zero testo prima o dopo.`
  );
}

/**
 * Estrae [MEAL_PROPOSAL:{...}] dalla risposta AI e restituisce JSON validato + testo senza il blocco.
 */
function extractAndStripMealProposal(rawText) {
  const text = rawText == null ? '' : String(rawText);
  const tag = '[MEAL_PROPOSAL:';
  const i = text.indexOf(tag);
  if (i === -1) return { stripped: text, proposal: null };
  const jsonStart = i + tag.length;
  if (text[jsonStart] !== '{') return { stripped: text, proposal: null };
  let depth = 0;
  let j = jsonStart;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  if (depth !== 0) return { stripped: text, proposal: null };
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k++;
  const endBlock = k < text.length && text[k] === ']' ? k + 1 : j;
  const jsonStr = text.slice(jsonStart, j);
  let proposal = null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      proposal = {
        title: parsed.title != null ? String(parsed.title) : undefined,
        timeString: parsed.timeString != null ? String(parsed.timeString) : undefined,
        items: parsed.items.map((row, idx) => ({
          id: row.id != null ? String(row.id) : `ing_${idx}`,
          name: String(row.name || row.desc || 'Alimento').trim(),
          qty: Number(row.qty ?? row.weight ?? row.qta) > 0 ? Number(row.qty ?? row.weight ?? row.qta) : 100,
          dbKey: row.dbKey != null ? String(row.dbKey) : undefined,
          why: row.why != null ? String(row.why) : row.perche != null ? String(row.perche) : '',
          estKcal: row.estKcal,
          estPro: row.estPro,
          estCar: row.estCar,
          estFat: row.estFat,
        })),
      };
    }
  } catch (_) {
    proposal = null;
  }
  const stripped = (text.slice(0, i) + text.slice(endBlock)).replace(/\s+/g, ' ').trim();
  return { stripped, proposal };
}

/** Normalizza orario per input type="time" (HH:mm). */
function normalizeDailyPlanTimeForInput(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null') return '';
  const colon = s.match(/^(\d{1,2})\s*[:.h]\s*(\d{2})$/i);
  if (colon) {
    const h = Math.min(23, Math.max(0, parseInt(colon[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(colon[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const n = parseFloat(s.replace(',', '.'));
  if (Number.isFinite(n)) {
    const h = Math.floor(n) % 24;
    const frac = n % 1;
    const min = Math.min(59, Math.round(frac * 60) % 60);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return '';
}

function normalizeDailyPlanFromToken(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const rawActivities = Array.isArray(parsed.activities) ? parsed.activities : [];
  const activities = rawActivities
    .map((a, idx) => {
      const timeNorm = normalizeDailyPlanTimeForInput(a?.time != null ? String(a.time) : '') || '12:00';
      const desc = String(a?.desc ?? a?.title ?? '').trim() || `Attività ${idx + 1}`;
      return { time: timeNorm, desc };
    })
    .filter((a) => a.desc);
  if (activities.length === 0) return null;
  const targetNorm = normalizeCalorieStrategyTarget(parsed.target);
  const target = targetNorm || 'pari';
  let workoutTime = null;
  if (parsed.workoutTime != null) {
    const ws = String(parsed.workoutTime).trim();
    if (ws && ws.toLowerCase() !== 'null') {
      const wn = normalizeDailyPlanTimeForInput(ws);
      if (wn) workoutTime = wn;
    }
  }
  let ghostMeals = [];
  if (Array.isArray(parsed.ghostMeals)) {
    ghostMeals = parsed.ghostMeals
      .map((g) => {
        const mealType = String(g?.mealType || 'pranzo').toLowerCase().split('_')[0];
        const timeNorm = normalizeDailyPlanTimeForInput(g?.time != null ? String(g.time) : '') || '12:00';
        const title = String(g?.title || 'Pasto pianificato').trim();
        const microDesc = String(g?.microDesc || '').trim();
        const draftFoods = Array.isArray(g?.draftFoods)
          ? g.draftFoods.map((x) => String(x).trim()).filter(Boolean)
          : [];
        if (!title) return null;
        const row = {
          mealType,
          time: timeNorm,
          title,
          microDesc,
          draftFoods,
          foods: normalizeMealFoodsArray(g?.foods),
        };
        return row;
      })
      .filter(Boolean);
  }
  return { target, workoutTime, activities, ghostMeals };
}

/**
 * Estrae [DAILY_PLAN:{...}] dalla risposta AI e restituisce JSON validato + testo senza il blocco.
 */
function extractAndStripDailyPlan(rawText) {
  const text = rawText == null ? '' : String(rawText);
  const tag = '[DAILY_PLAN:';
  const i = text.indexOf(tag);
  if (i === -1) return { stripped: text, plan: null };
  const jsonStart = i + tag.length;
  if (text[jsonStart] !== '{') return { stripped: text, plan: null };
  let depth = 0;
  let j = jsonStart;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  if (depth !== 0) return { stripped: text, plan: null };
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k++;
  const endBlock = k < text.length && text[k] === ']' ? k + 1 : j;
  const jsonStr = text.slice(jsonStart, j);
  let plan = null;
  try {
    const parsed = JSON.parse(jsonStr);
    plan = normalizeDailyPlanFromToken(parsed);
  } catch (_) {
    plan = null;
  }
  const stripped = (text.slice(0, i) + text.slice(endBlock)).replace(/\s+/g, ' ').trim();
  return { stripped, plan };
}

function formatBodyBatteryValue(v) {
  const n = Math.round(Number(v) * 10) / 10;
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : ''}${n}%`;
}

/** Arco semicircolare Body Battery — look neon sottile; 💤 cyan se boost sonnellino. */
function EnergyArc({ percentage, size = 'small', hasNapBoost = false, showText = true }) {
  const filterUid = useId().replace(/:/g, '');
  const energyVal = Number(percentage);
  const arcP = Math.min(100, Math.max(0, Number.isFinite(energyVal) ? energyVal : 0));
  const large = size === 'large';
  const w = large ? 200 : 52;
  const h = large ? 118 : 38;
  const r = large ? 82 : 21;
  const sw = large ? 5 : 2.25;
  const cx = w / 2;
  const cy = h - (large ? 10 : 7);
  const x1 = cx - r;
  const x2 = cx + r;
  const arcLen = Math.PI * r;
  const dashOffset = arcLen * (1 - arcP / 100);
  const gid = `${large ? 'eaL' : 'eaS'}_${filterUid}`;
  const pctRounded = Math.round(Number.isFinite(energyVal) ? energyVal : 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: large ? 8 : 2,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: large ? 8 : 4 }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs>
            <filter id={gid} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation={large ? 3.2 : 1.4} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={`M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}`}
            fill="none"
            stroke="#27272a"
            strokeWidth={sw + 1}
            strokeLinecap="round"
            opacity={0.95}
          />
          <path
            d={`M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}`}
            fill="none"
            stroke="#4ade80"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={arcLen}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.55s ease-out', filter: `url(#${gid})` }}
          />
        </svg>
        {hasNapBoost ? (
          <span
            style={{
              fontSize: large ? '1.75rem' : '0.85rem',
              lineHeight: 1,
              filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.85))',
              color: '#22d3ee',
              marginBottom: large ? 18 : 4,
            }}
            title="Boost sonnellino"
            aria-hidden
          >
            💤
          </span>
        ) : null}
      </div>
      {showText ? (
        <span
          style={{
            fontSize: large ? '1.35rem' : '0.62rem',
            fontWeight: 800,
            color: '#ecfdf5',
            letterSpacing: large ? '0.06em' : '-0.02em',
            textShadow: '0 0 12px rgba(74,222,128,0.45)',
            lineHeight: 1,
          }}
        >
          {pctRounded}%
        </span>
      ) : null}
    </div>
  );
}

function BodyBatteryModal({ onClose, batteryData }) {
  if (!batteryData) return null;
  const { currentEnergy, maxCapacity, breakdown, hasNapBoost } = batteryData;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        zIndex: 100030,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="body-battery-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(165deg, #18181b 0%, #0c0c0f 100%)',
          border: '1px solid #3f3f46',
          borderRadius: '18px',
          padding: '24px 20px 20px',
          width: '100%',
          maxWidth: '360px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '1.35rem', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px' }}>
          <EnergyArc percentage={currentEnergy} size="large" hasNapBoost={!!hasNapBoost} />
        </div>
        {hasNapBoost ? (
          <p style={{ margin: '0 0 8px 0', fontSize: '0.72rem', color: '#22d3ee', textAlign: 'center', fontWeight: 600 }}>
            Sonnellino attivo — recupero extra
          </p>
        ) : null}
        <p style={{ margin: '0 0 6px 0', fontSize: '0.7rem', color: '#71717a', textAlign: 'center' }}>
          Tetto teorico {maxCapacity}% · energia attuale {currentEnergy}%
        </p>
        <h3
          id="body-battery-title"
          style={{
            margin: '0 0 14px 0',
            color: '#e4e4e7',
            fontSize: '0.88rem',
            fontWeight: 700,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}
        >
          Estratto Conto Energia
        </h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(breakdown || []).map((row, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 0',
                borderBottom: i < (breakdown || []).length - 1 ? '1px solid #27272a' : 'none',
              }}
            >
              <span style={{ color: '#d4d4d8', fontSize: '0.8rem', lineHeight: 1.35 }}>{row.label}</span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  color:
                    row.type === 'positive' ? '#22d3ee' : row.type === 'negative' ? '#f97316' : '#a1a1aa',
                }}
              >
                {formatBodyBatteryValue(row.value)}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '12px',
            background: '#3f3f46',
            color: '#fafafa',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

const CustomDateTick = ({ x, y, payload }) => {
  if (!payload || !payload.value) return null;
  const parts = String(payload.value).split('-');
  if (parts.length !== 3) return null;
  const [yyyy, mm, dd] = parts;

  const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const nomeMese = mesi[parseInt(mm, 10) - 1] || mm;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#fff" fontSize="0.9rem" fontWeight="bold">
        {dd}
      </text>
      <text
        x={0}
        y={0}
        dy={28}
        textAnchor="middle"
        fill="#00e5ff"
        fontSize="0.75rem"
        fontWeight="600"
        style={{ textTransform: 'uppercase' }}
      >
        {nomeMese}
      </text>
      <text x={0} y={0} dy={40} textAnchor="middle" fill="#555" fontSize="0.65rem">
        {yyyy}
      </text>
    </g>
  );
};

const ZEN_SUN_MAX = 2.2;

/** Pattern respirazione Neural Reset: fasi in ordine, ms e scala sole per fase */
const NEURAL_RESET_PATTERNS = {
  square: {
    id: 'square',
    label: 'Respiro quadrato (4-4-4-4)',
    hint: 'Quattro tempi uguali: segui il sole sul mare.',
    steps: [
      { phase: 'Inspira', ms: 4000, sunTarget: ZEN_SUN_MAX },
      { phase: 'Trattieni', ms: 4000, sunTarget: ZEN_SUN_MAX, dimHold: true },
      { phase: 'Espira', ms: 4000, sunTarget: 1 },
      { phase: 'Pausa', ms: 4000, sunTarget: 1 },
    ],
  },
  relax478: {
    id: 'relax478',
    label: 'Rilassamento (4-7-8)',
    hint: 'Inspira 4 s, trattieni 7 s, espira 8 s; il ciclo riparte subito.',
    steps: [
      { phase: 'Inspira', ms: 4000, sunTarget: ZEN_SUN_MAX },
      { phase: 'Trattieni', ms: 7000, sunTarget: ZEN_SUN_MAX, dimHold: true },
      { phase: 'Espira', ms: 8000, sunTarget: 1 },
    ],
  },
  coherent: {
    id: 'coherent',
    label: 'Coerente (5.5 - 5.5)',
    hint: '5,5 s di inspiro e 5,5 s di espiro, senza pause.',
    steps: [
      { phase: 'Inspira', ms: 5500, sunTarget: ZEN_SUN_MAX },
      { phase: 'Espira', ms: 5500, sunTarget: 1 },
    ],
  },
};

const ZEN_SESSION_DURATION_OPTIONS = [
  { value: '1', label: '1 minuto', sec: 60 },
  { value: '3', label: '3 minuti', sec: 180 },
  { value: '5', label: '5 minuti', sec: 300 },
  { value: '10', label: '10 minuti', sec: 600 },
  { value: 'infinite', label: 'Infinito', sec: null },
];

function getNeuralResetZenStep(patternId, phaseName) {
  return NEURAL_RESET_PATTERNS[patternId]?.steps.find((s) => s?.phase === phaseName);
}

function getZenBreathAudioFade(phaseName, phaseMs) {
  if (phaseName === 'Inspira') return { target: 0.9, duration: Math.min(4000, phaseMs) };
  if (phaseName === 'Espira') return { target: 0.6, duration: Math.min(4000, phaseMs) };
  if (phaseName === 'Trattieni' || phaseName === 'Pausa') return { target: 0.02, duration: Math.min(3000, phaseMs) };
  return null;
}

/**
 * Pasti unici (ultimi 30 giorni) dal diario storico: label compatta + macro medi per occorrenza (contesto agenda Kentu).
 */
function buildRecentMealsContextForDinner(fullHistory, anchorDateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr) return '';

  const byNorm = new Map();

  for (let i = 0; i < 30; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    const foods = log.filter(
      (item) => item && (item.type === 'food' || item.type === 'recipe' || item.type === 'meal')
    );
    if (foods.length === 0) continue;

    const groups = {};
    foods.forEach((item) => {
      const timeKey = typeof item.mealTime === 'number' ? String(item.mealTime) : 'unknown';
      const typeKey = item.mealType || 'pasto';
      const gid = `${typeKey}_${timeKey}`;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(item);
    });

    Object.values(groups).forEach((items) => {
      if (!items.length) return;
      const names = [];
      const seen = new Set();
      for (const it of items) {
        const raw = (it.desc || it.name || '').trim();
        if (!raw) continue;
        const low = raw.toLowerCase();
        if (seen.has(low)) continue;
        seen.add(low);
        names.push(raw);
        if (names.length >= 4) break;
      }
      if (!names.length) return;

      const displayName = names.slice(0, 3).join(' e ');
      const norm = displayName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      let kcal = 0;
      let prot = 0;
      let carb = 0;
      let fat = 0;
      items.forEach((it) => {
        kcal += Number(it.kcal || it.cal || 0) || 0;
        prot += Number(it.prot || it.proteine || 0) || 0;
        carb += Number(it.carb || it.carboidrati || 0) || 0;
        fat += Number(it.fatTotal || it.fat || it.grassi || 0) || 0;
      });

      if (kcal < 10 && prot < 2 && carb < 2 && fat < 2) return;

      const prev = byNorm.get(norm);
      if (prev) {
        prev.n += 1;
        prev.kcal += kcal;
        prev.prot += prot;
        prev.carb += carb;
        prev.fat += fat;
        if (displayName.length > prev.label.length) prev.label = displayName;
      } else {
        byNorm.set(norm, { label: displayName, n: 1, kcal, prot, carb, fat });
      }
    });
  }

  const rows = Array.from(byNorm.values())
    .map((v) => ({
      label: v.label.length > 72 ? `${v.label.slice(0, 69)}…` : v.label,
      n: v.n,
      kcal: Math.round(v.kcal / v.n),
      prot: Math.round(v.prot / v.n),
      carb: Math.round(v.carb / v.n),
      fat: Math.round(v.fat / v.n)
    }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 25);

  return rows.map((r) => `- ${r.label} (~${r.kcal} kcal, P${r.prot} / C${r.carb} / F${r.fat} g)`).join('\n');
}

const AI_MEAL_CONSTRAINTS_MAX_ITEMS = 20;

function normalizeAiMealConstraintList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, AI_MEAL_CONSTRAINTS_MAX_ITEMS);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, AI_MEAL_CONSTRAINTS_MAX_ITEMS);
  }
  return [];
}

/**
 * Blocco testo per prompt Gemini: fissi / esclusi / preferiti.
 * @param {object} [constraints]
 * @param {string|string[]} [constraints.fixedFoods]
 * @param {string|string[]} [constraints.excludedFoods]
 * @param {string|string[]} [constraints.preferredFoods]
 */
function buildAiMealConstraintsPromptBlock(constraints) {
  const c = constraints && typeof constraints === 'object' ? constraints : {};
  const fixed = normalizeAiMealConstraintList(c.fixedFoods ?? c.fixed);
  const excluded = normalizeAiMealConstraintList(c.excludedFoods ?? c.excluded);
  const preferred = normalizeAiMealConstraintList(c.preferredFoods ?? c.preferred);
  if (fixed.length === 0 && excluded.length === 0 && preferred.length === 0) return '';
  const lines = [
    '',
    'VINCOLI MENU (OBBLIGATORI — applica alla lista alimenti che generi):',
  ];
  if (fixed.length > 0) {
    lines.push(
      `- INCLUDI OBBLIGATORIAMENTE questi alimenti (grammi realistici per porzione; ogni nome deve comparire come voce distinta nell'output): ${fixed.join('; ')}`
    );
  }
  if (excluded.length > 0) {
    lines.push(
      `- NON includere né sostituti stretti di: ${excluded.join('; ')} (niente derivati oculati dello stesso ingrediente).`
    );
  }
  if (preferred.length > 0) {
    lines.push(
      `- PREFERISCI dove compatibile con target e storico (includi almeno uno se sensato): ${preferred.join('; ')}`
    );
  }
  lines.push(
    'Verifica prima di rispondere: tutti i fissi presenti; nessun escluso; preferiti rispettati se possibile senza violare i target.'
  );
  return lines.join('\n');
}

/** Righe compatte pasti ultimi 7 giorni (prompt generazione draftFoods). */
function buildLast7DaysMealLinesForDraftPrompt(fullHistory, anchorDateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr) return '(nessuno storico)';
  const lines = [];
  for (let i = 0; i < 7; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    log.forEach((item) => {
      if (!item || (item.type !== 'food' && item.type !== 'recipe' && item.type !== 'meal')) return;
      const d = String(item.desc || item.name || '').trim();
      if (!d) return;
      const mt = item.mealType || '';
      const kcal = Math.round(Number(item.kcal || item.cal) || 0);
      lines.push(`- ${d} (${mt}, ~${kcal} kcal)`);
    });
  }
  return lines.slice(0, 45).join('\n') || '(nessun pasto negli ultimi 7 giorni)';
}

/**
 * Ultime ~30 giorni: attività / allenamenti dal diario storico, medie durata e kcal per tipo.
 */
function buildRecentActivitiesContext(fullHistory, anchorDateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr) return '';

  const byNorm = new Map();

  for (let i = 0; i < 30; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    const acts = log.filter(
      (item) =>
        item &&
        (item.type === 'workout' ||
          item.type === 'work' ||
          item.type === 'activity' ||
          item.type === 'cognitive')
    );
    acts.forEach((item) => {
      const raw = (item.desc || item.name || item.label || '').trim();
      if (!raw) return;
      const norm = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const durH = Number(item.duration);
      const hours = Number.isFinite(durH) && durH > 0 ? durH : null;
      const kcal = Number(item.kcal || item.cal || 0) || 0;
      const prev = byNorm.get(norm);
      if (prev) {
        prev.n += 1;
        if (hours != null) {
          prev.durSum += hours;
          prev.durCount += 1;
        }
        prev.kcal += kcal;
        if (raw.length > prev.label.length) prev.label = raw;
      } else {
        byNorm.set(norm, {
          label: raw,
          n: 1,
          durSum: hours != null ? hours : 0,
          durCount: hours != null ? 1 : 0,
          kcal,
        });
      }
    });
  }

  const rows = Array.from(byNorm.values())
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 20)
    .map((v) => {
      const avgK = Math.round(v.kcal / Math.max(1, v.n));
      let durPart = 'n/d';
      if (v.durCount > 0) {
        const avgH = v.durSum / v.durCount;
        if (avgH >= 1) durPart = `${avgH.toFixed(1).replace(/\.0$/, '')}h`;
        else if (avgH > 0) durPart = `${Math.round(avgH * 60)}min`;
      }
      return `- ${v.label.length > 56 ? `${v.label.slice(0, 53)}…` : v.label} (media ${durPart}, ~${avgK} kcal)`;
    });

  return rows.join('\n');
}

function buildKentuAgendaSecretPrompt(userMessage, activitiesContext, mealsContext) {
  const act =
    activitiesContext && String(activitiesContext).trim()
      ? String(activitiesContext).trim()
      : '(nessuna attività strutturata negli ultimi 30 giorni nel diario)';
  const meals =
    mealsContext && String(mealsContext).trim()
      ? String(mealsContext).trim()
      : '(nessun pasto recente rilevante nel diario)';
  const safeUser = String(userMessage || '').trim() || '(nessun dettaglio fornito)';
  return `L'utente ha questi piani per oggi: ${safeUser}

STORICO ATTIVITÀ:
${act}

STORICO PASTI:
${meals}

DIRETTIVE:
1. Trova le attività nello storico che combaciano con i piani di oggi. Se non ci sono, stima tu calorie e durata.
2. Genera una strategia nutrizionale rapida per supportare questo specifico carico di lavoro (es. quando inserire i carboidrati per l'allenamento gambe), usando i pasti dello storico se possibile.
3. Rispondi in modo discorsivo ma conciso.
4. Alla fine, allega un blocco JSON chiamato agenda_options contenente un array delle attività individuate, con "name", "duration" (in minuti) e "kcal" stimate.

Formato esatto dell'ultima riga (solo JSON valido, senza markdown):
{"agenda_options":[{"name":"etichetta breve","duration":90,"kcal":300}]}`;
}

/** Ore decimali di sonno da addormentamento a risveglio (attraversa mezzanotte). */
function computeSleepDurationHours(bedDecimal, wakeDecimal) {
  const b = Number(bedDecimal);
  const w = Number(wakeDecimal);
  if (!Number.isFinite(b) || !Number.isFinite(w)) return 0;
  let dur = w - b;
  if (dur <= 0) dur += 24;
  return Math.round(Math.min(24, Math.max(0, dur)) * 100) / 100;
}

function getMealTimeFromLogItem(item) {
  if (!item) return null;
  const mt = Number(item.mealTime);
  if (Number.isFinite(mt)) return mt;
  const t = Number(item.time);
  return Number.isFinite(t) ? t : null;
}

function normalizeWorkoutSearchKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDecimalHourIt(dec) {
  const d = Number(dec);
  if (!Number.isFinite(d)) return '';
  let h = Math.floor(d);
  let m = Math.round((d - h) * 60);
  if (m >= 60) {
    h += Math.floor(m / 60);
    m %= 60;
  }
  h %= 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseFlexibleTimeToDecimal(text) {
  const s = String(text || '').trim().toLowerCase();
  const m = s.match(/\b(\d{1,2})[:h.](\d{2})\b/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min < 60) return Math.round((h + min / 60) * 100) / 100;
  }
  const m2 = s.match(/\b(\d{1,2})\s*,\s*(\d{2})\b/);
  if (m2) {
    const h = parseInt(m2[1], 10);
    const min = parseInt(m2[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min < 60) return Math.round((h + min / 60) * 100) / 100;
  }
  const m3 = s.match(/\b(\d{1,2})\s*(?:e\s*mezza)\b/);
  if (m3) {
    const h = parseInt(m3[1], 10);
    if (h >= 0 && h < 24) return h + 0.5;
  }
  return null;
}

function extractWorkoutSearchKeysFromMessage(normMsg) {
  const parts = normMsg.split(/\s+/).filter(Boolean);
  const skip = new Set([
    'oggi', 'stasera', 'ieri', 'allenamento', 'di', 'il', 'la', 'lo', 'per', 'un', 'una', 'ho', 'fare', 'faccio', 'faro', 'farò',
    'programmo', 'voglio', 'devo', 'andare', 'in', 'palestra', 'con', 'del', 'dei', 'della',
  ]);
  return [...new Set(parts.filter((p) => p.length > 2 && !skip.has(p)))];
}

/** Rileva intento allenamento in chat (solo giorno corrente, prima della chiamata API). */
function detectWorkoutIntentFromChat(raw) {
  const m = String(raw || '').trim();
  if (m.length < 4) return null;
  const norm = normalizeWorkoutSearchKey(m);
  if (/\b(ho mangiato|logga\s+pasto|registra(?:\s+il)?\s*pasto)\b/i.test(m) && !/\ballenamento\b|\bpalestra\b|\bpesi\b/i.test(m)) {
    return null;
  }
  const hasStrong =
    /\ballenamento\b|\bpalestra\b|\bpesi\b|workout|crossfit|push\s*day|pull\s*day|leg\s*day|\bcardio\b|\bcorsa\b|\bhiit\b/i.test(m);
  const hasBody = /\b(petto|schiena|gambe|braccia|glutei|spalle|bicipiti|tricipiti|addome|dorso|quadricipiti|polpacci)\b/i.test(m);
  if (!hasStrong) {
    if (!hasBody) return null;
    if (!/\b(faccio|farò|faro|oggi|stasera|programmo|voglio|allen)\b/i.test(norm)) return null;
  }
  let activity = 'weights';
  if (/\bcorsa\b|\bcardio\b|\bcamminata\b|\bhiit\b|bike|spinning|ellittica|nuot/i.test(m)) activity = 'cardio';

  let displayLabel = m.replace(/\s+/g, ' ');
  const am = m.match(/\ballenamento\s+(?:di\s+|da\s+)?([^.!?\n]{2,40})/i);
  if (am) displayLabel = am[1].trim().replace(/\s+$/,'');
  else {
    const bm = m.match(/\b(petto|schiena|gambe|braccia|glutei|spalle|bicipiti|tricipiti|push|pull|legs|dorso)\b/i);
    if (bm) displayLabel = bm[0];
  }

  const keys = extractWorkoutSearchKeysFromMessage(normalizeWorkoutSearchKey(displayLabel));
  const fullKeys = [...new Set([...keys, normalizeWorkoutSearchKey(displayLabel)])].filter(Boolean);
  if (fullKeys.length === 0) fullKeys.push(normalizeWorkoutSearchKey(displayLabel));
  return { displayLabel, activity, searchKeys: fullKeys };
}

function findLastMatchingWorkoutSlot(fullHistory, anchorDateStr, searchKeys) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr || !searchKeys?.length) return null;
  for (let i = 1; i < 90; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    const workouts = log.filter(
      (e) => e && (e.type === 'workout' || e.type === 'work' || e.type === 'activity' || e.type === 'cognitive')
    );
    for (const w of workouts) {
      const desc = normalizeWorkoutSearchKey((w.desc || w.name || w.label || '').trim());
      if (!desc) continue;
      const hit = searchKeys.some(
        (k) =>
          k.length >= 3 &&
          (desc.includes(k) || k.includes(desc.slice(0, Math.min(14, desc.length))))
      );
      if (hit) {
        const t = getMealTimeFromLogItem(w) ?? (typeof w.time === 'number' ? w.time : null);
        if (t != null && Number.isFinite(t)) {
          return { decimalHour: t, sourceLabel: w.desc || w.name || '' };
        }
      }
    }
  }
  return null;
}

const FIREBASE_LOAD_OVERLAY_FADE_MS = 800;

/** Riferimenti stabili per chart vuoto / notte in sospeso (evita ricalcoli longevity ad ogni render). */
const EMPTY_ENERGY_CHART_DATA = [];
const LONGEVITY_NIGHT_PENDING_ENERGY_SIM = {
  chartData: EMPTY_ENERGY_CHART_DATA,
  realTotals: {},
  hasCrashRisk: false,
  hasCortisolRisk: false,
  hasDigestionRisk: false,
  nervousSystemLoad: 0
};

/** Overlay fullscreen: unico piano visibile finché auth/data non sono pronti per la dashboard/login. */
function FirebaseDataLoadingLayer({ blocking }) {
  const [introPhrase] = useState(() => takeNextKentuIntroPhrase());
  const [mounted, setMounted] = useState(false);
  const [opaque, setOpaque] = useState(true);

  useEffect(() => {
    if (blocking) {
      setMounted(true);
      setOpaque(true);
      return;
    }
    if (mounted) {
      setOpaque(false);
      const t = window.setTimeout(() => setMounted(false), FIREBASE_LOAD_OVERLAY_FADE_MS);
      return () => window.clearTimeout(t);
    }
  }, [blocking, mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        minHeight: '100dvh',
        zIndex: 200000,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #0f2847 0%, #0a1a2e 42%, #050e1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:
          'max(20px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))',
        opacity: opaque ? 1 : 0,
        transition: `opacity ${FIREBASE_LOAD_OVERLAY_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: blocking ? 'auto' : 'none',
      }}
      aria-live="polite"
      aria-busy={blocking}
    >
      <p
        className="kentu-intro-phrase-text kentu-intro-phrase-text--glow"
        style={{
          margin: 0,
          maxWidth: 'min(24rem, 90vw)',
          textAlign: 'center',
          fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
          fontWeight: 300,
          fontSize: 'clamp(0.95rem, 3.5vw, 1.18rem)',
          letterSpacing: '0.06em',
          lineHeight: 1.75,
          color: 'rgba(248, 250, 252, 0.95)',
        }}
      >
        {introPhrase}
      </p>
    </div>,
    document.body
  );
}

/** Età in anni interi dalla data di nascita (formato YYYY-MM-DD). */
export function calculateAge(dobString) {
  if (!dobString) return null;
  const today = new Date();
  const birthDate = new Date(dobString);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/** Alias intestazioni CSV bilance / app salute (Renpho, Xiaomi, Withings, ecc.) */
const COLUMN_ALIASES = {
  date: ['date', 'data', 'time', 'ora', 'misurazione', 'measurement'],
  weight: ['peso', 'weight', 'poid', 'kg', 'lbs'],
  fat: ['grasso', 'fat', 'adipose', 'bf'],
  muscle: ['muscol', 'muscle', 'skeletal'],
  water: ['acqua', 'water', 'hydration', 'eau'],
  visceral: ['viscerale', 'visceral', 'vfr'],
};

const CSV_BODY_METRIC_FIELDS = ['date', 'weight', 'fat', 'muscle', 'water', 'visceral'];

function extractNumber(str) {
  if (str == null) return null;
  let s = String(str).replace(/[^0-9.,-]/g, '');
  if (!s || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  if (lastComma !== -1) {
    s = `${s.slice(0, lastComma).replace(/,/g, '')}.${s.slice(lastComma + 1)}`;
  }
  s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeCsvTimeFragment(timePart) {
  const t = String(timePart).trim();
  if (!t) return '12:00:00';
  if (/^\d{1,2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 8);
  return t;
}

/**
 * Riconosce YYYY-MM-DD, EU (GG/MM/YYYY o GG-MM-YYYY con primi token) e US MM-DD-YYYY quando ambiguo con trattino.
 * @returns {{ isoDate: string, timestamp: number } | null}
 */
function parseUniversalDate(raw) {
  if (raw == null || raw === '') return null;
  const str = String(raw).trim();
  const [datePart, ...timeRest] = str.split(/\s+/);
  if (!datePart) return null;
  const timePart = timeRest.join(' ').trim();

  let year;
  let month;
  let day;

  let m = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = Number(m[3]);
      if (a > 12) {
        day = a;
        month = b;
        year = y;
      } else if (b > 12) {
        month = a;
        day = b;
        year = y;
      } else {
        day = a;
        month = b;
        year = y;
      }
    } else {
      m = datePart.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const y = Number(m[3]);
        if (a > 12) {
          day = a;
          month = b;
          year = y;
        } else if (b > 12) {
          month = a;
          day = b;
          year = y;
        } else {
          month = a;
          day = b;
          year = y;
        }
      }
    }
  }

  if (
    year == null ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isoTime = normalizeCsvTimeFragment(timePart);
  const d = new Date(`${isoDate}T${isoTime}`);
  if (!Number.isFinite(d.getTime())) return null;
  return { isoDate, timestamp: d.getTime() };
}

function buildBodyMetricsColumnMap(headerLine) {
  const headerCells = headerLine
    .replace(/"/g, '')
    .toLowerCase()
    .split(',')
    .map((h) => h.trim());

  const columnMap = { date: -1, weight: -1, fat: -1, muscle: -1, water: -1, visceral: -1 };

  for (const field of CSV_BODY_METRIC_FIELDS) {
    const aliases = COLUMN_ALIASES[field];
    if (!aliases) continue;
    for (let i = 0; i < headerCells.length; i++) {
      const h = headerCells[i];
      if (aliases.some((alias) => h.includes(alias))) {
        columnMap[field] = i;
        break;
      }
    }
  }

  if (columnMap.date === -1 || columnMap.weight === -1) {
    throw new Error(
      "CSV: intestazione non valida — servono colonne riconoscibili per data e peso (es. 'date'/'data' e 'weight'/'peso')."
    );
  }

  return { columnMap, headerCells };
}

function kentuChatStorageKey(dateStr) {
  return `kentu_chat_${dateStr}`;
}

function readKentuChatHistoryFromLocalStorage(dateStr) {
  try {
    const raw = localStorage.getItem(kentuChatStorageKey(dateStr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const cleaned = parsed.filter(
      (m) => m && (m.sender === 'user' || m.sender === 'ai') && !m.isTyping
    );
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

function isKentuChatPersistableMessage(m) {
  if (!m || m.isTyping) return false;
  const t = (m.text || '').trim();
  if (
    m.sender === 'ai' &&
    (t.startsWith('❌') || t.includes('Errore Server') || t.includes('Nessuna API Key'))
  ) {
    return false;
  }
  return true;
}

function kentuChatHistoryForPersistence(messages) {
  return (messages || []).filter(isKentuChatPersistableMessage);
}

const ADD_MENU_ORDER_LS_KEY = 'kentu_add_menu_order';

function normalizeAddMenuOrderState(saved, defaultOrder) {
  const allowed = new Set(defaultOrder);
  if (!Array.isArray(saved)) return [...defaultOrder];
  const out = [];
  const seen = new Set();
  for (const id of saved) {
    if (id === 'luce') continue;
    if (allowed.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of defaultOrder) {
    if (!seen.has(id)) {
      if (id === 'plan') out.unshift(id);
      else out.push(id);
      seen.add(id);
    }
  }
  return out;
}

function getNowDecimalHourForPlanMerge() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Tipi pasto già consumati (reali, non ghost) con orario ≤ ora: bloccano un nuovo ghost sullo stesso slot. */
function buildPastOnlyRealMealTypeSet(srcLog, nowDec) {
  const set = new Set();
  (srcLog || []).forEach((n) => {
    if (!n || n.isGhost || (n.type !== 'food' && n.type !== 'recipe') || !n.mealType) return;
    const dec = Number(n.mealTime);
    if (Number.isNaN(dec) || dec > nowDec) return;
    const mt = toCanonicalMealType(String(n.mealType).split('_')[0]);
    if (mt) set.add(mt);
  });
  return set;
}

/** Rimuove ghost_meal e i pasti reali futuri che verranno sostituiti da ghost nel piano (stesso mealType). */
function buildBaseLogForGhostPlanMerge(srcLog, ghostList, nowDec) {
  const ghostMt = new Set(
    (ghostList || [])
      .map((gm) => toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]))
      .filter(Boolean)
  );
  return (srcLog || []).filter((e) => {
    if (!e) return false;
    if (e.type === 'ghost_meal') return false;
    if ((e.type === 'food' || e.type === 'recipe') && !e.isGhost) {
      const dec = Number(e.mealTime);
      if (!Number.isNaN(dec) && dec > nowDec) {
        const mt = toCanonicalMealType(String(e.mealType || '').split('_')[0]);
        if (mt && ghostMt.has(mt)) return false;
      }
    }
    return true;
  });
}

/** Debounce conferma pasti (wizard / piano giornaliero): evita doppio insert su click rapidi. */
const MEAL_CONFIRM_DEBOUNCE_MS = 900;

/**
 * Deduplica voci ghost nel payload (stesso `id` staging o stesso slot mealType+orario).
 * @param {object[]} ghostList
 * @param {(gm: object) => string} getSlotKey
 */
function dedupeGhostMealsPayloadForConfirm(ghostList, getSlotKey) {
  const seen = new Set();
  const out = [];
  for (const gm of ghostList || []) {
    if (!gm || typeof gm !== 'object') continue;
    const key = getSlotKey(gm);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(gm);
  }
  return out;
}

/** Id log stabile da payload wizard/piano (`ghost_meal_<id>`) o batch timestamp se manca id. */
function ghostMealLogEntryIdFromPayload(gm, index, batchTs) {
  const rawId = gm.id != null && String(gm.id).trim() !== '' ? String(gm.id).trim() : '';
  if (rawId) {
    const safe = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    return `ghost_meal_${safe}`;
  }
  return `ghost_meal_${batchTs}_${index}`;
}

function tryAcquireMealConfirmGuard(guardRef) {
  const g = guardRef.current;
  const now = Date.now();
  if (g.busy || now - g.lastAt < MEAL_CONFIRM_DEBOUNCE_MS) return false;
  g.busy = true;
  g.lastAt = now;
  return true;
}

function releaseMealConfirmGuard(guardRef) {
  guardRef.current.busy = false;
}

/** Da stringhe tipo "200g Riso" → oggetti { name, qty } per stato `meals.foods`. */
function draftStringsToFoods(strings) {
  if (!Array.isArray(strings)) return [];
  return strings
    .map((s) => {
      const raw = String(s || '').trim();
      if (!raw) return null;
      const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*g\s+(.+)$/i);
      if (m) {
        const qty = Math.round(Number(String(m[1]).replace(',', '.')) || 100);
        const name = String(m[2]).trim();
        return name ? { name, qty: qty > 0 ? qty : 100 } : null;
      }
      return { name: raw, qty: 100 };
    })
    .filter(Boolean)
    .slice(0, 14);
}

/** Righe alimento per modal ghost: prima `foods` normalizzati, poi oggetti in draft, poi stringhe. */
function ghostMealModalFoodRows(report) {
  let rows = normalizeMealFoodsArray(report?.foods);
  if (rows.length > 0) return rows;
  const draft = Array.isArray(report?.draftFoods) ? report.draftFoods : [];
  const objs = draft.filter((x) => x && typeof x === 'object' && (x.name || x.desc));
  if (objs.length > 0) rows = normalizeMealFoodsArray(objs);
  else {
    const strs = draft
      .filter((x) => typeof x === 'string')
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (strs.length > 0) rows = normalizeMealFoodsArray(draftStringsToFoods(strs));
  }
  return rows;
}

/**
 * Risposta AI piano pasto: preferisce `items` strutturati; fallback `draftFoods` (stringhe).
 * @returns {{ foods: object[], draftFoods: string[] }}
 */
function parsePlanMealDraftAiResponse(raw) {
  const s = String(raw || '').trim();
  let jsonStr = s;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(e?.message ? String(e.message) : 'JSON non valido');
  }
  if (Array.isArray(obj?.items) && obj.items.length > 0) {
    const foods = normalizeMealFoodsArray(obj.items).slice(0, 14);
    const draftFoods = foods.map((f) => `${f.qty}g ${f.name}`);
    return { foods, draftFoods };
  }
  const arr = obj?.draftFoods;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('draftFoods vuoto o non valido');
  const draftFoods = arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 14);
  const foods = normalizeMealFoodsArray(draftStringsToFoods(draftFoods));
  return { foods, draftFoods };
}

/** Da voci canoniche `meal.foods` (o legacy) → items per `mapProposalItemsToDiaryFoods` (est* + matchedKey). */
function structuredFoodsToProposalItems(foods) {
  if (!Array.isArray(foods)) return [];
  return foods
    .map((f) => {
      const canon = normalizeMealFoodItem(f);
      if (!canon) return null;
      const o = {
        name: canon.name,
        qty: canon.qty,
        estKcal: canon.kcal,
        estPro: canon.prot,
        estCar: canon.carb,
        estFat: canon.fat,
      };
      if (canon.dbKey) o.dbKey = canon.dbKey;
      if (f && typeof f === 'object' && f.matchedKey != null && String(f.matchedKey).trim() !== '') {
        o.matchedKey = String(f.matchedKey).trim();
      }
      return o;
    })
    .filter(Boolean);
}

/**
 * `draftFoods` UI (stringhe "200g X" o oggetti pill) → proposal items per espansione in righe diario.
 */
function ghostSurfaceDraftToProposalItems(draftFoods) {
  if (!Array.isArray(draftFoods)) return [];
  return draftFoods
    .map((x) => {
      if (x == null) return null;
      if (typeof x === 'object') {
        return structuredFoodsToProposalItems([x])[0] ?? null;
      }
      const s = String(x).trim();
      if (!s) return null;
      const m = s.match(/^(\d+(?:[.,]\d+)?)\s*g\s+(.+)$/i);
      if (m) {
        const qty = Math.max(1, Math.round(Number(String(m[1]).replace(',', '.')) || 100));
        const name = String(m[2]).trim();
        return name ? { name, qty } : null;
      }
      return { name: s, qty: 100 };
    })
    .filter(Boolean);
}

/** Nodo timeline ghost: `foods` in forma canonica (da log o da draftFoods). */
function normalizeGhostFoodsForTimelineNode(e) {
  const fromLog = normalizeMealFoodsArray(mealFoodsRead(e));
  if (fromLog.length > 0) return fromLog;
  return normalizeMealFoodsArray(ghostSurfaceDraftToProposalItems(e?.draftFoods));
}

function parseSmartCompletionFoodsPayload(obj) {
  const foods = obj?.foods;
  if (!Array.isArray(foods) || foods.length === 0) throw new Error('foods vuoto o non valido');
  return foods
    .map((f) => ({
      desc: String(f?.desc ?? f?.name ?? '').trim(),
      weight: Math.max(5, Math.round(Number(f?.weight ?? f?.qty) || 100)),
    }))
    .filter((f) => f.desc.length > 0)
    .slice(0, 20);
}

function parseSmartCompletionJsonFromAiResponse(raw) {
  const aiText = String(raw || '').trim();
  let obj = null;
  const match = aiText.match(/\[COMPLETION_JSON:\s*(\{[\s\S]*?\})\s*\]/i);
  if (!match) {
    console.log('AI Response:', aiText);
  } else {
    try {
      obj = JSON.parse(match[1]);
    } catch (_) {
      obj = null;
    }
  }
  if (!obj) {
    const i0 = aiText.indexOf('{');
    const i1 = aiText.lastIndexOf('}');
    if (i0 < 0 || i1 <= i0) throw new Error('Token COMPLETION_JSON non trovato o JSON non estraibile');
    try {
      obj = JSON.parse(aiText.slice(i0, i1 + 1));
    } catch (e) {
      throw new Error(e?.message ? String(e.message) : 'JSON non valido (fallback brace)');
    }
  }
  return parseSmartCompletionFoodsPayload(obj);
}

export default function SalaComandi() {
  const { db, auth, user, authReady, handleLogin: firebaseLogin } = useFirebase();
  const isAuthenticated = !!user;
  const userUid = user?.uid ?? null;

  // Form di login (stato locale)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isBooting, setIsBooting] = useState(false);
  const [introPhrase] = useState(() => takeNextKentuIntroPhrase());

  // STATI INTERFACCIA
  const [currentTime, setCurrentTime] = useState(8);
  const [showDetails, setShowDetails] = useState(false);
  const [chartUnit, setChartUnit] = useState('percent'); // 'percent' | 'kcal'
  const [expandedChart, setExpandedChart] = useState(null); // 'percent' | 'kcal' | 'glicemia' | ... per modale fullscreen
  const [activeHighlight, setActiveHighlight] = useState(null); // glossario: 'energia' | 'anabolica' | 'cortisolo' | 'sveglia' | 'digestione' | 'ora'
  const [bottomTab, setBottomTab] = useState('ai'); // 'desc' | 'ai' (metà inferiore modale)
  const [aiInsightsList, setAiInsightsList] = useState([]); // Array di { time: string, text: string }
  const [currentAiIndex, setCurrentAiIndex] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const highlightResetTimeoutRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1.8); // Partiamo con uno zoom maggiore per separare i nodi
  const [isChartTooltipActive, setIsChartTooltipActive] = useState(false);
  /** Anteprima curve (energia/kcal) durante drag nodo timeline; null = stato committato. */
  const [timelineStripPreview, setTimelineStripPreview] = useState(null);
  const timelineStripPreviewGenRef = useRef(0);
  const timelineStripPreviewDebounceRef = useRef(null);
  const timelineStripPreviewLatestRef = useRef(null);
  const timelineStripPreviewSlowRef = useRef(0);
  const timelineStripPreviewDisabledRef = useRef(false);
  const timelineStripPreviewDepsRef = useRef({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeAction, setActiveAction] = useState('home');
  const [activeBottomTab, setActiveBottomTab] = useState(readPersistedActiveBottomTab);
  const [eventUsage, setEventUsage] = useState(readPersistedEventUsage);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [slideDirection, setSlideDirection] = useState('slide-none');

  const trackEventUsage = useCallback((id) => {
    if (!Object.prototype.hasOwnProperty.call(EVENT_USAGE_DEFAULT, id)) return;
    setEventUsage((prev) => {
      const next = {
        ...EVENT_USAGE_DEFAULT,
        ...(prev && typeof prev === 'object' ? prev : {}),
      };
      next[id] = (Number(next[id]) || 0) + 1;
      try {
        localStorage.setItem(EVENT_USAGE_LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!MAIN_BOTTOM_TAB_ORDER.includes(activeBottomTab)) return;
    try {
      localStorage.setItem(ACTIVE_BOTTOM_TAB_LS_KEY, activeBottomTab);
    } catch {
      /* ignore */
    }
  }, [activeBottomTab]);

  useEffect(() => {
    if (!MAIN_BOTTOM_TAB_ORDER.includes(activeBottomTab)) {
      setActiveBottomTab('oggi');
    }
  }, [activeBottomTab]);

  const [mainTabTouchStartX, setMainTabTouchStartX] = useState(null);
  const [mainTabTouchEndX, setMainTabTouchEndX] = useState(null);
  const mainTabTouchStartXRef = useRef(null);
  const mainTabTouchEndXRef = useRef(null);
  const mainTabTouchStartYRef = useRef(null);
  const mainTabTouchEndYRef = useRef(null);
  const mainTabSwipeIgnoreRef = useRef(false);

  const handleMainTabTouchStart = useCallback((e) => {
    const el = e.target;
    if (el && typeof el.closest === 'function') {
      if (el.closest('.chart-scroll-container') || el.closest('.mini-timeline-hitbox')) {
        mainTabSwipeIgnoreRef.current = true;
        return;
      }
    }
    mainTabSwipeIgnoreRef.current = false;
    const touch = e.targetTouches[0];
    if (!touch) return;
    setMainTabTouchEndX(null);
    mainTabTouchEndXRef.current = null;
    setMainTabTouchStartX(touch.clientX);
    mainTabTouchStartXRef.current = touch.clientX;
    mainTabTouchStartYRef.current = touch.clientY;
    mainTabTouchEndYRef.current = touch.clientY;
  }, []);

  const handleMainTabTouchMove = useCallback((e) => {
    if (mainTabSwipeIgnoreRef.current) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      return;
    }
    const touch = e.targetTouches[0];
    if (!touch) return;
    setMainTabTouchEndX(touch.clientX);
    mainTabTouchEndXRef.current = touch.clientX;
    mainTabTouchEndYRef.current = touch.clientY;
  }, []);

  const handleMainTabTouchEnd = useCallback(
    (e) => {
      if (mainTabSwipeIgnoreRef.current) {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        mainTabSwipeIgnoreRef.current = false;
        setMainTabTouchStartX(null);
        setMainTabTouchEndX(null);
        mainTabTouchStartXRef.current = null;
        mainTabTouchEndXRef.current = null;
        return;
      }
      const startX = mainTabTouchStartXRef.current;
      const endX = mainTabTouchEndXRef.current ?? e.changedTouches?.[0]?.clientX ?? null;
      const startY = mainTabTouchStartYRef.current;
      const endY = mainTabTouchEndYRef.current ?? e.changedTouches?.[0]?.clientY ?? null;
      setMainTabTouchStartX(null);
      setMainTabTouchEndX(null);
      mainTabTouchStartXRef.current = null;
      mainTabTouchEndXRef.current = null;

      if (startX == null || endX == null) return;

      const minSwipeDistance = 50;
      const distance = startX - endX;
      const absDx = Math.abs(distance);
      const absDy = Math.abs((startY ?? 0) - (endY ?? 0));
      if (absDx < minSwipeDistance) return;
      if (absDx <= absDy * 1.25) return;

      const idx = MAIN_BOTTOM_TAB_ORDER.indexOf(activeBottomTab);
      if (idx < 0) return;

      if (distance > minSwipeDistance) {
        if (idx < MAIN_BOTTOM_TAB_ORDER.length - 1) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
          }
          setSlideDirection('slide-left');
          setActiveBottomTab(MAIN_BOTTOM_TAB_ORDER[idx + 1]);
        }
      } else if (distance < -minSwipeDistance) {
        if (idx > 0) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
          }
          setSlideDirection('slide-right');
          setActiveBottomTab(MAIN_BOTTOM_TAB_ORDER[idx - 1]);
        }
      }
    },
    [activeBottomTab]
  );

  const handleBottomNavTabSelect = useCallback(
    (tabId) => {
      if (tabId === 'menu') {
        setActiveAction('menu_secondary');
        setIsDrawerOpen(true);
        return;
      }
      const fromIdx = MAIN_BOTTOM_TAB_ORDER.indexOf(activeBottomTab);
      const toIdx = MAIN_BOTTOM_TAB_ORDER.indexOf(tabId);
      if (tabId !== activeBottomTab && toIdx >= 0 && fromIdx >= 0) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15);
        }
        if (toIdx > fromIdx) setSlideDirection('slide-left');
        else if (toIdx < fromIdx) setSlideDirection('slide-right');
      }
      setActiveBottomTab(tabId);
    },
    [activeBottomTab]
  );

  const handleMainTabTouchCancel = useCallback((e) => {
    if (mainTabSwipeIgnoreRef.current && typeof e?.stopPropagation === 'function') {
      e.stopPropagation();
    }
    mainTabSwipeIgnoreRef.current = false;
    setMainTabTouchStartX(null);
    setMainTabTouchEndX(null);
    mainTabTouchStartXRef.current = null;
    mainTabTouchEndXRef.current = null;
  }, []);

  const [pendingAiBatch, setPendingAiBatch] = useState(null);
  /** add_food con qty mancante: proposta da abitudine DB + storico, in attesa di Sì/No */
  const [pendingHabit, setPendingHabit] = useState(null);
  const [selectedMealCenter, setSelectedMealCenter] = useState(null);
  const [dailyMacroSheetOpen, setDailyMacroSheetOpen] = useState(false);
  /** Quadrante home (modalità base): kcal | pro | cho | fat */
  const [activeDialMode, setActiveDialMode] = useState('kcal');
  const [isMealBuilderOpen, setIsMealBuilderOpen] = useState(false);
  const [userModel, setUserModel] = useState(DEFAULT_USER_MODEL);
  const [lastCalibrationWeek, setLastCalibrationWeek] = useState(null);
  const [nervousSystemLoad, setNervousSystemLoad] = useState(30);
  const [simulationMode, setSimulationMode] = useState(false);
  const [simulationNodes, setSimulationNodes] = useState([]);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulatedLog, setSimulatedLog] = useState(null);
  const coreOsClickCount = useRef(0);
  const coreOsClickTimer = useRef(null);
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const activeActionRef = useRef(activeAction);
  const [addedFoods, setAddedFoods] = useState([]);
  const [showUnsavedMealWarning, setShowUnsavedMealWarning] = useState(false);
  const addedFoodsRef = useRef(addedFoods);
  const closeDrawerRef = useRef(null);
  useEffect(() => { isDrawerOpenRef.current = isDrawerOpen; }, [isDrawerOpen]);
  useEffect(() => { activeActionRef.current = activeAction; }, [activeAction]);
  useEffect(() => {
    if (addedFoodsRef) {
      addedFoodsRef.current = addedFoods;
    }
  }, [addedFoods]);
  useEffect(() => {
    closeDrawerRef.current = closeDrawer;
  });

  useEffect(() => {
    if (expandedChart == null) {
      if (highlightResetTimeoutRef.current) {
        clearTimeout(highlightResetTimeoutRef.current);
        highlightResetTimeoutRef.current = null;
      }
    }
    return () => {
      if (highlightResetTimeoutRef.current) {
        clearTimeout(highlightResetTimeoutRef.current);
        highlightResetTimeoutRef.current = null;
      }
    };
  }, [expandedChart]);

  useEffect(() => {
    window.history.pushState({ noExit: true }, '');
    const handlePopState = () => {
      if (isDrawerOpenRef.current) {
        if (
          activeActionRef.current === 'pasto' &&
          addedFoodsRef.current &&
          addedFoodsRef.current.length > 0
        ) {
          setShowUnsavedMealWarning(true);
          window.history.pushState({ drawer: 'open' }, '');
          return;
        }
        closeDrawerRef.current?.();
        window.history.pushState({ noExit: true }, '');
        return;
      }
      if (activeActionRef.current && activeActionRef.current !== 'home') {
        setActiveAction('home');
        window.history.pushState({ noExit: true }, '');
        return;
      }
      const confirmExit = window.confirm('Vuoi uscire da KentuOS?');
      if (!confirmExit) {
        window.history.pushState({ noExit: true }, '');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');

  // SOTTO-NAVIGAZIONE DIARIO
  const [diarioTab, setDiarioTab] = useState('storico');
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [telemetrySubTab, setTelemetrySubTab] = useState('macro');

  const toggleRecipe = useCallback((id) => {
    const key = id != null ? String(id) : '';
    if (!key) return;
    setExpandedRecipes((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const TELEMETRY_TABS = ['macro', 'bilanci', 'amino', 'vit', 'min', 'fat'];
  const telemetryScrollRef = useRef(null);
  const [expandedStoricoDate, setExpandedStoricoDate] = useState(null);

  // STRATEGIA E DATABASE
  const [dayProfile, setDayProfile] = useState('upper');
  const [calorieTuning, setCalorieTuning] = useState(0);
  const [foodDb, setFoodDb] = useState({});
  const { foodDb: csvFoodDb, loading: csvFoodDbLoading } = useFoodDb();
  const [dailyLog, setDailyLog] = useState([]);
  const dailyLogRef = useRef(dailyLog);
  dailyLogRef.current = dailyLog;
  const activeLog = isSimulationMode && simulatedLog != null ? simulatedLog : dailyLog;

  // STATI MODULI (Pasti, Acqua, Allenamento, Zen)
  const [mealType, setMealType] = useState('cena');
  const [mealPlannerGhostNote, setMealPlannerGhostNote] = useState('');
  const [mealBuilderSmartLaunchKey, setMealBuilderSmartLaunchKey] = useState(0);
  const [mealBuilderCoachPracticalKey, setMealBuilderCoachPracticalKey] = useState(0);
  const [coachPrefsTick, setCoachPrefsTick] = useState(0);
  const [hasNewInsight, setHasNewInsight] = useState(false);
  const [aiCoachBulbPulseCycles, setAiCoachBulbPulseCycles] = useState(0);
  const [isAiCoachBulbHovered, setIsAiCoachBulbHovered] = useState(false);
  const [isAiCoachInsightArmed, setIsAiCoachInsightArmed] = useState(false);
  const [dismissedAiCoachInsights, setDismissedAiCoachInsights] = useState(() => readDismissedAiCoachInsights());
  const [isAiCoachSuggestionModalOpen, setIsAiCoachSuggestionModalOpen] = useState(false);
  const hasNewInsightRef = useRef(false);
  const isAiCoachSuggestionActiveRef = useRef(false);
  const isUserActivelyEditingRef = useRef(false);
  const aiCoachInsightReminderTimeoutRef = useRef(null);
  const aiCoachInsightActivateTimeoutRef = useRef(null);
  const aiCoachCooldownUntilRef = useRef(0);
  const aiCoachLastInsightKeyRef = useRef(null);
  const [drawerMealTime, setDrawerMealTime] = useState(12);
  const [drawerMealTimeStr, setDrawerMealTimeStr] = useState('12:00');
  const [foodNameInput, setFoodNameInput] = useState('');
  const [foodWeightInput, setFoodWeightInput] = useState('');
  const [foodDropdownSuggestions, setFoodDropdownSuggestions] = useState([]);
  const [creaResults, setCreaResults] = useState([]);
  const [isCreaLoading, setIsCreaLoading] = useState(false);
  const creaUsdaAbortRef = useRef(null);
  const lastCreaNormalizedRef = useRef(null);
  const lastCreaQueryRef = useRef('');
  const usdaFusionDoneForQueryRef = useRef('');
  const [showFoodDropdown, setShowFoodDropdown] = useState(false);
  const [isGeneratingFood, setIsGeneratingFood] = useState(false);
  const [selectedFoodForCard, setSelectedFoodForCard] = useState(null);
  const [inspectedFood, setInspectedFood] = useState(null);
  const [editFoodData, setEditFoodData] = useState(null);
  const [isAIVerifying, setIsAIVerifying] = useState(false);

  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  /** One-shot bootstrap per MealBuilder dopo scansione OFF (nonce + match con row Firebase o bozza locale). */
  const [mealBuilderBarcodeBootstrap, setMealBuilderBarcodeBootstrap] = useState(null);
  const barcodeVideoRef = useRef(null);
  const barcodeStreamRef = useRef(null);
  const barcodeScanIntervalRef = useRef(null);
  const foodInputRef = useRef(null);

  const [selectedFoodForInfo, setSelectedFoodForInfo] = useState(null);
  const [selectedFoodForEdit, setSelectedFoodForEdit] = useState(null);
  const [nutrientModal, setNutrientModal] = useState(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [inputWeight, setInputWeight] = useState('');
  const [inputFat, setInputFat] = useState('');
  const [drawerMuscleMass, setDrawerMuscleMass] = useState('');
  const [drawerBodyWater, setDrawerBodyWater] = useState('');
  const [drawerVisceralFat, setDrawerVisceralFat] = useState('');
  const [bodyMetricsSaveToast, setBodyMetricsSaveToast] = useState(false);
  const [bodyMetricsHistory, setBodyMetricsHistory] = useState([]);
  const [predictiveCalibration, setPredictiveCalibration] = useState({ errors: [] });
  const [tdeeHistory, setTdeeHistory] = useState([]);
  const [addChoiceView, setAddChoiceView] = useState('main'); // 'main' | 'stimulant'
  const [stimulantSubtype, setStimulantSubtype] = useState('caffè'); // 'caffè' | 'tè' | 'energy drink'
  const [stimulantTime, setStimulantTime] = useState(8);
  const [addEventMenuOrder, setAddEventMenuOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(ADD_MENU_ORDER_LS_KEY);
      let order = saved ? JSON.parse(saved) : [...ADD_EVENT_MENU_DEFAULT_ORDER];
      if (!Array.isArray(order)) order = [...ADD_EVENT_MENU_DEFAULT_ORDER];
      order = order.filter((id) => id !== 'luce');
      const allIds = [...ADD_EVENT_MENU_DEFAULT_ORDER];
      let changed = false;
      allIds.forEach((id) => {
        if (!order.includes(id)) {
          if (id === 'plan') order.unshift('plan');
          else order.push(id);
          changed = true;
        }
      });
      if (changed || !saved) {
        localStorage.setItem(ADD_MENU_ORDER_LS_KEY, JSON.stringify(order));
      }
      return order;
    } catch (e) {
      return [...ADD_EVENT_MENU_DEFAULT_ORDER];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADD_MENU_ORDER_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const normalized = normalizeAddMenuOrderState(parsed, ADD_EVENT_MENU_DEFAULT_ORDER);
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        try {
          localStorage.setItem(ADD_MENU_ORDER_LS_KEY, JSON.stringify(normalized));
        } catch {
          /* ignore */
        }
        setAddEventMenuOrder(normalized);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const q = (foodNameInput || '').trim();
    if (!q) {
      setFoodDropdownSuggestions([]);
      return;
    }

    const matches = searchFoods(foodDb, q, {
      mode: 'autocomplete',
      limit: 5,
      includeUserHistory: true,
    }).map((item) => ({
      key: item.id,
      desc: item.name || item.id,
    }));

    setFoodDropdownSuggestions(matches);
  }, [foodNameInput, foodDb]);

  const [planningWizardOverlayOpen, setPlanningWizardOverlayOpen] = useState(false);
  /** Incrementato ad ogni apertura wizard: consente idratazione da Firebase senza sovrascrivere durante l’editing. */
  const [planningWizardHydrateNonce, setPlanningWizardHydrateNonce] = useState(0);
  const planningWizardMealConfirmGuardRef = useRef({ busy: false, lastAt: 0 });
  const dailyPlanMealConfirmGuardRef = useRef({ busy: false, lastAt: 0 });
  const [remotePlanning, setRemotePlanning] = useState(null);

  /** Piano settimanale: goal, kcal settimanale, giorni `{ [dateKey]: { type, kcalTarget } }`. Pasti non collegati. */
  const [weeklyPlan, setWeeklyPlan] = useState(createInitialWeeklyPlan);
  const weeklyPlanningRemoteSigRef = useRef('');
  const weeklyPlanningListenerReadyRef = useRef(false);
  const weeklyPlanRef = useRef(weeklyPlan);
  weeklyPlanRef.current = weeklyPlan;

  const [showSpieInfo, setShowSpieInfo] = useState(false); // Modale spiegazione spie
  const [isFullScreenGraph, setIsFullScreenGraph] = useState(false);
  const availableFullscreenCharts = ['percent', 'cortisolo', 'calorieTimeline', 'glicemia', 'idratazione', 'neuro', 'digestione', 'kcal'];
  const [fullscreenChartIndex, setFullscreenChartIndex] = useState(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(orientation: landscape)");

    const handleOrientationChange = (e) => {
      // Se diventa landscape, attiva il fullscreen. Altrimenti lo disattiva.
      setIsFullScreenGraph(e.matches);
    };

    // Controllo iniziale nel caso l'app venga aperta già in orizzontale
    if (mediaQuery.matches) {
      setIsFullScreenGraph(true);
    }

    // Aggiungi il listener
    mediaQuery.addEventListener("change", handleOrientationChange);

    // Cleanup
    return () => mediaQuery.removeEventListener("change", handleOrientationChange);
  }, []);

  const [showTrainingPopup, setShowTrainingPopup] = useState(false);
  const [showAlcoholPopup, setShowAlcoholPopup] = useState(false);
  const [showLongevityModal, setShowLongevityModal] = useState(false);
  const [longevityDays, setLongevityDays] = useState(7);
  const [expandedRiskId, setExpandedRiskId] = useState(null);
  const [alcoholForm, setAlcoholForm] = useState({ subtype: 'vino', ml: 150, abv: 12, timeStr: '20:00' });
  const [showSncPopup, setShowSncPopup] = useState(false);
  const [showSleepPrompt, setShowSleepPrompt] = useState(false);
  /** null | { editingId: string | null } — editingId null = nuovo sonno */
  const [sleepModal, setSleepModal] = useState(null);
  const [sleepFormBedStr, setSleepFormBedStr] = useState('23:00');
  const [sleepFormWakeStr, setSleepFormWakeStr] = useState('07:00');

  useEffect(() => {
    if (sleepModal == null) return;
    const logSrc = isSimulationMode ? (simulatedLog || []) : dailyLog;
    const item = sleepModal.editingId
      ? logSrc.find((e) => e?.id === sleepModal.editingId && e?.type === 'sleep')
      : null;
    if (sleepModal.editingId && !item) {
      console.warn('[SalaComandi] sleep entry not found for edit', { editingId: sleepModal.editingId });
    }
    if (item) {
      const bed = Number(item.bedtime ?? item.sleepStart);
      const wake = Number(item.wakeTime ?? item.sleepEnd);
      setSleepFormBedStr(decimalToTimeStr(Number.isFinite(bed) ? bed : 23));
      setSleepFormWakeStr(decimalToTimeStr(Number.isFinite(wake) ? wake : 7.5));
    } else {
      setSleepFormBedStr('23:00');
      setSleepFormWakeStr('07:00');
    }
  }, [sleepModal, isSimulationMode, dailyLog, simulatedLog]);

  const [selectedNodeReport, setSelectedNodeReport] = useState(null);
  /** Menu inserimento rapido timeline: `{ hour, view: 'main' | 'events' }`. */
  const [timelineInsertUI, setTimelineInsertUI] = useState(null);
  const [editingQuickNode, setEditingQuickNode] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState({
    gender: 'M',
    age: 30,
    weight: 75,
    height: 175,
    activityLevel: '1.55',
    goal: 'maintain',
    nutritionGoal: 'maintain',
    targetCalories: 2000,
    proteinTarget: null,
    level: 'base'
  });
  const [userTargets, setUserTargets] = useState({ ...DEFAULT_TARGETS });
  const [birthDate, setBirthDate] = useState('');
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;

  const nutritionGoalsValue = useMemo(
    () => buildNutritionGoalsSnapshot(userProfile, userTargets),
    [userProfile, userTargets]
  );

  const [workoutType, setWorkoutType] = useState('pesi');
  const [workoutKcal, setWorkoutKcal] = useState(300);
  const [workoutEndTime, setWorkoutEndTime] = useState(19);
  const [workoutDurationMin, setWorkoutDurationMin] = useState(30);
  const [workoutStrengthDetail, setWorkoutStrengthDetail] = useState('');
  const [workoutMuscles, setWorkoutMuscles] = useState([]);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);

  const workoutDurationHours = Math.max(0.25, Math.min(24, Number(workoutDurationMin) || 30) / 60);
  const workoutStartTime = (() => {
    let s = Number(workoutEndTime) - workoutDurationHours;
    if (s < 0) s += 24;
    if (s >= 24) s -= 24;
    return s;
  })();

  const dailyWaterGoal = userTargets.water ?? 2500; 
  const [isZenActive, setIsZenActive] = useState(false);
  const [zenBreathPhase, setZenBreathPhase] = useState(null);
  const [zenSunScale, setZenSunScale] = useState(1);
  /** Audio guidato sul respiro: nessuno | mare (ondemare) */
  const [audioMode, setAudioMode] = useState('muted');
  /** Paesaggio sonoro continuo foresta (indipendente dai fade del respiro) */
  const [zenForestAmbientOn, setZenForestAmbientOn] = useState(false);
  const [zenBreathPatternId, setZenBreathPatternId] = useState('square');
  const [zenSessionDurationKey, setZenSessionDurationKey] = useState('3');
  const [zenSessionRemainingSec, setZenSessionRemainingSec] = useState(null);
  const [zenGracefulEnd, setZenGracefulEnd] = useState(false);
  const neuralResetAudioRef = useRef(null);
  const neuralResetBellRef = useRef(null);
  const zenAmbientForestRef = useRef(null);
  const zenAmbientFadeIntervalRef = useRef(null);
  const neuralResetFadeIntervalRef = useRef(null);
  const zenSessionEndTriggeredRef = useRef(false);
  const zenEndSessionTimeoutRef = useRef(null);
  const neuralResetAudioContextRef = useRef(null);
  const neuralResetGainRef = useRef(null);
  const neuralResetMediaSourceCreatedRef = useRef(false);

  const clearNeuralResetFades = useCallback(() => {
    if (neuralResetFadeIntervalRef.current != null) {
      clearInterval(neuralResetFadeIntervalRef.current);
      neuralResetFadeIntervalRef.current = null;
    }
    const ctx = neuralResetAudioContextRef.current;
    const gain = neuralResetGainRef.current;
    if (ctx && gain) {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
      } catch {
        /* noop */
      }
    }
  }, []);

  const ensureNeuralResetWebAudio = useCallback(() => {
    const el = neuralResetAudioRef.current;
    if (!el) return null;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    if (!neuralResetAudioContextRef.current) {
      neuralResetAudioContextRef.current = new AC();
    }
    const ctx = neuralResetAudioContextRef.current;
    if (!neuralResetGainRef.current) {
      const g = ctx.createGain();
      g.connect(ctx.destination);
      neuralResetGainRef.current = g;
    }
    const gain = neuralResetGainRef.current;
    if (!neuralResetMediaSourceCreatedRef.current) {
      try {
        const src = ctx.createMediaElementSource(el);
        src.connect(gain);
        neuralResetMediaSourceCreatedRef.current = true;
        const v = el.volume;
        el.volume = 1;
        gain.gain.value = v > 0 ? v : 1;
      } catch {
        return null;
      }
    }
    return { ctx, gain };
  }, []);

  const ZEN_AMBIENT_TARGET_VOL = 0.35;
  const ZEN_AMBIENT_FADE_MS = 2000;

  const clearZenAmbientFade = useCallback(() => {
    if (zenAmbientFadeIntervalRef.current != null) {
      clearInterval(zenAmbientFadeIntervalRef.current);
      zenAmbientFadeIntervalRef.current = null;
    }
  }, []);

  /** Fade sul solo elemento ambient (non tocca Web Audio del respiro). */
  const fadeZenAmbientVolume = useCallback((targetVol, durationMs, onComplete) => {
    const el = zenAmbientForestRef.current;
    if (!el) {
      onComplete?.();
      return;
    }
    clearZenAmbientFade();
    const safeTarget = Math.max(0, Math.min(1, targetVol));
    const startVol = el.volume;
    const tickMs = 32;
    const t0 = performance.now();
    const dur = Math.max(1, durationMs);
    const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const w = easeInOut(t);
      el.volume = startVol + (safeTarget - startVol) * w;
      if (t >= 1) {
        el.volume = safeTarget;
        clearInterval(id);
        zenAmbientFadeIntervalRef.current = null;
        onComplete?.();
      }
    }, tickMs);
    zenAmbientFadeIntervalRef.current = id;
  }, [clearZenAmbientFade]);

  const fadeAudio = useCallback((targetVolume, durationMs) => {
    const el = neuralResetAudioRef.current;
    if (!el) return;
    clearNeuralResetFades();
    const safeTarget = Math.max(0, Math.min(1, targetVolume));
    const floor = 0.0001;
    const rampEnd = Math.max(floor, safeTarget);
    const durationSec = Math.max(0.02, durationMs / 1000);

    const graph = ensureNeuralResetWebAudio();
    if (graph) {
      const { ctx, gain } = graph;
      ctx.resume().catch(() => {});
      const param = gain.gain;
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      if (safeTarget <= 0) {
        const cur = Math.max(param.value, 0);
        param.setValueAtTime(cur, now);
        param.linearRampToValueAtTime(0, now + durationSec);
        return;
      }
      const current = Math.max(param.value, floor);
      param.setValueAtTime(current, now);
      try {
        param.exponentialRampToValueAtTime(rampEnd, now + durationSec);
      } catch {
        param.linearRampToValueAtTime(safeTarget, now + durationSec);
      }
      return;
    }

    const startVol = Math.max(el.volume, safeTarget <= 0 ? 0 : floor);
    const endVol = safeTarget <= 0 ? 0 : rampEnd;
    const tickMs = 32;
    const startTime = performance.now();
    const safeDur = Math.max(1, durationMs);
    const id = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / safeDur);
      let v;
      if (safeTarget <= 0) {
        v = startVol * (1 - t);
      } else {
        v = startVol * (endVol / Math.max(startVol, floor)) ** t;
      }
      el.volume = Math.min(1, Math.max(0, v));
      if (t >= 1) {
        el.volume = safeTarget;
        clearInterval(id);
        if (neuralResetFadeIntervalRef.current === id) neuralResetFadeIntervalRef.current = null;
      }
    }, tickMs);
    neuralResetFadeIntervalRef.current = id;
  }, [clearNeuralResetFades, ensureNeuralResetWebAudio]);

  const endZenSessionGracefully = useCallback(() => {
    setZenGracefulEnd(true);
    if (zenSessionDurationKey !== 'infinite') {
      setZenSessionRemainingSec(0);
    }
    setZenBreathPhase(null);
    setZenSunScale(1);
    const bell = neuralResetBellRef.current;
    if (bell) {
      bell.currentTime = 0;
      bell.volume = 1;
      bell.play().catch(() => {});
    }
    fadeAudio(0, 2600);
    fadeZenAmbientVolume(0, 2600, () => {
      const amb = zenAmbientForestRef.current;
      if (amb) {
        amb.pause();
        amb.currentTime = 0;
      }
      setZenForestAmbientOn(false);
    });
    if (zenEndSessionTimeoutRef.current) {
      clearTimeout(zenEndSessionTimeoutRef.current);
      zenEndSessionTimeoutRef.current = null;
    }
    zenEndSessionTimeoutRef.current = window.setTimeout(() => {
      zenEndSessionTimeoutRef.current = null;
      setIsZenActive(false);
      setZenGracefulEnd(false);
      setZenSessionRemainingSec(null);
      const el = neuralResetAudioRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      clearNeuralResetFades();
      const g = neuralResetGainRef.current;
      const ctx = neuralResetAudioContextRef.current;
      if (ctx && g) {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.value = 1;
        } catch {
          /* noop */
        }
      }
      if (el) el.volume = 1;
      zenSessionEndTriggeredRef.current = false;
      clearZenAmbientFade();
      const amb = zenAmbientForestRef.current;
      if (amb) {
        amb.pause();
        amb.currentTime = 0;
        amb.volume = 0;
      }
    }, 2800);
  }, [clearNeuralResetFades, clearZenAmbientFade, fadeAudio, fadeZenAmbientVolume, zenSessionDurationKey]);

  const zenSunTransitionMs = useMemo(() => {
    if (zenGracefulEnd && !zenBreathPhase) return 2500;
    if (!zenBreathPhase) return 4000;
    return getNeuralResetZenStep(zenBreathPatternId, zenBreathPhase)?.ms ?? 4000;
  }, [zenBreathPatternId, zenBreathPhase, zenGracefulEnd]);

  const zenSunDimHold = useMemo(() => {
    const step = zenBreathPhase ? getNeuralResetZenStep(zenBreathPatternId, zenBreathPhase) : null;
    return !!step?.dimHold;
  }, [zenBreathPatternId, zenBreathPhase]);

  const zenTimerLine = useMemo(() => {
    if (!isZenActive) return null;
    if (zenGracefulEnd) return '00:00';
    if (zenSessionDurationKey === 'infinite') return 'Senza limite';
    if (zenSessionRemainingSec == null) return null;
    if (zenSessionRemainingSec <= 0) return '00:00';
    const m = Math.floor(zenSessionRemainingSec / 60);
    const s = Math.max(0, zenSessionRemainingSec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [isZenActive, zenGracefulEnd, zenSessionDurationKey, zenSessionRemainingSec]);

  // AI ASSISTANT E CLUSTER
  const [apiKeys, setApiKeys] = useState(() => JSON.parse(localStorage.getItem('ghost_api_cluster')) || ['']);
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const stored = readKentuChatHistoryFromLocalStorage(getTodayString());
      if (stored) return stored;
    } catch {
      /* noop */
    }
    return [{ sender: 'ai', text: introPhrase }];
  });
  const skipKentuChatPersistRef = useRef(false);
  const kentuChatBoundDateRef = useRef(null);
  /** Strategia calorica giornaliera da comandi invisibili chat (deficit / pari / surplus). */
  const [kentuDailyCalorieStrategy, setKentuDailyCalorieStrategy] = useState('pari');
  const CHAT_HISTORY_WINDOW = 10;
  const lastDinnerOptionsRef = useRef(null);
  const lastAgendaOptionsRef = useRef(null);
  const kentuAgendaAwaitingRef = useRef(false);
  /** Flusso chat: conferma orario allenamento prima del log. */
  const pendingWorkoutFlowRef = useRef(null);
  /** Contesto per prompt AI: allenamento programmato nel futuro (no pasti "adesso"). */
  const scheduledWorkoutContextRef = useRef(null);
  const lastLogFromFirebaseRef = useRef(null);
  const pendingLogRef = useRef(null);
  const pendingNodesRef = useRef(null);
  const csvInputRef = useRef(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [startupSafetyBypass, setStartupSafetyBypass] = useState(false);

  useEffect(() => {
    setStartupSafetyBypass(false);
    const t = window.setTimeout(() => setStartupSafetyBypass(true), 5000);
    return () => window.clearTimeout(t);
  }, [userUid]);

  const [fullStorico, setFullStorico] = useState(null);
  const [fullHistory, setFullHistory] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [showDateCalendarModal, setShowDateCalendarModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [trendModalMetric, setTrendModalMetric] = useState(null);
  const [trendDays, setTrendDays] = useState(30);
  const [reportViewedDates, setReportViewedDates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reportViewedDates')) || {}; } catch { return {}; }
  });
  const [reportPeriod, setReportPeriod] = useState('7');
  const [currentDateObj, setCurrentDateObj] = useState(() => new Date());
  const [calendarMonthIso, setCalendarMonthIso] = useState(() => getTodayString().slice(0, 7));

  const currentTrackerDate = useMemo(() => {
    const offset = currentDateObj.getTimezoneOffset() * 60000;
    return new Date(currentDateObj.getTime() - offset).toISOString().slice(0, 10);
  }, [currentDateObj]);

  const calendarZoneByDate = useMemo(() => {
    const out = {};
    if (!fullHistory || typeof fullHistory !== 'object' || !userTargets) return out;
    const anchor = getTodayString();
    for (let i = 0; i < 60; i += 1) {
      const d = addDays(anchor, -i);
      try {
        const matrix = computeRiskMatrix(fullHistory, userTargets, 1, addDays(d, 1));
        const score = computeLongevityMasterScoreFromMatrix(matrix);
        const zone = score >= 85 ? 'blue' : score >= 70 ? 'green' : score >= 55 ? 'orange' : 'red';
        out[d] = { zone, score };
      } catch {
        // keep day uncolored if matrix cannot be computed
      }
    }
    return out;
  }, [fullHistory, userTargets]);

  const calendarGridDays = useMemo(() => {
    const [yy, mm] = String(calendarMonthIso || '').split('-').map(Number);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return [];
    const first = new Date(yy, mm - 1, 1);
    const startWeekday = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(yy, mm - 1, day);
      const offset = d.getTimezoneOffset() * 60000;
      const iso = new Date(d.getTime() - offset).toISOString().slice(0, 10);
      cells.push(iso);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonthIso]);

  useEffect(() => {
    const d = currentTrackerDate || getTodayString();
    skipKentuChatPersistRef.current = true;
    const stored = readKentuChatHistoryFromLocalStorage(d);
    const prevBound = kentuChatBoundDateRef.current;
    kentuChatBoundDateRef.current = d;
    if (stored) {
      setChatHistory(stored);
    } else if (prevBound != null && prevBound !== d) {
      setChatHistory([{ sender: 'ai', text: introPhrase }]);
    }
  }, [currentTrackerDate, introPhrase]);

  useEffect(() => {
    if (skipKentuChatPersistRef.current) {
      skipKentuChatPersistRef.current = false;
      return;
    }
    const d = currentTrackerDate || getTodayString();
    if (kentuChatBoundDateRef.current !== d) return;
    try {
      const payload = kentuChatHistoryForPersistence(chatHistory);
      localStorage.setItem(kentuChatStorageKey(d), JSON.stringify(payload));
    } catch {
      /* quota / private mode */
    }
  }, [chatHistory, currentTrackerDate]);

  useEffect(() => {
    scheduledWorkoutContextRef.current = null;
  }, [currentTrackerDate]);

  useEffect(() => {
    const d = currentTrackerDate || getTodayString();
    try {
      const v = localStorage.getItem(`kentu_cal_strategy_${d}`);
      if (v === 'deficit' || v === 'pari' || v === 'surplus') {
        setKentuDailyCalorieStrategy(v);
      } else {
        setKentuDailyCalorieStrategy('pari');
      }
    } catch {
      setKentuDailyCalorieStrategy('pari');
    }
  }, [currentTrackerDate]);

  const selectedNodeReportPrevRef = useRef(null);
  useEffect(() => {
    setExpandedRecipes({});
  }, [currentTrackerDate]);

  useEffect(() => {
    if (activeAction !== 'diario_giornaliero') setExpandedRecipes({});
  }, [activeAction]);

  useEffect(() => {
    setExpandedRecipes({});
  }, [diarioTab]);

  useEffect(() => {
    if (selectedNodeReportPrevRef.current != null && selectedNodeReport == null) {
      setExpandedRecipes({});
    }
    selectedNodeReportPrevRef.current = selectedNodeReport;
  }, [selectedNodeReport]);

  /** Carico allostatico (0–100) ultimi 60gg → tetto energia in generateRealEnergyData */
  const accumuloSNC = useMemo(() => {
    if (!fullHistory || typeof fullHistory !== 'object') return 0;
    return computeAccumuloSNC(fullHistory, 60);
  }, [fullHistory]);

  /** Serie giornaliera reale (Firebase `fullHistory`) per la bussola metabolica. */
  const metabolicCompassDailyHistory = useMemo(
    () =>
      buildMetabolicCompassDailyHistory(
        fullHistory,
        currentTrackerDate || getTodayString(),
        userTargets
      ),
    [fullHistory, currentTrackerDate, userTargets]
  );

  // Alias semantico: livello SNC usato in UI / allarmi.
  const sncStressLevel = accumuloSNC;

  const [idealStrategy, setIdealStrategy] = useState(() => {
    try {
      const saved = localStorage.getItem('vyta_idealStrategy');
      return migrateIdealStrategy(saved ? JSON.parse(saved) : null);
    } catch {
      return migrateIdealStrategy(null);
    }
  });

  const [manualNodes, setManualNodes] = useState(() => {
    const saved = localStorage.getItem('vyta_timeline');
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  });
  const manualNodesRef = useRef(manualNodes);
  manualNodesRef.current = manualNodes;
  const waterIntake = useMemo(() => manualNodes.filter(n => n.type === 'water').reduce((acc, n) => acc + (n.ml ?? n.amount ?? 0), 0), [manualNodes]);
  const [draggingNode, setDraggingNode] = useState(null);
  const [touchingNodeId, setTouchingNodeId] = useState(null);
  const [historyStack, setHistoryStack] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showUndoToast, setShowUndoToast] = useState(false);
  /** Modale trascina-in-zona-cancella per ghost_meal / ghost_workout */
  const [ghostProgramDeleteModal, setGhostProgramDeleteModal] = useState(null);
  const [programmingRemovedToast, setProgrammingRemovedToast] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragLiveTime, setDragLiveTime] = useState(null);
  const dragEngine = useRef({
    isActive: false,
    nodeId: null,
    nodeType: null,
    startX: 0,
    initialTime: 0,
    lastX: 0,
    lastTime: 0,
    currentLiveTime: 0
  });
  const timelineContainerRef = useRef(null);
  const chartScrollRef = useRef(null);
  const initialPinchDistance = useRef(null);
  const initialZoomLevel = useRef(1);
  const chartTouchTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressMoveCleanupRef = useRef(null);
  const pendingClickRef = useRef(null);
  const historyStackRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const dragOffsetYRef = useRef(0);
  const miniTimelinePastoRef = useRef(null);
  const miniTimelineActivityRef = useRef(null);
  const miniTimelineWaterRef = useRef(null);
  const [drawerWaterTime, setDrawerWaterTime] = useState(12);
  const [drawerFastChargeStart, setDrawerFastChargeStart] = useState(12);
  const [drawerFastChargeEnd, setDrawerFastChargeEnd] = useState(12.5);
  const [drawerFastChargeTime, setDrawerFastChargeTime] = useState(12);
  const [fastChargeSupplementName, setFastChargeSupplementName] = useState('');
  const currentTrackerDateRef = useRef(currentTrackerDate);
  useEffect(() => { currentTrackerDateRef.current = currentTrackerDate; }, [currentTrackerDate]);
  useEffect(() => { historyStackRef.current = historyStack; historyIndexRef.current = historyIndex; }, [historyStack, historyIndex]);

  const pushTimelineUndoSnapshot = useCallback((newDailyLog, newManualNodes) => {
    const newStack = historyStackRef.current.slice(0, historyIndexRef.current + 1);
    newStack.push({
      dailyLog: JSON.parse(JSON.stringify(newDailyLog)),
      manualNodes: JSON.parse(JSON.stringify(newManualNodes)),
    });
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
    setShowUndoToast(true);
    setTimeout(() => setShowUndoToast(false), 4000);
  }, []);

  // Weekly adaptive calibration of physiological coefficients
  // The simulation gradually learns the user's metabolic responses.
  useEffect(() => {
    if (!fullHistory || !currentTrackerDate) return;

    const date = new Date(currentTrackerDate + 'T12:00:00');
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);

    const weekKey = monday.toISOString().slice(0, 10);

    if (weekKey === lastCalibrationWeek) return;

    try {
      const weeklyData = buildWeeklyDataFromHistory(
        fullHistory,
        userModel,
        idealStrategy,
        weekKey
      );

      const newModel = calibrateUserModel(
        weeklyData,
        userModel
      );

      setUserModel(newModel);
      setLastCalibrationWeek(weekKey);
    } catch (err) {
      console.warn('Weekly calibration skipped:', err);
    }
  }, [fullHistory, currentTrackerDate]);

  useEffect(() => {
    if (draggingNode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [draggingNode]);

  const CURRENT_TIME_VIEW_OFFSET = 0.3; // ora attuale al 30% da sinistra (più spazio a destra per la proiezione)

  const centerCurrentTime = useCallback(() => {
    if (!chartScrollRef.current) return;
    const container = chartScrollRef.current;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;

    if (currentTrackerDate === getTodayString()) {
      const chartWidth =
        scrollWidth - CHART_AXIS_GUTTER_LEFT_PX - CHART_AXIS_GUTTER_RIGHT_PX - 15;
      const timePos = (getTimePositionPercent(currentTime) / 100) * chartWidth;
      const targetScroll = timePos - (clientWidth * CURRENT_TIME_VIEW_OFFSET);
      container.scrollLeft = Math.max(0, Math.min(targetScroll, scrollWidth - clientWidth));
    } else {
      container.scrollLeft = scrollWidth;
    }
  }, [currentTime, currentTrackerDate, zoomLevel]);

  const fullscreenChartScrollRef = useRef(null);

  const centerCurrentTimeFullscreen = useCallback(() => {
    if (!fullscreenChartScrollRef.current) return;
    const container = fullscreenChartScrollRef.current;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    if (currentTrackerDate === getTodayString()) {
      const chartWidth = Math.max(
        scrollWidth - CHART_AXIS_GUTTER_LEFT_PX - CHART_AXIS_GUTTER_RIGHT_PX - 15,
        1
      );
      const timePos = (getTimePositionPercent(currentTime) / 100) * chartWidth;
      const targetScroll = timePos - (clientWidth * CURRENT_TIME_VIEW_OFFSET);
      container.scrollLeft = Math.max(0, Math.min(targetScroll, scrollWidth - clientWidth));
    } else {
      container.scrollLeft = Math.max(0, scrollWidth - clientWidth);
    }
  }, [currentTime, currentTrackerDate, zoomLevel]);

  const handleCenterZoomAndPan = useCallback(() => {
    setZoomLevel(1);
    const runPan = () => {
      if (isFullScreenGraph && fullscreenChartScrollRef.current) {
        centerCurrentTimeFullscreen();
      } else if (chartScrollRef.current) {
        centerCurrentTime();
      }
    };
    setTimeout(runPan, 120);
  }, [isFullScreenGraph, centerCurrentTime, centerCurrentTimeFullscreen]);

  useEffect(() => {
    const timer = setTimeout(centerCurrentTime, 50);
    return () => clearTimeout(timer);
  }, [currentTime, zoomLevel, centerCurrentTime]);

  // Forza la centratura del grafico su tab Analisi o con interfaccia Pro su Oggi
  useEffect(() => {
    if (activeBottomTab === 'analisi' || userProfile?.level === 'pro') {
      const timer = setTimeout(() => centerCurrentTime(), 100);
      return () => clearTimeout(timer);
    }
  }, [userProfile?.level, currentTrackerDate, zoomLevel, centerCurrentTime, activeBottomTab]);

  const handleChartTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      initialPinchDistance.current = dist;
      initialZoomLevel.current = zoomLevel;
    }
  };
  const handleChartTouchMove = (e) => {
    if (e.touches.length === 2 && initialPinchDistance.current != null) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const scale = currentDist / initialPinchDistance.current;
      let newZoom = initialZoomLevel.current * scale;
      newZoom = Math.max(0.45, Math.min(1.5, newZoom));
      setZoomLevel(newZoom);
    }
  };
  const handleChartTouchEnd = () => {
    initialPinchDistance.current = null;
  };

  // ============================================================================
  // COMPUTED CON RETROCOMPATIBILITÀ
  // ============================================================================

  const getStrategyKey = (mealType) => {
    const map = {
      colazione: 'colazione',
      merenda1: 'colazione',
      snack: 'snack',
      merenda_am: 'snack',
      merenda_pm: 'snack',
      merenda2: 'snack',
      spuntino: 'snack',
      pranzo: 'pranzo',
      cena: 'cena',
    };
    return map[mealType] || toCanonicalMealType(mealType) || mealType;
  };

  const computedMealNodes = useMemo(() => {
    const groups = {};
    (activeLog || []).forEach((f) => {
      if (f.type !== 'food' && f.type !== 'recipe') return;
      const typeKey = f.mealType || 'pasto';
      const timeKey =
        typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime)
          ? String(f.mealTime)
          : 'unknown';
      const mealId = `${typeKey}_${timeKey}`;
      const foodKcal = Number(f.kcal ?? f.cal ?? 0) || 0;
      if (!groups[mealId]) {
        groups[mealId] = {
          mealId,
          mealType: typeKey,
          originalTypes: new Set(),
          time: typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime) ? f.mealTime : 12,
          strategyKey: getStrategyKey(toCanonicalMealType(String(typeKey).split('_')[0])),
          kcal: 0,
          items: [],
        };
      }
      groups[mealId].kcal += foodKcal;
      groups[mealId].originalTypes.add(f.mealType);
      groups[mealId].items.push({ ...f });
      if (typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime)) {
        groups[mealId].time = f.mealTime;
      }
    });

    return Object.values(groups).map((m) => ({
      id: m.mealId,
      mealId: m.mealId,
      type: 'meal',
      time: m.time,
      mealType: m.mealType,
      strategyKey: m.strategyKey,
      kcal: m.kcal ?? 0,
      originalTypes: Array.from(m.originalTypes),
      items: m.items,
      foods: (m.items || []).map((it) => ({ ...it })),
      icon: getMealIcon(String(m.mealType).split('_')[0]),
    }));
  }, [activeLog]);

  const ghostMealTimelineNodes = useMemo(() => {
    return (activeLog || [])
      .filter((e) => e && e.type === 'ghost_meal')
      .map((e) => {
        let t = e.mealTime;
        if (typeof t !== 'number' || Number.isNaN(t)) {
          const parsed = parseFlexibleTimeToDecimal(String(e.time || e.mealTime || '12:00'));
          t = parsed != null ? parsed : 12;
        }
        return {
          id: e.id || `ghost_tl_${e.mealType}_${t}`,
          type: 'ghost_meal',
          time: t,
          mealType: e.mealType,
          title: e.title,
          microDesc: e.microDesc,
          draftFoods: Array.isArray(e.draftFoods) ? e.draftFoods : [],
          foods: normalizeGhostFoodsForTimelineNode(e),
          isGhost: true,
        };
      });
  }, [activeLog]);

  const computedActivityTimelineNodes = useMemo(() => {
    return (activeLog || [])
      .filter((e) => e && (e.type === 'workout' || e.type === 'activity'))
      .map((e, idx) => {
        let t = Number(e.time);
        if (!Number.isFinite(t)) t = Number(e.mealTime);
        if (!Number.isFinite(t)) {
          const parsed = parseFlexibleTimeToDecimal(String(e.time || e.mealTime || '12:00'));
          t = parsed != null ? parsed : 12;
        }
        const normalizedTime = Math.max(0, Math.min(23.99, t));
        const isCardio =
          String(e.workoutType || e.activity || '').toLowerCase() === 'cardio' ||
          /cardio|corsa|bike|hiit/i.test(String(e.name || e.desc || ''));
        return {
          id: e.id || `wk_tl_${normalizedTime}_${idx}`,
          type: 'workout',
          subType: isCardio ? 'cardio' : 'pesi',
          time: normalizedTime,
          mealTime: normalizedTime,
          duration: Number.isFinite(Number(e.duration)) ? Math.max(0.25, Number(e.duration)) : 1,
          kcal: Number.isFinite(Number(e.kcal)) ? Number(e.kcal) : (Number.isFinite(Number(e.cal)) ? Number(e.cal) : 0),
          cal: Number.isFinite(Number(e.cal)) ? Number(e.cal) : (Number.isFinite(Number(e.kcal)) ? Number(e.kcal) : 0),
          name: e.name || e.desc || (isCardio ? 'Cardio' : 'Allenamento'),
          desc: e.desc || e.name || '',
          icon: isCardio ? '🏃' : '🏋️',
        };
      });
  }, [activeLog]);

  const allNodes = useMemo(() => {
    return [...computedMealNodes, ...ghostMealTimelineNodes, ...computedActivityTimelineNodes, ...manualNodes]
      .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
  }, [computedMealNodes, ghostMealTimelineNodes, computedActivityTimelineNodes, manualNodes]);

  const activeNodes = simulationMode ? simulationNodes : allNodes;

  const effectiveWakeTimeForSleep = useMemo(() => {
    const sleepEntry = (activeLog || []).find(e => e?.type === 'sleep');
    if (!sleepEntry) return null;
    let wt = sleepEntry.wakeTime;
    if (wt == null || typeof wt !== 'number') {
      const start = sleepEntry.sleepStart ?? 0;
      const duration = sleepEntry.duration ?? sleepEntry.hours ?? sleepEntry.sleepHours ?? 7;
      wt = start + duration;
      if (wt >= 24) wt -= 24;
    }
    return Number(wt);
  }, [activeLog]);

  const nodesForEnergySimulation = useMemo(() => {
    const base = activeNodes || [];
    const sleepEntry = (activeLog || []).find(e => e?.type === 'sleep');
    if (!sleepEntry) return base;
    const sleepHours = sleepEntry.hours ?? sleepEntry.duration ?? sleepEntry.sleepHours ?? 7;
    const deepMin = sleepEntry.deepMin ?? sleepEntry.deepMinutes ?? (typeof sleepEntry.deep === 'number' ? sleepEntry.deep : 60);
    const remMin = sleepEntry.remMin ?? sleepEntry.remMinutes ?? (typeof sleepEntry.rem === 'number' ? sleepEntry.rem : 60);
    const wakeTime = effectiveWakeTimeForSleep != null ? effectiveWakeTimeForSleep : 7;
    const sleepNode = {
      id: 'sleep',
      type: 'sleep',
      time: wakeTime,
      duration: sleepHours,
      hours: sleepHours,
      wakeTime,
      deepMin,
      remMin,
      sleepStart: sleepEntry.sleepStart ?? 0
    };
    return [...base, sleepNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }, [activeNodes, activeLog, effectiveWakeTimeForSleep]);

  const dailyLogForEnergy = useMemo(() => {
    const log = activeLog || [];
    if (effectiveWakeTimeForSleep == null) return log;
    return log.map(e => e.type === 'sleep' ? { ...e, wakeTime: effectiveWakeTimeForSleep } : e);
  }, [activeLog, effectiveWakeTimeForSleep]);

  /** Pilota idratazione: nessun record acqua → nessun malus; un solo log/nodo acqua attiva il calcolo reale. */
  const isWaterHydrationAutoPilot = useMemo(
    () => computeWaterHydrationAutoPilot(dailyLogForEnergy, nodesForEnergySimulation),
    [dailyLogForEnergy, nodesForEnergySimulation]
  );

  const allNodesWithStack = useMemo(() => {
    const endTime = (n) => {
      if (n.type === 'work' || n.type === 'cognitive') return n.time + (n.duration || 1);
      if (n.type === 'nap' || n.type === 'meditation') return n.time + (n.duration ?? 0.25);
      return n.time;
    };
    const overlaps = (a, b) => {
      const aEnd = endTime(a);
      const bEnd = endTime(b);
      return a.time <= bEnd && b.time <= aEnd;
    };
    return allNodes.map((node, i) => {
      let stackIndex = 0;
      for (let j = 0; j < i; j++) {
        if (overlaps(allNodes[j], node)) stackIndex++;
      }
      return { ...node, stackIndex };
    });
  }, [allNodes]);

  const activeNodesWithStack = useMemo(() => {
    const nodes = simulationMode ? simulationNodes : allNodes;
    const endTime = (n) => {
      if (n.type === 'work' || n.type === 'cognitive') return n.time + (n.duration || 1);
      if (n.type === 'nap' || n.type === 'meditation') return n.time + (n.duration ?? 0.25);
      return n.time;
    };
    const overlaps = (a, b) => {
      const aEnd = endTime(a);
      const bEnd = endTime(b);
      return a.time <= bEnd && b.time <= aEnd;
    };
    return nodes.map((node, i) => {
      let stackIndex = 0;
      for (let j = 0; j < i; j++) {
        if (overlaps(nodes[j], node)) stackIndex++;
      }
      return { ...node, stackIndex };
    });
  }, [simulationMode, simulationNodes, allNodes]);

  const enterSimulationMode = () => {
    setSimulationNodes(JSON.parse(JSON.stringify(allNodes)));
    setSimulationMode(true);
  };

  const exitSimulationMode = () => {
    setSimulationMode(false);
    setSimulationNodes([]);
  };

  const addSimulationEvent = (event) => {
    setSimulationNodes(prev => [...prev, event].sort((a, b) => (a.time ?? 0) - (b.time ?? 0)));
  };

  const removeSimulationEvent = (index) => {
    setSimulationNodes(prev => prev.filter((_, i) => i !== index));
  };

  const handleCoreOsClick = () => {
    coreOsClickCount.current += 1;
    if (coreOsClickCount.current === 3) {
      setIsSimulationMode(true);
      setSimulatedLog(JSON.parse(JSON.stringify(dailyLog || [])));
      coreOsClickCount.current = 0;
    }
    if (coreOsClickTimer.current) clearTimeout(coreOsClickTimer.current);
    coreOsClickTimer.current = setTimeout(() => { coreOsClickCount.current = 0; }, 1000);
  };

  const handleSimulatedTimeChange = (itemId, newTimeStr) => {
    if (!isSimulationMode) return;
    const parts = (newTimeStr || '00:00').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const timeDecimal = Math.min(24, Math.max(0, h + m / 60));
    setSimulatedLog(prev => {
      const logCopy = [...(prev || [])];
      const index = logCopy.findIndex(item => item.id === itemId || item.idLog === itemId);
      if (index !== -1) {
        logCopy[index] = {
          ...logCopy[index],
          time: timeDecimal,
          ...(logCopy[index].mealTime !== undefined && { mealTime: timeDecimal })
        };
      }
      return logCopy;
    });
  };

  useEffect(() => {
    if (currentTrackerDate !== getTodayString()) {
      setZoomLevel(0.45);
      return;
    }
    const pointNodes = activeNodes.filter(n => n.type !== 'work');
    if (pointNodes.length === 0) return;
    const times = pointNodes.map(n => n.time).sort((a, b) => a - b);
    let minGap = 24;
    for (let i = 1; i < times.length; i++) minGap = Math.min(minGap, times[i] - times[i - 1]);
    const suggested = minGap < 0.35 ? 1.5 : minGap < 0.6 ? 1.3 : minGap < 1 ? 1.1 : minGap < 2 ? 0.9 : 0.65;
    setZoomLevel(prev => Math.max(0.45, Math.min(1.5, suggested)));
  }, [simulationMode, simulationNodes, allNodes, currentTrackerDate]);

  useEffect(() => {
    localStorage.setItem('vyta_timeline', JSON.stringify(manualNodes));
  }, [manualNodes]);

  useEffect(() => {
    if (!fullStorico || typeof fullStorico !== 'object') return;
    if (currentTrackerDateRef.current !== getTodayString()) return;
    const todayKey = TRACKER_STORICO_KEY(getTodayString());
    const todayNode = fullStorico[todayKey];

    if (todayNode?.hasEditedNodes || (todayNode?.manualNodes && todayNode.manualNodes.length > 0)) {
      setManualNodes(todayNode.manualNodes || []);
    } else {
      // BUGFIX: Se oggi è vuoto, partiamo puliti. Nessun trascinamento da ieri.
      setManualNodes([]);
    }
  }, [fullStorico]);

  useEffect(() => {
    localStorage.setItem('vyta_idealStrategy', JSON.stringify(idealStrategy));
  }, [idealStrategy]);

  /** Carica pianificazione giornaliera da RTDB `planning/{uid}/{date}` (separata da tracker_data). */
  useEffect(() => {
    if (!db || !user?.uid || !currentTrackerDate || isSimulationMode) {
      setRemotePlanning(null);
      return;
    }
    const r = ref(db, `planning/${user.uid}/${currentTrackerDate}`);
    const unsub = onValue(r, (snap) => {
      setRemotePlanning(snap.exists() ? snap.val() : null);
    });
    return () => unsub();
  }, [db, user?.uid, currentTrackerDate, isSimulationMode]);

  /** RTDB `weeklyPlanning/{uid}/{weekStartMonday}` — separato da `planning/{uid}/{date}`. */
  useEffect(() => {
    weeklyPlanningListenerReadyRef.current = false;
    weeklyPlanningRemoteSigRef.current = '';
    if (!db || !user?.uid || isSimulationMode) {
      setWeeklyPlan(createInitialWeeklyPlan());
      return;
    }
    const weekKey = getWeekStartMondayKeyLocal(currentTrackerDate || getTodayString());
    const r = ref(db, `weeklyPlanning/${user.uid}/${weekKey}`);
    const unsub = onValue(r, (snap) => {
      weeklyPlanningListenerReadyRef.current = true;
      if (!snap.exists()) {
        const empty = createInitialWeeklyPlan();
        weeklyPlanningRemoteSigRef.current = weeklyPlanStableJson(empty);
        setWeeklyPlan(empty);
        return;
      }
      const next = sanitizeWeeklyPlanFromFirebase(snap.val());
      weeklyPlanningRemoteSigRef.current = weeklyPlanStableJson(next);
      setWeeklyPlan(next);
    });
    return () => {
      unsub();
      weeklyPlanningListenerReadyRef.current = false;
    };
  }, [db, user?.uid, currentTrackerDate, isSimulationMode]);

  useEffect(() => {
    if (!db || !user?.uid || isSimulationMode) return;
    if (!weeklyPlanningListenerReadyRef.current) return;
    const plan = weeklyPlanRef.current;
    const sig = weeklyPlanStableJson(plan);
    if (sig === weeklyPlanningRemoteSigRef.current) return;
    const t = window.setTimeout(() => {
      if (!weeklyPlanningListenerReadyRef.current) return;
      const dateStr = currentTrackerDateRef.current || getTodayString();
      const weekKey = getWeekStartMondayKeyLocal(dateStr);
      const uid = user.uid;
      const latest = weeklyPlanRef.current;
      const latestSig = weeklyPlanStableJson(latest);
      if (latestSig === weeklyPlanningRemoteSigRef.current) return;
      void set(ref(db, `weeklyPlanning/${uid}/${weekKey}`), weeklyPlanToFirebasePayload(latest))
        .then(() => {
          weeklyPlanningRemoteSigRef.current = latestSig;
        })
        .catch((err) => console.warn('weeklyPlanning save:', err));
    }, 500);
    return () => window.clearTimeout(t);
  }, [weeklyPlan, db, user?.uid, isSimulationMode]);

  // Caricamento dati al login (user da useFirebase); onValue/set restano qui
  useEffect(() => {
    if (!user) {
      setIsInitialLoadComplete(false);
      setBodyMetricsHistory([]);
      setPredictiveCalibration({ errors: [] });
      setTdeeHistory([]);
      setWeeklyPlan(createInitialWeeklyPlan());
      weeklyPlanningListenerReadyRef.current = false;
      weeklyPlanningRemoteSigRef.current = '';
      return;
    }
    let unsubToday = null;
    const today = getTodayString();
    const basePath = `users/${user.uid}/tracker_data`;

    const unsubBodyMetrics = onValue(ref(db, `users/${user.uid}/body_metrics`), (metricsSnap) => {
      const val = metricsSnap.val();
      if (!val || typeof val !== 'object') {
        setBodyMetricsHistory([]);
        return;
      }
      const arr = Object.entries(val)
        .map(([id, v]) => (v != null && typeof v === 'object' ? { id, ...v } : null))
        .filter(Boolean);
      arr.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      setBodyMetricsHistory(arr);
    });

    const unsubTdeeHistory = onValue(ref(db, `users/${user.uid}/tdee_history`), (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') {
        setTdeeHistory([]);
        return;
      }
      const arr = Object.entries(val)
        .map(([id, v]) => (v != null && typeof v === 'object' ? { id, ...v } : null))
        .filter(Boolean);
      arr.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      setTdeeHistory(arr);
    });

    const unsubPredictiveCalibration = onValue(
      ref(db, `users/${user.uid}/predictive_body_calibration`),
      (calSnap) => {
        const v = calSnap.val();
        if (!v || typeof v !== 'object') {
          setPredictiveCalibration({ errors: [] });
          return;
        }
        setPredictiveCalibration({
          errors: Array.isArray(v.errors) ? v.errors : [],
          updatedAt: v.updatedAt,
        });
      }
    );

    get(ref(db, basePath)).then(snap => {
      const tree = snap.exists() ? snap.val() : null;
      setFullStorico(tree);
      setFullHistory(tree || {});
      const todayNode = tree?.[TRACKER_STORICO_KEY(today)];
      const initialLog = getLogFromStoricoTree(tree, today);
      setDailyLog(applyMealTimes(initialLog, todayNode?.mealTimes ?? {}));
      unsubToday = onValue(ref(db, `${basePath}/${TRACKER_STORICO_KEY(today)}`), (liveSnap) => {
        if (liveSnap.exists() && currentTrackerDateRef.current === getTodayString()) {
          const val = liveSnap.val();
          const incomingLog = val?.log ?? [];
          const normalized = normalizeLogData(Array.isArray(incomingLog) ? incomingLog : Object.values(incomingLog || {}));
          const mealTimes = val?.mealTimes ?? {};
          lastLogFromFirebaseRef.current = JSON.stringify(normalized);
          setDailyLog(applyMealTimes(normalized, mealTimes));
        }
      });
      setActiveAction('home');
      setIsInitialLoadComplete(true);
    });

    get(ref(db, `users/${user.uid}/profile_targets`)).then(profileSnap => {
      if (profileSnap.exists()) {
        const data = profileSnap.val();
        if (data?.targets) setUserTargets(prev => ({ ...prev, ...data.targets }));
        if (data?.profile) {
          const merged = mergeProfileNutritionFromServer(data.profile);
          setUserProfile(prev => ({ ...prev, ...merged }));
          setBirthDate(typeof merged?.birthDate === 'string' ? merged.birthDate : '');
          if (merged.targetCalories != null && Number.isFinite(Number(merged.targetCalories))) {
            setUserTargets(prev => ({
              ...prev,
              kcal: Math.round(Number(merged.targetCalories)),
            }));
          }
          if (merged.proteinTarget != null && merged.proteinTarget !== '') {
            setUserTargets(prev => ({
              ...prev,
              prot: Math.round(Number(merged.proteinTarget)),
            }));
          }
        }
      }
    });

    get(ref(db, `users/${user.uid}/physiology_model`)).then(physSnap => {
      if (physSnap.exists()) {
        const data = physSnap.val();
        const { lastCalibrationWeek: savedCalWeek, ...model } = data;
        if (savedCalWeek) setLastCalibrationWeek(savedCalWeek);
        if (model && typeof model === 'object') {
          setUserModel(prev => ({
            ...DEFAULT_USER_MODEL,
            ...model,
            caffeineSensitivity: clampModelValue(model.caffeineSensitivity ?? 1),
            carbCrashSensitivity: clampModelValue(model.carbCrashSensitivity ?? 1),
            stressSensitivity: clampModelValue(model.stressSensitivity ?? 1),
            hydrationSensitivity: clampModelValue(model.hydrationSensitivity ?? 1),
            recoveryRate: clampModelValue(model.recoveryRate ?? 1)
          }));
        }
      }
    });

    get(ref(db, `${basePath}/trackerFoodDatabase`)).then((s) => {
      if (!s.exists()) return;
      const val = s.val();
      if (!val || typeof val !== 'object') {
        setFoodDb({});
        return;
      }
      const enriched = {};
      Object.keys(val).forEach((k) => {
        const row = val[k];
        if (!row || typeof row !== 'object') return;
        enriched[k] = row.isRecipe === true || row.type === 'recipe' ? row : enrichDbRowWithFoodUnits(row, k);
      });
      setFoodDb(enriched);
    });

    return () => {
      unsubBodyMetrics();
      unsubTdeeHistory();
      unsubPredictiveCalibration();
      unsubToday?.();
    };
  }, [user]);

  // Fallback: quando fullHistory è popolato ma dailyLog è ancora vuoto (es. primo caricamento), sincronizza il log del giorno corrente
  useEffect(() => {
    if (!fullHistory || typeof fullHistory !== 'object' || !currentTrackerDate) return;
    if (Object.keys(fullHistory).length === 0) return;
    setDailyLog(prev => {
      if (prev && prev.length > 0) return prev;
      const node = fullHistory[TRACKER_STORICO_KEY(currentTrackerDate)];
      const initialLog = getLogFromStoricoTree(fullHistory, currentTrackerDate);
      return applyMealTimes(initialLog, node?.mealTimes ?? {});
    });
  }, [fullHistory, currentTrackerDate]);

  // Weekly calibration: at start of new week (Monday), adjust userModel from last week's data and persist.
  useEffect(() => {
    if (!userUid || !isAuthenticated || typeof fullHistory !== 'object') return;
    const today = getTodayString();
    const mondayThisWeek = getMondayOfWeek(today);
    if (today !== mondayThisWeek) return;
    const lastWeekMonday = addDays(mondayThisWeek, -7);
    if (lastCalibrationWeek === lastWeekMonday) return;

    const weeklyData = buildWeeklyDataFromHistory(fullHistory, userModel, idealStrategy, lastWeekMonday);
    const updatedModel = calibrateUserModel(weeklyData, userModel);
    setUserModel(updatedModel);
    setLastCalibrationWeek(lastWeekMonday);
    set(ref(db, `users/${userUid}/physiology_model`), { ...updatedModel, lastCalibrationWeek: lastWeekMonday }).catch(err => console.warn('Physiology model save failed', err));
  }, [userUid, isAuthenticated, fullHistory, userModel, idealStrategy, lastCalibrationWeek]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsBooting(true);
    try {
      await firebaseLogin(loginEmail, loginPassword);
    } catch (error) {
      alert("ACCESSO NEGATO: Controlla le credenziali.");
    } finally {
      setIsBooting(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const updateTime = () => {
      setCurrentTime(getWallClockDecimalHour());
    };
    updateTime();
    const interval = window.setInterval(updateTime, 45_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') updateTime();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isAuthenticated]);

  /** stripUndefined: rimuove undefined ricorsivamente per payload Firebase. */
  const stripUndefined = (obj, depth = 0) => {
    const MAX_STRIP_DEPTH = 25;
    if (depth > MAX_STRIP_DEPTH) return obj;
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map((v) => stripUndefined(v, depth + 1)).filter((v) => v !== undefined);
    if (typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) {
        const v = stripUndefined(obj[k], depth + 1);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    return obj;
  };

  /** Sincronizzazione esplicita su Firebase. Legge uid da auth.currentUser per evitare stale closures. In modalità simulazione non scrive mai. */
  const syncDatiFirebase = useCallback((nuovoLog, nuoviNodi) => {
    if (isSimulationMode) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn("⚠️ Firebase Sync interrotto: Nessun utente loggato rilevato da auth.currentUser");
      return;
    }
    const uid = currentUser.uid;

    console.log("🔄 Preparazione salvataggio su Firebase per UID:", uid);

    try {
      const dateStr = currentTrackerDate;
      const logForFirebase = denormalizeLogForFirebase(nuovoLog || []);
      const mealTimes = (nuovoLog || []).filter(i => i.type === 'food' || i.type === 'recipe').reduce((acc, f) => ({
        ...acc,
        [f.mealType]: f.mealTime ?? 12
      }), {});
      const sanitizedLog = stripUndefined(logForFirebase);
      const sanitizedNodes = stripUndefined(nuoviNodi || []);
      const payload = {
        data: dateStr,
        log: sanitizedLog,
        mealTimes,
        manualNodes: sanitizedNodes,
        hasEditedNodes: true
      };
      const sanitized = stripUndefined(payload);

      const dbPath = `users/${uid}/tracker_data/${TRACKER_STORICO_KEY(dateStr)}`;
      console.log("📁 Percorso di salvataggio:", dbPath);

      set(ref(db, dbPath), sanitized)
        .then(() => {
          setFullHistory(prev => ({ ...prev, [TRACKER_STORICO_KEY(dateStr)]: sanitized }));
          console.log("✅ Dati salvati con successo su Firebase!");
        })
        .catch(err => console.error("❌ Errore critico durante il salvataggio Firebase:", err));
    } catch (error) {
      console.error("❌ Errore durante la preparazione del payload Firebase:", error);
    }
  }, [currentTrackerDate, isSimulationMode]);

  const saveProfileToFirebase = (newProfile, newTargets) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const uid = currentUser.uid;
    set(ref(db, `users/${uid}/profile_targets`), {
      profile: newProfile,
      targets: newTargets
    }).then(() => {
      alert("✅ Profilo e Target salvati con successo!");
      setShowProfile(false);
    }).catch(err => console.error("Errore salvataggio profilo:", err));
  };

  /**
   * Autopilota metabolico: TDEE + cascata macro (prot fisse; Δ kcal 50% CHO / 50% grassi).
   * Firebase usa le chiavi `prot` / `carb` / `fat` | `fatTotal` come nel resto dell’app.
   */
  const handleUpdateTDEE = useCallback(
    async (newKcal, options = {}) => {
      const requested = Math.round(Number(newKcal));
      if (!Number.isFinite(requested) || requested < 800 || requested > 12000) {
        alert('Valore kcal non valido.');
        return;
      }
      const uid = auth.currentUser?.uid;
      if (!uid) {
        alert('Accedi per aggiornare il TDEE.');
        return;
      }
      const oldKcal = userTargets.kcal ?? 2000;
      const deltaKcal = requested - oldKcal;

      const newPro =
        options.prot != null && Number.isFinite(Number(options.prot))
          ? Math.round(Number(options.prot))
          : Math.round(userTargets.prot ?? userTargets.pro ?? 150);
      const deltaChoGrams = (deltaKcal * 0.5) / 4;
      const deltaFatGrams = (deltaKcal * 0.5) / 9;
      const baseCarb = userTargets.carb ?? userTargets.cho ?? 200;
      const baseFat = userTargets.fatTotal ?? userTargets.fat ?? 70;
      const newCho = Math.max(50, Math.round(baseCarb + deltaChoGrams));
      const newFat = Math.max(30, Math.round(baseFat + deltaFatGrams));
      const finalKcal = Math.round(newPro * 4 + newCho * 4 + newFat * 9);

      try {
        const payload = {
          'targets/kcal': finalKcal,
          'targets/prot': newPro,
          'targets/carb': newCho,
          'targets/fat': newFat,
          'targets/fatTotal': newFat,
        };
        if (options.recordTdeeEval === true) {
          payload['targets/tdeeTargetLastEvalAt'] = Date.now();
        }
        await update(ref(db, `users/${uid}/profile_targets`), payload);
        try {
          await push(ref(db, `users/${uid}/tdee_history`), {
            date: new Date().toISOString().split('T')[0],
            timestamp: Date.now(),
            tdee: finalKcal,
            prot: newPro,
            carb: newCho,
            fat: newFat,
          });
        } catch (histErr) {
          console.error('Salvataggio tdee_history:', histErr);
        }
        setUserTargets((prev) => ({
          ...prev,
          kcal: finalKcal,
          prot: newPro,
          carb: newCho,
          fat: newFat,
          fatTotal: newFat,
          ...(options.recordTdeeEval === true ? { tdeeTargetLastEvalAt: Date.now() } : {}),
        }));
        alert(
          `✅ Autopilota Metabolico attivato!\nNuovo TDEE: ${finalKcal} kcal\nProteine: ${newPro}g (Invariate)\nCarboidrati: ${newCho}g\nGrassi: ${newFat}g`
        );
      } catch (err) {
        console.error('Aggiornamento TDEE:', err);
        alert('Errore durante il salvataggio del TDEE.');
      }
    },
    [auth, db, userTargets]
  );

  /**
   * Macro da ultima pesata (kcal invariate = baseline profilo; nessuna formula BMR) + Firebase.
   * @returns {Promise<{ kcal: number, prot: number, carb: number, fat: number } | null>}
   */
  const applyAutomaticTargetRecalibration = useCallback(
    async (latestRecord) => {
      if (!latestRecord || typeof latestRecord !== 'object') return null;
      const w = Number(latestRecord.weight);
      if (!Number.isFinite(w) || w <= 0) return null;
      const uid = auth.currentUser?.uid;
      if (!uid) return null;
      try {
        const baseK = userTargets.kcal ?? 2000;
        const targets = recalculateUserTargets(latestRecord, userProfile, baseK);
        await update(ref(db, `users/${uid}/profile_targets`), {
          'targets/kcal': targets.kcal,
          'targets/prot': targets.prot,
          'targets/carb': targets.carb,
          'targets/fat': targets.fat,
          'targets/fatTotal': targets.fat,
        });
        setUserTargets((prev) => ({
          ...prev,
          kcal: targets.kcal,
          prot: targets.prot,
          carb: targets.carb,
          fat: targets.fat,
          fatTotal: targets.fat,
          water: targets.water,
        }));
        return {
          kcal: targets.kcal,
          prot: targets.prot,
          carb: targets.carb,
          fat: targets.fat,
        };
      } catch (err) {
        console.warn('Ricalibrazione automatica macro:', err);
        return null;
      }
    },
    [auth, db, userProfile, userTargets.kcal]
  );

  const evaluateAndApplyTDEE = useCallback(
    async ({ weighDate, historyWithThisWeigh, latestRecord }) => {
      try {
        const plan = computeDataDrivenTdeeWithCoach({
          anchorDateIso: weighDate,
          fullHistory,
          bodyMetricsHistory: historyWithThisWeigh,
          goal: goalFromProfile(userProfile),
          currentCalorieTarget: userTargets?.kcal,
          lastTdeeEvalAt: userTargets?.tdeeTargetLastEvalAt,
        });
        const uid = auth.currentUser?.uid;
        if (uid) {
          const notification = computeMetabolicNotification({
            plan,
            lastNotificationAt: userTargets?.tdeeLastNotificationAt,
            lastDecision: userTargets?.tdeeLastDecision,
          });
          const nowTs = Date.now();
          const metadataPatch = {
            'targets/tdeeLastDecision': plan?.decision ?? null,
          };
          if (notification.shouldNotify) {
            metadataPatch['targets/tdeeLastNotificationAt'] = nowTs;
          }
          try {
            await update(ref(db, `users/${uid}/profile_targets`), metadataPatch);
            setUserTargets((prev) => ({
              ...prev,
              tdeeLastDecision: plan?.decision ?? null,
              ...(notification.shouldNotify ? { tdeeLastNotificationAt: nowTs } : {}),
            }));
            if (notification.shouldNotify && notification.message) {
              alert(notification.message);
            }
          } catch (notifyErr) {
            console.warn('Notifica metabolica:', notifyErr);
          }
        }
        if (plan.status === 'hold' || !plan.canUpdate || plan.calorie_target == null) {
          return plan;
        }
        const recalTargets = await applyAutomaticTargetRecalibration(latestRecord);
        if (plan.canUpdate && plan.calorie_target != null) {
          await handleUpdateTDEE(plan.calorie_target, {
            prot: recalTargets?.prot,
            recordTdeeEval: true,
          });
        }
        return plan;
      } catch (calErr) {
        console.warn('Valutazione TDEE data-driven:', calErr);
        return null;
      }
    },
    [
      auth,
      db,
      fullHistory,
      userProfile,
      userTargets?.kcal,
      userTargets?.tdeeLastDecision,
      userTargets?.tdeeLastNotificationAt,
      userTargets?.tdeeTargetLastEvalAt,
      applyAutomaticTargetRecalibration,
      handleUpdateTDEE,
    ]
  );

  const handleSaveBodyMetrics = useCallback(async () => {
    const w = parseFloat(String(inputWeight).replace(',', '.'));
    if (!Number.isFinite(w) || w <= 0) {
      alert('Inserisci un peso valido (maggiore di 0).');
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      alert('Accedi per registrare la pesata.');
      return;
    }
    const uid = currentUser.uid;
    const fatRaw = String(inputFat ?? '').trim();
    const parsedFat = fatRaw === '' ? null : parseFloat(fatRaw.replace(',', '.'));
    const bodyFat = parsedFat != null && Number.isFinite(parsedFat) ? parsedFat : null;
    const muscleRaw = String(drawerMuscleMass ?? '').trim();
    const parsedMuscle = muscleRaw === '' ? null : parseFloat(muscleRaw.replace(',', '.'));
    const musclePct = parsedMuscle != null && Number.isFinite(parsedMuscle) ? parsedMuscle : null;
    const waterRaw = String(drawerBodyWater ?? '').trim();
    const parsedWater = waterRaw === '' ? null : parseFloat(waterRaw.replace(',', '.'));
    const waterPct = parsedWater != null && Number.isFinite(parsedWater) ? parsedWater : null;
    const visceralRaw = String(drawerVisceralFat ?? '').trim();
    const parsedVisceral = visceralRaw === '' ? null : parseFloat(visceralRaw.replace(',', '.'));
    const visceralFat = parsedVisceral != null && Number.isFinite(parsedVisceral) ? parsedVisceral : null;
    const weighDate = getTodayString();
    const payload = {
      weight: w,
      bodyFat,
      muscle_pct: musclePct,
      water_pct: waterPct,
      visceral_fat: visceralFat,
      timestamp: Date.now(),
      date: weighDate,
    };
    const profileUpdates = { 'profile/weight': w };
    if (bodyFat != null) profileUpdates['profile/bodyFat'] = bodyFat;
    try {
      await update(ref(db, `users/${uid}/profile_targets`), profileUpdates);
      await push(ref(db, `users/${uid}/body_metrics`), payload);
      setUserProfile((prev) => ({
        ...prev,
        weight: w,
        ...(bodyFat != null ? { bodyFat } : {}),
        ...(musclePct != null ? { muscle_pct: musclePct } : {}),
        ...(waterPct != null ? { water_pct: waterPct } : {}),
        ...(visceralFat != null ? { visceral_fat: visceralFat } : {}),
      }));
      setShowWeightModal(false);
      setInputWeight('');
      setInputFat('');
      setDrawerMuscleMass('');
      setDrawerBodyWater('');
      setDrawerVisceralFat('');
      setBodyMetricsSaveToast(true);
      setTimeout(() => setBodyMetricsSaveToast(false), 3500);

      const historyWithThisWeigh = (() => {
        const list = Array.isArray(bodyMetricsHistory) ? [...bodyMetricsHistory] : [];
        const filtered = list.filter((e) => metricEntryToIsoDay(e) !== weighDate);
        filtered.push(payload);
        return filtered;
      })();
      await evaluateAndApplyTDEE({
        weighDate,
        historyWithThisWeigh,
        latestRecord: payload,
      });
    } catch (err) {
      console.error('Salvataggio composizione corporea:', err);
      alert('Errore durante il salvataggio. Riprova.');
    }
  }, [
    auth,
    db,
    inputWeight,
    inputFat,
    drawerMuscleMass,
    drawerBodyWater,
    drawerVisceralFat,
    bodyMetricsHistory,
    fullHistory,
    userProfile,
    userTargets?.kcal,
    userTargets?.tdeeTargetLastEvalAt,
    evaluateAndApplyTDEE,
  ]);

  const handleQuickWeighInFromHistory = useCallback(
    async ({ weight, bodyFat, muscle, water, visceral }) => {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) return;
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        alert('Accedi per registrare la pesata.');
        return;
      }
      const uid = currentUser.uid;
      const weighDate = getTodayString();
      const payload = {
        weight: w,
        timestamp: Date.now(),
        date: weighDate,
      };
      if (bodyFat != null) payload.bodyFat = bodyFat;
      if (muscle != null) payload.muscle = muscle;
      if (water != null) payload.water = water;
      if (visceral != null) payload.visceral = visceral;
      const profileUpdates = { 'profile/weight': w };
      if (bodyFat != null) profileUpdates['profile/bodyFat'] = bodyFat;
      try {
        await update(ref(db, `users/${uid}/profile_targets`), profileUpdates);
        await push(ref(db, `users/${uid}/body_metrics`), payload);
        setUserProfile((prev) => ({ ...prev, weight: w, ...(bodyFat != null ? { bodyFat } : {}) }));
        setBodyMetricsSaveToast(true);
        setTimeout(() => setBodyMetricsSaveToast(false), 3500);

        const historyWithThisWeigh = (() => {
          const list = Array.isArray(bodyMetricsHistory) ? [...bodyMetricsHistory] : [];
          const filtered = list.filter((e) => metricEntryToIsoDay(e) !== weighDate);
          filtered.push(payload);
          return filtered;
        })();
        await evaluateAndApplyTDEE({
          weighDate,
          historyWithThisWeigh,
          latestRecord: payload,
        });
      } catch (err) {
        console.error('Salvataggio pesata rapida:', err);
        alert('Errore durante il salvataggio. Riprova.');
      }
    },
    [
      auth,
      db,
      bodyMetricsHistory,
      fullHistory,
      userProfile,
      userTargets?.kcal,
      userTargets?.tdeeTargetLastEvalAt,
      evaluateAndApplyTDEE,
    ]
  );

  useEffect(() => {
    if (!showWeightModal) return;
    const p = userProfileRef.current;
    const pw = p?.weight;
    setInputWeight(pw != null && pw !== '' ? String(pw) : '');
    const pbf = p?.bodyFat;
    setInputFat(pbf != null && pbf !== '' ? String(pbf) : '');
    const pm = p?.muscle_pct ?? p?.muscleMass ?? p?.muscle;
    setDrawerMuscleMass(pm != null && pm !== '' ? String(pm) : '');
    const pwt = p?.water_pct ?? p?.bodyWater ?? p?.water;
    setDrawerBodyWater(pwt != null && pwt !== '' ? String(pwt) : '');
    const pvf = p?.visceral_fat ?? p?.visceralFat ?? p?.visceral;
    setDrawerVisceralFat(pvf != null && pvf !== '' ? String(pvf) : '');
  }, [showWeightModal]);

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (!text || typeof text !== 'string') {
          alert('File CSV vuoto o non valido.');
          return;
        }

        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          alert('File CSV vuoto o non valido.');
          return;
        }

        const uid = userUid;
        if (!uid) {
          alert('Accedi per importare le misurazioni.');
          return;
        }

        const { columnMap } = buildBodyMetricsColumnMap(lines[0]);
        const mappedIndices = Object.values(columnMap).filter((idx) => idx >= 0);
        const maxColIdx = mappedIndices.length ? Math.max(...mappedIndices) : 0;

        const payloads = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].replace(/"/g, '').split(',');
          if (cols.length <= maxColIdx) continue;

          const dateRaw = (cols[columnMap.date] ?? '').trim();
          const parsed = parseUniversalDate(dateRaw);
          const weight = extractNumber(cols[columnMap.weight]);
          if (parsed == null || weight == null) continue;

          const payload = {
            date: parsed.isoDate,
            timestamp: parsed.timestamp,
            weight,
          };
          if (columnMap.fat !== -1) payload.bodyFat = extractNumber(cols[columnMap.fat]);
          if (columnMap.muscle !== -1) payload.muscle = extractNumber(cols[columnMap.muscle]);
          if (columnMap.water !== -1) payload.water = extractNumber(cols[columnMap.water]);
          if (columnMap.visceral !== -1) payload.visceral = extractNumber(cols[columnMap.visceral]);

          payloads.push(payload);
        }

        const mergedPayloads = mergeDuplicateBiometrics(payloads);

        if (mergedPayloads.length === 0) {
          alert('Nessuna riga valida trovata nel CSV.');
          return;
        }

        const metricsRef = ref(db, `users/${uid}/body_metrics`);
        const batch = {};
        for (const p of mergedPayloads) {
          const entry = {
            date: p.date,
            timestamp: p.timestamp,
            weight: p.weight,
          };
          if ('bodyFat' in p) entry.bodyFat = p.bodyFat;
          if ('muscle' in p) entry.muscle = p.muscle;
          if ('water' in p) entry.water = p.water;
          if ('visceral' in p) entry.visceral = p.visceral;
          batch[push(metricsRef).key] = entry;
        }
        await update(metricsRef, batch);

        let latest = mergedPayloads[0];
        for (let i = 1; i < mergedPayloads.length; i += 1) {
          if (mergedPayloads[i].timestamp > latest.timestamp) latest = mergedPayloads[i];
        }
        await applyAutomaticTargetRecalibration({
          weight: latest.weight,
          bodyFat: latest.bodyFat,
          muscle: latest.muscle,
          water: latest.water,
          visceral: latest.visceral,
          date: latest.date,
          timestamp: latest.timestamp,
        });
        setUserProfile((prev) => ({
          ...prev,
          weight: latest.weight,
          ...(latest.bodyFat != null && Number.isFinite(Number(latest.bodyFat))
            ? { bodyFat: latest.bodyFat }
            : {}),
        }));

        const dupNote =
          payloads.length > mergedPayloads.length
            ? ` (${payloads.length} righe CSV → ${mergedPayloads.length} giorni dopo unione duplicati)`
            : '';
        alert(`✅ Importazione completata! ${mergedPayloads.length} misurazioni salvate nel database.${dupNote}`);
      } catch (err) {
        console.error('Errore importazione CSV body metrics:', err);
        alert(
          err?.message?.startsWith('CSV:')
            ? err.message
            : '❌ Errore durante la conversione o il salvataggio del CSV. Controlla la console.'
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const calculateSmartTargets = () => {
    const { weight, nutritionGoal, goal } = userProfile;
    const w = parseFloat(weight) || 75;
    const ng = nutritionGoal || (goal === 'lose' ? 'cut' : goal === 'gain' ? 'bulk' : 'maintain');
    const endIso = getTodayString();
    const fromLogs = averageFoodKcalOver14d(fullHistory, endIso);
    const fallback = parseFloat(String(userProfile.targetCalories ?? '')) || 2000;
    const kcal = fromLogs ?? Math.round(fallback);
    const m = buildMacroSplitFromKcal(w, kcal);
    setUserProfile((prev) => ({
      ...prev,
      nutritionGoal: ng,
      goal: ng === 'cut' ? 'lose' : ng === 'bulk' ? 'gain' : 'maintain',
      targetCalories: m.kcal,
      proteinTarget: prev.proteinTarget,
    }));
    setUserTargets((prev) => ({
      ...prev,
      kcal: m.kcal,
      prot: m.prot,
      carb: m.carb,
      fatTotal: m.fat,
      fat: m.fat,
      water: m.water,
    }));
  };

  const navigateToDate = useCallback((dateInput) => {
    const nextDate = dateInput instanceof Date ? new Date(dateInput) : new Date(`${dateInput}T12:00:00`);
    if (!Number.isFinite(nextDate.getTime())) return;
    setCurrentDateObj(nextDate);
    const offset = nextDate.getTimezoneOffset() * 60000;
    const dateStr = new Date(nextDate.getTime() - offset).toISOString().slice(0, 10);
    const dayData = fullHistory[`trackerStorico_${dateStr}`];

    if (dayData) {
      const rawLog = Array.isArray(dayData.log) ? dayData.log : Object.values(dayData.log || {});
      const normalized = normalizeLogData(rawLog);
      setDailyLog(applyMealTimes(normalized, dayData.mealTimes ?? {}));
      setManualNodes(Array.isArray(dayData.manualNodes) ? dayData.manualNodes : []);
    } else {
      setDailyLog([]);
      setManualNodes([]);
    }
  }, [fullHistory]);

  const changeDate = (daysOffset) => {
    const newDate = new Date(currentDateObj);
    newDate.setDate(newDate.getDate() + daysOffset);
    navigateToDate(newDate);
  };

  const REPORT_NUTRIENT_KEYS = ['kcal', 'prot', 'carb', 'fatTotal', 'fibre', 'vitc', 'vitD', 'omega3', 'mg', 'k', 'fe', 'ca'];
  const generateReportData = () => {
    const days = parseInt(reportPeriod, 10) || 7;
    const now = new Date();
    let totalDaysFound = 0;
    const aggregated = {};
    REPORT_NUTRIENT_KEYS.forEach(k => { aggregated[k] = 0; });

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = fullHistory[`trackerStorico_${dateStr}`];

      if (dayData && dayData.log) {
        const rawLog = Array.isArray(dayData.log) ? dayData.log : Object.values(dayData.log || []);
        const flatLog = normalizeLogData(rawLog);
        const foodItems = flatLog.filter(item => item.type === 'food' || item.type === 'recipe');
        if (foodItems.length > 0) totalDaysFound++;
        foodItems.forEach(food => {
          REPORT_NUTRIENT_KEYS.forEach(key => {
            const val = key === 'kcal' ? (food.kcal ?? food.cal) : food[key];
            aggregated[key] += (parseFloat(val) || 0);
          });
        });
      }
    }

    if (totalDaysFound === 0) return null;
    const averages = {};
    REPORT_NUTRIENT_KEYS.forEach(key => {
      averages[key] = aggregated[key] / totalDaysFound;
    });
    return { averages, daysFound: totalDaysFound };
  };

  useEffect(() => {
    if (!draggingNode) return;
    setDragOffsetY(0);
    dragOffsetYRef.current = 0;
    const el = timelineContainerRef.current;
    const { id: dragId, edge: dragEdge, type: dragType, originalTime, originalDuration } = draggingNode;
    const initialTime = dragType === 'work' && dragEdge === 'end' ? (originalTime + (originalDuration ?? 0)) : originalTime;
    dragEngine.current = {
      isActive: true,
      nodeId: dragId,
      nodeType: dragType,
      startX: 0,
      initialTime,
      lastX: 0,
      lastTime: 0,
      currentLiveTime: initialTime
    };
    setDragLiveTime(initialTime);

    const onMove = (e) => {
      if (!el || !draggingNode) return;
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const offsetY = e.clientY - centerY;
      dragOffsetYRef.current = offsetY;
      setDragOffsetY(offsetY);

      const currentX = e.clientX;
      const currentT = performance.now();
      const { lastX, lastTime, currentLiveTime } = dragEngine.current;
      const pixelsPerHour = rect.width / 24;

      if (dragEngine.current.lastTime === 0) {
        dragEngine.current.lastX = currentX;
        dragEngine.current.lastTime = currentT;
        return;
      }
      const dx = currentX - lastX;
      const deltaT = currentT - lastTime;
      const velocity = deltaT > 0 ? Math.abs(dx) / deltaT : 0;
      const VELOCITY_THRESHOLD = 0.4;
      const FRICTION = 0.3;
      const effectiveDx = velocity > VELOCITY_THRESHOLD ? dx : dx * FRICTION;
      const deltaHours = effectiveDx / pixelsPerHour;
      let newTime = currentLiveTime + deltaHours;
      if (newTime < 0) newTime = 0;
      if (newTime > 24) newTime = 24;
      dragEngine.current.currentLiveTime = newTime;
      dragEngine.current.lastX = currentX;
      dragEngine.current.lastTime = currentT;
      setDragLiveTime(Math.round(newTime * 60) / 60);
    };

    const onUp = () => {
      if (isSimulationMode) {
        dragEngine.current.isActive = false;
        setDragLiveTime(null);
        setDragOffsetY(0);
        dragOffsetYRef.current = 0;
        setTouchingNodeId(null);
        setDraggingNode(null);
        return;
      }
      const isOutside = Math.abs(dragOffsetYRef.current) > 50;
      const finalTimeRaw = dragEngine.current.currentLiveTime;
      const finalTimeRounded = Math.round(finalTimeRaw * 12) / 12;
      const isGhostDrag = dragType === 'ghost_meal' || dragType === 'ghost_workout';
      const dlSnap = dailyLogRef.current;
      const mnSnap = manualNodesRef.current;

      if (isOutside) {
        if (isGhostDrag) {
          setGhostProgramDeleteModal({ nodeId: dragId, dragType });
        } else {
          const confirmDelete = window.confirm('Vuoi eliminare questo elemento?');
          if (confirmDelete) {
            if (dragType === 'meal') {
              const { itemIds } = draggingNode;
              const idSet = new Set((itemIds || []).map((x) => String(x)));
              const newLog = dlSnap.filter((item) => !idSet.has(String(item.id)));
              const newNodes = mnSnap;
              setDailyLog(newLog);
              syncDatiFirebase(newLog, newNodes);
              pushTimelineUndoSnapshot(newLog, newNodes);
            } else {
              const newLog = dlSnap.filter(item => item.id !== dragId);
              const newNodes = mnSnap.filter(n => n.id !== dragId);
              setDailyLog(newLog);
              setManualNodes(newNodes);
              syncDatiFirebase(newLog, newNodes);
              pushTimelineUndoSnapshot(newLog, newNodes);
            }
          } else {
            if (dragType === 'meal') {
              const { itemIds, originalTime: origTime } = draggingNode;
              const idSet = new Set((itemIds || []).map((x) => String(x)));
              const next = dlSnap.map((item) =>
                idSet.has(String(item.id)) ? { ...item, mealTime: origTime } : item
              );
              setDailyLog(next);
              syncDatiFirebase(next, mnSnap);
            } else {
              const next = mnSnap.map(n =>
                n.id === dragId ? { ...n, time: originalTime, duration: originalDuration ?? n.duration } : n
              );
              setManualNodes(next);
              syncDatiFirebase(dlSnap, next);
            }
          }
        }
      } else {
        if (dragType === 'meal') {
          const { itemIds } = draggingNode;
          const idSet = new Set((itemIds || []).map((x) => String(x)));
          const nextLog = dlSnap.map((item) =>
            idSet.has(String(item.id)) ? { ...item, mealTime: finalTimeRounded } : item
          );
          setDailyLog(nextLog);
          syncDatiFirebase(nextLog, mnSnap);
          pushTimelineUndoSnapshot(nextLog, mnSnap);
        } else if (dragType === 'ghost_meal') {
          const nextLog = dlSnap.map((item) =>
            item.id === dragId && item.type === 'ghost_meal'
              ? { ...item, mealTime: finalTimeRounded, time: finalTimeRounded }
              : item
          );
          setDailyLog(nextLog);
          syncDatiFirebase(nextLog, mnSnap);
          pushTimelineUndoSnapshot(nextLog, mnSnap);
        } else {
          const next = mnSnap.map(n => {
            if (n.id !== dragId) return n;
            if (n.type === 'work' || n.type === 'cognitive') {
              if (dragEdge === 'start') {
                const end = n.time + (n.duration || 1);
                const newTime = Math.min(finalTimeRounded, end - 0.25);
                return { ...n, time: newTime, duration: end - newTime };
              }
              if (dragEdge === 'end') {
                const newEnd = Math.max(finalTimeRounded, n.time + 0.25);
                return { ...n, duration: newEnd - n.time };
              }
              return { ...n, time: finalTimeRounded };
            }
            return { ...n, time: finalTimeRounded };
          });
          setManualNodes(next);
          syncDatiFirebase(dlSnap, next);
          pushTimelineUndoSnapshot(dlSnap, next);
        }
      }
      dragEngine.current.isActive = false;
      setDragLiveTime(null);
      setDragOffsetY(0);
      dragOffsetYRef.current = 0;
      setTouchingNodeId(null);
      setDraggingNode(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingNode, isSimulationMode, pushTimelineUndoSnapshot, syncDatiFirebase]);

  useEffect(() => { if (!isDrawerOpen) setIsZenActive(false); }, [isDrawerOpen]);

  useEffect(() => {
    if (isZenActive) zenSessionEndTriggeredRef.current = false;
  }, [isZenActive]);

  useEffect(() => {
    if (!isZenActive) {
      setZenBreathPhase(null);
      setZenSunScale(1);
      return undefined;
    }
    if (zenGracefulEnd) return undefined;

    const pattern = NEURAL_RESET_PATTERNS[zenBreathPatternId];
    if (!pattern?.steps?.length) return undefined;

    const timeouts = [];
    let cancelled = false;
    const after = (ms, fn) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(id);
    };

    const runStep = (stepIndex) => {
      if (cancelled) return;
      const { steps } = pattern;
      const step = steps[stepIndex];
      if (!step) return;
      setZenBreathPhase(step.phase);
      setZenSunScale(step.sunTarget);
      after(step.ms, () => {
        if (cancelled) return;
        runStep((stepIndex + 1) % steps.length);
      });
    };

    runStep(0);
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [isZenActive, zenBreathPatternId, zenGracefulEnd]);

  useEffect(() => {
    if (!isZenActive || zenGracefulEnd || zenSessionDurationKey === 'infinite') {
      if (!isZenActive) setZenSessionRemainingSec(null);
      return undefined;
    }
    const opt = ZEN_SESSION_DURATION_OPTIONS.find((o) => o?.value === zenSessionDurationKey);
    const total = opt?.sec;
    if (total == null) return undefined;
    setZenSessionRemainingSec(total);
    const id = window.setInterval(() => {
      setZenSessionRemainingSec((r) => {
        if (r === null || r <= 0) return 0;
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isZenActive, zenSessionDurationKey, zenGracefulEnd]);

  useEffect(() => {
    if (zenSessionDurationKey === 'infinite' || !isZenActive || zenGracefulEnd) return;
    if (zenSessionRemainingSec !== 0) return;
    if (zenSessionEndTriggeredRef.current) return;
    zenSessionEndTriggeredRef.current = true;
    endZenSessionGracefully();
  }, [zenSessionRemainingSec, zenSessionDurationKey, isZenActive, zenGracefulEnd, endZenSessionGracefully]);

  useEffect(() => {
    if (activeAction !== 'focus') return undefined;
    return () => {
      clearNeuralResetFades();
      const el = neuralResetAudioRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      const bell = neuralResetBellRef.current;
      if (bell) {
        bell.pause();
        bell.currentTime = 0;
      }
      clearZenAmbientFade();
      const amb = zenAmbientForestRef.current;
      if (amb) {
        amb.pause();
        amb.currentTime = 0;
        amb.volume = 0;
      }
      setZenForestAmbientOn(false);
    };
  }, [activeAction, clearNeuralResetFades, clearZenAmbientFade]);

  useEffect(() => {
    if (activeAction === 'focus') return;
    clearZenAmbientFade();
    const amb = zenAmbientForestRef.current;
    if (amb) {
      amb.pause();
      amb.currentTime = 0;
      amb.volume = 0;
    }
    setZenForestAmbientOn(false);
    setAudioMode('muted');
  }, [activeAction, clearZenAmbientFade]);

  useEffect(() => {
    if (activeAction !== 'focus') return;
    const el = neuralResetAudioRef.current;
    if (!el) return;

    if (audioMode === 'muted' || !isZenActive) {
      clearNeuralResetFades();
      el.pause();
      el.currentTime = 0;
      return;
    }

    const nextSrc = '/onde-mare.mp3';
    const tail = nextSrc.replace(/^\//, '');
    let pathMatches = false;
    try {
      if (el.src) pathMatches = new URL(el.src, window.location.href).pathname.endsWith(tail);
    } catch {
      pathMatches = false;
    }
    if (!pathMatches) {
      clearNeuralResetFades();
      el.pause();
      el.src = nextSrc;
      el.load();
    }

    el.play().catch(() => {});
  }, [activeAction, audioMode, isZenActive, clearNeuralResetFades]);

  useEffect(() => {
    if (activeAction !== 'focus' || !isZenActive || audioMode === 'muted' || zenGracefulEnd) return;
    if (!zenBreathPhase) return;
    const step = getNeuralResetZenStep(zenBreathPatternId, zenBreathPhase);
    if (!step) return;
    const fade = getZenBreathAudioFade(zenBreathPhase, step.ms);
    if (fade) fadeAudio(fade.target, fade.duration);
  }, [zenBreathPhase, zenBreathPatternId, activeAction, isZenActive, audioMode, zenGracefulEnd, fadeAudio]);

  useEffect(() => {
    if (isDrawerOpen && activeAction === 'pasto') setDrawerMealTimeStr(decimalToTimeStr(drawerMealTime));
  }, [isDrawerOpen, activeAction, drawerMealTime]);

  // Motore biochimico
  const baseKcal = (userTargets.kcal ?? STRATEGY_PROFILES[dayProfile].kcal) + calorieTuning;
  const { totali, obiettiviPasti } = useBiochimico(activeLog, baseKcal);
  const targetKcal = baseKcal + (totali?.workout ?? 0);

  // Macro giornalieri reali (solo da dailyLog) per MealBuilder — mai undefined per evitare NaN nelle barre
  const macroDailyReals = useMemo(() => {
    const t = computeTotali(dailyLog ?? []);
    return t && typeof t === 'object' ? t : { kcal: 0, prot: 0, carb: 0, fat: 0, fatTotal: 0, fibre: 0, workout: 0 };
  }, [dailyLog]);

  const dailyReport = useMemo(() => {
    if (!activeLog || currentTrackerDate === getTodayString()) return null;
    const foods = (activeLog || []).filter(e => e.type === 'food' || e.type === 'recipe');
    if (foods.length === 0 && !(activeLog || []).some(e => e.type === 'sleep' || e.type === 'workout')) return null;
    return computeDayEvaluations(activeLog, userTargets);
  }, [activeLog, currentTrackerDate, userTargets]);

  const longevityData = useMemo(() => {
    if (!fullHistory || !userTargets) return null;
    if (Object.keys(fullHistory || {}).length === 0) return null;

    const matrix = computeRiskMatrix(fullHistory, userTargets, longevityDays);
    const weightedRisk = (matrix.metabolic.score * 0.30) + (matrix.neuro.score * 0.30) + (matrix.inflammatory.score * 0.20) + (matrix.cardio.score * 0.20);
    const masterScore = Math.max(0, Math.min(100, Math.round(100 - weightedRisk)));

    let color = '#00e5ff';
    if (masterScore < 60) color = '#f44336';
    else if (masterScore < 85) color = '#ffb300';

    return { ...matrix, masterScore, color };
  }, [fullHistory, userTargets, longevityDays]);

  const longevityModalRiskRows = useMemo(() => {
    if (!longevityData) return [];
    return [
      { id: 'metabolic', label: 'Rischio Metabolico', data: longevityData.metabolic, icon: '🩸', desc: 'Glicazione, Insulina e Autofagia' },
      { id: 'neuro', label: 'Usura Neuro-Ormonale', data: longevityData.neuro, icon: '🧠', desc: 'Cortisolo, Stress e Deep Sleep' },
      { id: 'inflammatory', label: 'Carico Infiammatorio', data: longevityData.inflammatory, icon: '🔥', desc: 'Danno tissutale e Tossicità' },
      { id: 'cardio', label: 'Rischio Cardiovascolare', data: longevityData.cardio, icon: '🫀', desc: 'Endotelio e Sedentarietà' }
    ];
  }, [longevityData]);

  const trendData = useMemo(() => {
    if (!trendModalMetric) return [];
    return computeEvaluationTrend(fullHistory, trendModalMetric, userTargets, trendDays);
  }, [fullHistory, trendModalMetric, userTargets, trendDays]);

  function openDrawer() {
    setActiveAction(null);
    setIsDrawerOpen(true);
  }

  function finalizeMealBuilderCloseEmpty() {
    setShowUnsavedMealWarning(false);
    setEditingMealId(null);
    setAddedFoods([]);
    setSelectedMealCenter(null);
    setFoodNameInput('');
    setFoodWeightInput('');
    setIsBarcodeScannerOpen(false);
    setMealPlannerGhostNote('');
    setActiveAction('home');
    setIsDrawerOpen(false);
  }

  function handleAttemptCloseMeal() {
    if ((addedFoods?.length ?? 0) > 0) {
      setShowUnsavedMealWarning(true);
      return;
    }
    finalizeMealBuilderCloseEmpty();
  }

  /** @param {{ force?: boolean }} [opts] — `force: true` dopo salvataggio pasto (stesso tick: addedFoods non aggiornato ancora). */
  function closeDrawer(opts) {
    const force = opts && opts.force === true;
    if (!force && activeAction === 'pasto' && (addedFoods?.length ?? 0) > 0) {
      setShowUnsavedMealWarning(true);
      return;
    }
    if (activeAction === 'pasto' && (force || (addedFoods?.length ?? 0) === 0)) {
      finalizeMealBuilderCloseEmpty();
      return;
    }
    setEditingMealId(null);
    setAddedFoods([]);
    setIsDrawerOpen(false);
    setTimeout(() => setActiveAction(null), 400);
  }

  const commitAddEventMenuOrder = useCallback((nextOrder) => {
    setAddEventMenuOrder(nextOrder);
    try {
      localStorage.setItem(ADD_MENU_ORDER_LS_KEY, JSON.stringify(nextOrder));
    } catch (e) {
      /* ignore */
    }
  }, []);

  // ============================================================================
  // FUNZIONI CRITICHE CON RETROCOMPATIBILITÀ
  // ============================================================================

  const mealIdFromCanonical = (c) => {
    const canon = toCanonicalMealType(String(c || '').split('_')[0]);
    if (canon === 'colazione') return 'colazione';
    if (canon === 'snack') return 'snack';
    if (canon === 'pranzo') return 'pranzo';
    if (canon === 'cena') return 'cena';
    return canon || 'pranzo';
  };

  /** Vocabolario AI → id diario: colazione, snack, pranzo, cena. */
  const normalizeAiMealTypeToStorageId = (raw, decimalHourInfer) => {
    const inferH =
      typeof decimalHourInfer === 'number' && !Number.isNaN(decimalHourInfer)
        ? decimalHourInfer
        : new Date().getHours() + new Date().getMinutes() / 60;
    const k = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ');
    if (!k) return 'snack';
    const phraseExact = {
      colazione: 'colazione',
      merenda1: 'colazione',
      breakfast: 'colazione',
      pranzo: 'pranzo',
      lunch: 'pranzo',
      cena: 'cena',
      dinner: 'cena',
      'pasto serale': 'cena',
      snack: 'snack',
      spuntino: 'snack',
      merenda: 'snack',
      merenda_am: 'snack',
      merenda_pm: 'snack',
      merenda2: 'snack',
      'merenda am': 'snack',
      'merenda pm': 'snack',
      'spuntino mattina': 'snack',
      'spuntino pomeridiano': 'snack',
      'spuntino pomeriggio': 'snack',
    };
    if (Object.prototype.hasOwnProperty.call(phraseExact, k)) return phraseExact[k];
    const base = k.includes(' ') ? k.replace(/\s/g, '_') : k;
    const canon = toCanonicalMealType(base);
    const id = mealIdFromCanonical(canon);
    const allowed = new Set(['colazione', 'snack', 'pranzo', 'cena']);
    if (allowed.has(id)) return id;
    return 'snack';
  };

  const fallbackPredict = (now) => {
    if (now >= 5 && now < 10) return 'colazione';
    if (now >= 10 && now < 12.5) return 'snack';
    if (now >= 12.5 && now < 14.5) return 'pranzo';
    if (now >= 14.5 && now < 19) return 'snack';
    return 'cena';
  };

  /**
   * Predizione a 3 giorni: media degli orari degli ultimi 3 giorni per categoria, poi match sul più vicino a targetTime.
   */
  const predictMealType = (timeDecimal) => {
    const targetTime = typeof timeDecimal === 'number' && !Number.isNaN(timeDecimal) ? timeDecimal : getCurrentTimeRoundedTo15Min();
    if (!fullStorico) return fallbackPredict(targetTime);

    const pastDays = Object.keys(fullStorico)
      .filter(k => k.startsWith('trackerStorico_') && k !== TRACKER_STORICO_KEY(getTodayString()))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 3);
    if (pastDays.length === 0) return fallbackPredict(targetTime);

    const timeAcc = {};
    const timeCount = {};
    pastDays.forEach(dayKey => {
      const mealTimesObj = fullStorico[dayKey]?.mealTimes || {};
      const log = fullStorico[dayKey]?.log || [];
      const flatLog = normalizeLogData(Array.isArray(log) ? log : Object.values(log));
      flatLog.forEach(item => {
        if (item.type !== 'food' && item.type !== 'recipe') return;
        const canonical = toCanonicalMealType(item.mealType);
        const t = mealTimesObj[item.mealType] ?? item.mealTime;
        if (typeof t === 'number') {
          timeAcc[canonical] = (timeAcc[canonical] || 0) + t;
          timeCount[canonical] = (timeCount[canonical] || 0) + 1;
        }
      });
    });

    let bestMatch = 'pranzo';
    let minDiff = Infinity;
    Object.keys(timeAcc).forEach(canonical => {
      const avgTime = timeAcc[canonical] / timeCount[canonical];
      const diff = Math.abs(avgTime - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        bestMatch = canonical;
      }
    });
    if (minDiff > 3) return fallbackPredict(targetTime);
    return mealIdFromCanonical(bestMatch);
  };

  const computeTimelineHourFromPointer = useCallback((e) => {
    const el = timelineContainerRef.current;
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0)) return null;
    const clientX =
      typeof e?.clientX === 'number' && Number.isFinite(e.clientX) ? e.clientX : rect.left + rect.width / 2;
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    let hour = ratio * 24;
    hour = Math.max(0, Math.min(24, Math.round(hour * 4) / 4));
    return hour;
  }, []);

  const openTimelineQuickAddAtPointer = useCallback(
    (e) => {
      if (isSimulationMode) return;
      if (draggingNode != null || touchingNodeId != null) return;
      const hour = computeTimelineHourFromPointer(e);
      if (hour == null) return;
      setSelectedNodeReport(null);
      setTimelineInsertUI({ hour, view: 'main' });
    },
    [isSimulationMode, draggingNode, touchingNodeId, computeTimelineHourFromPointer]
  );

  const openTimelineQuickAddAtCenter = useCallback(() => {
    openTimelineQuickAddAtPointer({});
  }, [openTimelineQuickAddAtPointer]);

  useEffect(() => {
    if (timelineInsertUI == null) return undefined;
    const onKey = (ev) => {
      if (ev.key === 'Escape') setTimelineInsertUI(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timelineInsertUI]);

  /** Alimenti del diario che appartengono allo slot pasto (mealType o composito mealType_decimalTime come nel Pie). */
  const getFoodItemsForMealSlot = useCallback((log, slotId) => {
    if (slotId == null || slotId === 'rimanenti') return [];
    const idStr = String(slotId);
    const list = log || [];
    let items = list.filter(item => getSlotKey(item) === idStr);
    if (items.length === 0) {
      const u = idStr.lastIndexOf('_');
      if (u > 0) {
        const baseMealType = idStr.slice(0, u);
        const parsedTime = Number(idStr.slice(u + 1));
        if (!Number.isNaN(parsedTime)) {
          items = list.filter(item =>
            (item.type === 'food' || item.type === 'recipe') &&
            item.mealType === baseMealType &&
            typeof item.mealTime === 'number' &&
            Math.abs(item.mealTime - parsedTime) < 1e-4
          );
        }
      }
    }
    return items;
  }, []);

  /** Commit orario nodo timeline (pasto aggregato, ghost_meal, manualNodes: work/cognitive/water/…). */
  const updateMealTime = useCallback(
    (nodeId, newTimeRaw) => {
      if (isSimulationMode) return;
      const t = Number(newTimeRaw);
      if (!Number.isFinite(t)) return;
      const finalTimeRounded = Math.max(0, Math.min(24, Math.round(t * 12) / 12));
      const dragId = nodeId;
      const dlSnap = dailyLogRef.current;
      const mnSnap = manualNodesRef.current;
      const idMatch = (a, b) => a === b || String(a) === String(b);

      if (mnSnap.some((n) => idMatch(n.id, dragId))) {
        const next = mnSnap.map((node) => {
          if (!idMatch(node.id, dragId)) return node;
          if (node.type === 'work' || node.type === 'cognitive') {
            return { ...node, time: finalTimeRounded };
          }
          return { ...node, time: finalTimeRounded, mealTime: finalTimeRounded };
        });
        setManualNodes(next);
        syncDatiFirebase(dlSnap, next);
        pushTimelineUndoSnapshot(dlSnap, next);
        return;
      }

      const ghost = dlSnap.find((item) => idMatch(item?.id, dragId) && item?.type === 'ghost_meal');
      if (ghost) {
        const nextLog = dlSnap.map((item) =>
          idMatch(item.id, dragId) && item.type === 'ghost_meal'
            ? { ...item, mealTime: finalTimeRounded, time: finalTimeRounded }
            : item
        );
        setDailyLog(nextLog);
        syncDatiFirebase(nextLog, mnSnap);
        pushTimelineUndoSnapshot(nextLog, mnSnap);
        return;
      }

      const mealSlotForDrag = String(dragId);
      const itemIds = getFoodItemsForMealSlot(dlSnap, mealSlotForDrag).map((i) => i.id).filter((id) => id != null);
      if (itemIds.length === 0) return;
      const idSet = new Set(itemIds.map((x) => String(x)));
      const nextLog = dlSnap.map((item) =>
        idSet.has(String(item.id)) ? { ...item, mealTime: finalTimeRounded } : item
      );
      setDailyLog(nextLog);
      syncDatiFirebase(nextLog, mnSnap);
      pushTimelineUndoSnapshot(nextLog, mnSnap);
    },
    [isSimulationMode, syncDatiFirebase, pushTimelineUndoSnapshot, getFoodItemsForMealSlot]
  );

  /** Cancellazione dopo drag orizzontale sulla striscia con puntatore fuori dalla fascia verticale della timeline. */
  const onTimelineStripDragOutsideDelete = useCallback(
    (node) => {
      if (!node || isSimulationMode) return;
      const dragId = node.id;
      const dragType = node.type;
      const dlSnap = dailyLogRef.current;
      const mnSnap = manualNodesRef.current;
      const idMatch = (a, b) => a === b || String(a) === String(b);
      const isGhostDrag = dragType === 'ghost_meal' || dragType === 'ghost_workout';

      if (isGhostDrag) {
        setGhostProgramDeleteModal({ nodeId: dragId, dragType });
        return;
      }

      const confirmDelete = window.confirm('Vuoi eliminare questo elemento?');
      if (!confirmDelete) return;

      if (dragType === 'meal') {
        const slotId = String(node.mealId || node.id);
        const itemIds = getFoodItemsForMealSlot(dlSnap, slotId).map((i) => i.id).filter((id) => id != null);
        if (itemIds.length === 0) return;
        const idSet = new Set(itemIds.map((x) => String(x)));
        const newLog = dlSnap.filter((item) => !idSet.has(String(item.id)));
        setDailyLog(newLog);
        syncDatiFirebase(newLog, mnSnap);
        pushTimelineUndoSnapshot(newLog, mnSnap);
      } else {
        const newLog = dlSnap.filter((item) => !idMatch(item.id, dragId));
        const newNodes = mnSnap.filter((n) => !idMatch(n.id, dragId));
        setDailyLog(newLog);
        setManualNodes(newNodes);
        syncDatiFirebase(newLog, newNodes);
        pushTimelineUndoSnapshot(newLog, newNodes);
      }
    },
    [isSimulationMode, getFoodItemsForMealSlot, syncDatiFirebase, pushTimelineUndoSnapshot]
  );

  /**
   * Carica un pasto nel costruttore. Accetta mealType o id composito "mealType_time" (es. snack_16.5).
   * Con id composito carica solo i food con quel mealType e quel mealTime.
   */
  const loadMealToConstructor = (mTypeOrId) => {
    setAddedFoods([]);
    setEditingMealId(mTypeOrId);
    let items = getFoodItemsForMealSlot(activeLog, mTypeOrId);

    if (items.length === 0) {
      const canonical = toCanonicalMealType(String(mTypeOrId).split('_')[0]);
      const equivalents = getEquivalentMealTypes(canonical);
      items = (activeLog || []).filter(item => (item.type === 'food' || item.type === 'recipe') && equivalents.includes(item.mealType));
    }

    const toNum = (v) => (typeof v === 'number' && !Number.isNaN(v)) ? v : (Number(v) || 0);
    items = items.map(f => ({
      ...f,
      kcal: toNum(f.kcal) || toNum(f.cal) || 0,
      prot: toNum(f.prot) || toNum(f.proteine) || 0,
      carb: toNum(f.carb) || toNum(f.carboidrati) || 0,
      fat: toNum(f.fat) || toNum(f.fatTotal) || toNum(f.grassi) || 0,
      qta: toNum(f.qta) || toNum(f.weight) || 100,
      weight: toNum(f.weight) || toNum(f.qta) || 100
    }));
    const canonical = items.length > 0 ? toCanonicalMealType(items[0].mealType) : toCanonicalMealType(String(mTypeOrId).split('_')[0]);

    let parsedTimeFromId = null;
    const idStr = String(mTypeOrId);
    const u = idStr.lastIndexOf('_');
    if (u > 0) {
      const p = Number(idStr.slice(u + 1));
      if (Number.isFinite(p)) parsedTimeFromId = p;
    }
    const fromFirst = items.length > 0 ? getMealTimeFromLogItem(items[0]) : null;
    const t =
      fromFirst != null
        ? fromFirst
        : parsedTimeFromId != null
          ? parsedTimeFromId
          : getDefaultMealTime(canonical);

    setMealType(mealIdFromCanonical(canonical));
    setDrawerMealTime(t);
    setDrawerMealTimeStr(decimalToTimeStr(t));
    setAddedFoods(items);
    setActiveAction('pasto');
    setIsDrawerOpen(true);
    setIsMealBuilderOpen(true);
  };

  useEffect(() => {
    if (activeAction === 'pasto' && !editingMealId && addedFoods.length === 0) {
      const predicted = predictMealType(drawerMealTime);
      if (predicted !== mealType) setMealType(predicted);
    }
  }, [drawerMealTime, activeAction, editingMealId, addedFoods.length]);

  const getCurrentTimeRoundedTo15Min = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const decimal = h + m / 60;
    return Math.min(24, Math.max(0, Math.round(decimal * 4) / 4));
  };

  function handleAddEventMenuItem(itemId, source) {
    const fromModal = source === 'modal';
    switch (itemId) {
      case 'meal': {
        const predicted = predictMealType(getCurrentTimeRoundedTo15Min());
        setMealType(predicted);
        setAddedFoods([]);
        setEditingMealId(null);
        const t = getCurrentTimeRoundedTo15Min();
        setDrawerMealTime(t);
        setDrawerMealTimeStr(decimalToTimeStr(t));
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('pasto');
        setIsDrawerOpen(true);
        break;
      }
      case 'water':
        setDrawerWaterTime(getCurrentTimeRoundedTo15Min());
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('acqua');
        setIsDrawerOpen(true);
        break;
      case 'weight':
        if (fromModal) setShowChoiceModal(false);
        else closeDrawer();
        setShowWeightModal(true);
        break;
      case 'alcohol': {
        if (isSimulationMode) return;
        const now = new Date();
        setAlcoholForm({
          subtype: 'vino',
          ml: 150,
          abv: 12,
          timeStr: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        });
        if (fromModal) setShowChoiceModal(false);
        else closeDrawer();
        setShowAlcoholPopup(true);
        break;
      }
      case 'workout': {
        const nowT = getCurrentTimeRoundedTo15Min();
        setWorkoutEndTime(nowT);
        setWorkoutDurationMin(30);
        setWorkoutStrengthDetail('');
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('allenamento');
        setIsDrawerOpen(true);
        break;
      }
      case 'stimulant':
        if (!fromModal) closeDrawer();
        setStimulantTime(getCurrentTimeRoundedTo15Min());
        setStimulantSubtype('caffè');
        setAddChoiceView('stimulant');
        setShowChoiceModal(true);
        break;
      case 'nap': {
        const tN = getCurrentTimeRoundedTo15Min();
        const defaultNapDurationHours = 0.5;
        let napStart = tN - defaultNapDurationHours;
        if (napStart < 0) napStart += 24;
        setDrawerFastChargeStart(napStart);
        setDrawerFastChargeEnd(tN);
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('fast_charge_nap');
        setIsDrawerOpen(true);
        break;
      }
      case 'meditation': {
        const tM = getCurrentTimeRoundedTo15Min();
        setDrawerFastChargeStart(tM);
        setDrawerFastChargeEnd(Math.min(24, tM + 0.5));
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('fast_charge_meditation');
        setIsDrawerOpen(true);
        break;
      }
      case 'supplements':
        setDrawerFastChargeTime(getCurrentTimeRoundedTo15Min());
        setFastChargeSupplementName('');
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('fast_charge_supplements');
        setIsDrawerOpen(true);
        break;
      case 'plan':
        setShowChoiceModal(false);
        closeDrawer({ force: true });
        setPlanningWizardHydrateNonce((n) => n + 1);
        setPlanningWizardOverlayOpen(true);
        break;
      case 'diary':
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('diario_giornaliero');
        if (fromModal) setIsDrawerOpen(true);
        break;
      case 'menu':
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('menu_secondary');
        if (fromModal) setIsDrawerOpen(true);
        break;
      default:
        break;
    }
  }

  const eventQuickButtonConfigs = useMemo(
    () => [
      { id: 'pasto', label: 'Inserisci Pasto', icon: '🍽️', drawerActionId: 'meal' },
      { id: 'allenamento', label: 'Allenamento', icon: '🏋️', drawerActionId: 'workout' },
      { id: 'acqua', label: 'Acqua', icon: '💧', drawerActionId: 'water' },
      { id: 'nap', label: 'Nap', icon: '😴', drawerActionId: 'nap' },
      { id: 'supplements', label: 'Supplementi', icon: '💊', drawerActionId: 'supplements' },
    ],
    []
  );

  const mostUsedEventButtons = useMemo(() => {
    const orderIndex = new Map(eventQuickButtonConfigs.map((cfg, idx) => [cfg.id, idx]));
    return [...eventQuickButtonConfigs]
      .filter((cfg) => cfg.id !== 'pasto')
      .sort((a, b) => {
        const diff = (Number(eventUsage?.[b.id]) || 0) - (Number(eventUsage?.[a.id]) || 0);
        if (diff !== 0) return diff;
        return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
      })
      .slice(0, 2);
  }, [eventQuickButtonConfigs, eventUsage]);

  const getDefaultMealTime = (mealTypeKey) => {
    const DEFAULT_SLOT_TIME = {
      colazione: 8,
      merenda1: 8,
      snack: 10.5,
      merenda_am: 10.5,
      merenda_pm: 16.5,
      merenda2: 16.5,
      spuntino: 16.5,
      pranzo: 13,
      cena: 20,
    };
    const fallbackFromSlot = () => {
      const defT = DEFAULT_SLOT_TIME[mealTypeKey];
      return typeof defT === 'number' ? defT : getCurrentTimeRoundedTo15Min();
    };

    const equivalents = getEquivalentMealTypes(mealTypeKey);

    const first = (activeLog || []).find(item =>
      (item?.type === 'food' || item?.type === 'recipe') && equivalents.includes(item?.mealType)
    );
    const fromFirst = first != null ? getMealTimeFromLogItem(first) : null;
    if (fromFirst != null) return fromFirst;

    if (!fullStorico) return fallbackFromSlot();
    const keys = Object.keys(fullStorico).filter(k => k.startsWith('trackerStorico_'));
    keys.sort((a, b) => b.localeCompare(a));
    const todayKey = TRACKER_STORICO_KEY(getTodayString());

    for (const key of keys) {
      if (key === todayKey) continue;
      const dayData = fullStorico[key];
      for (const eq of equivalents) {
        const t = dayData?.mealTimes?.[eq];
        if (typeof t === 'number') return t;
      }
    }
    return fallbackFromSlot();
  };

  const handleTimeInput = (value) => {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length === 0) {
      setDrawerMealTimeStr('');
      setDrawerMealTime(12);
      return;
    }
    let formatted = digits.slice(0, 4);
    if (formatted.length > 2) formatted = formatted.slice(0, 2) + ':' + formatted.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4);
    setDrawerMealTimeStr(formatted);
    const [hh, mm] = formatted.includes(':') ? formatted.split(':') : [formatted.slice(0, 2) || '0', formatted.slice(2) || '0'];
    const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
    setDrawerMealTime(h + m / 60);
  };

  const adjustMealTime = (delta) => {
    const next = Math.max(0, Math.min(24, Math.round((drawerMealTime + delta) * 4) / 4));
    setDrawerMealTime(next);
    setDrawerMealTimeStr(decimalToTimeStr(next));
  };

  const parseTimeStrToDecimal = (value) => {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length === 0) return 12;
    const formatted = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2, 4) : digits;
    const [hh, mm] = formatted.includes(':') ? formatted.split(':') : [formatted.slice(0, 2) || '0', formatted.slice(2) || '0'];
    const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
    return h + m / 60;
  };

  const getLastQuantityForFood = (desc) => {
    if (!fullStorico || !desc) return null;
    const keys = Object.keys(fullStorico).filter(k => k.startsWith('trackerStorico_'));
    keys.sort((a, b) => b.localeCompare(a));
    const norm = (s) => (s || '').toLowerCase().trim();
    const target = norm(desc);
    for (const key of keys) {
      const log = fullStorico[key]?.log;
      if (!Array.isArray(log)) continue;
      const flat = normalizeLogData(log);
      const found = flat.filter(i => i?.type === 'food' || i?.type === 'recipe').find(i => 
        norm(i?.desc || i?.name) === target || 
        norm(i?.desc || i?.name).includes(target) || 
        target.includes(norm(i?.desc || i?.name))
      );
      if (found != null && (found.qta != null || found.weight != null)) {
        return String(found.qta ?? found.weight ?? '');
      }
    }
    return null;
  };

  const fetchOpenFoodFactsProduct = async (barcode) => {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,ingredients_text_it,ingredients_text,nutriments`);
    const data = await res.json();
    if (data?.status === 0 || !data?.product) return null;
    const p = data?.product;
    const nut = p?.nutriments || {};
    const toNum = (v) => (v != null && v !== '' ? parseFloat(v) : undefined);
    const kcalFromKj = (kj) => (kj != null && Number.isFinite(kj) ? kj / 4.184 : undefined);
    const energyKcal = toNum(nut['energy-kcal_100g']);
    const energyKj = toNum(nut['energy_100g']);
    const entryPer100 = {
      desc: p?.product_name || `Barcode ${barcode}`,
      kcal: energyKcal ?? kcalFromKj(energyKj),
      prot: toNum(nut.proteins_100g),
      carb: toNum(nut.carbohydrates_100g),
      fatTotal: toNum(nut.fat_100g),
      fibre: toNum(nut.fiber_100g)
    };
    ['sugars_100g', 'saturated-fat_100g', 'salt_100g', 'sodium_100g', 'calcium_100g', 'iron_100g', 'potassium_100g', 'vitamin-c_100g', 'vitamin-d_100g'].forEach((key, i) => {
      const our = ['zuccheri', 'fatSat', 'sale', 'na', 'ca', 'fe', 'k', 'vitc', 'vitD'][i];
      if (our && nut[key] != null) entryPer100[our] = parseFloat(nut[key]);
    });
    return entryPer100;
  };

  const handleBarcodeDetected = useCallback(async (barcode) => {
    setIsBarcodeScannerOpen(false);
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach(t => t.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeScanIntervalRef.current) clearInterval(barcodeScanIntervalRef.current);
    const code = String(barcode ?? '').trim();
    const slugName = (name) => String(name).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 30);

    const applyLocalOverride = (base) => {
      const ov = getBarcodeNutritionOverride(code);
      if (!ov) return base;
      const next = { ...base };
      if (ov.desc) next.desc = ov.desc;
      if (ov.kcal != null) next.kcal = ov.kcal;
      if (ov.prot != null) next.prot = ov.prot;
      if (ov.carb != null) next.carb = ov.carb;
      if (ov.fat != null) next.fatTotal = ov.fat;
      return next;
    };

    const fillPer100Defaults = (row) => {
      const r = { ...row };
      Object.keys(TARGETS).forEach((g) =>
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (r[k] == null) r[k] = getDefaultNutrientValue(k, fullHistory);
        })
      );
      if (r.kcal == null) r.kcal = getDefaultNutrientValue('kcal', fullHistory);
      return r;
    };

    try {
      let entryPer100 = await fetchOpenFoodFactsProduct(code);
      const localOv = getBarcodeNutritionOverride(code);

      if (!entryPer100) {
        if (localOv && (localOv.desc || localOv.kcal != null)) {
          entryPer100 = {
            desc: localOv.desc || `Barcode ${code}`,
            kcal: localOv.kcal,
            prot: localOv.prot,
            carb: localOv.carb,
            fatTotal: localOv.fat,
            barcode: code,
          };
        } else {
          entryPer100 = { desc: `Barcode ${code}`, barcode: code };
        }
      } else {
        entryPer100 = { ...entryPer100, barcode: code };
        entryPer100 = applyLocalOverride(entryPer100);
      }

      entryPer100 = fillPer100Defaults(entryPer100);
      const name = String(entryPer100.desc || '').trim() || `Barcode ${code}`;

      let savedRow = { ...entryPer100, desc: name };
      let dbKey = `local_${Date.now()}_${code}`;

      if (userUid && db) {
        const basePath = `users/${userUid}/tracker_data`;
        const existingKey = Object.keys(foodDb || {}).find(
          (k) => foodDb[k] && String(foodDb[k].barcode ?? '') === code
        );
        dbKey = existingKey || `food_${Date.now()}_${slugName(name)}`;
        const entrySaved = enrichDbRowWithFoodUnits(savedRow, dbKey);
        await set(ref(db, `${basePath}/trackerFoodDatabase/${dbKey}`), entrySaved);
        setFoodDb((prev) => ({ ...(prev || {}), [dbKey]: entrySaved }));
        savedRow = entrySaved;
      }

      setFoodNameInput(savedRow.desc || name);
      setFoodWeightInput(getLastQuantityForFood(savedRow.desc || name) || '100');
      setMealBuilderBarcodeBootstrap({
        nonce: Date.now(),
        match: {
          id: dbKey,
          desc: savedRow.desc || name,
          row: savedRow,
          barcode: code,
        },
      });
      setTimeout(() => document.getElementById('weight-input')?.focus(), 100);
    } catch (e) {
      setFoodNameInput(`Barcode ${code}`);
      setFoodWeightInput('100');
      setMealBuilderBarcodeBootstrap({
        nonce: Date.now(),
        match: {
          id: `err_${Date.now()}`,
          desc: `Barcode ${code}`,
          row: { desc: `Barcode ${code}`, barcode: code },
          barcode: code,
        },
      });
      setTimeout(() => document.getElementById('weight-input')?.focus(), 100);
    }
  }, [foodDb, userUid, fullHistory, db]);

  useEffect(() => {
    if (!isBarcodeScannerOpen || !barcodeVideoRef.current) return;
    if (!('BarcodeDetector' in window)) {
      alert('Il browser non supporta la scansione barcode. Prova Chrome su Android.');
      setIsBarcodeScannerOpen(false);
      return;
    }
    let stream = null;
    const barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        stream = s;
        barcodeStreamRef.current = s;
        if (barcodeVideoRef.current) {
          barcodeVideoRef.current.srcObject = s;
          barcodeVideoRef.current.play();
        }
        barcodeScanIntervalRef.current = setInterval(async () => {
          if (!barcodeVideoRef.current || !stream) return;
          try {
            const barcodes = await barcodeDetector.detect(barcodeVideoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              handleBarcodeDetected(code);
            }
          } catch (_) {}
        }, 200);
      })
      .catch(() => {
        alert('Impossibile accedere alla fotocamera.');
        setIsBarcodeScannerOpen(false);
      });
    return () => {
      if (barcodeScanIntervalRef.current) clearInterval(barcodeScanIntervalRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
      barcodeStreamRef.current = null;
    };
  }, [isBarcodeScannerOpen, handleBarcodeDetected]);

  const closeBarcodeScanner = useCallback(() => {
    setIsBarcodeScannerOpen(false);
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach(t => t.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeScanIntervalRef.current) clearInterval(barcodeScanIntervalRef.current);
  }, []);

  const consumeMealBuilderBarcodeBootstrap = useCallback(() => {
    setMealBuilderBarcodeBootstrap(null);
  }, []);

  /** Stima media verosimile per nutriente mancante (mai 0: usa contesto nome o media). */
  const getAverageEstimate = useCallback((nutrientKey, foodDesc = '') => {
    const desc = (foodDesc || '').toLowerCase();
    const isProteico = /pollo|carne|pesce|tonno|salmone|manzo|petto|bresaola|prosciutto|uovo|tofu|legum|fagiol|ceci|lenticch|proteina/.test(desc);
    const isCarboidrato = /pasta|pane|riso|patata|cereal|pizza|biscott|dolce|zucchero|miele|frutta|banana|mela/.test(desc);
    const isGrasso = /olio|avocado|frutta secca|mandorla|noci|semi|burro/.test(desc);
    if (nutrientKey === 'prot') return isProteico ? 18 : (isCarboidrato ? 6 : 10);
    if (nutrientKey === 'carb') return isCarboidrato ? 45 : (isProteico ? 2 : 15);
    if (nutrientKey === 'fatTotal' || nutrientKey === 'fat') return isGrasso ? 15 : (isProteico ? 5 : 8);
    if (nutrientKey === 'kcal' || nutrientKey === 'cal') {
      const p = getAverageEstimate('prot', foodDesc);
      const c = getAverageEstimate('carb', foodDesc);
      const f = getAverageEstimate('fatTotal', foodDesc);
      return Math.round((p * 4 + c * 4 + f * 9)) || 120;
    }
    const def = getDefaultNutrientValue(nutrientKey, fullHistory);
    return def > 0 ? def : (nutrientKey === 'fibre' ? 3 : nutrientKey === 'omega3' ? 0.3 : nutrientKey === 'mg' ? 25 : 10);
  }, [fullHistory]);

  // Estrazione dati da DB (preferredDbKey: da findBestFoodMatch nel flusso add_food)
  const estraiDatiFoodDb = useCallback((nome, qta, pastoType, preferredDbKey) => {
    const foodItem = Object.assign(
      { id: Date.now() + Math.random(), type: 'food', mealType: pastoType, desc: nome, qta, weight: qta, kcal: 0, cal: 0 },
      ...Object.keys(TARGETS).flatMap(g => Object.keys(TARGETS[g]).map(k => ({ [k]: undefined })))
    );
    const dbKey =
      preferredDbKey != null && foodDb[preferredDbKey] != null
        ? preferredDbKey
        : Object.keys(foodDb).find(k => foodDb?.[k]?.desc?.toLowerCase()?.includes(nome.toLowerCase()));
    if (dbKey) {
      const dbF = foodDb[dbKey];
      if (dbF.isRecipe && Array.isArray(dbF.ingredients) && dbF.ingredients.length > 0) {
        const factor = qta / 100;
        const ingredients = dbF.ingredients.map((ing) => {
          const w0 = Number(ing.weight) || 0;
          const wf = w0 > 0 ? Math.max(5, Math.round(w0 * factor)) / w0 : factor;
          return {
            ...ing,
            weight: Math.max(5, Math.round(w0 * factor)),
            kcal: Math.max(0, Math.round((Number(ing.kcal) || 0) * wf)),
            prot: Math.max(0, Math.round((Number(ing.prot) || 0) * wf * 10) / 10),
            carb: Math.max(0, Math.round((Number(ing.carb) || 0) * wf * 10) / 10),
            fat: Math.max(0, Math.round((Number(ing.fat) || 0) * wf * 10) / 10)
          };
        });
        const recipeItem = {
          id: `recipe_${Date.now()}`,
          type: 'recipe',
          mealType: pastoType,
          desc: dbF.desc || nome,
          name: dbF.desc || nome,
          qta,
          weight: qta,
          unitStep: 50,
          kcal: ((Number(dbF.kcal) || 0) * qta) / 100,
          cal: ((Number(dbF.kcal) || 0) * qta) / 100,
          prot: ((Number(dbF.prot) || 0) * qta) / 100,
          carb: ((Number(dbF.carb) || 0) * qta) / 100,
          fat: ((Number(dbF.fatTotal) || Number(dbF.fat) || 0) * qta) / 100,
          fatTotal: ((Number(dbF.fatTotal) || Number(dbF.fat) || 0) * qta) / 100,
          ingredients
        };
        Object.keys(dbF || {}).forEach(k => {
          if (typeof dbF[k] === 'number' && k !== 'id' && k !== 'kcal' && k !== 'cal' && !['prot', 'carb', 'fatTotal', 'fat'].includes(k)) {
            recipeItem[k] = (dbF[k] / 100) * qta;
          }
        });
        const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
        Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g]).forEach(k => {
          if (recipeItem[k] == null || recipeItem[k] === 0) {
            recipeItem[k] = macroKeys.includes(k)
              ? (getAverageEstimate(k, nome) / 100) * qta || getDefaultNutrientValue(k, fullHistory)
              : getDefaultNutrientValue(k, fullHistory);
          }
        }));
        recipeItem.kcal = recipeItem.kcal || recipeItem.cal || 0;
        recipeItem.cal = recipeItem.cal ?? recipeItem.kcal;
        return recipeItem;
      }
      foodItem.foodDbKey = dbKey;
      Object.keys(dbF || {}).forEach(k => {
        if (typeof dbF[k] === 'number' && k !== 'id') foodItem[k] = (dbF[k] / 100) * qta;
      });
      foodItem.kcal = foodItem.kcal || foodItem.cal || 0;
      foodItem.cal = foodItem.cal ?? foodItem.kcal;
      const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
      Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g]).forEach(k => {
        if (foodItem[k] == null || foodItem[k] === 0) {
          foodItem[k] = macroKeys.includes(k)
            ? (getAverageEstimate(k, nome) / 100) * qta || getDefaultNutrientValue(k, fullHistory)
            : getDefaultNutrientValue(k, fullHistory);
        }
      }));
      if (!foodItem.kcal || foodItem.kcal === 0) foodItem.kcal = (getAverageEstimate('kcal', nome) / 100) * qta || getDefaultNutrientValue('kcal', fullHistory);
      return enrichPortionItemWithDbUnits(foodItem, dbF, dbKey);
    } else {
      const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
      foodItem.kcal = (getAverageEstimate('kcal', nome) / 100) * qta || getDefaultNutrientValue('kcal', fullHistory);
      foodItem.cal = foodItem.kcal;
      foodItem.prot = (getAverageEstimate('prot', nome) / 100) * qta || getDefaultNutrientValue('prot', fullHistory);
      foodItem.carb = (getAverageEstimate('carb', nome) / 100) * qta || getDefaultNutrientValue('carb', fullHistory);
      foodItem.fatTotal = (getAverageEstimate('fatTotal', nome) / 100) * qta || getDefaultNutrientValue('fatTotal', fullHistory);
      Object.values(TARGETS).forEach(g => Object.keys(g || {}).forEach(k => {
        if (foodItem[k] == null)
          foodItem[k] = macroKeys.includes(k) ? (getAverageEstimate(k, nome) / 100) * qta || getDefaultNutrientValue(k, fullHistory) : getDefaultNutrientValue(k, fullHistory);
      }));
    }
    const { units, defaultUnit, category } = buildFoodUnits({ desc: nome }, '');
    return { ...foodItem, units, defaultUnit, category };
  }, [foodDb, getAverageEstimate, fullHistory]);

  /**
   * Proposal items (nome, qty, est*, dbKey, matchedKey) → righe `food`/`recipe` per il diario.
   * Usato da chat add_food e da espansione ghost timeline → costruttore pasto.
   */
  const mapProposalItemsToDiaryFoods = useCallback(
    (addFoodItems, mealDecFood) => {
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return [];
      const predictedMealType = predictMealType(mealDecFood);
      const batchGhostTypeFood = getGhostMealType(predictedMealType, dailyLogRef.current || []);
      const batchIdFood = `batch_${Date.now()}`;
      return addFoodItems
        .map((item, index) => {
          const name = item.name;
          const qty = Math.max(1, Number(item.qty));
          const matchedKey =
            item.matchedKey != null && foodDb[item.matchedKey] != null
              ? item.matchedKey
              : findBestFoodMatch(name, foodDb);
          if (matchedKey != null) {
            const dati = estraiDatiFoodDb(name, qty, batchGhostTypeFood, matchedKey);
            const isRecipe = dati.type === 'recipe';
            return {
              ...dati,
              id: dati.id || `ai_${batchIdFood}_${index}`,
              mealType: batchGhostTypeFood,
              mealTime: mealDecFood,
              batchId: batchIdFood,
              isEstimated: false,
              type: isRecipe ? 'recipe' : 'food',
            };
          }
          const qSafe = Math.max(5, qty);
          let kcal = Number(item.estKcal ?? item.kcal);
          let prot = Number(item.estPro ?? item.prot);
          let carb = Number(item.estCar ?? item.carb);
          let fat = Number(item.estFat ?? item.fat);
          if (!Number.isFinite(kcal) || kcal <= 0) {
            kcal = Math.max(10, Math.round((getAverageEstimate('kcal', name) / 100) * qSafe));
          }
          if (!Number.isFinite(prot) || prot < 0) {
            prot = (getAverageEstimate('prot', name) / 100) * qSafe;
          }
          if (!Number.isFinite(carb) || carb < 0) {
            carb = (getAverageEstimate('carb', name) / 100) * qSafe;
          }
          if (!Number.isFinite(fat) || fat < 0) {
            fat = (getAverageEstimate('fatTotal', name) / 100) * qSafe;
          }
          const baseEst = estraiDatiFoodDb(name, qty, batchGhostTypeFood);
          return {
            ...baseEst,
            id: `ai_food_${batchIdFood}_${index}`,
            type: 'food',
            mealType: batchGhostTypeFood,
            desc: name,
            name,
            qta: qSafe,
            weight: qSafe,
            kcal,
            cal: kcal,
            prot,
            carb,
            fatTotal: fat,
            fat,
            mealTime: mealDecFood,
            batchId: batchIdFood,
            isEstimated: true,
          };
        })
        .filter(Boolean);
    },
    [predictMealType, getGhostMealType, foodDb, estraiDatiFoodDb, getAverageEstimate]
  );

  /** Apre MealBuilder su ghost_meal (timeline o modale) con stessi dati del diario. */
  const openGhostMealEditorFromTimelineNode = useCallback(
    (node) => {
      if (!node || node.type !== 'ghost_meal') return;
      const logSnap = dailyLogRef.current || [];
      const src =
        logSnap.find(
          (e) => e?.type === 'ghost_meal' && e?.id != null && String(e.id) === String(node.id)
        ) || node;
      const mt = toCanonicalMealType(String(src.mealType || 'pranzo').split('_')[0]) || 'pranzo';
      let t = src.mealTime;
      if (typeof t !== 'number' || Number.isNaN(t)) t = src.time;
      if (typeof t !== 'number' || Number.isNaN(t)) t = node.time;
      if (typeof t !== 'number' || Number.isNaN(t)) t = 12;
      setSelectedNodeReport(null);
      setEditingMealId(src.id ?? node.id);
      const reads = mealFoodsRead(src);
      const proposalItems =
        reads.length > 0
          ? structuredFoodsToProposalItems(reads)
          : ghostSurfaceDraftToProposalItems(src.draftFoods || node.draftFoods);
      setAddedFoods(mapProposalItemsToDiaryFoods(proposalItems, t));
      setMealType(mealIdFromCanonical(mt));
      setDrawerMealTime(t);
      setDrawerMealTimeStr(decimalToTimeStr(t));
      setMealPlannerGhostNote(String(src.microDesc || src.title || node.microDesc || node.title || '').trim());
      setActiveAction('pasto');
      setIsDrawerOpen(true);
      setIsMealBuilderOpen(true);
      setMealBuilderSmartLaunchKey((k) => k + 1);
    },
    [mapProposalItemsToDiaryFoods, decimalToTimeStr, toCanonicalMealType, mealIdFromCanonical]
  );

  /** Salvataggio pasto da payload add_food / pendingHabit; items possono includere matchedKey (abitudine). */
  const commitAddFoodChatPayload = useCallback(
    (payload) => {
      const { timeString: oraStringFood, mealDec: mealDecFood, items: addFoodItems } = payload || {};
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return null;
      const alimentiProcessatiFood = mapProposalItemsToDiaryFoods(addFoodItems, mealDecFood);
      if (!alimentiProcessatiFood.length) return null;

      const totKcal = Math.round(
        alimentiProcessatiFood.reduce((s, f) => s + (Number(f.kcal) || Number(f.cal) || 0), 0)
      );
      const totPro =
        Math.round(alimentiProcessatiFood.reduce((s, f) => s + (Number(f.prot) || 0), 0) * 10) / 10;
      const totCar =
        Math.round(alimentiProcessatiFood.reduce((s, f) => s + (Number(f.carb) || 0), 0) * 10) / 10;
      const totFat =
        Math.round(alimentiProcessatiFood.reduce((s, f) => s + (Number(f.fatTotal ?? f.fat) || 0), 0) * 10) /
        10;
      const testoRispostaFood = `🎯 **Pasto Registrato**
- **Orario:** ${oraStringFood}
- **Kcal Totali:** ${totKcal}
- **Proteine:** ${totPro}g
- **Carboidrati:** ${totCar}g
- **Grassi:** ${totFat}g

Ottimo! Diario aggiornato. 🥗`;

      if (isSimulationMode) {
        setSimulatedLog((prev) => [...alimentiProcessatiFood, ...(prev || [])]);
      } else {
        setDailyLog((prev) => {
          const nuovoLogFood = [...alimentiProcessatiFood, ...(prev || [])];
          syncDatiFirebase(nuovoLogFood, manualNodesRef.current);
          return nuovoLogFood;
        });
      }
      return testoRispostaFood;
    },
    [
      mapProposalItemsToDiaryFoods,
      isSimulationMode,
      setSimulatedLog,
      setDailyLog,
      syncDatiFirebase,
    ]
  );

  const handleAddFoodManual = () => {
    if (!foodNameInput || !foodWeightInput) return;
    const item = estraiDatiFoodDb(foodNameInput.trim(), parseFloat(foodWeightInput), mealType);
    setAddedFoods([item, ...addedFoods]);
    setFoodNameInput('');
    setFoodWeightInput('');
  };

  const handleCalibrateFoodWeight = (foodId, deltaG) => {
    const food = addedFoods.find(f => f?.id === foodId);
    if (!food) {
      console.warn('[SalaComandi] food not found for calibration', { foodId });
      return;
    }
    const currentQta = Number(food.qta ?? food.weight ?? 100) || 100;
    const newQta = Math.max(5, Math.min(5000, currentQta + deltaG));
    if (newQta === currentQta) return;
    if (food.type === 'recipe') {
      const ratio = newQta / currentQta;
      const scaleKeys = new Set([
        'kcal', 'cal', 'prot', 'carb', 'fat', 'fatTotal',
        ...Object.values(TARGETS).flatMap(g => Object.keys(g || {}))
      ]);
      setAddedFoods(prev => prev.map(f => {
        if (f.id !== foodId) return f;
        const next = { ...f, qta: newQta, weight: newQta, locked: true };
        scaleKeys.forEach((k) => {
          if (f[k] != null && typeof f[k] === 'number' && !Number.isNaN(f[k])) {
            next[k] = f[k] * ratio;
          }
        });
        if (Array.isArray(f.ingredients)) {
          next.ingredients = f.ingredients.map((ing) => {
            const w0 = Number(ing.weight) || 0;
            const w1 = Math.max(5, Math.round(w0 * ratio));
            const wf = w0 > 0 ? w1 / w0 : 1;
            return {
              ...ing,
              weight: w1,
              kcal: Math.max(0, Math.round((Number(ing.kcal) || 0) * wf)),
              prot: Math.max(0, Math.round((Number(ing.prot) || 0) * wf * 10) / 10),
              carb: Math.max(0, Math.round((Number(ing.carb) || 0) * wf * 10) / 10),
              fat: Math.max(0, Math.round((Number(ing.fat) || 0) * wf * 10) / 10)
            };
          });
        }
        return next;
      }));
      return;
    }
    const updated = estraiDatiFoodDb(food.desc || food.name, newQta, food.mealType || mealType);
    setAddedFoods(prev => prev.map(f => f.id === foodId ? { ...updated, id: foodId, locked: true } : f));
  };

  const saveCustomRecipeToFoodDb = useCallback(async ({ desc, kcal, prot, carb, fatTotal, ingredients }, existingKey) => {
    if (!userUid || !desc) return null;
    const basePath = `users/${userUid}/tracker_data`;
    const slug = String(desc).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 40);
    const trimmed = existingKey != null && String(existingKey).trim() !== '' ? String(existingKey).trim() : '';
    const dbKey = trimmed || `recipe_${Date.now()}_${slug}`;
    const entryPer100 = {
      desc: String(desc).trim(),
      kcal: Number(kcal) || 0,
      prot: Number(prot) || 0,
      carb: Number(carb) || 0,
      fatTotal: fatTotal != null ? Number(fatTotal) : 0,
      isRecipe: true,
      ingredients: Array.isArray(ingredients) ? ingredients : []
    };
    Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g] || {}).forEach(k => {
      if (entryPer100[k] == null) entryPer100[k] = getDefaultNutrientValue(k, fullHistory);
    }));
    await set(ref(db, `${basePath}/trackerFoodDatabase/${dbKey}`), entryPer100);
    setFoodDb(prev => ({ ...(prev || {}), [dbKey]: entryPer100 }));
    return dbKey;
  }, [userUid, db, fullHistory]);

  const saveFoodEntryPer100ToFoodDb = useCallback(async (entry) => {
    if (!userUid || !entry?.desc) return;
    const basePath = `users/${userUid}/tracker_data`;
    const name = String(entry.desc).trim();
    const slug = name.replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 40);
    const newKey = `food_${Date.now()}_${slug}`;
    const payload = { ...entry, desc: name, isRecipe: false };
    delete payload.ingredients;
    delete payload.type;
    Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g] || {}).forEach(k => {
      if (payload[k] == null) payload[k] = getDefaultNutrientValue(k, fullHistory);
    }));
    if (payload.kcal == null || Number(payload.kcal) === 0) {
      payload.kcal = getDefaultNutrientValue('kcal', fullHistory);
    }
    if (payload.fatTotal == null && payload.fat != null) payload.fatTotal = Number(payload.fat);
    const payloadWithUnits = enrichDbRowWithFoodUnits(payload, newKey);
    await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), payloadWithUnits);
    setFoodDb(prev => ({ ...(prev || {}), [newKey]: payloadWithUnits }));
  }, [userUid, db, fullHistory]);

  /** Override locale + aggiornamento riga Firebase per stesso barcode (correzioni utente). */
  const persistBarcodeNutritionCorrection = useCallback(
    async ({ barcode, foodDbKey, per100, desc }) => {
      const code = String(barcode ?? '').trim();
      if (!code || !per100 || typeof per100 !== 'object') return;
      const name = String(desc ?? '').trim();
      setBarcodeNutritionOverrideStorage(code, {
        desc: name || undefined,
        kcal: per100.kcal,
        prot: per100.prot,
        carb: per100.carb,
        fat: per100.fat,
      });
      if (!userUid || !db || !foodDbKey || !foodDb?.[foodDbKey]) return;
      const basePath = `users/${userUid}/tracker_data`;
      const prev = foodDb[foodDbKey];
      const merged = {
        ...prev,
        desc: name || prev.desc,
        barcode: code,
        kcal: per100.kcal,
        prot: per100.prot,
        carb: per100.carb,
        fatTotal: per100.fat,
      };
      Object.keys(TARGETS).forEach((g) =>
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (merged[k] == null) merged[k] = getDefaultNutrientValue(k, fullHistory);
        })
      );
      if (merged.kcal == null || Number(merged.kcal) === 0) {
        merged.kcal = getDefaultNutrientValue('kcal', fullHistory);
      }
      if (merged.fatTotal == null && merged.fat != null) merged.fatTotal = Number(merged.fat);
      const payload = enrichDbRowWithFoodUnits(merged, foodDbKey);
      await set(ref(db, `${basePath}/trackerFoodDatabase/${foodDbKey}`), payload);
      setFoodDb((p) => ({ ...(p || {}), [foodDbKey]: payload }));
    },
    [userUid, db, foodDb, fullHistory]
  );

  const deleteRecipeFromFoodDb = useCallback(async (recipeKey) => {
    if (!userUid || !recipeKey) return;
    const path = `users/${userUid}/tracker_data/trackerFoodDatabase/${recipeKey}`;
    await remove(ref(db, path));
    setFoodDb((prev) => {
      const next = { ...(prev || {}) };
      delete next[recipeKey];
      return next;
    });
  }, [userUid, db]);

  const enterFullscreen = async () => {
    const idx = availableFullscreenCharts.indexOf(chartUnit);
    setFullscreenChartIndex(idx >= 0 ? idx : 0);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      if (window.screen?.orientation?.lock) await window.screen.orientation.lock('landscape');
    } catch (err) { console.warn('Landscape lock non supportato', err); }
    setIsFullScreenGraph(true);
    setTimeout(() => centerCurrentTimeFullscreen(), 180);
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      if (window.screen?.orientation?.unlock) window.screen.orientation.unlock();
    } catch (err) { console.warn('Exit fullscreen fallito', err); }
    setIsFullScreenGraph(false);
  };

  const saveMealToDiary = () => {
    if (!isInitialLoadComplete) return;
    try {
      const currentTargetType = mealType;
      const uniqueBatchId = Date.now();
      const timeToUse =
        typeof drawerMealTime === 'number' && !Number.isNaN(drawerMealTime)
          ? drawerMealTime
          : getCurrentTimeRoundedTo15Min();
      const safeDailyLog = dailyLog || [];
      const ourSlot = getGhostMealType(currentTargetType, safeDailyLog);
      const slotToReplace = editingMealId || ourSlot;

      const mealItems = (addedFoods || []).map((f, index) => ({
        ...f,
        type: f.type === 'recipe' ? 'recipe' : 'food',
        mealType: ourSlot,
        mealTime: timeToUse,
        id: f.id || `f_${uniqueBatchId}_${index}`
      }));

      if (!isSimulationMode && mealItems.length >= 1) {
        try {
          if (mealItems.length >= 2) {
            recordMealFoodCooccurrence(mealItems, ourSlot);
          }
          recordMealSuggestionHabits(mealItems, ourSlot, foodDb || {});
          recordMealFoodUnitUsageFromItems(mealItems, foodDb || {}, findBestFoodMatch);
        } catch (_) {}
      }

      const foodsToRemove = getFoodItemsForMealSlot(safeDailyLog, String(slotToReplace));
      const removeSet = new Set(foodsToRemove);
      const editingGhostMealId = editingMealId != null ? String(editingMealId) : '';
      const rest = safeDailyLog.filter((item) => {
        if (removeSet.has(item)) return false;
        if (
          editingGhostMealId &&
          item?.type === 'ghost_meal' &&
          item.id != null &&
          String(item.id) === editingGhostMealId
        ) {
          return false;
        }
        return true;
      });

      const nuovoLog = [...mealItems, ...rest];
      if (isSimulationMode) {
        setSimulatedLog((prev) => {
          const p = prev || [];
          const toRm = getFoodItemsForMealSlot(p, String(slotToReplace));
          const rm = new Set(toRm);
          const kept = p.filter((item) => {
            if (rm.has(item)) return false;
            if (
              editingGhostMealId &&
              item?.type === 'ghost_meal' &&
              item.id != null &&
              String(item.id) === editingGhostMealId
            ) {
              return false;
            }
            return true;
          });
          return [...kept, ...mealItems];
        });
        setAddedFoods([]);
        setEditingMealId(null);
        closeDrawer({ force: true });
        return;
      }
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes || []);
    } catch (error) {
      console.error("Errore salvataggio pasto:", error);
    } finally {
      setAddedFoods([]);
      setEditingMealId(null);
      closeDrawer({ force: true });
    }
  };

  /**
   * Salvataggio dal costruttore pasti avanzato (macro, timing, impatto glicemico stimato).
   * Predisposto per un futuro sistema modulare di creazione pasti.
   * @param {Object} payload - { macro?, timing?, glycemicImpact?, mealType?, items? }
   */
  const handleMealBuilderSave = useCallback((payload = {}) => {
    setIsMealBuilderOpen(false);
    if (payload?.items?.length) {
      const timeToUse =
        typeof payload.timing === 'number' && !Number.isNaN(payload.timing)
          ? payload.timing
          : typeof drawerMealTime === 'number' && !Number.isNaN(drawerMealTime)
            ? drawerMealTime
            : getCurrentTimeRoundedTo15Min();
      const logToUse = isSimulationMode ? (simulatedLog || []) : dailyLog;
      const ourSlot = getGhostMealType(payload.mealType || mealType, logToUse);
      const slotToReplace = editingMealId || ourSlot;
      const mealItems = payload.items.map((f, index) => ({
        ...f,
        type: f.type === 'recipe' ? 'recipe' : 'food',
        mealType: ourSlot,
        mealTime: timeToUse,
        id: f.id || `f_${Date.now()}_${index}`
      }));
      const foodsToRemove = getFoodItemsForMealSlot(logToUse, String(slotToReplace));
      const removeSet = new Set(foodsToRemove);
      const editingGhostMealId = editingMealId != null ? String(editingMealId) : '';
      const dailyLogRest = logToUse.filter((item) => {
        if (removeSet.has(item)) return false;
        if (
          editingGhostMealId &&
          item?.type === 'ghost_meal' &&
          item.id != null &&
          String(item.id) === editingGhostMealId
        ) {
          return false;
        }
        return true;
      });
      const nextLog = [...mealItems, ...dailyLogRest];
      if (isSimulationMode) {
        setSimulatedLog(nextLog);
        setEditingMealId(null);
        return;
      }
      if (mealItems.length >= 1) {
        try {
          if (mealItems.length >= 2) {
            recordMealFoodCooccurrence(mealItems, ourSlot);
          }
          recordMealSuggestionHabits(mealItems, ourSlot, foodDb || {});
          recordMealFoodUnitUsageFromItems(mealItems, foodDb || {}, findBestFoodMatch);
        } catch (_) {}
      }
      setDailyLog(nextLog);
      syncDatiFirebase(nextLog, manualNodes);
      setEditingMealId(null);
    }
  }, [dailyLog, simulatedLog, isSimulationMode, manualNodes, mealType, drawerMealTime, syncDatiFirebase, editingMealId, getFoodItemsForMealSlot, foodDb]);

  const startNodeDrag = useCallback((node, edge) => (e, activationOpts) => {
    e.stopPropagation();
    setTouchingNodeId(node.id);
    const target = e.currentTarget;
    const startX = Number.isFinite(activationOpts?.clientX0) ? activationOpts.clientX0 : e.clientX;
    const startY = Number.isFinite(activationOpts?.clientY0) ? activationOpts.clientY0 : e.clientY;

    longPressMoveCleanupRef.current?.();
    longPressMoveCleanupRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > NODE_DRAG_ARM_CANCEL_MOVE_PX) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        target.removeEventListener('pointermove', onMove, { passive: true });
        longPressMoveCleanupRef.current = null;
      }
    };
    const moveListenerOpts = { passive: true };
    target.addEventListener('pointermove', onMove, moveListenerOpts);
    longPressMoveCleanupRef.current = () => {
      target.removeEventListener('pointermove', onMove, moveListenerOpts);
      longPressMoveCleanupRef.current = null;
    };

    const innerDelayMs = activationOpts?.skipInnerLongPressDelay === true ? 0 : 180;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressMoveCleanupRef.current?.();
      longPressMoveCleanupRef.current = null;
      target.setPointerCapture(e.pointerId);
      dragOffsetYRef.current = 0;
      const mealSlotForDrag = String(node.mealId || node.id);
      const itemIds =
        node.type === 'meal'
          ? getFoodItemsForMealSlot(activeLog || [], mealSlotForDrag)
              .map((i) => i.id)
              .filter((id) => id != null)
          : [];
      setDraggingNode({
        id: node.id,
        type: node.type,
        itemIds,
        originalTime: node.time,
        originalDuration: node.duration,
        edge
      });
    }, innerDelayMs);
  }, [activeLog, manualNodes, dailyLog]);

  const releaseNodePointer = (e) => {
    setTouchingNodeId(null);
    longPressMoveCleanupRef.current?.();
    longPressMoveCleanupRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      return;
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const prev = historyStack[newIndex];
    if (!prev) return;
    setHistoryIndex(newIndex);
    setDailyLog(prev.dailyLog);
    setManualNodes(prev.manualNodes);
    syncDatiFirebase(prev.dailyLog, prev.manualNodes);
    setShowUndoToast(false);
  }, [historyIndex, historyStack, syncDatiFirebase]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= historyStack.length - 1) return;
    const newIndex = historyIndex + 1;
    const next = historyStack[newIndex];
    if (!next) return;
    setHistoryIndex(newIndex);
    setDailyLog(next.dailyLog);
    setManualNodes(next.manualNodes);
    syncDatiFirebase(next.dailyLog, next.manualNodes);
    setShowUndoToast(false);
  }, [historyIndex, historyStack, syncDatiFirebase]);

  const handleNodeTap = useCallback((node) => (event) => {
    if (Math.abs(dragOffsetYRef.current) >= 10) return;

    if (node.type === 'ghost_meal') {
      if (isSimulationMode) return;
      openGhostMealEditorFromTimelineNode(node);
      return;
    }

    if (node.type === 'ghost_workout') {
      const t = typeof node.time === 'number' && !Number.isNaN(node.time) ? node.time : 18;
      const title = String(node.title || 'Allenamento Pianificato').trim();
      setSelectedNodeReport({
        type: 'ghost_workout',
        id: node.id,
        time: t,
        title,
        name: title,
        desc: title,
        microDesc: String(node.microDesc || '').trim(),
        subType: 'pesi',
        kcal: 0,
        cal: 0,
        duration: 1,
        muscles: [],
        isGhost: true,
      });
      return;
    }

    if (isSimulationMode) return;

    if (node.type === 'meal') {
      if (isSimulationMode) return;
      const slotId = String(node.mealId || node.id);
      const foodsForSlot =
        Array.isArray(node.items) && node.items.length > 0
          ? node.items
          : mealFoodsRead(node).length > 0
            ? mealFoodsRead(node)
            : getFoodItemsForMealSlot(activeLog, slotId);
      if (foodsForSlot.length > 0) {
        const toN = (v) => (typeof v === 'number' && !Number.isNaN(v)) ? v : (Number(v) || 0);
        const kcal = foodsForSlot.reduce((a, f) => a + toN(f.kcal ?? f.cal), 0);
        const prot = foodsForSlot.reduce((a, f) => a + toN(f.prot ?? f.proteine), 0);
        const carb = foodsForSlot.reduce((a, f) => a + toN(f.carb ?? f.carboidrati), 0);
        const fat = foodsForSlot.reduce((a, f) => a + toN(f.fat ?? f.fatTotal ?? f.grassi), 0);
        const mType = foodsForSlot[0]?.mealType || String(node.id).split('_')[0];
        const slot = String(mType).split('_')[0] || 'snack';
        const baseName = MEAL_LABELS_SAVE?.[slot] || mType || 'Pasto';
        let timeLabel = '';
        if (typeof node.time === 'number') {
          const h = Math.floor(node.time).toString().padStart(2, '0');
          const m = Math.round((node.time % 1) * 60).toString().padStart(2, '0');
          timeLabel = ` (${h}:${m})`;
        }
        setSelectedMealCenter({
          id: slotId,
          name: `${baseName}${timeLabel}`,
          label: `${baseName}${timeLabel}`,
          value: kcal,
          kcal,
          prot,
          carb,
          fat,
          timeValue: node.time,
          color: '#00e5ff',
          fill: '#00e5ff',
          payload: { macros: { pro: prot, carb, fat } }
        });
        setSelectedNodeReport(null);
        loadMealToConstructor(slotId);
        return;
      }
      const slotBase = String(slotId).split('_')[0] || 'snack';
      setSelectedMealCenter({
        id: slotId,
        name: MEAL_LABELS_SAVE?.[slotBase] || slotBase || 'Pasto',
        label: MEAL_LABELS_SAVE?.[slotBase] || slotBase || 'Pasto',
        value: 0,
        kcal: 0,
        prot: 0,
        carb: 0,
        fat: 0,
        timeValue: node.time,
        color: '#00e5ff',
        fill: '#00e5ff',
        payload: { macros: { pro: 0, carb: 0, fat: 0 } }
      });
      setSelectedNodeReport(null);
      loadMealToConstructor(slotId);
      return;
    }

    if (
      node.type === 'nap' || node.name?.toLowerCase().includes('pisolino') ||
      node.type === 'meditation' || node.name?.toLowerCase().includes('meditazion')
    ) {
      setEditingQuickNode(node);
      return;
    }

    // Modifica rapida orario per energizzanti/caffè senza aprire il modale
    if (node.type === 'stimulant' || node.type === 'energizer' || node.isEnergizer) {
      const currentHH = Math.floor(node.time).toString().padStart(2, '0');
      const currentMM = Math.round((node.time % 1) * 60).toString().padStart(2, '0');
      const newTimeStr = window.prompt("Modifica rapida orario (HH:MM):", `${currentHH}:${currentMM}`);
      if (newTimeStr && newTimeStr.includes(':')) {
        const [h, m] = newTimeStr.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const newTimeFloat = h + (m / 60);
          const next = manualNodes.map(n => n.id === node.id ? { ...n, time: newTimeFloat, mealTime: newTimeFloat } : n);
          setManualNodes(next);
          syncDatiFirebase(dailyLog, next);
        }
      }
      return;
    }

    setSelectedNodeReport(node);
  }, [
    manualNodes,
    dailyLog,
    activeLog,
    syncDatiFirebase,
    setManualNodes,
    isSimulationMode,
    MEAL_LABELS_SAVE,
    getFoodItemsForMealSlot,
    decimalToTimeStr,
    setActiveAction,
    toCanonicalMealType,
    setSelectedNodeReport,
    openGhostMealEditorFromTimelineNode,
    loadMealToConstructor,
  ]);

  const onTimelineNodeClick = useCallback((node, event) => {
    handleNodeTap(node)(event);
  }, [handleNodeTap]);

  const handleSaveAlcohol = () => {
    if (isSimulationMode) return;
    if (!alcoholForm.timeStr || !alcoholForm.timeStr.includes(':')) return;
    const [h, m] = alcoholForm.timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const timeFloat = h + (m / 60);

    const ml = Number(alcoholForm.ml);
    const abv = Number(alcoholForm.abv);
    const pureAlcoholGrams = ml * (abv / 100) * 0.8;
    const kcal = pureAlcoholGrams * 7;

    const sub = String(alcoholForm.subtype || 'vino');
    const newNode = {
      id: `alcohol_${Date.now()}`,
      type: 'alcohol',
      subtype: sub,
      name: sub.charAt(0).toUpperCase() + sub.slice(1),
      time: timeFloat,
      ml,
      abv,
      pureAlcohol: pureAlcoholGrams,
      kcal: Math.round(kcal)
    };

    const next = [...manualNodes, newNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    setManualNodes(next);
    syncDatiFirebase(dailyLog, next);
    setShowAlcoholPopup(false);
  };

  const getAlcoholGlassIcon = (type) => (type === 'birra' ? '🍺' : type === 'vino' ? '🍷' : '🥃');
  const getAlcoholBaseMl = (type) => (type === 'birra' ? 330 : type === 'vino' ? 150 : 40);

  const handleAddWater = (amount) => {
    if (isSimulationMode) return;
    if (amount > 0) {
      const next = [...manualNodes, { id: `water_${Date.now()}`, type: 'water', time: drawerWaterTime, ml: amount }];
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    } else {
      const toRemove = amount === -250 ? 1 : 2;
      const waterNodes = manualNodes.filter(n => n.type === 'water');
      const idsToRemove = waterNodes.slice(-toRemove).map(n => n.id);
      const next = manualNodes.filter(n => !idsToRemove.includes(n.id));
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    }
  };

  const handleSaveFastCharge = (chargeType) => {
    if (isSimulationMode) return;
    const id = `${chargeType}_${Date.now()}`;
    let node = { id, type: chargeType };
    if (chargeType === 'nap' || chargeType === 'meditation') {
      let duration = Number(drawerFastChargeEnd) - Number(drawerFastChargeStart);
      if (duration < 0) duration += 24;
      duration = Math.max(0.08, Math.min(24, duration));
      node.time = Number(drawerFastChargeStart);
      node.duration = Math.round(duration * 100) / 100;
    } else if (chargeType === 'sunlight') {
      node.time = Number(drawerFastChargeTime);
    } else if (chargeType === 'supplements') {
      node.time = Number(drawerFastChargeTime);
      if (fastChargeSupplementName?.trim()) node.name = fastChargeSupplementName.trim();
      if (fastChargeSupplementName?.trim()) node.subtype = fastChargeSupplementName.trim();
    }
    const next = [...manualNodes, node].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    setManualNodes(next);
    syncDatiFirebase(dailyLog, next);
    setActiveAction(null);
    setFastChargeSupplementName('');
  };

  const handleSaveWorkout = () => {
    if (workoutActivityRequiresStrengthDetailNote(workoutType) && !String(workoutStrengthDetail).trim()) {
      window.alert('Compila «Dettaglio workout» per salvare questo tipo di attività.');
      return;
    }
    const def = getWorkoutActivityTypeDef(workoutType);
    const nodeKind = def?.nodeKind ?? 'workout';
    const isWork = nodeKind === 'work';
    const isCognitive = nodeKind === 'cognitive';
    const duration = workoutDurationHours;
    const startDec = workoutStartTime;
    const finalId = editingWorkoutId || (isWork ? 'work_' : isCognitive ? 'cognitive_' : 'workout_') + Date.now();

    const musclesCanon = normalizeMuscleGroupArray(workoutMuscles);
    const detailTrim = String(workoutStrengthDetail).trim();
    const baseDesc = getWorkoutActivityLogDescription(workoutType, musclesCanon);
    const desc =
      detailTrim && workoutActivityRequiresStrengthDetailNote(workoutType)
        ? `${baseDesc} — ${detailTrim}`
        : baseDesc;
    const cognitiveKcal = isCognitive ? Math.round(getCognitiveMetForActivity(workoutType) * 70 * duration) : workoutKcal;
    const iconNode = isCognitive ? (def?.icon || '📚') : isWork ? '💼' : def?.icon || '🏋️';
    const nodeData = {
      id: finalId,
      type: isCognitive ? 'cognitive' : isWork ? 'work' : 'workout',
      time: Number(startDec),
      duration,
      kcal: isCognitive ? cognitiveKcal : workoutKcal,
      icon: iconNode,
      subType: workoutType,
      muscles: musclesCanon,
      ...(detailTrim ? { workoutDetailNote: detailTrim } : {}),
    };
    const logData = {
      id: finalId,
      type: 'workout',
      workoutType,
      desc,
      name: isCognitive ? desc : isWork ? 'Lavoro' : desc,
      kcal: isCognitive ? cognitiveKcal : workoutKcal,
      cal: isCognitive ? cognitiveKcal : workoutKcal,
      duration,
      ...(detailTrim ? { workoutDetailNote: detailTrim } : {}),
    };

    if (isSimulationMode) {
      setSimulatedLog(prev => {
        const base = prev || [];
        return base.some(n => n.id === finalId) ? base.map(n => n.id === finalId ? logData : n) : [logData, ...base];
      });
      setEditingWorkoutId(null);
      setWorkoutMuscles([]);
      setWorkoutStrengthDetail('');
      closeDrawer();
      return;
    }
    const baseLog = dailyLog;
    const newLog = baseLog.some(n => n.id === finalId) ? baseLog.map(n => n.id === finalId ? logData : n) : [logData, ...baseLog];
    const newNodesRaw = manualNodes.some(n => n.id === finalId) ? manualNodes.map(n => n.id === finalId ? nodeData : n) : [...manualNodes, nodeData];
    const newNodes = newNodesRaw.filter((n) => n && n.type !== 'ghost_workout');
    setDailyLog(newLog);
    setManualNodes(newNodes);
    syncDatiFirebase(newLog, newNodes);

    setEditingWorkoutId(null);
    setWorkoutMuscles([]);
    setWorkoutStrengthDetail('');
    closeDrawer();
  };

  const processTestoAI = (testo) => {
    let trovati = 0;
    const batchId = Date.now();
    const nuoviAlimenti = [];
    const nuoviWorkout = [];
    const ghostTypesCache = {};

    const regexFood = /\[(.*?)\s*\|\s*([0-9.,]+)\s*\|\s*([^\|\]]+?)\]/gi;
    let matchFood;
    while ((matchFood = regexFood.exec(testo)) !== null) {
      trovati++;
      const nome = matchFood[1].trim();
      const qta = parseFloat(String(matchFood[2]).replace(',', '.')) || 0;
      const pastoString = String(matchFood[3]).trim().toLowerCase().replace(/\s+/g, ' ');
      const pastoStorage = normalizeAiMealTypeToStorageId(pastoString, getCurrentTimeRoundedTo15Min());
      if (!ghostTypesCache[pastoStorage]) {
        ghostTypesCache[pastoStorage] = getGhostMealType(pastoStorage, [...(dailyLog || []), ...nuoviAlimenti]);
      }
      const finalMealType = ghostTypesCache[pastoStorage];
      const item = estraiDatiFoodDb(nome, qta, finalMealType);
      nuoviAlimenti.push({
        ...item,
        id: `f_${batchId}_${trovati}`,
        mealTime: getDefaultMealTime(pastoStorage)
      });
      ghostTypesCache[pastoStorage] = getGhostMealType(pastoStorage, [...(dailyLog || []), ...nuoviAlimenti]);
    }

    const regexWorkout = /\[ALLENAMENTO:\s*([^|\]]+?)\s*\|\s*([0-9.,]+)\]/gi;
    let matchWorkout;
    while ((matchWorkout = regexWorkout.exec(testo)) !== null) {
      trovati++;
      const desc = matchWorkout[1].trim();
      const kcal = parseFloat(String(matchWorkout[2]).replace(',', '.')) || 0;
      nuoviWorkout.push({
        id: `w_${batchId}_${trovati}`,
        type: 'workout',
        desc,
        name: desc,
        kcal,
        cal: kcal,
        duration: Math.floor(kcal / 6) || 30
      });
    }

    if (trovati > 0) {
      const prev = isSimulationMode ? (simulatedLog || []) : dailyLog;
      const nextLog = [...nuoviAlimenti, ...nuoviWorkout, ...prev];
      if (isSimulationMode) {
        setSimulatedLog(nextLog);
        alert(`✅ Inseriti ${trovati} elementi (sandbox).`);
        return;
      }
      setDailyLog(nextLog);
      syncDatiFirebase(nextLog, manualNodes);
      alert(`✅ Inseriti ${trovati} elementi dal comando testuale!`);
    } else {
      alert("❌ Nessun comando compatibile trovato nel testo.");
    }
  };

  const removeLogItem = (id) => {
    if (isSimulationMode) {
      // Stessa chiave della logica reale: item.id (non idLog)
      setSimulatedLog(prev => (prev || []).filter(item => item.id !== id));
      return;
    }
    const newLog = dailyLog.filter(item => item.id !== id);
    const newNodes = manualNodes.filter(n => n.id !== id);
    setDailyLog(newLog);
    setManualNodes(newNodes);
    syncDatiFirebase(newLog, newNodes);
  };

  const handleMiniTimelineDrag = (
    e,
    containerRef,
    type,
    currentStart,
    currentEnd,
    setterStart,
    setterEnd,
    dragOpts = null,
  ) => {
    if (!containerRef?.current) return;
    e.preventDefault();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    target.setPointerCapture(pointerId);
    const fixedD =
      dragOpts && typeof dragOpts.fixedDurationHours === 'number' && dragOpts.fixedDurationHours > 0
        ? dragOpts.fixedDurationHours
        : null;

    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      const newTime = Math.round(percent * 24 * 4) / 4;
      if (type === 'point') {
        setterStart(newTime);
      } else if (type === 'bar-start') {
        setterStart(Math.min(newTime, currentEnd - 0.25));
      } else if (type === 'bar-end' && fixedD != null) {
        /* Durata fissa: l'inizio è derivato da fine − durata (anche con wrap 0–24h). Non vincolare la fine al vecchio inizio+durata, altrimenti non si può spostare la fine a un'ora precedente (es. log serale di una sessione pomeridiana). */
        setterEnd(Math.min(24, Math.max(0, newTime)));
      } else if (type === 'bar-end') {
        setterEnd(Math.max(newTime, currentStart + 0.25));
      } else if (type === 'bar-all' && fixedD != null) {
        const clampedStart = Math.min(24 - fixedD, newTime);
        setterEnd(clampedStart + fixedD);
      } else if (type === 'bar-all') {
        const duration = currentEnd - currentStart;
        const clampedStart = Math.min(24 - duration, newTime);
        setterStart(clampedStart);
        setterEnd(clampedStart + duration);
      }
    };

    const onUp = () => {
      try { target.releasePointerCapture(pointerId); } catch (_) {}
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  // --- CLUSTER AI GEMINI ---
  const handleAddKey = () => { setApiKeys([...apiKeys, '']); };
  const handleKeyChange = (index, value) => { 
    const newKeys = [...apiKeys]; 
    newKeys[index] = value; 
    setApiKeys(newKeys); 
  };
  const handleRemoveKey = (index) => { 
    const newKeys = apiKeys.filter((_, i) => i !== index); 
    if(newKeys.length === 0) newKeys.push(''); 
    setApiKeys(newKeys); 
  };
  const saveApiCluster = () => { 
    localStorage.setItem('ghost_api_cluster', JSON.stringify(apiKeys)); 
    setShowAiSettings(false); 
  };

  const callGeminiAPIWithRotation = async (promptText, options = null) => {
    const validKeys = apiKeys.filter(k => k.trim() !== '');
    if (validKeys.length === 0) throw new Error("Nessuna API Key configurata.");
    const useChat = options?.systemInstruction != null && Array.isArray(options?.contents);
    let partsArray = [];
    if (options?.images && Array.isArray(options.images)) {
      options.images.forEach(img => {
        const base64Data = (img || '').split(',')[1];
        const mimeType = ((img || '').split(';')[0] || '').split(':')[1] || 'image/jpeg';
        if (base64Data) partsArray.push({ inlineData: { mimeType, data: base64Data } });
      });
    }
    if (options?.image) {
      const base64Data = options.image.split(',')[1];
      const mimeType = (options.image.split(';')[0] || '').split(':')[1] || 'image/jpeg';
      if (base64Data) partsArray.push({ inlineData: { mimeType, data: base64Data } });
    }
    partsArray.push({ text: promptText });
    const body = useChat
      ? {
          systemInstruction: { parts: [{ text: options.systemInstruction }] },
          contents: [...(options.contents || []), { role: 'user', parts: partsArray }],
          generationConfig: { temperature: 0.3 }
        }
      : {
          contents: [{ role: 'user', parts: partsArray }],
          generationConfig: { temperature: 0.1 }
        };
    let attempt = 0;
    while (attempt < validKeys.length) {
      const currentIndex = (activeKeyIndex + attempt) % validKeys.length;
      const currentKey = validKeys[currentIndex];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${currentKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          if (response.status === 429) {
            attempt++;
            continue;
          }
          throw new Error(`Errore Server: ${response.status}`);
        }
        const data = await response.json();
        if (attempt > 0) setActiveKeyIndex(currentIndex);
        const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generatedText == null) {
          console.warn('Gemini API response missing text payload', { data });
        }
        return generatedText;
      } catch (e) {
        if (attempt === validKeys.length - 1) throw e;
        attempt++;
      }
    }
    throw new Error("Cluster API esaurito.");
  };

  const generateFoodWithAI = useCallback(async (foodName) => {
    const name = (foodName || foodNameInput || '').trim();
    if (!name) return;
    if (!userUid) {
      alert('Effettua il login per salvare nuovi alimenti.');
      return;
    }
    setIsGeneratingFood(true);
    try {
      const prompt = `Restituisci SOLO un JSON valido, senza altro testo, con i valori nutrizionali per 100g dell'alimento "${name}".
Chiavi obbligatorie (numeri): desc (stringa con il nome), kcal, prot, carb, fatTotal, fibre.
Aggiungi se possibile: leu, iso, val, lys, vitA, vitc, vitD, ca, fe, mg, zn, omega3 (tutti in mg o µg come standard RDA).
Esempio: {"desc":"${name}","kcal":120,"prot":25,"carb":0,"fatTotal":2,"fibre":0}`;
      const raw = await callGeminiAPIWithRotation(prompt);
      let jsonStr = raw.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      const data = JSON.parse(jsonStr);
      const desc = data.desc || name;
      const entryPer100 = { desc };
      ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre', 'leu', 'iso', 'val', 'lys', 'vitA', 'vitc', 'vitD', 'ca', 'fe', 'mg', 'zn', 'omega3'].forEach((k) => {
        if (typeof data[k] === 'number' && data[k] > 0) entryPer100[k] = data[k];
      });
      Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
        if (entryPer100[k] == null || entryPer100[k] === 0) entryPer100[k] = getAverageEstimate(k, desc);
      }));
      if (entryPer100.kcal == null || entryPer100.kcal === 0) entryPer100.kcal = entryPer100.cal ?? getAverageEstimate('kcal', desc);
      entryPer100.cal = entryPer100.cal ?? entryPer100.kcal;
      const newKey = `food_${Date.now()}_${String(desc).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 30)}`;
      const basePath = `users/${userUid}/tracker_data`;
      const entrySaved = enrichDbRowWithFoodUnits(entryPer100, newKey);
      await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), entrySaved);
      setFoodDb((prev) => ({ ...prev, [newKey]: entrySaved }));
      const weight = parseFloat(foodWeightInput) || 100;
      const ratio = weight / 100;
      const newItem = {
        id: Date.now() + Math.random(),
        type: 'food',
        mealType,
        desc,
        qta: weight,
        weight
      };
      Object.keys(entrySaved).forEach((k) => {
        if (typeof entrySaved[k] === 'number' && k !== 'id') newItem[k] = entrySaved[k] * ratio;
      });
      newItem.units = entrySaved.units;
      newItem.defaultUnit = entrySaved.defaultUnit;
      newItem.category = entrySaved.category;
      newItem.foodDbKey = newKey;
      Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
        if (newItem[k] == null || newItem[k] === 0) newItem[k] = (getAverageEstimate(k, desc) / 100) * weight;
      }));
      newItem.kcal = newItem.kcal ?? newItem.cal ?? (getAverageEstimate('kcal', desc) / 100) * weight;
      newItem.cal = newItem.cal ?? newItem.kcal;
      setAddedFoods((prev) => [...prev, newItem]);
      setFoodNameInput('');
      setFoodWeightInput('');
      setShowFoodDropdown(false);
    } catch (e) {
      alert(`Generazione alimento fallita: ${e.message}`);
    } finally {
      setIsGeneratingFood(false);
    }
  }, [userUid, mealType, foodNameInput, foodWeightInput, callGeminiAPIWithRotation, getAverageEstimate, db, setFoodDb, setAddedFoods, setFoodNameInput, setFoodWeightInput, setShowFoodDropdown]);

  const triggerCreaSearch = useCallback(async (query, opts = {}) => {
    const q = String(query || '').trim();
    if (!q) return;

    const onlyUsda = opts.onlyUsda === true;
    if (onlyUsda) {
      if (lastCreaQueryRef.current !== q || !Array.isArray(lastCreaNormalizedRef.current)) {
        return;
      }
      if (usdaFusionDoneForQueryRef.current === q) return;
      creaUsdaAbortRef.current?.abort();
      const ac = new AbortController();
      creaUsdaAbortRef.current = ac;
      try {
        const merged = await fuseUsdaIntoCrea(lastCreaNormalizedRef.current, q, {
          signal: ac.signal,
          minQueryLengthForUsda: 3,
        });
        if (!ac.signal.aborted) {
          setCreaResults(merged);
          usdaFusionDoneForQueryRef.current = q;
        }
      } catch {
        /* CREA invariata */
      }
      return;
    }

    creaUsdaAbortRef.current?.abort();
    const ac = new AbortController();
    creaUsdaAbortRef.current = ac;
    usdaFusionDoneForQueryRef.current = '';
    lastCreaQueryRef.current = q;

    setShowFoodDropdown(true);
    setCreaResults([]);
    setIsCreaLoading(true);
    try {
      if (csvFoodDbLoading) {
        setCreaResults([]);
        return;
      }

      const { creaNormalized, uiItems } = getCreaFusionPayload(csvFoodDb, q, {
        includeUserHistory: false,
        creaLimit: 50,
      });
      lastCreaNormalizedRef.current = creaNormalized;
      setCreaResults(uiItems);
      setShowFoodDropdown(true);
      setIsCreaLoading(false);

      const loadUsda = opts.loadUsda !== false && q.length >= 3;
      if (!loadUsda) return;

      try {
        const merged = await fuseUsdaIntoCrea(creaNormalized, q, {
          signal: ac.signal,
          minQueryLengthForUsda: 3,
        });
        if (!ac.signal.aborted) {
          setCreaResults(merged);
          usdaFusionDoneForQueryRef.current = q;
        }
      } catch {
        /* USDA opzionale: lista CREA già mostrata */
      }
    } catch (err) {
      console.error('CREA search failed', err);
      setCreaResults([]);
    } finally {
      setIsCreaLoading(false);
    }
  }, [csvFoodDb, csvFoodDbLoading, setShowFoodDropdown]);

  const handleVerifyFoodAI = async () => {
    if (!editFoodData || !(editFoodData.name || editFoodData.nome || editFoodData.desc)) return;
    setIsAIVerifying(true);
    try {
      const prompt = `Agisci come un nutrizionista esperto. Verifica i seguenti valori nutrizionali per l'alimento "${editFoodData.name || editFoodData.nome || editFoodData.desc}" (Quantità: ${editFoodData.qty ?? editFoodData.weight ?? 100}g/ml).
Valori attuali: Calorie: ${editFoodData.kcal ?? editFoodData.cal ?? 0}, Proteine: ${editFoodData.prot ?? editFoodData.proteine ?? 0}g, Carboidrati: ${editFoodData.carb ?? editFoodData.carboidrati ?? 0}g, Grassi: ${editFoodData.fat ?? editFoodData.fatTotal ?? 0}g, Fibre: ${editFoodData.fibre ?? 0}g.
Controlla se i macro sono coerenti con le calorie (ricorda: 1g prot=4kcal, 1g carb=4kcal, 1g fat=9kcal). Se ci sono errori palesi o i valori sono implausibili per questa quantità, correggili con i valori medi reali.
RISPONDI SOLO CON UN OGGETTO JSON VALIDO, senza markdown, con queste esatte chiavi: {"kcal": numero, "prot": numero, "carb": numero, "fat": numero, "fibre": numero}`;
      const aiResponseText = await callGeminiAPIWithRotation(prompt);
      const cleanJsonStr = (aiResponseText || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const correctedValues = JSON.parse(cleanJsonStr);
      setEditFoodData(prev => ({
        ...prev,
        kcal: typeof correctedValues.kcal === 'number' ? correctedValues.kcal : (prev.kcal ?? prev.calorie ?? prev.cal),
        prot: typeof correctedValues.prot === 'number' ? correctedValues.prot : (prev.prot ?? prev.proteine),
        carb: typeof correctedValues.carb === 'number' ? correctedValues.carb : (prev.carb ?? prev.carboidrati),
        fat: typeof correctedValues.fat === 'number' ? correctedValues.fat : (prev.fat ?? prev.fatTotal ?? prev.grassi),
        fibre: typeof correctedValues.fibre === 'number' ? correctedValues.fibre : (prev.fibre ?? 0)
      }));
      alert('Valori verificati e aggiornati dall\'AI. Controllali e premi "Salva Modifiche".');
    } catch (error) {
      console.error("Errore verifica AI:", error);
      alert("Impossibile verificare con l'AI in questo momento.");
    } finally {
      setIsAIVerifying(false);
    }
  };

  const bodyBattery = useMemo(
    () => calculateBodyBattery(fullHistory, currentTrackerDate, activeLog, userTargets),
    [fullHistory, currentTrackerDate, activeLog, userTargets]
  );

  const {
    activeTrigger: kentuActiveTrigger,
    chatNotificationBadge: kentuChatNotificationBadge,
    dismissKentuSleepTrigger,
    dismissKentuAgendaTrigger,
    dismissKentuActiveTrigger,
  } = useSmartKentuTriggers(activeLog, currentTrackerDate, fullHistory, userTargets, bodyBattery?.maxCapacity ?? 100);

  const handleAutoLogDinner = useCallback(
    (mealData) => {
      if (!mealData || typeof mealData !== 'object') return;
      const defaultStr = decimalToTimeStr(getCurrentTimeRoundedTo15Min());
      const raw = typeof window !== 'undefined' ? window.prompt('Orario del pasto (HH:MM)', defaultStr) : null;
      if (raw === null) return;
      const mealTime = parseTimeStrToDecimal(raw);
      const t = typeof mealTime === 'number' && !Number.isNaN(mealTime) ? mealTime : getCurrentTimeRoundedTo15Min();
      const ghostType = getGhostMealType('cena', dailyLog || []);
      const label = String(mealData.label || mealData.description || 'Cena').trim() || 'Cena';
      const kcal = Math.max(0, Math.round(Number(mealData.kcal) || 0));
      const prot = Math.max(0, Math.round((Number(mealData.prot) || 0) * 10) / 10);
      const carb = Math.max(0, Math.round((Number(mealData.carb) || 0) * 10) / 10);
      const fat = Math.max(0, Math.round((Number(mealData.fat ?? mealData.fatTotal) || 0) * 10) / 10);
      const newItem = {
        id: `kentu_dinner_${Date.now()}`,
        type: 'food',
        mealType: ghostType,
        mealTime: t,
        desc: label,
        name: label,
        qta: 100,
        weight: 100,
        kcal,
        cal: kcal,
        prot,
        carb,
        fatTotal: fat,
        fat,
      };
      Object.keys(TARGETS).forEach((g) => {
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (newItem[k] == null || newItem[k] === 0) {
            newItem[k] = getDefaultNutrientValue(k, fullHistory);
          }
        });
      });
      if (isSimulationMode) {
        setSimulatedLog((prev) => [...(prev || []), newItem]);
        setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Cena salvata nel diario! (sandbox)' }]);
        return;
      }
      const nuovoLog = [newItem, ...(dailyLog || [])];
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes);
      const uid = auth.currentUser?.uid;
      const dateStr = currentTrackerDate || getTodayString();
      if (uid && db) {
        push(ref(db, `users/${uid}/history/${dateStr}/meals`), {
          label,
          kcal,
          prot,
          carb,
          fat,
          mealTime: t,
          source: 'kentu_dinner',
          loggedAt: Date.now(),
        }).catch(() => {});
      }
      setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Cena salvata nel diario!' }]);
    },
    [
      dailyLog,
      manualNodes,
      syncDatiFirebase,
      isSimulationMode,
      fullHistory,
      currentTrackerDate,
      auth,
      db,
    ]
  );

  const handleAutoLogAgenda = useCallback(
    (agendaOptions) => {
      if (!Array.isArray(agendaOptions) || agendaOptions.length === 0) return;
      const dateStr = currentTrackerDate || getTodayString();
      const uid = auth.currentUser?.uid;
      const n = agendaOptions.length;
      const newItems = agendaOptions.map((opt, idx) => {
        const name = String(opt?.name || opt?.label || 'Attività').trim() || 'Attività';
        const durMin = Math.max(15, Math.round(Number(opt?.duration) || 60));
        const kcal = Math.max(0, Math.round(Number(opt?.kcal) || 0));
        const durationH = Math.max(0.25, durMin / 60);
        const spreadT = n <= 1 ? 12 : 8 + (idx / Math.max(1, n - 1)) * 10;
        const mealTime = Math.min(22.75, Math.round(spreadT * 4) / 4);
        return {
          id: `kentu_agenda_${Date.now()}_${idx}`,
          type: 'workout',
          workoutType: 'misto',
          desc: name.toUpperCase(),
          name,
          kcal,
          cal: kcal,
          duration: durationH,
          mealTime,
          time: mealTime,
        };
      });
      if (isSimulationMode) {
        setSimulatedLog((prev) => [...newItems, ...(prev || [])]);
        dismissKentuAgendaTrigger();
        lastAgendaOptionsRef.current = null;
        setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Attività caricate nella timeline! (sandbox)' }]);
        return;
      }
      const nuovoLog = [...newItems, ...(dailyLog || [])];
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes);
      if (uid && db) {
        newItems.forEach((item) => {
          push(ref(db, `users/${uid}/history/${dateStr}/activities`), {
            name: item.name,
            durationMin: Math.round(Math.max(15, (item.duration || 0.25) * 60)),
            kcal: item.kcal,
            mealTime: item.mealTime,
            source: 'kentu_agenda',
            loggedAt: Date.now(),
          }).catch(() => {});
        });
      }
      dismissKentuAgendaTrigger();
      lastAgendaOptionsRef.current = null;
      setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Attività caricate nella timeline!' }]);
    },
    [
      dailyLog,
      manualNodes,
      syncDatiFirebase,
      isSimulationMode,
      currentTrackerDate,
      auth,
      db,
      dismissKentuAgendaTrigger,
    ]
  );

  const applyKentuChatCmd = useCallback((cmd) => {
    if (!cmd || typeof cmd !== 'object') return;
    if (cmd.target != null) {
      const t = normalizeCalorieStrategyTarget(cmd.target);
      setKentuDailyCalorieStrategy(t);
      try {
        const d = currentTrackerDateRef.current || getTodayString();
        localStorage.setItem(`kentu_cal_strategy_${d}`, t);
      } catch (_) {
        /* noop */
      }
    }
    const anchorW = currentTrackerDateRef.current || getTodayString();
    if (Object.prototype.hasOwnProperty.call(cmd, 'workoutTime')) {
      const wt = cmd.workoutTime;
      if (wt != null && String(wt).trim() && String(wt).toLowerCase() !== 'null') {
        const dec = parseFlexibleTimeToDecimal(String(wt).trim());
        if (dec != null && anchorW === getTodayString()) {
          scheduledWorkoutContextRef.current = {
            workoutDecimalHour: dec,
            label: 'Allenamento (Kentu)',
            dateStr: anchorW,
          };
        }
      } else {
        scheduledWorkoutContextRef.current = null;
      }
    }
  }, []);

  const handleChatSubmit = async (optionalReply, sendMeta) => {
    const meta = sendMeta && typeof sendMeta === 'object' ? sendMeta : null;
    const trimQuick = optionalReply != null ? String(optionalReply).trim() : '';

    const flushWorkoutLogFromChat = (decimalHour, displayDesc, activity) => {
      const t = Math.round(Math.min(23.75, Math.max(0, Number(decimalHour))) * 100) / 100;
      const label = (String(displayDesc || 'Allenamento').trim() || 'Allenamento');
      const upper = label.toUpperCase();
      const kcal = activity === 'cardio' ? 350 : 280;
      const duration = activity === 'cardio' ? 0.75 : 1;
      const newItem = {
        id: `wk_chat_${Date.now()}`,
        type: 'workout',
        workoutType: activity === 'cardio' ? 'cardio' : 'pesi',
        desc: upper,
        name: label,
        kcal,
        cal: kcal,
        duration,
        mealTime: t,
        time: t,
      };
      const anchor = currentTrackerDate || getTodayString();
      const yStatus = getYesterdayCalorieStatus(fullHistory, userTargets, anchor);
      const coach = buildPostWorkoutCoachMessage(yStatus, activity, label);
      const nowDec = new Date().getHours() + new Date().getMinutes() / 60;
      if (anchor === getTodayString() && t > nowDec + 0.2) {
        scheduledWorkoutContextRef.current = { workoutDecimalHour: t, label, dateStr: anchor };
      } else if (anchor === getTodayString()) {
        scheduledWorkoutContextRef.current = null;
      }
      if (isSimulationMode) {
        setSimulatedLog((prev) => [newItem, ...(prev || [])]);
        setChatHistory((prev) => [...prev, { sender: 'ai', text: `Registrato (sandbox) alle ${formatDecimalHourIt(t)}. ${coach}` }]);
        return;
      }
      const nuovoLog = [newItem, ...(dailyLog || [])];
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes);
      setChatHistory((prev) => [...prev, { sender: 'ai', text: `Allenamento salvato alle ${formatDecimalHourIt(t)}. ${coach}` }]);
    };

    if (meta?.fromQuickReply && meta?.workoutTimeReply && pendingWorkoutFlowRef.current?.kind === 'await_confirm') {
      const p = pendingWorkoutFlowRef.current;
      pendingWorkoutFlowRef.current = null;
      const userText = trimQuick || 'Ok';
      if (meta.workoutTimeReply === 'accept') {
        setChatHistory((prev) => {
          const stripped = prev.map((m) =>
            m.workoutTimeConfirm && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m
          );
          return [...stripped, { sender: 'user', text: userText }];
        });
        flushWorkoutLogFromChat(p.suggestedDecimal, p.displayLabel, p.activity);
      } else {
        pendingWorkoutFlowRef.current = {
          kind: 'await_custom_time',
          displayLabel: p.displayLabel,
          activity: p.activity,
          searchKeys: p.searchKeys || [],
        };
        setChatHistory((prev) => {
          const stripped = prev.map((m) =>
            m.workoutTimeConfirm && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m
          );
          return [
            ...stripped,
            { sender: 'user', text: userText },
            { sender: 'ai', text: 'Ok. A che ora lo programmiamo oggi? (es. 19:30 o 19,45)' },
          ];
        });
      }
      if (optionalReply == null) setChatInput('');
      return;
    }

    if (meta?.morningBriefingReply && meta?.fromQuickReply) {
      const { status, activity } = meta.morningBriefingReply;
      if (
        (status === 'deficit' || status === 'surplus') &&
        (activity === 'weights' || activity === 'cardio' || activity === 'rest')
      ) {
        const verdict = getMorningBriefingVerdict(status, activity);
        const userText = trimQuick;
        setChatHistory((prev) => {
          const stripped = prev.map((m) =>
            m.morningBriefing && Array.isArray(m.quickReplies)
              ? { ...m, quickReplies: undefined }
              : m
          );
          return [...stripped, { sender: 'user', text: userText }, { sender: 'ai', text: verdict }];
        });
        if (optionalReply == null) setChatInput('');
        return;
      }
    }

    if (meta?.fromQuickReply && meta?.eveningBriefingReply) {
      const { action, missingKcal, missingPro } = meta.eveningBriefingReply;
      const userText = trimQuick || '';
      const dateEv = currentTrackerDate || getTodayString();
      markEveningBriefingShown(dateEv);
      if (action === 'no') {
        setChatHistory((prev) => {
          const stripped = prev.map((m) =>
            m.eveningBriefing && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m
          );
          return [...stripped, { sender: 'user', text: userText }, { sender: 'ai', text: 'Perfetto, buona serata! 🌙' }];
        });
        if (optionalReply == null) setChatInput('');
        return;
      }
      if (action === 'yes') {
        const mk = Math.max(0, Math.round(Number(missingKcal) || 0));
        const mp = Math.max(0, Math.round(Number(missingPro) || 0));
        const secretPrompt = `L'utente vuole un consiglio per la cena. Deve rientrare in ${mk} kcal e contenere circa ${mp}g di proteine. Fornisci un'unica ricetta bilanciata e semplice, e alla fine chiedi 'Vuoi che la registri nel diario?'`;
        setChatHistory((prev) =>
          prev.map((m) => (m.eveningBriefing && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m))
        );
        if (optionalReply == null) setChatInput('');
        await handleChatSubmit(null, {
          secretPrompt,
          displayText: userText || '🍽️ Sì, proponi la cena perfetta',
        });
        return;
      }
    }

    if (trimQuick === 'Ho dormito 7h bene' || trimQuick === 'Ho dormito male') {
      dismissKentuSleepTrigger();
      const hours = trimQuick === 'Ho dormito 7h bene' ? 7 : 5.5;
      const quality = trimQuick === 'Ho dormito 7h bene' ? 'buona' : 'scarsa';
      const wakeTime = 7.5;
      let bedtime = wakeTime - hours;
      if (bedtime < 0) bedtime += 24;
      const sleepEntry = {
        type: 'sleep',
        id: `sleep_smart_${Date.now()}`,
        wakeTime,
        bedtime,
        sleepStart: bedtime,
        sleepEnd: wakeTime,
        hours,
        duration: hours,
        sleepHours: hours,
        deepMin: 45,
        remMin: 90,
        hr: 58,
        quality,
      };
      if (isSimulationMode) {
        setSimulatedLog((prev) => [...(prev || []), sleepEntry]);
        setChatHistory((prev) => [...prev, { sender: 'user', text: trimQuick }, { sender: 'ai', text: 'Registrato una stima del sonno (sandbox). Dal diario puoi rifinire i valori.' }]);
        return;
      }
      const nuovoLog = [...(dailyLog || []), sleepEntry];
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes);
      setChatHistory((prev) => [...prev, { sender: 'user', text: trimQuick }, { sender: 'ai', text: 'Perfetto, ho salvato una stima del sonno. Puoi correggere i dettagli dal diario se serve.' }]);
      return;
    }

    const secretPrompt = meta?.secretPrompt != null && String(meta.secretPrompt).trim() ? String(meta.secretPrompt).trim() : '';
    const displayOverride = meta?.displayText != null && String(meta.displayText).trim() ? String(meta.displayText).trim() : '';

    let userMessage;
    let apiUserContent;

    if (secretPrompt) {
      userMessage = displayOverride || 'Richiesta assistente';
      apiUserContent = secretPrompt;
    } else if (kentuAgendaAwaitingRef.current) {
      const agendaText =
        optionalReply != null && String(optionalReply).trim()
          ? String(optionalReply).trim()
          : chatInput.trim();
      if (agendaText) {
        userMessage = agendaText;
        const anchorAg = currentTrackerDate || getTodayString();
        const actCtx = buildRecentActivitiesContext(fullHistory, anchorAg);
        const mealCtx = buildRecentMealsContextForDinner(fullHistory, anchorAg);
        apiUserContent = buildKentuAgendaSecretPrompt(agendaText, actCtx, mealCtx);
        kentuAgendaAwaitingRef.current = false;
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(`kentu_agenda_secret_sent_${anchorAg}`, '1');
        }
      } else {
        userMessage = '';
        apiUserContent = '';
      }
    } else {
      userMessage = optionalReply != null && String(optionalReply).trim() ? String(optionalReply).trim() : chatInput.trim();
      apiUserContent = userMessage;
    }

    const NUTR_CHECK_TRIGGER = '⚖️ Check Oggi';
    const NUTR_CHECK_TRIGGER_LEGACY = '⚖️ Check Alimentare';
    const userTrim = String(userMessage || '').trim();
    if (!secretPrompt && (userTrim === NUTR_CHECK_TRIGGER || userTrim === NUTR_CHECK_TRIGGER_LEGACY)) {
      const auditLog = activeLog || [];
      const auditText = generateLocalNutritionalAudit(auditLog, userTargets);
      const userLine = userTrim === NUTR_CHECK_TRIGGER_LEGACY ? NUTR_CHECK_TRIGGER_LEGACY : NUTR_CHECK_TRIGGER;
      setChatHistory((prev) => [...prev, { sender: 'user', text: userLine }]);
      if (optionalReply == null) setChatInput('');
      window.setTimeout(() => {
        setChatHistory((prev) => [...prev, { sender: 'ai', text: auditText }]);
      }, 300);
      return;
    }

    const TRAINING_LOCAL_TRIGGER = '🏃‍♂️ Posso allenarmi?';
    if (!secretPrompt && String(userMessage || '').trim() === TRAINING_LOCAL_TRIGGER) {
      const advice = generateLocalTrainingAdvice(trainingWaveResult);
      setChatHistory((prev) => [...prev, { sender: 'user', text: TRAINING_LOCAL_TRIGGER }]);
      if (optionalReply == null) setChatInput('');
      window.setTimeout(() => {
        setChatHistory((prev) => [...prev, { sender: 'ai', text: advice }]);
      }, 300);
      return;
    }

    const MONTHLY_AUDIT_TRIGGER = '📅 Report Mese';
    const MONTHLY_AUDIT_TRIGGER_LEGACY = '📅 Report Mensile';
    if (!secretPrompt && (userTrim === MONTHLY_AUDIT_TRIGGER || userTrim === MONTHLY_AUDIT_TRIGGER_LEGACY)) {
      const reportText = generateLocalMonthlyAudit(fullHistory, userTargets, bodyMetricsHistory);
      const userLine = userTrim === MONTHLY_AUDIT_TRIGGER_LEGACY ? MONTHLY_AUDIT_TRIGGER_LEGACY : MONTHLY_AUDIT_TRIGGER;
      setChatHistory((prev) => [...prev, { sender: 'user', text: userLine }]);
      if (optionalReply == null) setChatInput('');
      window.setTimeout(() => {
        setChatHistory((prev) => [...prev, { sender: 'ai', text: reportText }]);
      }, 300);
      return;
    }

    const METABOLIC_SCAN_TRIGGER = '🧬 Scanner Metabolico';
    const HABIT_SCAN_TRIGGER_LEGACY = '🔍 Analisi Abitudini';
    if (!secretPrompt && (userTrim === METABOLIC_SCAN_TRIGGER || userTrim === HABIT_SCAN_TRIGGER_LEGACY)) {
      const habitText = generateLocalHabitScanner(fullHistory);
      const userLine = userTrim === HABIT_SCAN_TRIGGER_LEGACY ? HABIT_SCAN_TRIGGER_LEGACY : METABOLIC_SCAN_TRIGGER;
      setChatHistory((prev) => [...prev, { sender: 'user', text: userLine }]);
      if (optionalReply == null) setChatInput('');
      window.setTimeout(() => {
        setChatHistory((prev) => [...prev, { sender: 'ai', text: habitText }]);
      }, 400);
      return;
    }

    if (pendingHabit && userMessage && !secretPrompt) {
      const userTextLower = userMessage.trim().toLowerCase();
      const isHabitYes =
        userTextLower === 'si' ||
        userTextLower === 'sì' ||
        userTextLower === 'confermo' ||
        userTextLower === 'ok' ||
        userTextLower === 'va bene';
      const isHabitNo =
        userTextLower === 'no' ||
        userTextLower.includes('cambia') ||
        userTextLower.includes('annulla');
      if (isHabitYes) {
        const ph = pendingHabit;
        setPendingHabit(null);
        commitAddFoodChatPayload(ph);
        const summary = (ph.items || [])
          .map((it) => `${it.qty}g di ${it.name}`)
          .join(', ');
        setChatHistory((prev) => [
          ...prev,
          { sender: 'user', text: userMessage },
          { sender: 'ai', text: `Perfetto! Ho registrato ${summary || 'il pasto'}. 🥗` },
        ]);
        if (optionalReply == null) setChatInput('');
        return;
      }
      if (isHabitNo) {
        setPendingHabit(null);
        setChatHistory((prev) => [
          ...prev,
          { sender: 'user', text: userMessage },
          {
            sender: 'ai',
            text: 'Nessun problema. Quanti grammi e quale alimento esattamente?',
          },
        ]);
        if (optionalReply == null) setChatInput('');
        return;
      }
      setPendingHabit(null);
    }

    if (!secretPrompt && pendingWorkoutFlowRef.current?.kind === 'await_custom_time' && userMessage) {
      const parsedT = parseFlexibleTimeToDecimal(userMessage);
      if (parsedT == null) {
        setChatHistory((prev) => [
          ...prev,
          { sender: 'user', text: userMessage },
          { sender: 'ai', text: 'Non ho capito l\'orario. Prova con il formato 19:30 o 19,45.' },
        ]);
        if (optionalReply == null) setChatInput('');
        return;
      }
      const p = pendingWorkoutFlowRef.current;
      pendingWorkoutFlowRef.current = null;
      setChatHistory((prev) => [...prev, { sender: 'user', text: userMessage }]);
      flushWorkoutLogFromChat(parsedT, p.displayLabel, p.activity);
      if (optionalReply == null) setChatInput('');
      return;
    }

    if (!apiUserContent && chatImages.length === 0) return;

    const logPastoKw = /\b(logga\s+pasto|salva(?:\s+la)?\s+cena|registra(?:\s+la)?\s+cena)\b/i;
    if (!secretPrompt && logPastoKw.test(userMessage) && Array.isArray(lastDinnerOptionsRef.current) && lastDinnerOptionsRef.current.length) {
      const low = userMessage.toLowerCase();
      let idx = 0;
      const n = userMessage.match(/(?:opzione|scelta|#)\s*([1-3])\b/);
      if (n) idx = Math.min(2, Math.max(0, parseInt(n[1], 10) - 1));
      else if (/\bseconda\b|\b2\b/.test(low)) idx = 1;
      else if (/\bterza\b|\b3\b/.test(low)) idx = 2;
      else if (/\bprima\b|\buno\b/.test(low)) idx = 0;
      const opts = lastDinnerOptionsRef.current;
      const chosen = opts[idx];
      if (chosen) {
        setChatHistory((prev) => [...prev, { sender: 'user', text: userMessage }]);
        if (optionalReply == null) setChatInput('');
        handleAutoLogDinner(chosen);
        return;
      }
    }

    if (pendingAiBatch && userMessage) {
      const lowerMsg = userMessage.toLowerCase();
      const isConfirm = lowerMsg.includes('conferm') || lowerMsg.includes('sì') || lowerMsg.includes('si ');
      const isCancel = lowerMsg.includes('annulla') || lowerMsg.includes('no');

      if (pendingAiBatch.type === 'sleep' && isConfirm && pendingAiBatch.data) {
        const d = pendingAiBatch.data;
        const bed = Number(d.bedtime ?? d.sleepStart);
        const wake = Number(d.wakeTime ?? d.sleepEnd);
        let hoursVal = Number(d.hours ?? d.duration ?? d.sleepHours);
        if (!Number.isFinite(hoursVal) || hoursVal <= 0) {
          hoursVal = computeSleepDurationHours(bed, wake);
        }
        if (!Number.isFinite(hoursVal) || hoursVal <= 0) hoursVal = 7;
        const sleepEntry = {
          type: 'sleep',
          id: `sleep_${Date.now()}`,
          wakeTime: Number.isFinite(wake) ? wake : 7.5,
          bedtime: Number.isFinite(bed) ? bed : undefined,
          sleepStart: Number.isFinite(bed) ? bed : undefined,
          sleepEnd: Number.isFinite(wake) ? wake : undefined,
          hours: hoursVal,
          duration: hoursVal,
          sleepHours: hoursVal,
          deepMin: d.deepMin,
          remMin: d.remMin,
          hr: d.hr,
        };
        if (isSimulationMode) {
          setSimulatedLog(prev => [...(prev || []), sleepEntry]);
          setPendingAiBatch(null);
          dismissKentuSleepTrigger();
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Ho registrato i dati del sonno (sandbox).' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        const nuovoLog = [...(dailyLog || []), sleepEntry];
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes);
        setPendingAiBatch(null);
        dismissKentuSleepTrigger();
        setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Ho registrato i dati del sonno nel diario. La curva del cortisolo terrà conto dell\'ora di risveglio.' }]);
        if (optionalReply == null) setChatInput('');
        return;
      }
      if (pendingAiBatch.type === 'sleep' && isCancel) {
        setPendingAiBatch(null);
        setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Operazione annullata. Cosa vuoi fare ora?' }]);
        if (optionalReply == null) setChatInput('');
        return;
      }

      if (Array.isArray(pendingAiBatch) && isConfirm) {
        const baseMealTime = getCurrentTimeRoundedTo15Min();
        const predictedType = predictMealType(baseMealTime);
        const sharedMealTime = typeof pendingAiBatch[0]?.mealTime === 'number' ? pendingAiBatch[0].mealTime : baseMealTime;
        const rawMt0 = pendingAiBatch[0]?.mealType;
        const dominantMealType =
          rawMt0 != null && String(rawMt0).trim() !== ''
            ? normalizeAiMealTypeToStorageId(rawMt0, sharedMealTime)
            : predictedType;
        const batchGhostType = getGhostMealType(dominantMealType, dailyLog || []);
        const batchId = `batch_${Date.now()}`;
        const alimentiProcessati = pendingAiBatch
          .map((item, index) => {
            const desc = item.desc || item.name || '';
            if (!desc) return null;
            const qta = Math.max(1, parseFloat(item.weight ?? item.qta) || 100);
            const datiNutrizionali = estraiDatiFoodDb(desc, qta, batchGhostType);
            return {
              ...datiNutrizionali,
              id: datiNutrizionali.id || `ai_${batchId}_${index}`,
              type: 'food',
              mealType: batchGhostType,
              mealTime: sharedMealTime,
              batchId
            };
          })
          .filter(Boolean);
        if (isSimulationMode) {
          setSimulatedLog(prev => [...alimentiProcessati, ...(prev || [])]);
          setPendingAiBatch(null);
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Perfetto, ho salvato tutto (sandbox). 📝' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        const nuovoLog = [...alimentiProcessati, ...(dailyLog || [])];
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes);
        setPendingAiBatch(null);
        setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Perfetto, ho salvato tutto nel diario! 📝' }]);
        if (optionalReply == null) setChatInput('');
        return;
      }
      if (lowerMsg.includes('annulla') || lowerMsg.includes('no')) {
        setPendingAiBatch(null);
        setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Operazione annullata. Cosa vuoi fare ora?' }]);
        if (optionalReply == null) setChatInput('');
        return;
      }
    }

    const isTrackerToday = (currentTrackerDate || getTodayString()) === getTodayString();
    if (
      !secretPrompt &&
      isTrackerToday &&
      userMessage &&
      chatImages.length === 0 &&
      !kentuAgendaAwaitingRef.current
    ) {
      const wIntent = detectWorkoutIntentFromChat(userMessage);
      if (wIntent) {
        const slot = findLastMatchingWorkoutSlot(fullHistory, currentTrackerDate || getTodayString(), wIntent.searchKeys);
        if (slot) {
          pendingWorkoutFlowRef.current = {
            kind: 'await_confirm',
            displayLabel: wIntent.displayLabel,
            activity: wIntent.activity,
            searchKeys: wIntent.searchKeys,
            suggestedDecimal: slot.decimalHour,
          };
          const timeStr = formatDecimalHourIt(slot.decimalHour);
          setChatHistory((prev) => [
            ...prev,
            { sender: 'user', text: userMessage },
            {
              sender: 'ai',
              text: `Ricevuto, preparo il piano per l'allenamento ${wIntent.displayLabel}. Di solito ti alleni alle ${timeStr}, va bene questo orario anche per oggi?`,
              quickReplies: ['Sì, va bene', 'No, un altro orario'],
              workoutTimeConfirm: true,
            },
          ]);
          if (optionalReply == null) setChatInput('');
          return;
        }
      }
    }

    const historyMessage = userMessage || (chatImages.length > 0 ? `📷 ${chatImages.length} immagine/i allegata/e` : '');
    setChatHistory(prev => [...prev, { sender: 'user', text: historyMessage }]);
    if (optionalReply == null) setChatInput('');
    setChatHistory(prev => [...prev, { sender: 'ai', isTyping: true }]);

    try {
      const foodDbNames = Object.keys(foodDb || {}).map(k => foodDb[k]?.desc || foodDb[k]?.name || k).filter(Boolean).slice(0, 150);
      const energyResult = generateRealEnergyData(nodesForEnergySimulation, dailyLogForEnergy, idealStrategy, 0, 2500, null, null, userModel, nervousSystemLoad, currentTime, accumuloSNC);
      const chartData = energyResult?.chartData || [];
      const energyAt20 = chartData[20]?.energy;
      const paginaAttuale = (!activeAction || activeAction === 'home') ? 'Menu principale' : activeAction === 'pasto' ? `Costruttore pasto (${MEAL_LABELS_SAVE[mealType] || mealType})` : activeAction === 'allenamento' ? 'Costruttore allenamento' : activeAction === 'acqua' ? 'Idratazione' : activeAction === 'ai_chat' ? 'Chat Kentu' : activeAction === 'diario_giornaliero' ? 'Diario giornaliero' : activeAction === 'storico' ? 'Archivio storico' : activeAction === 'strategia' ? 'Protocollo / Strategia' : activeAction === 'focus' ? 'Neural Reset' : activeAction;

      const currentDecimalTime = new Date().getHours() + (new Date().getMinutes() / 60);
      const roundedTime = Math.round(currentDecimalTime * 2) / 2;
      const currentCortisolScore = cortisolCurve?.find(c => c?.time === roundedTime)?.cortisolScore ?? 0;

      const piccoAnabolico = Math.max(0, ...(anabolicCurve?.map(c => c.anabolicScore) ?? [0]));
      const piccoCortisolo = Math.max(0, ...(cortisolCurve?.map(c => c.cortisolScore) ?? [0]));

      const anchorAi = currentTrackerDate || getTodayString();
      const lastBodyEntry =
        Array.isArray(bodyMetricsHistory) && bodyMetricsHistory.length > 0
          ? bodyMetricsHistory[bodyMetricsHistory.length - 1]
          : null;
      const weightKgForAi =
        lastBodyEntry?.weight != null && Number.isFinite(Number(lastBodyEntry.weight))
          ? Number(lastBodyEntry.weight)
          : userProfile?.weight != null && Number.isFinite(Number(userProfile.weight))
            ? Number(userProfile.weight)
            : null;
      let bodyFatPctForAi = null;
      if (lastBodyEntry?.bodyFat != null && lastBodyEntry.bodyFat !== '') {
        const n = Number(lastBodyEntry.bodyFat);
        if (Number.isFinite(n)) bodyFatPctForAi = n;
      } else if (userProfile?.bodyFat != null && userProfile.bodyFat !== '') {
        const n = Number(userProfile.bodyFat);
        if (Number.isFinite(n)) bodyFatPctForAi = n;
      }

      const avgLong30ForAi = calculateConsolidatedAverageScore(30, anchorAi, longevityScoreHistory);
      const avgLong7ForAi = calculateConsolidatedAverageScore(7, anchorAi, longevityScoreHistory);
      const userAgeForAi = calculateAge(birthDate);
      let projectedAgeForAi = null;
      if (typeof userAgeForAi === 'number' && !Number.isNaN(userAgeForAi)) {
        if (avgLong30ForAi != null) projectedAgeForAi = calculateProjectedAge(userAgeForAi, avgLong30ForAi);
        else if (avgLong7ForAi != null) projectedAgeForAi = calculateProjectedAge(userAgeForAi, avgLong7ForAi);
      }
      const longevityMasterFallbackForAi =
        (typeof longevityEngineScore?.score === 'number' && !Number.isNaN(longevityEngineScore.score)
          ? longevityEngineScore.score
          : null) ??
        (typeof longevityData?.masterScore === 'number' && !Number.isNaN(longevityData.masterScore)
          ? longevityData.masterScore
          : null);

      const aiVitalsContextParagraph = buildKentuAiVitalsContextParagraph({
        weightKg: weightKgForAi,
        bodyFatPct: bodyFatPctForAi,
        projectedAge: projectedAgeForAi,
        avgScore30: avgLong30ForAi,
        avgScore7: avgLong7ForAi,
        longevityMasterScoreFallback: longevityMasterFallbackForAi,
      });

      const currentTdeeForAi =
        userTargets?.kcal != null &&
        Number.isFinite(Number(userTargets.kcal)) &&
        Number(userTargets.kcal) > 0
          ? Number(userTargets.kcal)
          : null;
      const metabolicVarianceForAi = calculateMetabolicVariance(
        bodyMetricsHistory,
        fullHistory,
        currentTdeeForAi
      );
      const metabolicRecompositionContext =
        buildKentuAiMetabolicRecompositionContext(metabolicVarianceForAi);

      const swCtx = scheduledWorkoutContextRef.current;
      const swAnchor = currentTrackerDate || getTodayString();
      let scheduledWorkoutPromptExtra = '';
      if (
        swCtx &&
        swCtx.dateStr === swAnchor &&
        typeof swCtx.workoutDecimalHour === 'number'
      ) {
        const wh = formatDecimalHourIt(swCtx.workoutDecimalHour);
        const nowDecAi = new Date().getHours() + new Date().getMinutes() / 60;
        if (swCtx.workoutDecimalHour > nowDecAi - 0.5) {
          const safeLab = String(swCtx.label || '').replace(/"/g, "'").slice(0, 80);
          scheduledWorkoutPromptExtra = `\n\nREGOLA ORARIO ALLENAMENTO: L'utente ha confermato un allenamento «${safeLab}» alle ${wh} di oggi. Finché non è passata quell'ora (finestra pre-workout ~90 min prima della sessione), NON proporre pasti "adesso", colazione immediata o spuntini fuori contesto: ragiona solo in termini di pre-workout (prima della sessione) e post-workout (dopo), con orari dei pasti allineati all'allenamento.`;
        }
      }

      const baseSystemPrompt = `Sei l'assistente di KentuOS. Il tuo scopo è dialogare con l'utente in italiano.

TONO (CO-PILOTA METABOLICO): Sei un Co-Pilota Metabolico di altissimo livello. Sii assertivo, tecnico ma immediato. NON usare toni timidi o accomodanti (es. "Vuoi che ti aiuti?", "Fammi sapere se ti va"). Usa toni direttivi (es. "Ottimizzo i macronutrienti per il recupero", "Sposta 15g di grassi a pranzo"). Chiudi con un'azione netta o una scelta binaria, senza ipersimpatia.

FORMATO "AI CARD" / DASHBOARD TESTUALE: Rispondi come una dashboard leggibile nel testo. Usa separatori tra blocchi (riga vuota tra sezioni), intestazioni chiare con emoji (es. riga dedicata "📊 STRATEGIA NUTRIZIONALE"). Quando riassumi macronutrienti, metriche, stress o allineamento agli obiettivi, usa SEMPRE barre visive fatte di caratteri/emoji per indicare riempimento o allerta, con una riga per metrica.
Esempio di formato obbligatorio (adatta numeri e testi al contesto):
📊 STRATEGIA NUTRIZIONALE
🔻 Carbo: [███░░░░░░░] Riduci zuccheri serali
🔺 Fibre: [████████░░] Focus ottimale
⚖️ Grassi: [█████░░░░░] Sotto controllo
👉 Azione: Sposta 15g di grassi a pranzo.
Combina questo stile con elenchi puntati dove serve; niente muri di testo.

REGOLE DI STILE (PRIORITÀ): Sintesi brutale. Al massimo 3 elenchi puntati per messaggio (quando usi elenchi). Vietate introduzioni tipo "Ecco il tuo briefing" / "Ecco un riepilogo" e conclusioni tipo "Spero di esserti stato utile" / "Fammi sapere": vai dritto al sodo.
FORMATTAZIONE OBBLIGATORIA: Devi essere chiarissimo e massimizzare la leggibilità. Quando dai consigli, spieghi concetti, elenchi alimenti o fai riepiloghi, usa SEMPRE gli elenchi puntati. Evita muri di testo. Usa frasi brevi, dirette e separate visivamente.
QUICK ACTION — Se l'ultimo messaggio utente inizia con QUICK_ACTION=BRIEFING o QUICK_ACTION=ANALISI_IERI: rispondi ESCLUSIVAMENTE in formato Lavagna (emoji + dato per riga, elenchi puntati essenziali), rispettando il tetto di 3 elenchi e le REGOLE DI STILE sopra.
QUICK ACTION — Se l'ultimo messaggio utente inizia con QUICK_ACTION=IDEA_PASTO: rispondi ESCLUSIVAMENTE con il blocco [MEAL_PROPOSAL:{...}] su una riga come da CARTA MENU; nessun altro testo (la Dispensa è in [CONTEXT_LIVE]).

MODALITÀ PIANIFICAZIONE: Se l'utente chiede di pianificare o programmare la giornata (testo libero o tramite wizard), entra in modalità pianificazione. Se il messaggio utente inizia con "PIANIFICAZIONE GUIDATA:", ha già scelto attività e fasce (Mattina / Pomeriggio / Sera): NON chiedere altro, NON fare elenchi lunghi. Rispondi generando ESATTAMENTE il token [DAILY_PLAN:{...}] su una riga, con orari concreti HH:MM coerenti con le fasce (es. Mattina → 08:00–11:30, Pomeriggio → 12:00–17:30, Sera → 18:00–22:00; se l'allenamento è in Sera usa tipicamente 18:30 o 19:00 come workoutTime e nella lista activities). Il JSON DEVE includere anche "ghostMeals": array di pasti pianificati (Nodi Fantasma) che l'utente vedrà in timeline finché non li converte in pasti veri: ogni elemento include {"mealType":"colazione|snack|pranzo|cena", "time":"HH:MM", "title":"Titolo breve", "microDesc":"Suggerimento micronutrienti (es. fibre, omega-3) per lucidità e sonno", "draftFoods":["200g Pollo","150g Riso"]} — draftFoods è un array di stringhe (abbozzo alimenti con pesi stimati). Per i pasti futuri nel token, calcola i target e COMPILA draftFoods con un abbozzo realistico di alimenti. Dai MASSIMA PRIORITÀ copiando pasti simili che l'utente ha consumato in passato (presenti nello storico) o cibi dal suo database/dispensa in [CONTEXT_LIVE]. Inserisci pesi stimati per centrare il target. Esempio forma completa: [DAILY_PLAN:{"target":"pari", "workoutTime":"19:00", "activities":[...], "ghostMeals":[{"mealType":"cena", "time":"20:00", "title":"Cena Recupero", "microDesc":"Focus proteine", "draftFoods":["200g Pollo","150g Riso"]}]}]. Scegli "target" (deficit, pari o surplus) in base a [CONTEXT_LIVE]. Altrimenti, in conversazione aperta, chiedi le attività; quando l'utente risponde, genera lo stesso token con ghostMeals coerenti col piano. Il token deve essere da solo su una riga. ATTENZIONE: DEVI OBBLIGATORIAMENTE riempire l'array draftFoods per OGNI nodo fantasma ('ghostMeals'). Se non sai cosa inserire, inventa un pasto coerente coi target (es. ['200g Pollo', '10g Olio']). L'array NON DEVE MAI essere vuoto. GERARCHIA COMPOSIZIONE draftFoods (ordine tassativo): (1) RECENTI — pasti identici o molto simili consumati negli ultimi 3–7 giorni; (2) STORICO — abitudini e pattern a più lungo termine se i recenti non bastano; (3) DISPENSA / DATABASE — attingi da foodDb e da alimenti noti in contesto, rispettando i target (es. pasto proteico → fonti proteiche coerenti); (4) NEW ENTRY — solo come ultima spiaggia, combinazione nuova e bilanciata. Ogni voce deve avere grammatura precisa per centrare i target ricalcolati. È SEVERAMENTE VIETATO GENERARE UN NODO FANTASMA SENZA CIBI. DEVI SEMPRE COMPILARE L'ARRAY 'draftFoods' (ES. ["200G POLLO", "10G OLIO"]) PER OGNI PASTO FUTURO, SIMULANDO LA COMPOSIZIONE IDEALE BASATA SUI TARGET.

REGOLA DI BILANCIAMENTO METABOLICO: Il tuo scopo primario è coprire il fabbisogno giornaliero. Se dopo aver inserito i pasti/attività esistenti noti che c'è un deficit calorico rimanente significativo (es. mancano più di 200 kcal ai target), DEVI ASSOLUTAMENTE inserire uno o più 'ghostMeals' (es. Cena o Spuntino) nell'array JSON per colmare il gap. NON TERMINARE MAI la pianificazione lasciando l'utente in grave deficit calorico.

ATTENZIONE TEMPORALE: Se nel prompt utente ricevi l'ora attuale e gli eventi già registrati, DEVI rispettarli. Proponi solo Nodi Fantasma futuri. Se la colazione o il pranzo sono già stati fatti, concentrati solo sugli spuntini e la cena, bilanciando i macro rimanenti.

LOGICA DI RACCOMANDAZIONE INTELLIGENTE: Quando l'utente chiede consigli su cosa mangiare (es. "Cosa mangio per cena?"):
1. Analizza i macro residui dal blocco [CONTEXT_LIVE] nell'ultimo messaggio utente per avvicinarti al fabbisogno giornaliero (senza ignorare equilibrio e contesto).
2. Dai priorità assoluta agli ingredienti elencati in "Dispensa" in [CONTEXT_LIVE]: è molto probabile che l'utente li abbia già in casa.
3. Se è ora di cena o il tema è serale, proponi pasti coerenti con la Nota in [CONTEXT_LIVE] sul cortisolo: carboidrati complessi, evita eccessi di grassi saturi o caffeina serale.
4. Presenta la proposta in STILE LAVAGNA con i macro totali stimati della ricetta (kcal e grammi P/C/F se possibile).
5. DIGESTIVE SAFETY GATE — Quando consigli un workout, calcola la somma tra i macro residui (da [CONTEXT_LIVE]) e il costo del workout. Se il totale calorico risultante per la cena supera le 900-1000 kcal (o se il volume di cibo previsto è eccessivo per l'orario), sconsiglia l'allenamento intenso. Spiega chiaramente che un pasto troppo pesante comprometterebbe il recupero e la gestione del cortisolo serale, suggerendo invece un pasto bilanciato e il rinvio dell'attività.
6. TRAINING WAVE (ORARIO ALLENAMENTO): In [CONTEXT_LIVE] c'è la riga «Finestra allenamento ideale: dalle HH:mm alle HH:mm.» oppure «Finestra allenamento ideale: Domani.» (nessuna finestra nelle prossime 4h del modello). Quando l'utente chiede se può allenarsi o quando conviene, usa quell'orario e l'ora attuale del messaggio.
- Prima dell'inizio della finestra: sconsiglia l'immediato; spiega in modo telegrafico (digestione/recupero) e indica di spostare l'allenamento dentro la finestra indicata.
- Con ora attuale dentro HH:mm–HH:mm: via libera per sessione ben pianificata; ricorda che è la finestra prevista dal modello.
- Dopo la fine o se compare solo «Domani»: niente finestra utile nell'orizzonte — evita HIIT intenso, preferisci riposo attivo o ripresa il giorno dopo.

CARTA MENU (MEAL_PROPOSAL): Quando proponi una cena concreta con ingredienti e grammi (contesto consiglio pasto / cena), NON scrivere una ricetta lunga in prose. Rispondi SOLO con il blocco dati su UNA riga così (nessun altro testo prima o dopo): [MEAL_PROPOSAL:{"title":"Proposta Cena Anti-Cortisolo","timeString":"HH:mm","items":[{"id":"id_univoco","name":"Nome alimento","qty":grammi,"dbKey":"chiave_opzionale_foodDb","why":"motivo breve","estKcal":n,"estPro":n,"estCar":n,"estFat":n}]}] — id univoco per ogni voce (es. salmone_1); qty in grammi; stime macro per quella quantità; dbKey solo se corrisponde al database noto.

STILE DI COMUNICAZIONE TASSATIVO (STILE LAVAGNA/COACH + AI CARD): Non usare MAI paragrafi lunghi o muri di testo. Sei un coach operativo. Le risposte devono essere visive, telegrafiche, come lavagna tattica in formato dashboard (vedi TONO e FORMATO "AI CARD" sopra).
Per ogni messaggio di testo normale (non vale quando un'altra regola impone SOLO JSON o SOLO array, senza testo libero):
1. Titolo sezione con emoji su riga propria (es. 📊 … oppure **🎯 Status** se usi markdown).
2. Metriche chiave: dove possibile, una riga con barra [████░░] + etichetta breve.
3. Elenchi puntati sintetici per dettagli o opzioni.
4. Grassetti su numeri, kcal, grammi P/C/F quando usi markdown.
5. Chiusura assertiva: imperativo o scelta A/B (coerente col TONO Co-Pilota), non inviti vaghi.

Se l'utente inserisce alimenti (anche in lista, es. "ho mangiato 3 gallette e 1 mela per spuntino") SENZA indicare un orario del pasto in modo da poter usare add_food (vedi PASTI ZERO FORM), devi rispondere ESCLUSIVAMENTE con un array JSON di oggetti. Formato: [{"name": "Nome alimento", "weight": peso_totale_grammi, "mealType": "pranzo"}]. Usa "name" o "desc", "weight" o "qta" (in grammi).

VOCABOLARIO PASTI (campo mealType — TASSATIVO): usa solo questi quattro valori: "colazione", "snack", "pranzo", "cena".
Qualsiasi spuntino o merenda (mattina o pomeriggio) → "snack". Pasto principale di mezzogiorno → "pranzo". Cena → "cena". Colazione → "colazione".
Compatibilità deprecata accettata dal parser: "merenda1"→colazione, "merenda_am"/"merenda_pm"/"merenda2"/"spuntino"→snack.

REGOLA MOLTIPLICATORE: Se l'utente indica quantità a pezzi (es. "3 gallette di riso", "2 uova"), stima il peso di UNA singola unità, moltiplicalo per la quantità, e inserisci il PESO TOTALE IN GRAMMI nel campo "weight" (es. 2 uova ≈ 120g, 3 gallette ≈ 30g totali). Un solo alimento = array con un elemento [{"name":"...", "weight": N, "mealType":"..."}].

Puoi anche proporre alternative dal database e chiedere conferma; alla conferma restituisci l'array JSON. In alternativa, per un singolo inserimento legacy, puoi usare {"action":"insert","food":{"desc":"nome","qta":grammi,"mealType":"pranzo"}} (mealType sempre uno dei cinque slot ufficiali sopra).

COMANDI DI SISTEMA (INVISIBILI): Se l'utente dichiara nel testo l'intenzione di cambiare strategia calorica (es. andare in deficit, mantenimento/pari, o surplus) OPPURE dichiara un orario in cui si allenerà, DEVI inserire alla FINE ASSOLUTA della tua risposta testuale un blocco dati formattato esattamente così: ===CMD:{"target":"deficit|pari|surplus", "workoutTime":"HH:MM"|null}===. Se l'utente non menziona modifiche strategiche né un orario di allenamento, non inserire il comando. Per solo orario di allenamento senza cambio strategia usa "pari" come target. workoutTime in 24h (es. "18:30") o null se non applichi un orario; null cancella l'orario programmato nel sistema quando l'utente lo revoca esplicitamente.

SONNO (ZERO FORM — solo messaggio testuale, niente screenshot Mi Fitness): Se l'utente riferisce di aver dormito (sonno notturno o sonnellino/pisolino), estrai la durata in ore decimali (es. 45 minuti = 0.75, 1 ora e mezza = 1.5). Restituisci RIGOROSAMENTE un JSON con questo formato: {"action":"add_sleep","hours":<numero_ore>}. Non aggiungere alcun testo fuori dal JSON.

ALLENAMENTO (ZERO FORM — solo messaggio testuale): Se l'utente riferisce di essersi allenato o di aver fatto un'attività fisica, estrai titolo, orario di INIZIO esatto e durata in minuti. SLOT FILLING SEVERO: se mancano dati cruciali (orario esatto di inizio o durata in minuti), NON inventarli: imposta "timeString" a null o "" e "duration" a null. Non usare add_workout finché l'utente non ha fornito entrambi in modo chiaro nel messaggio. Se le calorie non sono note, puoi stimarle solo quando durata e orario sono entrambi presenti; altrimenti "calories" può essere null. Formato JSON obbligatorio: {"action":"add_workout","title":"nome_attività","timeString":"HH:mm","duration":<minuti_intero>,"calories":<kcal_o_null>}. timeString in 24h (es. "18:30"). Restituisci RIGOROSAMENTE solo questo JSON senza altro testo. Non usare add_workout nella stessa risposta di add_sleep o log_sleep.

PASTI (ZERO FORM — add_food): Se l'utente riferisce di aver mangiato, estrai l'orario del pasto (timeString HH:mm) e una lista di alimenti con le rispettive quantità in grammi. Per ogni alimento fornisci anche una tua stima biochimica dei macronutrienti per quella specifica quantità nei campi estKcal (kcal), estPro (proteine g), estCar (carboidrati g), estFat (grassi g). SLOT FILLING SEVERO: se manca l'orario o la quantità in grammi di un alimento, NON inventarli: usa timeString null o "" e qty null. Restituisci RIGOROSAMENTE solo questo JSON senza altro testo: {"action":"add_food","timeString":"HH:mm","items":[{"name":"nome_alimento","qty":grammi,"estKcal":stima,"estPro":stima,"estCar":stima,"estFat":stima}]}. Non mischiare add_food con add_sleep, add_workout o log_sleep. Per elenchi senza orario/chiarezza per add_food usa l'array JSON legacy descritto sopra.

Database alimenti noti: ${foodDbNames.length ? foodDbNames.join(', ') : 'nessuno'}.

Contesto: Pagina ${paginaAttuale}. Rischio stress serale ${energyAt20 != null && energyAt20 < 40 ? 'ALTO' : 'Basso'}. [STRATEGIA: ...]. [ALLENAMENTO: desc | kcal]. Applica lo STILE LAVAGNA/COACH sopra.

QUICK REPLIES (OBBLIGATORIO QUANDO SERVE UNA SCELTA): Se chiedi conferma, proponi opzioni o un bivio, includi SEMPRE il blocco JSON quick_replies in coda. Nel testo visibile, invita perentoriamente a usare i pulsanti rapidi sotto il messaggio (es. «Scegli sotto», «Tocca un'opzione») e NON a riscrivere la stessa cosa a mano, salvo correzioni numeriche. Le etichette dei quick_replies devono coincidere con le azioni che proponi. Formato esatto su una riga finale: {"quick_replies": ["Sì, confermo", "Modifica quantità", "No, annulla"]}.`;

      const dynamicSystemPrompt = `${baseSystemPrompt}

DATI BIOCHIMICI IN TEMPO REALE DELL'UTENTE:
- Ora locale: ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
- Livello di Cortisolo stimato (0-100): ${Math.round(currentCortisolScore)}

REGOLA BIOCHIMICA FONDAMENTALE (RECUPERO NERVOSO):
Se l'utente chiede consigli per un pasto (in particolar modo la cena) o valuta opzioni alimentari, devi analizzare il livello di Cortisolo. Se il cortisolo è medio-alto in orario serale, è un segnale di allarme per il sistema nervoso. In questo caso, DEVI prioritizzare suggerimenti nutrizionali calmanti: proponi fonti di carboidrati complessi (che aiutano ad abbassare il cortisolo e favoriscono il sonno), alimenti ricchi di magnesio, omega 3 o triptofano. Evita di proporre pasti serali composti solo da proteine magre se lo stress è alto. Tono assertivo e focalizzato sul recupero: niente linguaggio timido o ipersimpatia.

LETTURA DEI GRAFICI ODIERNI:
- Picco massimo Sintesi Proteica oggi: ${Math.round(piccoAnabolico)}%
- Picco massimo Cortisolo oggi: ${Math.round(piccoCortisolo)}

REGOLA PER SPIEGAZIONE GRAFICI:
Se l'utente ti chiede spiegazioni sui suoi grafici, sulle sue curve o sui suoi livelli (es. "spiegami il grafico viola", "perché l'anabolismo è basso?"), usa i dati forniti per fargli un'analisi personalizzata. Spiega che il grafico viola (Cortisolo) indica lo stress nervoso (che sale con lavoro e allenamento), mentre la curva azzurra/verde (Sintesi proteica) indica il nutrimento muscolare. Sii chiaro e diretto ma SEMPRE in formato lavagna: titolo+emoji, elenco puntato sintetico, grassetti sui numeri, domanda finale — niente paragrafi lunghi.

RICONOSCIMENTO SONNO CONVERSAZIONALE (solo durata, senza screenshot Mi Fitness):
Se l'utente descrive solo quanto ha dormito (notte o pisolino) e NON stai estraendo un report Mi Fitness con sveglia/addormentamento/deep/REM, applica la regola SONNO (ZERO FORM) del prompt base: solo il JSON add_sleep, senza testo extra. Non usare add_sleep insieme a log_sleep nella stessa risposta.

TRACCIAMENTO DEL SONNO E VISION:
Se l'utente allega uno screenshot di un'app di tracciamento del sonno (es. Mi Fitness) o scrive i dati testualmente, estrai questi valori chiave: Ora di risveglio (es. 06:18 diventa 6.3 in ore decimali), Ore totali di sonno (es. 6 ore e 34 min diventa 6.56), Tempo in fase Profonda in minuti (es. 2h 14m = 134), Tempo in fase REM in minuti, Frequenza cardiaca media (BPM). Rispondi con un breve riepilogo testuale ("Ho letto i dati: hai dormito 6h 34m, recupero profondo ottimo...") e includi un JSON strutturato su una riga: {"action": "log_sleep", "sleepData": {"wakeTime": 6.3, "hours": 6.56, "sleepStart": 23.5, "sleepEnd": 6.3, "deepMin": 134, "remMin": 94, "hr": 56}}. Usa SEMPRE i quick_replies: {"quick_replies": ["Sì, confermo", "No, annulla"]} per la conferma prima del salvataggio.
${SLEEP_AI_MI_FITNESS_INSTRUCTIONS}${aiVitalsContextParagraph ? `\n\nCOMPOSIZIONE CORPORALE E LONGEVITÀ (contesto utente):\n${aiVitalsContextParagraph}` : ''}${metabolicRecompositionContext ? `\n\n${metabolicRecompositionContext}` : ''}${scheduledWorkoutPromptExtra}`;

      const previousMessages = (chatHistory || []).filter(m => !m.isTyping);
      const recentHistory = previousMessages.slice(-CHAT_HISTORY_WINDOW);
      const isLocalError = (text) => {
        const t = (text || '').trim();
        return t.startsWith('❌') || t.includes('Errore Server') || t.includes('Nessuna API Key');
      };
      const filtered = recentHistory.filter(m => !isLocalError(m.text));
      const conversationLines = filtered.map((m) => {
        const raw = (m.text || '').trim();
        const lineText =
          m.sender === 'user' ? stripInvisibleContextFromVisibleUserText(raw) : raw;
        return (m.sender === 'user' ? 'Utente: ' : 'Assistente: ') + lineText;
      });
      const burnedKcalContext = (activeLog || [])
        .filter((item) => item.type === 'workout')
        .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
      const dynamicDailyKcalContext =
        applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) +
        burnedKcalContext;
      const contextString = getInvisibleContext({
        bodyBatteryPercent: bodyBattery?.currentEnergy ?? 0,
        dynamicDailyKcal: dynamicDailyKcalContext,
        totali,
        userTargets,
        fullHistory,
        anchorDateStr: currentTrackerDate || getTodayString(),
        trainingWaveSnippet: buildTrainingWaveContextSnippet(trainingWaveResult),
        mealTypeForSmart: activeAction === 'pasto' ? mealType : undefined,
        dailyLogForSmart: activeAction === 'pasto' ? (activeLog || dailyLog) : undefined,
        kentuCalorieStrategy: kentuDailyCalorieStrategy,
      });
      const rawLastUserForApi =
        apiUserContent || (chatImages.length > 0 ? `[Allegati ${chatImages.length} screenshot da analizzare]` : '');
      const apiMessage = rawLastUserForApi
        ? `${contextString} ${rawLastUserForApi}`.trim()
        : contextString;
      conversationLines.push('Utente: ' + apiMessage);
      const conversationText = conversationLines.join('\n');
      const fullPrompt = dynamicSystemPrompt + '\n\n---\nConversazione (rispondi come Assistente all\'ultimo messaggio):\n' + conversationText;

      let responseText = await callGeminiAPIWithRotation(fullPrompt, { images: chatImages.length > 0 ? chatImages : undefined });
      setChatImages([]);
      {
        const cmdCut = parseKentuInvisibleCmd(responseText);
        responseText = cmdCut.stripped;
        if (cmdCut.cmd) applyKentuChatCmd(cmdCut.cmd);
      }

      let insertPayload = null;
      let itemsArray = null;

      const insertStart = responseText.indexOf('{"action":"insert"');
      if (insertStart !== -1) {
        let depth = 0;
        let end = insertStart;
        for (let i = insertStart; i < responseText.length; i++) {
          if (responseText[i] === '{') depth++;
          else if (responseText[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        try {
          const parsed = JSON.parse(responseText.slice(insertStart, end + 1));
          if (parsed.action === 'insert' && parsed.food && (parsed.food.desc || parsed.food.name)) {
            insertPayload = parsed.food;
          }
        } catch (_) {}
      }

      const arrayStart = responseText.indexOf('[');
      if (itemsArray == null && arrayStart !== -1 && responseText.indexOf('"add_food"') === -1) {
        let depth = 0;
        let arrayEnd = arrayStart;
        for (let i = arrayStart; i < responseText.length; i++) {
          if (responseText[i] === '[' || responseText[i] === '{') depth++;
          else if (responseText[i] === ']' || responseText[i] === '}') { depth--; if (depth === 0 && responseText[i] === ']') { arrayEnd = i; break; } }
        }
        try {
          const parsed = JSON.parse(responseText.slice(arrayStart, arrayEnd + 1));
          if (Array.isArray(parsed) && parsed.length > 0 && parsed.some(x => x && (x.name || x.desc) && (x.weight != null || x.qta != null))) {
            itemsArray = parsed;
          }
        } catch (_) {}
      }

      let addSleepHours = null;
      const addSleepMarker = responseText.indexOf('"add_sleep"');
      if (addSleepMarker !== -1) {
        let addObjStart = responseText.lastIndexOf('{', addSleepMarker);
        if (addObjStart !== -1) {
          let depthAs = 0;
          let addObjEnd = addObjStart;
          for (let i = addObjStart; i < responseText.length; i++) {
            if (responseText[i] === '{') depthAs++;
            else if (responseText[i] === '}') {
              depthAs--;
              if (depthAs === 0) {
                addObjEnd = i;
                break;
              }
            }
          }
          try {
            const addParsed = JSON.parse(responseText.slice(addObjStart, addObjEnd + 1));
            if (addParsed && addParsed.action === 'add_sleep') {
              const sleepHoursParsed = Number(addParsed.hours) || 0;
              if (Number.isFinite(sleepHoursParsed) && sleepHoursParsed > 0 && sleepHoursParsed <= 24) {
                addSleepHours = Math.round(sleepHoursParsed * 1000) / 1000;
              }
            }
          } catch (_) {}
        }
      }

      let addWorkoutPayload = null;
      let addWorkoutSlotError = false;
      const addWorkoutMarker = responseText.indexOf('"add_workout"');
      if (addWorkoutMarker !== -1) {
        let woObjStart = responseText.lastIndexOf('{', addWorkoutMarker);
        if (woObjStart !== -1) {
          let depthWo = 0;
          let woObjEnd = woObjStart;
          for (let i = woObjStart; i < responseText.length; i++) {
            if (responseText[i] === '{') depthWo++;
            else if (responseText[i] === '}') {
              depthWo--;
              if (depthWo === 0) {
                woObjEnd = i;
                break;
              }
            }
          }
          try {
            const woParsed = JSON.parse(responseText.slice(woObjStart, woObjEnd + 1));
            if (woParsed && woParsed.action === 'add_workout') {
              const timeStrRaw = woParsed.timeString != null ? String(woParsed.timeString).trim() : '';
              const timeDecFromSlot = timeStrRaw ? parseFlexibleTimeToDecimal(timeStrRaw) : null;
              const durRaw = woParsed.duration;
              const wDuration =
                durRaw === null || durRaw === undefined || durRaw === ''
                  ? NaN
                  : Number(durRaw);
              const hasValidDuration = Number.isFinite(wDuration) && wDuration > 0;
              const hasValidTimeString = timeStrRaw.length > 0 && timeDecFromSlot != null;
              if (!hasValidDuration || !hasValidTimeString) {
                addWorkoutSlotError = true;
              } else {
                const wTitle =
                  woParsed.title != null && String(woParsed.title).trim()
                    ? String(woParsed.title).trim()
                    : 'Allenamento';
                let wCalories = Number(woParsed.calories);
                if (!Number.isFinite(wCalories) || wCalories <= 0) {
                  wCalories = Math.max(80, Math.round(wDuration * 8));
                }
                addWorkoutPayload = {
                  title: wTitle,
                  duration: wDuration,
                  calories: wCalories,
                  timeString: timeStrRaw,
                  timeDec: timeDecFromSlot,
                };
              }
            }
          } catch (_) {}
        }
      }

      let addFoodPayload = null;
      let addFoodHabitProposal = null;
      let addFoodSlotError = false;
      const habitLogFlat = normalizeLogData([
        ...(Array.isArray(dailyLog) ? dailyLog : []),
        ...(Array.isArray(simulatedLog) ? simulatedLog : []),
      ]);
      const addFoodMarker = responseText.indexOf('"add_food"');
      if (addFoodMarker !== -1) {
        let afObjStart = responseText.lastIndexOf('{', addFoodMarker);
        if (afObjStart !== -1) {
          let depthAf = 0;
          let afObjEnd = afObjStart;
          for (let i = afObjStart; i < responseText.length; i++) {
            if (responseText[i] === '{') depthAf++;
            else if (responseText[i] === '}') {
              depthAf--;
              if (depthAf === 0) {
                afObjEnd = i;
                break;
              }
            }
          }
          try {
            const afParsed = JSON.parse(responseText.slice(afObjStart, afObjEnd + 1));
            if (afParsed && afParsed.action === 'add_food') {
              const timeStrRaw = afParsed.timeString != null ? String(afParsed.timeString).trim() : '';
              const mealDecFromSlot = timeStrRaw ? parseFlexibleTimeToDecimal(timeStrRaw) : null;
              const hasValidTimeString = timeStrRaw.length > 0 && mealDecFromSlot != null;
              const itemsRaw = afParsed.items;
              const itemsArr = Array.isArray(itemsRaw) ? itemsRaw : [];
              if (!hasValidTimeString || itemsArr.length === 0) {
                addFoodSlotError = true;
              } else {
                let slotInvalid = false;
                let needsHabitConfirm = false;
                const normalizedItems = [];
                for (const it of itemsArr) {
                  const nm = it?.name != null ? String(it.name).trim() : '';
                  if (!nm) {
                    slotInvalid = true;
                    break;
                  }
                  const qtyN = Number(it?.qty);
                  const qtyOk = Number.isFinite(qtyN) && qtyN > 0;
                  if (qtyOk) {
                    normalizedItems.push({
                      name: nm,
                      qty: qtyN,
                      estKcal: it?.estKcal,
                      estPro: it?.estPro,
                      estCar: it?.estCar,
                      estFat: it?.estFat,
                    });
                  } else {
                    const habit = findRecentFoodHabit(nm, foodDb, habitLogFlat);
                    if (!habit) {
                      slotInvalid = true;
                      break;
                    }
                    needsHabitConfirm = true;
                    normalizedItems.push({
                      name: habit.name,
                      qty: habit.qty,
                      estKcal: it?.estKcal,
                      estPro: it?.estPro,
                      estCar: it?.estCar,
                      estFat: it?.estFat,
                      matchedKey: habit.dbKey,
                    });
                  }
                }
                if (slotInvalid) addFoodSlotError = true;
                else if (needsHabitConfirm) {
                  addFoodHabitProposal = {
                    timeString: timeStrRaw,
                    mealDec: mealDecFromSlot,
                    items: normalizedItems,
                  };
                } else {
                  addFoodPayload = {
                    timeString: timeStrRaw,
                    mealDec: mealDecFromSlot,
                    items: normalizedItems,
                  };
                }
              }
            }
          } catch (_) {}
        }
      }

      if (addFoodHabitProposal != null) {
        setPendingHabit(addFoodHabitProposal);
        const bullets = addFoodHabitProposal.items
          .map((it) => `- **Alimento:** ${it.name}\n- **Quantità:** ${it.qty}g`)
          .join('\n\n');
        const msg = `🎯 **Conferma Abitudine**\n${bullets}\n\nConfermi questo inserimento? (Sì/No)`;
        setChatHistory((prev) => {
          const next = [...prev];
          next.pop();
          next.push({ sender: 'ai', text: msg });
          return next;
        });
        return;
      }

      let sleepDataPayload = null;
      const logSleepIdx = responseText.indexOf('"log_sleep"');
      if (logSleepIdx === -1) {
        const altIdx = responseText.indexOf('log_sleep');
        if (altIdx !== -1) {
          let objStart = responseText.lastIndexOf('{', altIdx);
          if (objStart !== -1) {
            let depth = 0;
            let objEnd = objStart;
            for (let i = objStart; i < responseText.length; i++) {
              if (responseText[i] === '{') depth++;
              else if (responseText[i] === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
            }
            try {
              const parsed = JSON.parse(responseText.slice(objStart, objEnd + 1));
              if (parsed.action === 'log_sleep' && parsed.sleepData && typeof parsed.sleepData === 'object') {
                sleepDataPayload = parsed.sleepData;
              }
            } catch (_) {}
          }
        }
      } else {
        let objStart = responseText.lastIndexOf('{', logSleepIdx);
        if (objStart !== -1) {
          let depth = 0;
          let objEnd = objStart;
          for (let i = objStart; i < responseText.length; i++) {
            if (responseText[i] === '{') depth++;
            else if (responseText[i] === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
          }
          try {
            const parsed = JSON.parse(responseText.slice(objStart, objEnd + 1));
            if (parsed.action === 'log_sleep' && parsed.sleepData && typeof parsed.sleepData === 'object') {
              sleepDataPayload = parsed.sleepData;
            }
          } catch (_) {}
        }
      }
      if (sleepDataPayload && addSleepHours == null) {
        setPendingAiBatch({ type: 'sleep', data: sleepDataPayload });
      }

      if (addSleepHours != null) {
        const sleepHours = addSleepHours;
        const timeDec = new Date().getHours() + new Date().getMinutes() / 60;
        const sleepEntry = {
          id: Date.now().toString(),
          type: 'sleep',
          hours: sleepHours,
          duration: sleepHours,
          sleepHours: sleepHours,
          time: timeDec,
        };
        const hoursDisplay = String(Math.round(sleepHours * 100) / 100).replace('.', ',');
        const testoRisposta =
          sleepHours < 3
            ? `Ho registrato il tuo sonnellino di ${Math.round(sleepHours * 60)} minuti. Body Battery ricalcolata!`
            : `Ho registrato ${hoursDisplay} ore di sonno. Body Battery aggiornata!`;
        if (isSimulationMode) {
          setSimulatedLog((prev) => [...(prev || []), sleepEntry]);
        } else {
          const nuovoLogSleep = [...(dailyLog || []), sleepEntry];
          setDailyLog(nuovoLogSleep);
          syncDatiFirebase(nuovoLogSleep, manualNodes);
        }
        dismissKentuSleepTrigger();
        setChatHistory((prev) => {
          const next = [...prev];
          next.pop();
          next.push({
            sender: 'ai',
            text: testoRisposta,
          });
          return next;
        });
        return;
      }

      if (addWorkoutSlotError) {
        const missingText =
          "Mi mancano alcuni dettagli per registrare l'allenamento. A che ora hai iniziato e quanto è durato?";
        setChatHistory((prev) => {
          const next = [...prev];
          next.pop();
          next.push({ sender: 'ai', text: missingText });
          return next;
        });
        return;
      }

      if (addFoodSlotError) {
        const missingFoodText =
          'Mi mancano dei dettagli per registrare il pasto. A che ora hai mangiato e quanti grammi erano all\'incirca?';
        setChatHistory((prev) => {
          const next = [...prev];
          next.pop();
          next.push({ sender: 'ai', text: missingFoodText });
          return next;
        });
        return;
      }

      if (addWorkoutPayload != null) {
        const { title: wTitle, duration: wDuration, calories: wCalories, timeString: oraString, timeDec } = addWorkoutPayload;
        const durationHours = Math.max(1 / 60, wDuration / 60);
        const titleLower = wTitle.toLowerCase();
        const isCardioHint = /corr|corsa|run|bike|cicl|spinning|nuot|swim|remier|rowing|ellitt|walk|cammin|cardio|hiit|saltell|jump/i.test(wTitle);
        const isPcOrCognitive = /lavoro\s*(al\s*)?pc|pc\b|smart\s*working|scrivania|studio|desk|videocal|zoom|call da|programm/i.test(titleLower);
        const isWorkGeneric = /(\blavoro\b|meeting|riunione|ufficio\b)/i.test(titleLower) && !/lavoro\s*al\s*pc|pc\b|scrivania/i.test(titleLower);
        let workoutTypeForLog = isCardioHint ? 'cardio' : 'pesi';
        let timelineNodeType = 'workout';
        if (isPcOrCognitive) {
          timelineNodeType = 'cognitive';
          workoutTypeForLog = /studio|studiare|leggere|libro/i.test(titleLower) ? 'studio' : 'lavoro_pc';
        } else if (isWorkGeneric) {
          timelineNodeType = 'work';
          workoutTypeForLog = 'lavoro';
        }
        const workoutId = Date.now().toString();
        const workoutEntry = {
          id: workoutId,
          type: 'workout',
          title: wTitle,
          name: wTitle,
          desc: wTitle.toUpperCase(),
          durationMinutes: wDuration,
          duration: durationHours,
          calories: wCalories,
          kcal: wCalories,
          cal: wCalories,
          workoutType: workoutTypeForLog,
          time: timeDec,
          mealTime: timeDec,
          ora: oraString,
          timeString: oraString,
        };
        const timelineNode = {
          id: workoutId,
          type: timelineNodeType,
          time: timeDec,
          duration: durationHours,
          kcal: wCalories,
          icon:
            timelineNodeType === 'cognitive'
              ? workoutTypeForLog === 'studio'
                ? '📚'
                : '💻'
              : timelineNodeType === 'work'
                ? '💼'
                : '🏋️',
          subType: workoutTypeForLog,
          name: wTitle,
          muscles: [],
        };
        const testoRisposta = `🎯 **Workout Registrato**
- **Attività:** ${wTitle}
- **Durata:** ${wDuration} min
- **Spesa energetica:** ~${wCalories} kcal

Ottimo lavoro! Body Battery e parametri aggiornati. 💪`;
        const anchorWo = currentTrackerDate || getTodayString();
        if (anchorWo === getTodayString()) {
          scheduledWorkoutContextRef.current = null;
        }
        if (isSimulationMode) {
          setSimulatedLog((prev) => [workoutEntry, ...(prev || [])]);
          setSimulationNodes((prev) =>
            [...(prev || []), timelineNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
          );
        } else {
          const nuovoLogWo = [workoutEntry, ...(dailyLog || [])];
          const nextManual = [...manualNodes, timelineNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
          setDailyLog(nuovoLogWo);
          setManualNodes(nextManual);
          syncDatiFirebase(nuovoLogWo, nextManual);
        }
        setChatHistory((prev) => {
          const next = [...prev];
          next.pop();
          next.push({
            sender: 'ai',
            text: testoRisposta,
          });
          return next;
        });
        return;
      }

      if (addFoodPayload != null) {
        const testoRispostaFood = commitAddFoodChatPayload(addFoodPayload);
        setChatHistory((prev) => {
          const next = [...prev];
          next.pop();
          next.push({
            sender: 'ai',
            text: testoRispostaFood || 'Pasto registrato. 🥗',
          });
          return next;
        });
        return;
      }

      const itemsToSave = itemsArray != null ? itemsArray : (insertPayload ? [insertPayload] : []);

      if (itemsToSave.length > 0) {
        const baseMealTime = getCurrentTimeRoundedTo15Min();
        const predictedType = predictMealType(baseMealTime);
        const sharedMealTime = typeof itemsToSave[0]?.mealTime === 'number' ? itemsToSave[0].mealTime : baseMealTime;
        const rawMtSave = itemsToSave[0]?.mealType;
        const dominantMealType =
          rawMtSave != null && String(rawMtSave).trim() !== ''
            ? normalizeAiMealTypeToStorageId(rawMtSave, sharedMealTime)
            : predictedType;
        const batchGhostType = getGhostMealType(dominantMealType, dailyLog || []);
        const batchId = `batch_${Date.now()}`;

        const alimentiProcessati = itemsToSave
          .map((item, index) => {
            const desc = item.desc || item.name || '';
            if (!desc) return null;
            const qta = Math.max(1, parseFloat(item.weight ?? item.qta) || 100);
            const datiNutrizionali = estraiDatiFoodDb(desc, qta, batchGhostType);
            return {
              ...datiNutrizionali,
              id: datiNutrizionali.id || `ai_${batchId}_${index}`,
              type: 'food',
              mealType: batchGhostType,
              mealTime: sharedMealTime,
              batchId
            };
          })
          .filter(Boolean);

        const nuovoLog = [...alimentiProcessati, ...(dailyLog || [])];
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes);
        setChatHistory(prev => {
          const next = [...prev];
          next.pop();
          next.push({ sender: 'ai', text: alimentiProcessati.length > 1 ? `Perfetto, ho inserito ${alimentiProcessati.length} alimenti nel diario!` : 'Perfetto, ho inserito l\'alimento nel diario!' });
          return next;
        });
        return;
      }

      const regexStrategia = /\[STRATEGIA:\s*(.+?)\]/gi;
      let matchStrategia;
      while ((matchStrategia = regexStrategia.exec(responseText)) !== null) {
        const pairs = matchStrategia[1].split(',');
        const newStrategy = { ...idealStrategy };
        pairs.forEach(pair => {
          const [key, val] = pair.split('=').map(s => (s || '').trim().toLowerCase());
          const numVal = parseFloat(val);
          if (isNaN(numVal) || !key) return;
          const stratKey = key === 'spuntino' || key === 'merenda_pm' || key === 'merenda_am' ? 'snack' : key;
          if (newStrategy[stratKey] !== undefined) newStrategy[stratKey] = numVal;
        });
        setIdealStrategy(newStrategy);
      }

      const regexWorkout = /\[ALLENAMENTO:\s*([^|\]]+?)\s*\|\s*([0-9.,]+)\]/gi;
      let matchWorkout;
      while ((matchWorkout = regexWorkout.exec(responseText)) !== null) {
        const kcal = Math.max(0, parseFloat((matchWorkout[2] || '').replace(',', '.')) || 300);
        const newItem = { id: Date.now() + Math.random(), type: 'workout', workoutType: 'misto', desc: (matchWorkout[1] || '').trim().toUpperCase(), kcal, duration: Math.floor(kcal / 6) };
        if (isSimulationMode) {
          setSimulatedLog(prev => [newItem, ...(prev || [])]);
        } else {
          setDailyLog(prev => {
            const newLog = [newItem, ...(prev || [])];
            syncDatiFirebase(newLog, manualNodes);
            return newLog;
          });
        }
      }

      const mealProposalExtract = extractAndStripMealProposal(responseText);
      let cleanText = mealProposalExtract.stripped;
      const mealProposalForUi = mealProposalExtract.proposal;
      const dailyPlanExtract = extractAndStripDailyPlan(cleanText);
      cleanText = dailyPlanExtract.stripped;
      const dailyPlanForUi = mealProposalForUi ? null : dailyPlanExtract.plan;
      const stripInsertStart = cleanText.indexOf('{"action":"insert"');
      if (stripInsertStart !== -1) {
        let depth = 0;
        let stripEnd = stripInsertStart;
        for (let i = stripInsertStart; i < cleanText.length; i++) {
          if (cleanText[i] === '{') depth++;
          else if (cleanText[i] === '}') { depth--; if (depth === 0) { stripEnd = i; break; } }
        }
        cleanText = (cleanText.slice(0, stripInsertStart) + cleanText.slice(stripEnd + 1)).trim();
      }
      if (itemsArray != null && itemsArray.length > 0) {
        const arrStart = cleanText.indexOf('[');
        if (arrStart !== -1) {
          let depth = 0;
          let arrEnd = arrStart;
          for (let i = arrStart; i < cleanText.length; i++) {
            if (cleanText[i] === '[' || cleanText[i] === '{') depth++;
            else if (cleanText[i] === ']' || cleanText[i] === '}') { depth--; if (depth === 0 && cleanText[i] === ']') { arrEnd = i; break; } }
          }
          cleanText = (cleanText.slice(0, arrStart) + cleanText.slice(arrEnd + 1)).trim();
        }
      }
      if (sleepDataPayload) {
        const lsIdx = cleanText.indexOf('"log_sleep"');
        const lsAlt = cleanText.indexOf('log_sleep');
        const idx = lsIdx !== -1 ? cleanText.lastIndexOf('{', lsIdx) : (lsAlt !== -1 ? cleanText.lastIndexOf('{', lsAlt) : -1);
        if (idx !== -1) {
          let depth = 0;
          let end = idx;
          for (let i = idx; i < cleanText.length; i++) {
            if (cleanText[i] === '{') depth++;
            else if (cleanText[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
          }
          cleanText = (cleanText.slice(0, idx) + cleanText.slice(end + 1)).trim();
        }
      }
      {
        const asIdx = cleanText.indexOf('"add_sleep"');
        if (asIdx !== -1) {
          const idxAs = cleanText.lastIndexOf('{', asIdx);
          if (idxAs !== -1) {
            let depthAs = 0;
            let endAs = idxAs;
            for (let i = idxAs; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depthAs++;
              else if (cleanText[i] === '}') {
                depthAs--;
                if (depthAs === 0) {
                  endAs = i;
                  break;
                }
              }
            }
            cleanText = (cleanText.slice(0, idxAs) + cleanText.slice(endAs + 1)).trim();
          }
        }
      }
      {
        const awIdx = cleanText.indexOf('"add_workout"');
        if (awIdx !== -1) {
          const idxAw = cleanText.lastIndexOf('{', awIdx);
          if (idxAw !== -1) {
            let depthAw = 0;
            let endAw = idxAw;
            for (let i = idxAw; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depthAw++;
              else if (cleanText[i] === '}') {
                depthAw--;
                if (depthAw === 0) {
                  endAw = i;
                  break;
                }
              }
            }
            cleanText = (cleanText.slice(0, idxAw) + cleanText.slice(endAw + 1)).trim();
          }
        }
      }
      {
        const afIdx = cleanText.indexOf('"add_food"');
        if (afIdx !== -1) {
          const idxAf = cleanText.lastIndexOf('{', afIdx);
          if (idxAf !== -1) {
            let depthAf = 0;
            let endAf = idxAf;
            for (let i = idxAf; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depthAf++;
              else if (cleanText[i] === '}') {
                depthAf--;
                if (depthAf === 0) {
                  endAf = i;
                  break;
                }
              }
            }
            cleanText = (cleanText.slice(0, idxAf) + cleanText.slice(endAf + 1)).trim();
          }
        }
      }
      cleanText = cleanText.replace(/\[STRATEGIA:\s*[^\]]+\]/gi, '').replace(/\[ALLENAMENTO:\s*[^\]]+\]/gi, '').trim();

      let quickReplies = [];
      const qrIdx = cleanText.indexOf('"quick_replies"');
      if (qrIdx !== -1) {
        const objStart = cleanText.lastIndexOf('{', qrIdx);
        if (objStart !== -1) {
          let depth = 0;
          let objEnd = objStart;
          for (let i = objStart; i < cleanText.length; i++) {
            if (cleanText[i] === '{') depth++;
            else if (cleanText[i] === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
          }
          try {
            const parsedQR = JSON.parse(cleanText.slice(objStart, objEnd + 1));
            if (Array.isArray(parsedQR.quick_replies)) quickReplies = parsedQR.quick_replies;
            cleanText = (cleanText.slice(0, objStart) + cleanText.slice(objEnd + 1)).trim();
          } catch (_) {}
        }
      }

      let dinnerOptions = null;
      const doIdx = cleanText.indexOf('"dinner_options"');
      if (doIdx !== -1) {
        const objStartDo = cleanText.lastIndexOf('{', doIdx);
        if (objStartDo !== -1) {
          let depthDo = 0;
          let objEndDo = objStartDo;
          for (let i = objStartDo; i < cleanText.length; i++) {
            if (cleanText[i] === '{') depthDo++;
            else if (cleanText[i] === '}') {
              depthDo--;
              if (depthDo === 0) {
                objEndDo = i;
                break;
              }
            }
          }
          try {
            const parsedDo = JSON.parse(cleanText.slice(objStartDo, objEndDo + 1));
            if (Array.isArray(parsedDo.dinner_options) && parsedDo.dinner_options.length) {
              dinnerOptions = parsedDo.dinner_options.slice(0, 3).filter((o) => o && (o.label || o.description));
            }
            cleanText = (cleanText.slice(0, objStartDo) + cleanText.slice(objEndDo + 1)).trim();
          } catch (_) {}
        }
      }

      let agendaOptions = null;
      const aoIdx = cleanText.indexOf('"agenda_options"');
      if (aoIdx !== -1) {
        const objStartAo = cleanText.lastIndexOf('{', aoIdx);
        if (objStartAo !== -1) {
          let depthAo = 0;
          let objEndAo = objStartAo;
          for (let i = objStartAo; i < cleanText.length; i++) {
            if (cleanText[i] === '{') depthAo++;
            else if (cleanText[i] === '}') {
              depthAo--;
              if (depthAo === 0) {
                objEndAo = i;
                break;
              }
            }
          }
          try {
            const parsedAo = JSON.parse(cleanText.slice(objStartAo, objEndAo + 1));
            if (Array.isArray(parsedAo.agenda_options) && parsedAo.agenda_options.length) {
              agendaOptions = parsedAo.agenda_options.filter((o) => o && (o.name || o.label));
            }
            cleanText = (cleanText.slice(0, objStartAo) + cleanText.slice(objEndAo + 1)).trim();
          } catch (_) {}
        }
      }

      if (!cleanText && !mealProposalForUi && !dailyPlanForUi) cleanText = '✨ Operazione completata.';
      if (mealProposalForUi) cleanText = '';
      if (dailyPlanForUi) cleanText = '';

      if (dinnerOptions && dinnerOptions.length) {
        lastDinnerOptionsRef.current = dinnerOptions;
      }
      if (agendaOptions && agendaOptions.length) {
        lastAgendaOptionsRef.current = agendaOptions;
      }

      setChatHistory(prev => {
        const newHist = [...prev];
        newHist.pop();
        newHist.push({
          sender: 'ai',
          text: cleanText,
          mealProposal: mealProposalForUi || undefined,
          dailyPlan: dailyPlanForUi || undefined,
          quickReplies:
            mealProposalForUi || dailyPlanForUi || quickReplies.length === 0 ? undefined : quickReplies,
          dinnerOptions:
            mealProposalForUi || dailyPlanForUi || !dinnerOptions || dinnerOptions.length === 0
              ? undefined
              : dinnerOptions,
          agendaOptions: agendaOptions && agendaOptions.length > 0 ? agendaOptions : undefined,
        });
        return newHist;
      });
    } catch (e) {
      setChatHistory(prev => {
        const newHist = [...prev];
        newHist.pop();
        newHist.push({ sender: 'ai', text: `❌ ${e.message || String(e)}` });
        return newHist;
      });
    }
  };

  /** Conferma [MEAL_PROPOSAL]: scrive alimenti reali in dailyLog (non solo ghost timeline). */
  const handleMealProposalConfirm = useCallback(
    (proposal, selectedItems) => {
      if (!selectedItems?.length) return;
      const timeStr =
        (proposal?.timeString && String(proposal.timeString).trim()) ||
        decimalToTimeStr(getCurrentTimeRoundedTo15Min());
      let mealDec = parseFlexibleTimeToDecimal(timeStr);
      if (mealDec == null) mealDec = getCurrentTimeRoundedTo15Min();

      const logSnap = dailyLogRef.current || [];
      const predicted = predictMealType(mealDec);
      const mealSlot = getGhostMealType(predicted, logSnap);
      const mealTypeCanonical = toCanonicalMealType(String(mealSlot).split('_')[0]);
      const batchId = `meal_proposal_${Date.now()}`;

      const entries = selectedItems.map((it, index) => {
        const name = String(it.name || '').trim() || 'Alimento';
        const qty = Math.max(1, Math.round(Number(it.qty) || 100));
        const matchedKey =
          it.dbKey != null && foodDb[it.dbKey] != null ? it.dbKey : findBestFoodMatch(name, foodDb);

        if (matchedKey != null) {
          const dati = estraiDatiFoodDb(name, qty, mealSlot, matchedKey);
          const isRecipe = dati.type === 'recipe';
          return {
            ...dati,
            id: dati.id || `${batchId}_${index}`,
            type: isRecipe ? 'recipe' : 'food',
            name: dati.name ?? dati.desc ?? name,
            desc: dati.desc ?? name,
            qta: dati.qta ?? dati.weight ?? qty,
            weight: dati.weight ?? dati.qta ?? qty,
            mealType: mealTypeCanonical,
            mealTime: mealDec,
            batchId,
            isEstimated: false,
          };
        }

        const qSafe = Math.max(5, qty);
        let kcal = Math.round(Number(it.estKcal));
        let prot = Number(it.estPro);
        let carb = Number(it.estCar);
        let fat = Number(it.estFat);
        if (!Number.isFinite(kcal) || kcal <= 0) {
          kcal = Math.max(10, Math.round((getAverageEstimate('kcal', name) / 100) * qSafe));
        }
        if (!Number.isFinite(prot) || prot < 0) {
          prot = (getAverageEstimate('prot', name) / 100) * qSafe;
        }
        if (!Number.isFinite(carb) || carb < 0) {
          carb = (getAverageEstimate('carb', name) / 100) * qSafe;
        }
        if (!Number.isFinite(fat) || fat < 0) {
          fat = (getAverageEstimate('fatTotal', name) / 100) * qSafe;
        }
        prot = Math.round(prot * 10) / 10;
        carb = Math.round(carb * 10) / 10;
        fat = Math.round(fat * 10) / 10;

        return {
          id: `${batchId}_food_${index}`,
          type: 'food',
          name,
          desc: name,
          qta: qSafe,
          weight: qSafe,
          kcal,
          cal: kcal,
          prot,
          carb,
          fat,
          fatTotal: fat,
          mealType: mealTypeCanonical,
          mealTime: mealDec,
          batchId,
          isEstimated: true,
        };
      });

      const totKcal = Math.round(entries.reduce((s, f) => s + (Number(f.kcal) || Number(f.cal) || 0), 0));
      const totPro = Math.round(entries.reduce((s, f) => s + (Number(f.prot) || 0), 0) * 10) / 10;
      const totCar = Math.round(entries.reduce((s, f) => s + (Number(f.carb) || 0), 0) * 10) / 10;
      const totFat =
        Math.round(entries.reduce((s, f) => s + (Number(f.fatTotal ?? f.fat) || 0), 0) * 10) / 10;

      const testo = `🎯 **Pasto Registrato**
- **Orario:** ${timeStr}
- **Kcal Totali:** ${totKcal}
- **Proteine:** ${totPro}g
- **Carboidrati:** ${totCar}g
- **Grassi:** ${totFat}g

Ottimo! Diario aggiornato. 🥗`;

      if (isSimulationMode) {
        setSimulatedLog((prev) => [...entries, ...(prev || [])]);
      } else {
        setDailyLog((prev) => {
          const next = [...entries, ...(prev || [])];
          syncDatiFirebase(next, manualNodesRef.current);
          return next;
        });
      }

      setChatHistory((prev) => {
        const withoutCard = prev.filter((m) => !m.mealProposal);
        return [...withoutCard, { sender: 'ai', text: testo }];
      });
    },
    [
      estraiDatiFoodDb,
      foodDb,
      getAverageEstimate,
      getCurrentTimeRoundedTo15Min,
      getGhostMealType,
      isSimulationMode,
      predictMealType,
      setDailyLog,
      setSimulatedLog,
      syncDatiFirebase,
    ]
  );

  const handleMealProposalCancel = useCallback(() => {
    setChatHistory((prev) => prev.filter((m) => !m.mealProposal));
  }, []);

  const handleMealProposalSwap = useCallback(
    (itemId) => {
      const safe = String(itemId ?? '').replace(/'/g, "'");
      handleChatSubmit(`Sostituisci l'ingrediente con ID: '${safe}'`, { fromInput: true });
    },
    [handleChatSubmit]
  );

  const handleDailyPlanConfirm = useCallback(
    (plan) => {
      if (!plan || typeof plan !== 'object') return;
      if (!tryAcquireMealConfirmGuard(dailyPlanMealConfirmGuardRef)) return;
      try {
      let workoutTime = plan.workoutTime != null && String(plan.workoutTime).trim() ? String(plan.workoutTime).trim() : null;
      if (!workoutTime && Array.isArray(plan.activities)) {
        const wRe = /allenament|workout|palestra|corr|run|pesi|cardio|yoga|hiit|spinning|nuot/i;
        const hit = plan.activities.find((a) => wRe.test(String(a?.desc || '')));
        if (hit?.time) workoutTime = String(hit.time).trim();
      }
      applyKentuChatCmd({
        target: plan.target,
        workoutTime: workoutTime || null,
      });
      const rawGhostList = Array.isArray(plan.ghostMeals) ? plan.ghostMeals : [];
      const ghostList = dedupeGhostMealsPayloadForConfirm(rawGhostList, (gm) => {
        const rawId = gm.id != null && String(gm.id).trim() !== '' ? String(gm.id).trim() : '';
        if (rawId) return `id:${rawId}`;
        const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
        const timeStr = gm.time != null ? String(gm.time) : '12:00';
        const dec = parseFlexibleTimeToDecimal(timeStr);
        const mealTime = dec != null && !Number.isNaN(dec) ? dec : 12;
        return `slot:${mt}|${Number(mealTime).toFixed(3)}`;
      });
      const batchTs = Date.now();
      const srcLog = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
      const nowDec = getNowDecimalHourForPlanMerge();
      const realMealsSet = buildPastOnlyRealMealTypeSet(srcLog, nowDec);
      const hasRealWorkout = (srcLog || []).some((n) => n && !n.isGhost && n.type === 'workout');
      const normalizeDailyPlanConflictTitle = (s) =>
        String(s || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const realTitles = new Set();
      (srcLog || []).forEach((n) => {
        if (!n || n.isGhost === true || n.type === 'ghost_meal' || n.type === 'ghost_workout') return;
        [n.desc, n.title, n.name].forEach((piece) => {
          const norm = normalizeDailyPlanConflictTitle(piece);
          if (norm.length >= 2) realTitles.add(norm);
        });
      });
      const baseLog = buildBaseLogForGhostPlanMerge(srcLog, ghostList, nowDec);
      const newGhostEntries = ghostList
        .filter((gm) => {
          const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
          if (realMealsSet.has(mt)) return false;
          const gTitle = normalizeDailyPlanConflictTitle(gm.title);
          if (gTitle && realTitles.has(gTitle)) return false;
          return true;
        })
        .map((gm, i) => {
          const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
          const timeStr = gm.time != null ? String(gm.time) : '12:00';
          const dec = parseFlexibleTimeToDecimal(timeStr);
          const mealTime = dec != null && !Number.isNaN(dec) ? dec : 12;
          const persistedDraftFoods = gm.draftFoods || [];
          const draftFoods = Array.isArray(persistedDraftFoods)
            ? persistedDraftFoods.map((x) => String(x).trim()).filter(Boolean)
            : [];
          let foodsArr = normalizeMealFoodsArray(mealFoodsRead(gm));
          if (foodsArr.length === 0 && draftFoods.length > 0) {
            foodsArr = normalizeMealFoodsArray(draftStringsToFoods(draftFoods));
          }
          const entry = {
            id: ghostMealLogEntryIdFromPayload(gm, i, batchTs),
            type: 'ghost_meal',
            mealType: mt,
            mealTime,
            title: String(gm.title || 'Pasto pianificato').trim(),
            microDesc: String(gm.microDesc || '').trim(),
            draftFoods,
            foods: foodsArr,
            isGhost: true,
          };
          return entry;
        });
      const seenDailyGhostIds = new Set();
      const uniqueDailyGhostEntries = newGhostEntries.filter((e) => {
        if (!e?.id || seenDailyGhostIds.has(e.id)) return false;
        seenDailyGhostIds.add(e.id);
        return true;
      });
      const logTimeKey = (e) => {
        if (!e) return 0;
        if (e.type === 'ghost_meal' || e.type === 'food' || e.type === 'recipe') {
          return Number(e.mealTime) || 0;
        }
        return Number(e.time ?? e.mealTime) || 0;
      };
      const mergedLog = [...baseLog, ...uniqueDailyGhostEntries].sort((a, b) => logTimeKey(a) - logTimeKey(b));
      const baseManual = (manualNodes || []).filter((n) => n && n.type !== 'ghost_workout');
      let mergedManual = [...baseManual].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
      if (!isSimulationMode && workoutTime && !hasRealWorkout) {
        const wDec = parseFlexibleTimeToDecimal(workoutTime);
        if (wDec != null && !Number.isNaN(wDec)) {
          mergedManual = [
            ...baseManual,
            {
              id: `ghost_workout_${Date.now()}`,
              type: 'ghost_workout',
              time: wDec,
              title: 'Allenamento Pianificato',
              isGhost: true,
            },
          ].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
        }
      }
      if (isSimulationMode) {
        setSimulatedLog(mergedLog);
      } else {
        setDailyLog(mergedLog);
        setManualNodes(mergedManual);
        syncDatiFirebase(mergedLog, mergedManual);
      }
      setChatHistory((prev) => {
        const withoutCard = prev.filter((m) => !m.dailyPlan);
        return [...withoutCard, { sender: 'ai', text: 'Piano confermato e caricato nel sistema.' }];
      });
      } finally {
        releaseMealConfirmGuard(dailyPlanMealConfirmGuardRef);
      }
    },
    [applyKentuChatCmd, dailyLog, manualNodes, syncDatiFirebase, isSimulationMode, simulatedLog, parseFlexibleTimeToDecimal, toCanonicalMealType]
  );

  const handleDailyPlanCancel = useCallback(() => {
    setChatHistory((prev) => prev.filter((m) => !m.dailyPlan));
  }, []);

  const handleGeneratePlanGhostMealDraft = useCallback(
    async ({
      mealType,
      time,
      title,
      microDesc,
      planTarget,
      aiMealConstraints,
      manualFoods,
      mealMacroResidual,
      mealMacroTargetTotal,
    }) => {
      const manualNorm = normalizeMealFoodsArray(manualFoods);
      const cov =
        manualNorm.length > 0
          ? manualNorm.reduce(
              (a, f) => ({
                kcal: a.kcal + (Number(f.kcal) || 0),
                prot: a.prot + (Number(f.prot) || 0),
                carb: a.carb + (Number(f.carb) || 0),
                fat: a.fat + (Number(f.fat) || 0),
              }),
              { kcal: 0, prot: 0, carb: 0, fat: 0 }
            )
          : null;
      const mt = mealMacroTargetTotal || {};
      const mr = mealMacroResidual || {};
      const manualBlock =
        manualNorm.length > 0
          ? `

ALIMENTI GIÀ INSERITI DALL'UTENTE (fissi: non modificare grammi, non rimuovere, non ripetere nel JSON):
${manualNorm.map((f) => `- ${f.qty}g ${f.name}`).join('\n')}

Target pasto complessivo (riferimento motore): ~${Math.round(Number(mt.kcal) || 0)} kcal, P${mt.prot}g, C${mt.carb}g, F${mt.fat}g.
Macro stimate dai fissi (se note): ~${Math.round(cov.kcal)} kcal, P${cov.prot.toFixed(1)}g, C${cov.carb.toFixed(1)}g, F${cov.fat.toFixed(1)}g.
RESIDUO da colmare SOLO con nuove voci nell'array "items" (o in draftFoods se usi il formato legacy): ~${Math.round(Number(mr.kcal) || 0)} kcal, P${mr.prot}g, C${mr.carb}g, F${mr.fat}g.

REGOLE CON FISSI:
- "items" / draftFoods devono contenere SOLO alimenti AGGIUNTIVI (nessun nome uguale o equivalente ai fissi).
- Se il residuo è trascurabile (es. kcal ≤ 30 e ogni macro residua ≤ 3 g), restituisci aggiunte vuote: {"items":[]} o draftFoods [].
- Se il residuo non è trascurabile: almeno 1 nuova voce, massimo 10 nuove voci.
`
          : '';

      const anchor = currentTrackerDate || getTodayString();
      const burnedKcalContext = (activeLog || [])
        .filter((item) => item && item.type === 'workout')
        .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
      const dynamicKcal =
        applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) + burnedKcalContext;
      const recent7 = buildLast7DaysMealLinesForDraftPrompt(fullHistory, anchor);
      const storicoBreve = buildRecentMealsContextForDinner(fullHistory, anchor);
      const dispensa = collectDispensaProbableFoods(fullHistory, anchor, 18, 7);
      const dbKeys = Object.keys(foodDb || {})
        .slice(0, 45)
        .join(', ');
      const oggiBreve = (activeLog || [])
        .filter((e) => e && (e.type === 'food' || e.type === 'recipe') && !e.isGhost)
        .map((e) => `${e.desc || e.title || '?'} (~${Math.round(Number(e.kcal || e.cal) || 0)} kcal)`)
        .slice(0, 20)
        .join('; ');
      const constraintsBlock = buildAiMealConstraintsPromptBlock(aiMealConstraints);
      const minVociRule =
        manualNorm.length > 0
          ? 'Con alimenti fissi: solo aggiunte nel JSON (vedi blocco sotto). Senza fissi: minimo 2 voci, massimo 10.'
          : 'Minimo 2 voci, massimo 10.';
      const prompt = `Sei Kentu (nutrizionista operativo). Rispondi SOLO con un JSON valido su una riga o un blocco, senza testo prima o dopo, senza markdown.
Formato preferito (voci strutturate con stime):
{"items":[{"name":"Riso basmati","qty":200,"estKcal":260,"estPro":5,"estCar":58,"estFat":0.6,"dbKey":""}]}
(dbKey opzionale: chiave da database se nota; altrimenti stringa vuota)

Formato legacy accettato:
{"draftFoods":["200g Riso basmati","120g Petto di pollo","10g Olio EVO"]}

Pasto pianificato (slot):
- mealType: ${String(mealType || '')}
- orario: ${String(time || '')}
- titolo: ${String(title || '')}
- microDesc / focus: ${String(microDesc || '')}
- target strategia giornata: ${String(planTarget || 'pari')}
- kcal giornaliere di riferimento (adattate): ~${Math.round(dynamicKcal)}

Gerarchia obbligatoria: (1) ultimi 3-7 giorni pasti simili; (2) storico più lungo; (3) dispensa + database; (4) combinazione nuova solo se necessario.
Ogni voce deve essere "grammi + nome" (es. 150g Tofu). ${minVociRule}
${constraintsBlock}
${manualBlock}

ULTIMI 7 GIORNI:
${recent7}

STORICO PASTI (sintesi 30gg):
${String(storicoBreve).slice(0, 2200)}

DISPENSA PROBABILE:
${dispensa}

OGGI GIÀ REGISTRATO:
${oggiBreve || 'niente'}

CHIAVI DB (subset):
${dbKeys || 'n/d'}`;

      const raw = await callGeminiAPIWithRotation(prompt);
      try {
        return parsePlanMealDraftAiResponse(raw);
      } catch (e) {
        throw new Error(e?.message ? `JSON non valido: ${e.message}` : 'Risposta AI non valida (piano pasto)');
      }
    },
    [
      activeLog,
      callGeminiAPIWithRotation,
      currentTrackerDate,
      foodDb,
      fullHistory,
      kentuDailyCalorieStrategy,
      userTargets,
    ]
  );

  const savePlanning = useCallback(
    async (dateStr, doc) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !db || !dateStr || isSimulationMode || !doc) return;
      try {
        await set(ref(db, `planning/${uid}/${dateStr}`), doc);
      } catch (e) {
        console.warn('savePlanning:', e);
      }
    },
    [auth, db, isSimulationMode]
  );

  const handlePlanningWizardConfirm = useCallback(
    (payload) => {
      if (!payload || typeof payload !== 'object') return;
      if (!tryAcquireMealConfirmGuard(planningWizardMealConfirmGuardRef)) return;
      try {
      const rawGhostList = Array.isArray(payload.ghostMeals) ? payload.ghostMeals : [];
      const ghostList = dedupeGhostMealsPayloadForConfirm(rawGhostList, (gm) => {
        const rawId = gm.id != null && String(gm.id).trim() !== '' ? String(gm.id).trim() : '';
        if (rawId) return `id:${rawId}`;
        const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
        const mealTime =
          typeof gm.mealTime === 'number' && !Number.isNaN(gm.mealTime)
            ? gm.mealTime
            : parseFlexibleTimeToDecimal(String(gm.time || '12:00')) ?? 12;
        return `slot:${mt}|${Number(mealTime).toFixed(3)}`;
      });
      const batchTs = Date.now();
      const srcLog = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
      const nowDec = getNowDecimalHourForPlanMerge();
      const realMealsSet = buildPastOnlyRealMealTypeSet(srcLog, nowDec);
      const hasRealWorkout = (srcLog || []).some((n) => n && !n.isGhost && n.type === 'workout');
      const normalizeDailyPlanConflictTitle = (s) =>
        String(s || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const realTitles = new Set();
      (srcLog || []).forEach((n) => {
        if (!n || n.isGhost === true || n.type === 'ghost_meal' || n.type === 'ghost_workout') return;
        [n.desc, n.title, n.name].forEach((piece) => {
          const norm = normalizeDailyPlanConflictTitle(piece);
          if (norm.length >= 2) realTitles.add(norm);
        });
      });
      const baseLog = buildBaseLogForGhostPlanMerge(srcLog, ghostList, nowDec);
      const newGhostEntries = ghostList
        .filter((gm) => {
          const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
          if (realMealsSet.has(mt)) return false;
          const gTitle = normalizeDailyPlanConflictTitle(gm.title);
          if (gTitle && realTitles.has(gTitle)) return false;
          return true;
        })
        .map((gm, i) => {
          const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
          const mealTime =
            typeof gm.mealTime === 'number' && !Number.isNaN(gm.mealTime)
              ? gm.mealTime
              : parseFlexibleTimeToDecimal(String(gm.time || '12:00')) ?? 12;
          let foodsArr = normalizeMealFoodsArray(mealFoodsRead(gm));
          if (foodsArr.length === 0 && Array.isArray(gm.draftFoods)) {
            const objs = gm.draftFoods.filter((x) => x && typeof x === 'object' && (x.name || x.desc));
            if (objs.length > 0) {
              foodsArr = normalizeMealFoodsArray(objs);
            } else {
              const strOnly = gm.draftFoods
                .map((x) => (typeof x === 'string' ? String(x).trim() : ''))
                .filter(Boolean);
              if (strOnly.length > 0) {
                foodsArr = normalizeMealFoodsArray(draftStringsToFoods(strOnly));
              }
            }
          }
          const persistedDraftFoods = gm.draftFoods || [];
          let draftFoods = [];
          if (foodsArr.length > 0) {
            draftFoods = foodsArr.map((f) => {
              if (typeof f === 'string') return f.trim();
              if (f && typeof f === 'object') {
                const name = String(f.name || '').trim();
                const q = Math.round(Number(f.qty) || 0);
                return q > 0 ? `${q}g ${name}` : name;
              }
              return '';
            }).filter(Boolean);
          } else if (Array.isArray(persistedDraftFoods)) {
            draftFoods = persistedDraftFoods
              .map((x) => {
                if (typeof x === 'string') return x.trim();
                if (x && typeof x === 'object') {
                  const name = String(x.name || x.desc || '').trim();
                  const q = x.qty != null ? Math.round(Number(x.qty) || 0) : null;
                  return q ? `${q}g ${name}` : name;
                }
                return '';
              })
              .filter(Boolean);
          }
          const entry = {
            id: ghostMealLogEntryIdFromPayload(gm, i, batchTs),
            type: 'ghost_meal',
            mealType: mt,
            mealTime,
            title: String(gm.title || 'Pasto pianificato').trim(),
            microDesc: String(gm.microDesc || '').trim(),
            draftFoods,
            foods: foodsArr,
            isGhost: true,
          };
          return entry;
        });
      const seenGhostEntryIds = new Set();
      const uniqueGhostEntries = newGhostEntries.filter((e) => {
        if (!e?.id || seenGhostEntryIds.has(e.id)) return false;
        seenGhostEntryIds.add(e.id);
        return true;
      });
      const logTimeKey = (e) => {
        if (!e) return 0;
        if (e.type === 'ghost_meal' || e.type === 'food' || e.type === 'recipe') {
          return Number(e.mealTime) || 0;
        }
        return Number(e.time ?? e.mealTime) || 0;
      };
      const mergedLog = [...baseLog, ...uniqueGhostEntries].sort((a, b) => logTimeKey(a) - logTimeKey(b));

      const baseManual = (manualNodes || []).filter((n) => n && n.type !== 'ghost_workout');
      let mergedManual = [...baseManual].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
      const workoutTimesRaw = Array.isArray(payload.workoutTimesDec)
        ? payload.workoutTimesDec
        : typeof payload.workoutTimeDec === 'number' && !Number.isNaN(payload.workoutTimeDec)
          ? [payload.workoutTimeDec]
          : [];
      const workoutTimes = [...new Set(workoutTimesRaw.filter((x) => typeof x === 'number' && !Number.isNaN(x)))].sort(
        (a, b) => a - b
      );
      if (!isSimulationMode && payload.addGhostWorkout && workoutTimes.length > 0 && !hasRealWorkout) {
        const ghostWos = workoutTimes.map((t, idx) => ({
          id: `ghost_workout_${batchTs}_${idx}`,
          type: 'ghost_workout',
          time: t,
          title: 'Allenamento Pianificato',
          isGhost: true,
        }));
        mergedManual = [...baseManual, ...ghostWos].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
      }

      if (isSimulationMode) {
        setSimulatedLog(mergedLog);
      } else {
        setDailyLog(mergedLog);
        setManualNodes(mergedManual);
        syncDatiFirebase(mergedLog, mergedManual);
        if (auth.currentUser?.uid) {
          const planningDoc = buildPlanningFirebaseDoc(payload);
          void savePlanning(currentTrackerDate, planningDoc);
        }
      }
      setPlanningWizardOverlayOpen(false);
      } finally {
        releaseMealConfirmGuard(planningWizardMealConfirmGuardRef);
      }
    },
    [
      auth,
      currentTrackerDate,
      dailyLog,
      manualNodes,
      savePlanning,
      syncDatiFirebase,
      isSimulationMode,
      simulatedLog,
      parseFlexibleTimeToDecimal,
      toCanonicalMealType,
    ]
  );

  const planningWizardBurnedKcal = useMemo(
    () =>
      (activeLog || []).filter((i) => i && i.type === 'workout').reduce((a, w) => a + (Number(w.kcal || w.cal) || 0), 0),
    [activeLog]
  );

  /** Pasti pianificati salvati su RTDB (`planning/.../meals`) → idratazione slot Step 2 nel PlanningWizard. */
  const planningWizardInitialMeals = useMemo(() => {
    const rows = remotePlanning?.meals;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows;
  }, [remotePlanning]);

  const waterProgress = Math.min((waterIntake / dailyWaterGoal) * 100, 100);
  
  const foodsLog = activeLog.filter(item => item.type === 'food' || item.type === 'recipe');
  const groupedFoods = foodsLog.reduce((acc, food) => {
    const typeKey = food.mealType || 'pasto';
    const timeKey =
      typeof food.mealTime === 'number' && !Number.isNaN(food.mealTime)
        ? String(food.mealTime)
        : 'unknown';
    const slotKey = `${typeKey}_${timeKey}`;
    (acc[slotKey] = acc[slotKey] || []).push(food);
    return acc;
  }, {});
  
  const workoutsLog = activeLog.filter(item => item.type === 'workout');

  const todayStr = getTodayString();

  const selectedDayData = useMemo(() => {
    if (!selectedHistoryDate || !fullStorico) return null;
    const node = fullStorico[TRACKER_STORICO_KEY(selectedHistoryDate)];
    if (!node) return null;
    const raw = node.log ?? [];
    const log = Array.isArray(raw) ? raw : Object.values(raw || {});
    let calorie = 0, proteine = 0, workoutKcal = 0;
    log.forEach(entry => {
      if (entry.type === 'meal' && entry.items) {
        entry.items.forEach(item => { 
          proteine += item.prot || 0; 
          calorie += (item.cal || item.kcal) || 0; 
        });
      } else if (entry.type === 'single' || !entry.type) {
        proteine += entry.prot || 0;
        calorie += (entry.cal || entry.kcal) || 0;
      } else if (entry.type === 'workout') {
        workoutKcal += (entry.cal || entry.kcal) || 0;
      }
    });
    const giornoSettimana = new Date(selectedHistoryDate).getDay();
    const piano = PIANO_SETTIMANALE[giornoSettimana] ?? PIANO_SETTIMANALE[1];
    const obiettivo = piano.cal + workoutKcal;
    const deficit = Math.round(calorie - obiettivo);
    return { log, calorie, proteine, workoutKcal, deficit };
  }, [fullStorico, selectedHistoryDate]);

  const pastDaysStorico = useMemo(() => {
    if (!fullStorico || typeof fullStorico !== 'object') return [];
    const keys = Object.keys(fullStorico).filter(k => k.startsWith('trackerStorico_'));
    const dates = keys.map(k => k.replace('trackerStorico_', '')).filter(d => d !== todayStr);
    dates.sort((a, b) => new Date(b) - new Date(a));
    return dates.map(dataStr => {
      const node = fullStorico[TRACKER_STORICO_KEY(dataStr)];
      const raw = node?.log ?? [];
      const log = Array.isArray(raw) ? raw : Object.values(raw || {});
      let calorie = 0, proteine = 0, workoutKcal = 0;
      log.forEach(entry => {
        if (entry.type === 'meal' && entry.items) {
          entry.items.forEach(item => { 
            proteine += item.prot || 0; 
            calorie += (item.cal || item.kcal) || 0; 
          });
        } else if (entry.type === 'single' || !entry.type) {
          proteine += entry.prot || 0;
          calorie += (entry.cal || entry.kcal) || 0;
        } else if (entry.type === 'workout') {
          workoutKcal += (entry.cal || entry.kcal) || 0;
        }
      });
      const giornoSettimana = new Date(dataStr).getDay();
      const piano = PIANO_SETTIMANALE[giornoSettimana] ?? PIANO_SETTIMANALE[1];
      const obiettivo = piano.cal + workoutKcal;
      const deficit = Math.round(calorie - obiettivo);
      return { dataStr, log, calorie, proteine, workoutKcal, deficit, note: node?.note };
    });
  }, [fullStorico, todayStr]);

  /** Cibi mangiati ieri nello stesso pasto (stesso mealType) per suggerimenti inserimento fulmineo */
  const abitudiniIeri = useMemo(() => {
    if (!fullStorico || !mealType) return [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const node = fullStorico[TRACKER_STORICO_KEY(yesterdayStr)];
    const raw = node?.log ?? node?.dati?.log ?? [];
    const logArr = Array.isArray(raw) ? raw : Object.values(raw || {});
    const normalized = normalizeLogData(logArr);
    const equivalents = getEquivalentMealTypes(mealType);
    return normalized.filter(item => (item.type === 'food' || item.type === 'recipe') && equivalents.includes(item.mealType));
  }, [fullStorico, mealType]);

  const weeklyTrendData = useMemo(() => {
    return [...pastDaysStorico].slice(0, 7).reverse().map(d => {
      const prevDate = new Date(d.dataStr + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = prevDate.toISOString().slice(0, 10);
      const prevNode = fullStorico?.[TRACKER_STORICO_KEY(prevStr)];
      const prevLog = Array.isArray(prevNode?.log) ? prevNode.log : Object.values(prevNode?.log || {});
      const prevFood = prevLog.filter(i => (i?.type === 'food' || i?.type === 'recipe') && i?.mealTime != null);
      const todayFood = (d.log || []).filter(i => (i?.type === 'food' || i?.type === 'recipe') && i?.mealTime != null);
      const lastMealPrev = prevFood.length ? Math.max(...prevFood.map(i => i.mealTime)) : null;
      const firstMealToday = todayFood.length ? Math.min(...todayFood.map(i => i.mealTime)) : null;
      let maxFastingHours = null;
      if (lastMealPrev != null && firstMealToday != null) {
        maxFastingHours = (24 - lastMealPrev) + firstMealToday;
      }
      return { ...d, shortDate: d.dataStr.substring(5), maxFastingHours };
    });
  }, [pastDaysStorico, fullStorico]);

  const weeklyMicrosTotals = useMemo(() => {
    const totals = { fatTotal: 0, omega3: 0, omega6: 0, vitA: 0, vitD: 0, vitE: 0, vitK: 0, vitB12: 0 };
    const last7 = pastDaysStorico.slice(0, 7);
    last7.forEach(day => {
      (day.log || []).forEach(entry => {
        const sumItem = (item) => {
          totals.fatTotal += (Number(item.fatTotal) || 0);
          totals.omega3 += (Number(item.omega3) || 0);
          totals.omega6 += (Number(item.omega6) || 0);
          totals.vitA += (Number(item.vitA) || 0);
          totals.vitD += (Number(item.vitD) || 0);
          totals.vitE += (Number(item.vitE) || 0);
          totals.vitK += (Number(item.vitK) || 0);
          totals.vitB12 += (Number(item.vitB12) || 0);
        };
        if (entry.type === 'meal' && entry.items) {
          entry.items.forEach(sumItem);
        } else if (entry.type === 'food' || entry.type === 'single' || !entry.type) {
          sumItem(entry);
        }
      });
    });
    return totals;
  }, [pastDaysStorico]);

  const weeklyKcalChartReference = useMemo(() => {
    const k = Number(userTargets?.kcal);
    if (Number.isFinite(k) && k > 0) return k;
    return STRATEGY_PROFILES[dayProfile]?.kcal ?? 2300;
  }, [userTargets?.kcal, dayProfile]);

  const getNutrientSources = (nutrientKey, target, isWeekly = false) => {
    const sources = {};
    const processEntry = (entry) => {
      const amount = Number(entry[nutrientKey]) || 0;
      if (amount > 0) {
        const name = (entry.desc || entry.name || 'Sconosciuto').trim();
        sources[name] = (sources[name] || 0) + amount;
      }
    };
    const logsToProcess = isWeekly
      ? pastDaysStorico.slice(0, 7).flatMap(d => d.log || [])
      : activeLog;
    logsToProcess.forEach(entry => {
      if (entry.type === 'meal' && entry.items) {
        entry.items.forEach(processEntry);
      } else if (entry.type === 'food' || entry.type === 'single' || !entry.type) {
        processEntry(entry);
      }
    });
    return Object.keys(sources).map(name => {
      const amount = sources[name];
      const percent = target > 0 ? (amount / target) * 100 : 0;
      return { name, amount, percent };
    }).sort((a, b) => b.amount - a.amount);
  };

  // Renderizzatore Barre Telemetria
  const renderProgressBar = (label, current, target, unit = 'g', nutrientKey = null) => {
    const c = Number(current) ?? 0;
    const t = Number(target) ?? 0;
    const p = t > 0 ? Math.min((c / t) * 100, 100) : 0;
    const color = p >= 100 ? '#00e676' : p > 50 ? '#00e5ff' : '#ff6d00';
    return (
      <div
        style={{ marginBottom: '12px', cursor: nutrientKey ? 'pointer' : 'default', transition: 'transform 0.2s' }}
        onClick={() => nutrientKey && setNutrientModal({ label, key: nutrientKey, target: t, unit, isWeekly: false })}
        onMouseEnter={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1.02)')}
        onMouseLeave={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#aaa', marginBottom: '4px' }}>
          <span>{label}</span>
          <span>{Math.round(c)} / {Math.round(t)} {unit}</span>
        </div>
        <div style={{ height: '12px', background: '#333', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: '6px', transition: 'width 0.5s' }}></div>
        </div>
      </div>
    );
  };

  const renderRatioBar = (title, labelA, valA, labelB, valB, idealText, isGood) => {
    const vA = Number(valA) || 0;
    const vB = Number(valB) || 0;
    const total = vA + vB;
    const percentA = total > 0 ? (vA / total) * 100 : 50;
    return (
      <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#aaa', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          <span>{title}</span>
          <span style={{ color: isGood ? '#00e676' : '#ffea00' }}>{idealText}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 'bold' }}>
          <span style={{ color: '#ff6d00' }}>{labelA}: {Math.round(vA)}</span>
          <span style={{ color: '#00e5ff' }}>{labelB}: {Math.round(vB)}</span>
        </div>
        <div style={{ height: '8px', background: '#00e5ff', borderRadius: '4px', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
          <div style={{ width: `${percentA}%`, background: '#ff6d00', transition: 'width 0.5s', borderRight: '2px solid #111' }}></div>
        </div>
      </div>
    );
  };

  const renderWeeklyBar = (label, current, dailyTarget, unit, nutrientKey = null) => {
    const target = (Number(dailyTarget) || 1) * 7;
    const percent = Math.min((current / target) * 100, 100);
    const isOver = current > target * 1.5;
    return (
      <div
        key={label}
        style={{ marginBottom: '10px', cursor: nutrientKey ? 'pointer' : 'default', transition: 'transform 0.2s' }}
        onClick={() => nutrientKey && setNutrientModal({ label, key: nutrientKey, target, unit, isWeekly: true })}
        onMouseEnter={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1.02)')}
        onMouseLeave={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>
          <span>{label}</span>
          <span style={{ color: isOver ? '#ff3d00' : '#ccc' }}>{Math.round(current)} / {Math.round(target)} {unit}</span>
        </div>
        <div style={{ height: '5px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: isOver ? '#ff3d00' : (percent >= 100 ? '#00e676' : '#b388ff'), transition: 'width 0.5s' }}></div>
        </div>
      </div>
    );
  };

  const renderMiniBar = (label, current, target, color) => {
    const percent = Math.min((current / (target || 1)) * 100, 100);
    const isOver = current > target * 1.1;
    return (
      <div key={label} style={{ flex: '1 1 45%', minWidth: '120px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#888', marginBottom: '4px' }}>
          <span>{label}</span>
          <span style={{ color: isOver ? '#ff3d00' : '#ccc' }}>{Math.round(current)} / {Math.round(target)}</span>
        </div>
        <div style={{ height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: isOver ? '#ff3d00' : color, transition: 'width 0.3s' }}></div>
        </div>
      </div>
    );
  };

  const renderLiveProgressBar = (label, currentDaily, mealAddition, dailyTarget, unit, color) => {
    const current = Number(currentDaily) || 0;
    const addition = Number(mealAddition) || 0;
    const target = Number(dailyTarget) || 1;
    const currentPercent = Math.min((current / target) * 100, 100);
    const additionPercent = Math.min((addition / target) * 100, 100 - currentPercent);
    const isOverflow = current + addition > target;
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px', fontWeight: 'bold' }}>
          <span style={{ color: color }}>{label.toUpperCase()}</span>
          <span>
            {current.toFixed(1)} <span style={{ color, filter: 'brightness(1.5)' }}>+{addition.toFixed(1)}</span> / {target} {unit}
          </span>
        </div>
        <div style={{ height: '12px', background: '#1a1a1a', borderRadius: '6px', overflow: 'hidden', display: 'flex', border: '1px solid #333' }}>
          <div style={{ width: `${currentPercent}%`, background: '#444', transition: 'width 0.3s' }}></div>
          {addition > 0 && (
            <div className={`live-bar-addition ${isOverflow ? 'live-bar-overflow' : ''}`} style={{ width: `${Math.max(2, additionPercent)}%`, backgroundColor: isOverflow ? '#ff1744' : color, color: isOverflow ? '#ff1744' : color }}></div>
          )}
        </div>
        {isOverflow && <div style={{ fontSize: '0.65rem', color: '#ff1744', marginTop: '4px', textAlign: 'right' }}>⚠️ Superato limite giornaliero</div>}
      </div>
    );
  };

  // ========================================================
  // SCHERMATA PRINCIPALE VYTA — Curva ideale dinamica (GPS) — Hooks prima del bivio login
  // ========================================================
  const yesterdayEnergyAt24 = useMemo(() => {
    if (currentTrackerDate !== getTodayString() || !fullHistory || typeof fullHistory !== 'object') return null;
    const yesterday = new Date(currentTrackerDate + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const node = fullHistory[TRACKER_STORICO_KEY(yesterdayStr)];
    if (!node?.log) return null;
    const raw = node.log;
    const yesterdayLog = normalizeLogData(Array.isArray(raw) ? raw : Object.values(raw));
    const mealTypesToStrategy = {
      colazione: 'colazione',
      merenda1: 'colazione',
      snack: 'snack',
      merenda_am: 'snack',
      merenda_pm: 'snack',
      merenda2: 'snack',
      spuntino: 'snack',
      pranzo: 'pranzo',
      cena: 'cena',
    };
    const yesterdayNodes = [];
    yesterdayLog.forEach(entry => {
      if (entry?.type === 'food' || entry?.type === 'recipe') {
        const t = typeof entry.mealTime === 'number' ? entry.mealTime : 12;
        const base = entry.mealType?.split('_')[0];
        const strategyKey = mealTypesToStrategy[base] || toCanonicalMealType(base) || 'cena';
        yesterdayNodes.push({ type: 'meal', time: t, strategyKey, kcal: entry.kcal ?? entry.cal ?? 0 });
      } else if (entry?.type === 'workout' || entry?.type === 'work') {
        yesterdayNodes.push({ type: 'workout', time: entry.time ?? entry.mealTime ?? 12, duration: entry.duration ?? 1, kcal: entry.kcal ?? entry.cal ?? 300 });
      }
    });
    const yesterdaySleep = yesterdayLog.find(e => e?.type === 'sleep');
    if (yesterdaySleep) {
      const sleepHours = yesterdaySleep.hours ?? yesterdaySleep.duration ?? yesterdaySleep.sleepHours ?? 7;
      const deepMin = yesterdaySleep.deepMin ?? yesterdaySleep.deepMinutes ?? (typeof yesterdaySleep.deep === 'number' ? yesterdaySleep.deep : 60);
      const remMin = yesterdaySleep.remMin ?? yesterdaySleep.remMinutes ?? (typeof yesterdaySleep.rem === 'number' ? yesterdaySleep.rem : 60);
      yesterdayNodes.push({
        id: 'sleep',
        type: 'sleep',
        time: yesterdaySleep.wakeTime ?? 7,
        duration: sleepHours,
        hours: sleepHours,
        wakeTime: yesterdaySleep.wakeTime ?? 7,
        deepMin,
        remMin,
        sleepStart: yesterdaySleep.sleepStart
      });
    }
    const result = generateRealEnergyData(yesterdayNodes, yesterdayLog, idealStrategy, 0, 2500, null, null, userModel, 30, null, accumuloSNC);
    const last = result?.chartData?.[24];
    if (!last) return null;
    return { energy: last.energy, idealEnergy: last.idealEnergy };
  }, [currentTrackerDate, fullHistory, idealStrategy, userModel, accumuloSNC]);

  const sleepStatus = getSleepStatus(activeLog);
  const activeWaterIntake = simulationMode ? activeNodes.filter(n => n.type === 'water').reduce((acc, n) => acc + (n.ml ?? n.amount ?? 0), 0) : waterIntake;
  const energySimulation = useMemo(() => {
    if (sleepStatus === 'NIGHT_PENDING') {
      return LONGEVITY_NIGHT_PENDING_ENERGY_SIM;
    }
    return generateRealEnergyData(
      nodesForEnergySimulation,
      dailyLogForEnergy,
      idealStrategy,
      activeWaterIntake,
      dailyWaterGoal,
      yesterdayEnergyAt24?.energy ?? undefined,
      yesterdayEnergyAt24?.idealEnergy ?? undefined,
      userModel,
      nervousSystemLoad,
      currentTime,
      accumuloSNC
    );
  }, [
    sleepStatus,
    nodesForEnergySimulation,
    dailyLogForEnergy,
    idealStrategy,
    activeWaterIntake,
    dailyWaterGoal,
    yesterdayEnergyAt24,
    userModel,
    nervousSystemLoad,
    currentTime,
    accumuloSNC
  ]);
  const chartDataCommitted = energySimulation?.chartData ?? EMPTY_ENERGY_CHART_DATA;
  const chartData = timelineStripPreview?.chartData ?? chartDataCommitted;

  const timelineEnergySeries = useMemo(
    () =>
      (chartData || [])
        .map((p) => {
          const t = p?.time ?? p?.hour;
          const time = typeof t === 'number' && Number.isFinite(t) ? t : null;
          const energy = typeof p?.energy === 'number' && Number.isFinite(p.energy) ? p.energy : null;
          return time != null && energy != null ? { time, energy } : null;
        })
        .filter(Boolean),
    [chartData]
  );

  timelineStripPreviewDepsRef.current = {
    nodesForEnergySimulation,
    dailyLogForEnergy,
    manualNodes,
    getFoodItemsForMealSlot,
    idealStrategy,
    activeWaterIntake,
    dailyWaterGoal,
    yesterdayEnergyAt24,
    userModel,
    nervousSystemLoad,
    currentTime,
    accumuloSNC,
    sleepStatus,
    isSimulationMode,
  };

  const clearTimelineStripEnergyPreview = useCallback(() => {
    if (timelineStripPreviewDebounceRef.current != null) {
      window.clearTimeout(timelineStripPreviewDebounceRef.current);
      timelineStripPreviewDebounceRef.current = null;
    }
    timelineStripPreviewLatestRef.current = null;
    timelineStripPreviewGenRef.current += 1;
    setTimelineStripPreview(null);
  }, []);

  const onTimelineStripPreviewDragStart = useCallback(() => {
    timelineStripPreviewDisabledRef.current = false;
    timelineStripPreviewSlowRef.current = 0;
    timelineStripPreviewGenRef.current += 1;
  }, []);

  const scheduleTimelineStripEnergyPreview = useCallback(
    (dragNodeId, hourDecimal) => {
      if (isSimulationMode || sleepStatus === 'NIGHT_PENDING') return;
      timelineStripPreviewLatestRef.current = { id: dragNodeId, hour: hourDecimal };
      if (timelineStripPreviewDebounceRef.current != null) {
        window.clearTimeout(timelineStripPreviewDebounceRef.current);
      }
      timelineStripPreviewDebounceRef.current = window.setTimeout(() => {
        timelineStripPreviewDebounceRef.current = null;
        const token = timelineStripPreviewGenRef.current;
        window.requestAnimationFrame(() => {
          if (token !== timelineStripPreviewGenRef.current) return;
          const d = timelineStripPreviewDepsRef.current;
          if (!d || d.isSimulationMode || d.sleepStatus === 'NIGHT_PENDING') return;
          if (timelineStripPreviewDisabledRef.current) return;
          const pending = timelineStripPreviewLatestRef.current;
          if (!pending || pending.id == null) return;

          const merged = applyTimelineStripHourToPreviewInputs(
            pending.id,
            pending.hour,
            d.nodesForEnergySimulation,
            d.dailyLogForEnergy,
            d.getFoodItemsForMealSlot,
            d.manualNodes
          );
          if (!merged) {
            if (token === timelineStripPreviewGenRef.current) setTimelineStripPreview(null);
            return;
          }

          const t0 = performance.now();
          let sim;
          try {
            sim = generateRealEnergyData(
              merged.nodes,
              merged.log,
              d.idealStrategy,
              d.activeWaterIntake,
              d.dailyWaterGoal,
              d.yesterdayEnergyAt24?.energy ?? undefined,
              d.yesterdayEnergyAt24?.idealEnergy ?? undefined,
              d.userModel,
              d.nervousSystemLoad,
              d.currentTime,
              d.accumuloSNC
            );
          } catch {
            return;
          }
          const dt = performance.now() - t0;
          if (dt > 55) {
            timelineStripPreviewSlowRef.current += 1;
            if (timelineStripPreviewSlowRef.current >= 2) {
              timelineStripPreviewDisabledRef.current = true;
              if (token === timelineStripPreviewGenRef.current) setTimelineStripPreview(null);
              return;
            }
          }
          if (token !== timelineStripPreviewGenRef.current) return;

          let cal;
          try {
            cal = generateCalorieTimeline(merged.log);
          } catch {
            cal = { calorieTimeline: [], totalCalories: 0 };
          }
          setTimelineStripPreview({
            chartData: sim.chartData,
            calorieTimeline: cal.calorieTimeline,
            totalCalories: cal.totalCalories,
          });
        });
      }, 24);
    },
    [isSimulationMode, sleepStatus]
  );

  /** Input giornaliero per computeLongevityScore (allineato a chart, totali, rischio matrix, acqua). */
  const longevityPayload = useMemo(() => {
    const nutritionTotals =
      totali && typeof totali === 'object'
        ? {
            ...totali,
            fat: totali.fat != null && totali.fat > 0 ? totali.fat : (totali.fatTotal ?? 0)
          }
        : computeTotali(activeLog || []);

    const stressPts = (chartData || [])
      .map(p => computeMetabolicStress(p))
      .filter(v => typeof v === 'number' && !Number.isNaN(v));
    const metabolicStressVal = stressPts.length
      ? Math.round(stressPts.reduce((a, b) => a + b, 0) / stressPts.length)
      : undefined;

    const riskBadness =
      longevityData != null && typeof longevityData.masterScore === 'number'
        ? Math.max(0, Math.min(100, 100 - longevityData.masterScore))
        : undefined;

    const sleepEntry = (activeLog || []).find(e => e?.type === 'sleep');
    const sleepHoursRaw = sleepEntry
      ? Number(sleepEntry.hours ?? sleepEntry.duration ?? sleepEntry.sleepHours ?? NaN)
      : NaN;
    const sleepHours = !Number.isNaN(sleepHoursRaw) ? sleepHoursRaw : undefined;

    const payload = {
      totals: nutritionTotals,
      nutrition: nutritionTotals,
      targets: {
        kcal: targetKcal,
        prot: userTargets?.prot ?? DEFAULT_TARGETS.prot,
        carb: userTargets?.carb ?? DEFAULT_TARGETS.carb,
        fat: userTargets?.fat ?? userTargets?.fatTotal ?? DEFAULT_TARGETS.fatTotal
      },
      metabolicStress: metabolicStressVal,
      stress: metabolicStressVal,
      risk: riskBadness ?? 50,
      hydration: activeWaterIntake,
      hydrationTarget: dailyWaterGoal,
      energySeries: (chartData || []).map(p => p.energy).filter(v => typeof v === 'number' && !Number.isNaN(v))
    };

    if (sleepHours !== undefined) {
      payload.sleepHours = sleepHours;
    } else {
      payload.sleepScore =
        sleepStatus === 'OK'
          ? 80
          : sleepStatus === 'NIGHT_PENDING'
            ? 45
            : sleepStatus === 'NO_DATA'
              ? DEFAULT_NO_SLEEP_ENERGY
              : 55;
    }

    return payload;
  }, [
    activeLog,
    userTargets,
    targetKcal,
    totali,
    energySimulation,
    activeWaterIntake,
    dailyWaterGoal,
    sleepStatus,
    longevityData
  ]);

  const longevityEngineScore = useMemo(
    () => computeLongevityScore(longevityPayload),
    [longevityPayload]
  );

  const longevityExplanation = useMemo(
    () => buildLongevityExplanation(longevityEngineScore),
    [longevityEngineScore]
  );

  const userAge = calculateAge(birthDate);

  /** Punteggi giornalieri (matrice rischi su singolo giorno) prima del giorno ancorato al tracker, per media mobile età proiettata. */
  const longevityScoreHistory = useMemo(() => {
    if (!fullHistory || !userTargets) return [];
    const anchor = currentTrackerDate || getTodayString();
    const maxLookback = 120;
    const out = [];
    for (let k = 1; k < maxLookback; k++) {
      const dStr = addDays(anchor, -k);
      const log = getLogFromStoricoTree(fullHistory, dStr) || [];
      const dayNode = fullHistory[TRACKER_STORICO_KEY(dStr)];
      const manualNodes = Array.isArray(dayNode?.manualNodes) ? dayNode.manualNodes : [];
      if (log.length === 0 && manualNodes.length === 0) continue;
      const matrix = computeRiskMatrix(fullHistory, userTargets, 1, addDays(dStr, 1));
      const score = computeLongevityMasterScoreFromMatrix(matrix);
      if (score == null || Number.isNaN(score)) continue;
      const ts = new Date(`${dStr}T12:00:00`).getTime();
      out.push({ date: dStr, score, timestamp: ts });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [fullHistory, userTargets, currentTrackerDate]);

  /** Punteggio “oggi” (giorno tracker): motore longevità se calendario = oggi, altrimenti matrice su quel giorno. */
  const longevityTodayScore = useMemo(() => {
    if (!fullHistory || !userTargets) return 0;
    if (currentTrackerDate === getTodayString()) {
      const s = longevityEngineScore?.score;
      if (typeof s === 'number' && !Number.isNaN(s)) return s;
    }
    const matrix = computeRiskMatrix(fullHistory, userTargets, 1, addDays(currentTrackerDate, 1));
    const m = computeLongevityMasterScoreFromMatrix(matrix);
    return typeof m === 'number' && !Number.isNaN(m) ? m : 0;
  }, [currentTrackerDate, longevityEngineScore, fullHistory, userTargets]);

  const homeLongevityInsightLine = useMemo(() => {
    const t = longevityEngineScore?.priorityFocus?.title;
    if (typeof t === 'string' && t.trim()) return t.trim();
    const ex = (longevityExplanation || '').trim();
    if (!ex) return '';
    const parts = ex.split(/(?<=[.!?])\s+/);
    return (parts[0] || ex).trim();
  }, [longevityEngineScore?.priorityFocus?.title, longevityExplanation]);

  const dailyReportDisplay = useMemo(() => {
    if (!dailyReport) return null;
    const neuroVal = dailyReport.neuro;
    const neuroScore = typeof neuroVal === 'object' ? neuroVal.score : neuroVal;
    const neuroReasonBase = typeof neuroVal === 'object' ? neuroVal.reason : '';
    if (!chartData || chartData.length === 0) return dailyReport;
    const minIdr = Math.min(...chartData.map(p => p.idratazione ?? 100));
    const neuroMalus = !isWaterHydrationAutoPilot && minIdr < 45 ? 1 : 0;
    const neuroReason = neuroMalus
      ? (neuroReasonBase ? `${neuroReasonBase} DISIDRATAZIONE: Il cervello ha lavorato in condizioni di stress osmotico.` : 'DISIDRATAZIONE: Il cervello ha lavorato in condizioni di stress osmotico.')
      : neuroReasonBase;
    return {
      ...dailyReport,
      neuro: { score: Math.max(0, neuroScore - neuroMalus), reason: neuroReason }
    };
  }, [dailyReport, chartData, isWaterHydrationAutoPilot]);
  const realTotals = energySimulation?.realTotals ?? {};
  const hasCrashRisk = energySimulation?.hasCrashRisk ?? false;
  const hasCortisolRisk = energySimulation?.hasCortisolRisk ?? false;
  const hasDigestionRisk = energySimulation?.hasDigestionRisk ?? false;

  const { calorieTimeline: calorieTimelineData, totalCalories: totalCaloriesTimeline } = useMemo(() => {
    if (
      timelineStripPreview?.calorieTimeline != null &&
      Array.isArray(timelineStripPreview.calorieTimeline)
    ) {
      return {
        calorieTimeline: timelineStripPreview.calorieTimeline,
        totalCalories:
          typeof timelineStripPreview.totalCalories === 'number' && !Number.isNaN(timelineStripPreview.totalCalories)
            ? timelineStripPreview.totalCalories
            : 0,
      };
    }
    return generateCalorieTimeline(activeLog);
  }, [activeLog, timelineStripPreview]);
  const safeCalorieTimelineData = Array.isArray(calorieTimelineData) ? calorieTimelineData : [];

  useEffect(() => {
    if (!simulationMode && currentTrackerDate === getTodayString() && energySimulation?.nervousSystemLoad != null) {
      setNervousSystemLoad(energySimulation.nervousSystemLoad);
    }
  }, [simulationMode, currentTrackerDate, energySimulation?.nervousSystemLoad]);

  useEffect(() => {
    if (!activeLog || activeLog.length === 0) {
      return;
    }
    if (sleepStatus === 'NO_DATA' && !showSleepPrompt) {
      setShowSleepPrompt(true);
    }
  }, [sleepStatus, showSleepPrompt, activeLog]);

  const anabolicCurve = useMemo(() => generateAnabolicCurve(activeLog), [activeLog]);
  const cortisolCurve = useMemo(() => generateCortisolCurve(activeLog, manualNodes), [activeLog, manualNodes]);
  const getAnabolicAtTime = (curve, t) => {
    const i = t * 2;
    const idx = Math.min(Math.floor(i), 48);
    const pt = curve[idx];
    return pt ? pt.anabolicScore : 0;
  };
  const getCortisolAtTime = (curve, t) => {
    const i = t * 2;
    const idx = Math.min(Math.floor(i), 48);
    const pt = curve[idx];
    return pt ? pt.cortisolScore : 0;
  };

  const isViewingPastDate = currentTrackerDate !== getTodayString();
  const displayTime = isViewingPastDate ? 24 : currentTime;
  const currentH = Math.floor(displayTime);
  const nextH = Math.min(24, currentH + 1);
  const fraction = displayTime - currentH;
  const dotY = chartData.length > 0
    ? (chartData[currentH]?.energy ?? 0) + ((chartData[nextH]?.energy ?? 0) - (chartData[currentH]?.energy ?? 0)) * fraction
    : 0;
  const dotGlicemia = chartData.length > 0
    ? (chartData[currentH]?.glicemia ?? 85) + ((chartData[nextH]?.glicemia ?? 85) - (chartData[currentH]?.glicemia ?? 85)) * fraction
    : 85;
  const dotIdratazione = chartData.length > 0
    ? (chartData[currentH]?.idratazione ?? 100) + ((chartData[nextH]?.idratazione ?? 100) - (chartData[currentH]?.idratazione ?? 100)) * fraction
    : 100;
  const hasWaterRisk = !isWaterHydrationAutoPilot && dotIdratazione < 40;
  const dotCortisolo = chartData.length > 0
    ? (chartData[currentH]?.cortisolo ?? 25) + ((chartData[nextH]?.cortisolo ?? 25) - (chartData[currentH]?.cortisolo ?? 25)) * fraction
    : 25;
  const dotDigestione = chartData.length > 0
    ? (chartData[currentH]?.digestione ?? 0) + ((chartData[nextH]?.digestione ?? 0) - (chartData[currentH]?.digestione ?? 0)) * fraction
    : 0;
  const dotNeuro = chartData.length > 0 ? (chartData[currentH]?.neuro ?? 100) + ((chartData[nextH]?.neuro ?? 100) - (chartData[currentH]?.neuro ?? 100)) * fraction : 100;
  const currentMinutes = Math.round((displayTime % 1) * 60);
  const timeLabel = isViewingPastDate ? 'Fine giornata (24:00)' : `ORA (${currentH.toString().padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')})`;
  const energyAt20 = chartData[20]?.energy;
  const idealDotY = chartData.length > 0
    ? (chartData[currentH]?.idealEnergy ?? 0) + ((chartData[nextH]?.idealEnergy ?? 0) - (chartData[currentH]?.idealEnergy ?? 0)) * fraction
    : 0;

  const renderData = [];
  chartData.forEach((point, index) => {
    renderData.push(point);
    if (index === currentH && fraction > 0) {
      const clampedHour = Math.max(0, Math.min(24, displayTime));
      renderData.push({
        time: clampedHour,
        hour: clampedHour,
        energy: dotY,
        idealEnergy: idealDotY,
        glicemia: dotGlicemia,
        idratazione: dotIdratazione,
        cortisolo: dotCortisolo,
        digestione: dotDigestione,
        neuro: dotNeuro
      });
    }
  });

  // Calcolo Budget Dinamico (Base + Bruciate oggi) — prima di renderDataWithSegments per usare scale nel map
  const burnedKcal = activeLog.filter(item => item.type === 'workout').reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
  const dynamicDailyKcal =
    applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) + burnedKcal;
  const targetKcalChart = dynamicDailyKcal;
  // --- NUOVI ALLARMI PREDITTIVI PERCENTUALI ---
  const targetKcalForAlerts = dynamicDailyKcal || baseKcal || (userTargets?.kcal ?? 2000);
  const targetMacros = { prot: userTargets?.prot ?? 150, carb: userTargets?.carb ?? 200, fat: userTargets?.fatTotal ?? userTargets?.fat ?? 65 };
  const totalMacrosTimeline = { prot: totali?.prot ?? 0, carb: totali?.carb ?? 0, fat: totali?.fatTotal ?? totali?.fat ?? 0 };

  const aiCoachEval = useMemo(() => {
    if (!activeLog || currentTrackerDate !== getTodayString() || isSimulationMode) {
      return { suggestion: null, state: null, period: null };
    }
    const tCal = Math.round(Number(dynamicDailyKcal) || Number(targetKcalForAlerts) || 0);
    return evaluateAiDayCoach({
      todayLog: activeLog,
      userHistory: [],
      targetCalories: tCal,
      decimalHour: getWallClockDecimalHour(),
      todayStr: getTodayString(),
      toCanonicalMealType,
    });
  }, [
    activeLog,
    coachPrefsTick,
    currentTrackerDate,
    dynamicDailyKcal,
    isSimulationMode,
    targetKcalForAlerts,
    toCanonicalMealType,
  ]);

  const isAiCoachSuggestionEligible =
    activeBottomTab === 'oggi'
    && currentTrackerDate === getTodayString()
    && !isSimulationMode;

  const aiCoachSuggestion = isAiCoachSuggestionEligible ? aiCoachEval?.suggestion ?? null : null;
  const aiCoachSuggestionDismissKey = useMemo(() => {
    if (!aiCoachSuggestion?.ruleId || !aiCoachEval?.period) return null;
    return `${getTodayString()}::${aiCoachEval.period}::${aiCoachSuggestion.ruleId}`;
  }, [aiCoachEval?.period, aiCoachSuggestion?.ruleId]);

  const aiCoachSuggestionTitle = useMemo(() => {
    if (!aiCoachSuggestion?.ruleId) return 'Suggerimento metabolico';
    if (aiCoachSuggestion.ruleId === 'cal_low') return 'Catabolismo in corso';
    if (aiCoachSuggestion.ruleId === 'low_prot') return 'Sintesi proteica da supportare';
    if (aiCoachSuggestion.ruleId === 'no_food') return 'Finestra energetica vuota';
    if (aiCoachSuggestion.ruleId === 'light_breakfast') return 'Energia da consolidare';
    return 'Suggerimento metabolico';
  }, [aiCoachSuggestion?.ruleId]);

  const isAiCoachSuggestionActive = !!(
    aiCoachSuggestion
    && aiCoachSuggestionDismissKey
    && !dismissedAiCoachInsights[aiCoachSuggestionDismissKey]
  );
  const isAiCoachInsightCritical = (Number(aiCoachSuggestion?.priority) || 0) >= 80;
  const isUserActivelyEditing = !!(
    activeAction === 'pasto'
    || isMealBuilderOpen
    || (isDrawerOpen && activeAction === 'pasto')
    || editingMealId != null
    || String(foodNameInput || '').trim().length > 0
    || String(foodWeightInput || '').trim().length > 0
  );
  const shouldDelayAiCoachInsight = isUserActivelyEditing && !isAiCoachInsightCritical;

  useEffect(() => {
    hasNewInsightRef.current = hasNewInsight;
  }, [hasNewInsight]);

  useEffect(() => {
    isAiCoachSuggestionActiveRef.current = isAiCoachSuggestionActive;
  }, [isAiCoachSuggestionActive]);

  useEffect(() => {
    isUserActivelyEditingRef.current = isUserActivelyEditing;
  }, [isUserActivelyEditing]);

  const beginAiCoachCooldown = useCallback((ms = 180000) => {
    aiCoachCooldownUntilRef.current = Date.now() + ms;
    setHasNewInsight(false);
    setAiCoachBulbPulseCycles(0);
    setIsAiCoachSuggestionModalOpen(false);
    setIsAiCoachInsightArmed(false);
    if (aiCoachInsightReminderTimeoutRef.current) {
      clearTimeout(aiCoachInsightReminderTimeoutRef.current);
      aiCoachInsightReminderTimeoutRef.current = null;
    }
    if (aiCoachInsightActivateTimeoutRef.current) {
      clearTimeout(aiCoachInsightActivateTimeoutRef.current);
      aiCoachInsightActivateTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (aiCoachInsightReminderTimeoutRef.current) {
      clearTimeout(aiCoachInsightReminderTimeoutRef.current);
      aiCoachInsightReminderTimeoutRef.current = null;
    }
    if (aiCoachInsightActivateTimeoutRef.current) {
      clearTimeout(aiCoachInsightActivateTimeoutRef.current);
      aiCoachInsightActivateTimeoutRef.current = null;
    }

    if (!isAiCoachSuggestionActive || !aiCoachSuggestionDismissKey) {
      setHasNewInsight(false);
      setAiCoachBulbPulseCycles(0);
      setIsAiCoachInsightArmed(false);
      aiCoachLastInsightKeyRef.current = null;
      return;
    }

    const inCooldown = Date.now() < aiCoachCooldownUntilRef.current;
    if (inCooldown) {
      setHasNewInsight(false);
      setAiCoachBulbPulseCycles(0);
      setIsAiCoachInsightArmed(false);
      return;
    }

    const activateInsight = () => {
      setIsAiCoachInsightArmed(true);
      setHasNewInsight(true);
      if (!isUserActivelyEditing) {
        setAiCoachBulbPulseCycles(3);
      } else {
        setAiCoachBulbPulseCycles(0);
      }
      if (!shouldDelayAiCoachInsight) {
        setIsAiCoachSuggestionModalOpen(true);
      }
      aiCoachInsightReminderTimeoutRef.current = setTimeout(() => {
        if (isAiCoachSuggestionActiveRef.current && hasNewInsightRef.current && !isUserActivelyEditingRef.current) {
          setAiCoachBulbPulseCycles(1);
        }
      }, 25000);
    };

    if (aiCoachLastInsightKeyRef.current !== aiCoachSuggestionDismissKey) {
      aiCoachLastInsightKeyRef.current = aiCoachSuggestionDismissKey;
      if (shouldDelayAiCoachInsight) {
        setIsAiCoachInsightArmed(false);
        aiCoachInsightActivateTimeoutRef.current = setTimeout(() => {
          if (isAiCoachSuggestionActiveRef.current && Date.now() >= aiCoachCooldownUntilRef.current) {
            activateInsight();
          }
        }, 7000);
      } else {
        activateInsight();
      }
    } else if (!isAiCoachInsightArmed && !shouldDelayAiCoachInsight) {
      activateInsight();
    } else if (isAiCoachInsightArmed && isUserActivelyEditing) {
      setAiCoachBulbPulseCycles(0);
    }

    return () => {
      if (aiCoachInsightReminderTimeoutRef.current) {
        clearTimeout(aiCoachInsightReminderTimeoutRef.current);
        aiCoachInsightReminderTimeoutRef.current = null;
      }
      if (aiCoachInsightActivateTimeoutRef.current) {
        clearTimeout(aiCoachInsightActivateTimeoutRef.current);
        aiCoachInsightActivateTimeoutRef.current = null;
      }
    };
  }, [
    isAiCoachSuggestionActive,
    aiCoachSuggestionDismissKey,
    isAiCoachInsightArmed,
    isUserActivelyEditing,
    shouldDelayAiCoachInsight,
  ]);

  const handleOpenAiCoachSuggestionModal = useCallback(() => {
    if (!isAiCoachSuggestionActive || !isAiCoachInsightArmed) return;
    setHasNewInsight(false);
    setAiCoachBulbPulseCycles(0);
    if (aiCoachInsightReminderTimeoutRef.current) {
      clearTimeout(aiCoachInsightReminderTimeoutRef.current);
      aiCoachInsightReminderTimeoutRef.current = null;
    }
    setIsAiCoachSuggestionModalOpen(true);
  }, [isAiCoachSuggestionActive, isAiCoachInsightArmed]);

  const handleAiCoachClose = useCallback(() => {
    beginAiCoachCooldown(180000);
  }, [beginAiCoachCooldown]);

  useEffect(() => {
    if (!aiCoachSuggestion || !aiCoachSuggestionDismissKey || !isAiCoachInsightArmed) {
      setIsAiCoachSuggestionModalOpen(false);
      return;
    }
    if (dismissedAiCoachInsights[aiCoachSuggestionDismissKey]) {
      setIsAiCoachSuggestionModalOpen(false);
      return;
    }
  }, [aiCoachSuggestion, aiCoachSuggestionDismissKey, dismissedAiCoachInsights, isAiCoachInsightArmed]);

  const handleAiCoachIgnore = useCallback(() => {
    const s = aiCoachEval?.suggestion;
    const period = aiCoachEval?.period;
    if (!s?.ruleId || !period) return;
    if (aiCoachSuggestionDismissKey) {
      setDismissedAiCoachInsights((prev) => {
        const next = { ...(prev || {}), [aiCoachSuggestionDismissKey]: true };
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(AI_COACH_DISMISSED_INSIGHTS_LS_KEY, JSON.stringify(next));
          }
        } catch {
          // ignore localStorage quota/availability issues
        }
        return next;
      });
    }
    recordCoachIgnore(s.ruleId);
    consumeCoachPeriod(getTodayString(), period);
    setCoachPrefsTick((x) => x + 1);
    beginAiCoachCooldown(180000);
  }, [aiCoachEval, aiCoachSuggestionDismissKey, beginAiCoachCooldown]);

  const handleAiCoachCreateMeal = useCallback(() => {
    const s = aiCoachEval?.suggestion;
    const period = aiCoachEval?.period;
    if (!s?.action?.mealType || !period) return;
    recordCoachAccept(s.ruleId);
    consumeCoachPeriod(getTodayString(), period);
    setCoachPrefsTick((x) => x + 1);
    const canon = s.action.mealType;
    const mealId = mealIdFromCanonical(canon);
    setMealType(mealId);
    const t = getDefaultMealTime(mealId);
    setDrawerMealTime(t);
    setDrawerMealTimeStr(decimalToTimeStr(t));
    setAddedFoods([]);
    setSelectedMealCenter(null);
    setEditingMealId(null);
    setFoodNameInput('');
    setFoodWeightInput('');
    setActiveAction('pasto');
    setIsDrawerOpen(true);
    setIsMealBuilderOpen(true);
    setMealBuilderCoachPracticalKey((k) => k + 1);
    setHasNewInsight(false);
    setAiCoachBulbPulseCycles(0);
    if (aiCoachInsightReminderTimeoutRef.current) {
      clearTimeout(aiCoachInsightReminderTimeoutRef.current);
      aiCoachInsightReminderTimeoutRef.current = null;
    }
    if (aiCoachInsightActivateTimeoutRef.current) {
      clearTimeout(aiCoachInsightActivateTimeoutRef.current);
      aiCoachInsightActivateTimeoutRef.current = null;
    }
    setIsAiCoachSuggestionModalOpen(false);
  }, [aiCoachEval, decimalToTimeStr, getDefaultMealTime, mealIdFromCanonical]);

  useEffect(() => {
    if (kentuActiveTrigger !== 'agenda') kentuAgendaAwaitingRef.current = false;
  }, [kentuActiveTrigger]);

  useEffect(() => {
    if (activeAction !== 'ai_chat' || !kentuActiveTrigger) return;
    const date = currentTrackerDate || getTodayString();
    if (kentuActiveTrigger === 'sleep') {
      const k = `kentu_pro_sleep_shown_${date}`;
      if (typeof window !== 'undefined' && window.localStorage.getItem(k)) return;
      if (typeof window !== 'undefined') window.localStorage.setItem(k, '1');
      setChatHistory((prev) => {
        const needle = 'mancano i dati del sonno';
        if (prev.some((m) => m.sender === 'ai' && typeof m.text === 'string' && m.text.includes(needle))) return prev;
        return [
          ...prev,
          {
            sender: 'ai',
            text: 'Buongiorno! L\'energia stamattina risulta bassa perché mancano i dati del sonno. Vuoi che li registriamo al volo per ricalibrare la giornata?',
            quickReplies: ['Ho dormito 7h bene', 'Ho dormito male'],
          },
        ];
      });
      return;
    }
    if (kentuActiveTrigger === 'agenda') {
      const k = `kentu_pro_agenda_shown_${date}`;
      const sentKey = `kentu_agenda_secret_sent_${date}`;
      const alreadySent =
        typeof window !== 'undefined' && window.sessionStorage.getItem(sentKey);
      if (!alreadySent) kentuAgendaAwaitingRef.current = true;
      if (typeof window !== 'undefined' && !window.localStorage.getItem(k)) {
        window.localStorage.setItem(k, '1');
        setChatHistory((prev) => {
          const needle = 'Che programmi hai per oggi';
          if (prev.some((m) => m.sender === 'ai' && typeof m.text === 'string' && m.text.includes(needle))) return prev;
          return [
            ...prev,
            {
              sender: 'ai',
              text: 'Buongiorno! Ho registrato i dati del sonno. Che programmi hai per oggi? (es. Lavoro al pc, perizie, allenamento)',
            },
          ];
        });
      }
      return;
    }
    if (kentuActiveTrigger === 'morning_briefing') {
      const date = currentTrackerDate || getTodayString();
      const br = checkMorningBriefing(fullHistory, userTargets, date);
      if (!br) return;
      setChatHistory((prev) => {
        const needle = 'Ho analizzato i dati di ieri';
        if (prev.some((m) => m.sender === 'ai' && typeof m.text === 'string' && m.text.includes(needle))) {
          return prev;
        }
        markMorningBriefingShown(date);
        return [
          ...prev,
          {
            sender: 'ai',
            text: `Buongiorno! Ho analizzato i dati di ieri: hai chiuso in ${br.status === 'deficit' ? 'deficit calorico' : 'surplus calorico'}. Per calibrare il digiuno e il timing dei pasti di oggi, dimmi: che livello di attività hai in programma?`,
            quickReplies: [
              '🏋️ Pesi / Alta intensità',
              '🏃‍♂️ Cardio / Attivo',
              '🧘‍♂️ Riposo / Scrivania',
            ],
            morningBriefing: { status: br.status },
          },
        ];
      });
      return;
    }
    if (kentuActiveTrigger === 'evening_briefing') {
      const evDate = currentTrackerDate || getTodayString();
      const ev = checkEveningBriefing(activeLog, userTargets, evDate, bodyBattery?.maxCapacity ?? 100);
      if (!ev) return;
      setChatHistory((prev) => {
        const needle = 'È quasi ora di cena';
        if (prev.some((m) => m.sender === 'ai' && typeof m.text === 'string' && m.text.includes(needle))) {
          markEveningBriefingShown(evDate);
          return prev;
        }
        markEveningBriefingShown(evDate);
        const mk = Math.max(0, ev.missingKcal);
        const mp = Math.max(0, ev.missingPro);
        const debtWarn = ev.isHighDebt
          ? 'Oggi la tua capacità di recupero è ridotta dal debito di sonno. Sarebbe meglio evitare allenamenti pesanti stasera per non alzare troppo il cortisolo e proteggere il riposo notturno.\n\n'
          : '';
        return [
          ...prev,
          {
            sender: 'ai',
            text: `${debtWarn}Buonasera! È quasi ora di cena. Per chiudere la giornata in modo ottimale hai a disposizione circa ${mk} kcal e ti servono ${mp}g di proteine. Vuoi che ti calcoli un'opzione perfetta e veloce da registrare?`,
            quickReplies: ['🍽️ Sì, proponi la cena perfetta', '✋ No, ci penso io'],
            eveningBriefing: { missingKcal: ev.missingKcal, missingPro: ev.missingPro },
          },
        ];
      });
    }
  }, [activeAction, kentuActiveTrigger, currentTrackerDate, fullHistory, userTargets, activeLog, bodyBattery?.maxCapacity]);

  const isNightDeficit = displayTime >= 20 && targetKcalForAlerts > 0 && ((totalCaloriesTimeline || 0) / targetKcalForAlerts) <= 0.60;
  const isProteinSaturated = displayTime <= 15 && (targetMacros?.prot ?? 0) > 0 && ((totalMacrosTimeline.prot || 0) / (targetMacros.prot || 1)) >= 0.90;
  const upcomingWorkout = allNodes.find(n => (n?.type === 'workout' || n?.type === 'work') && n?.time > displayTime && n?.time <= displayTime + 2);
  const isWorkoutCrash = !!upcomingWorkout && (dotY ?? 50) <= 40;
  const activeAlertsArray = [
    hasCrashRisk && 'glicemia',
    hasCortisolRisk && 'cortisolo',
    hasWaterRisk && 'idratazione',
    hasDigestionRisk && 'digestione',
    isNightDeficit && 'deficit_serale',
    isProteinSaturated && 'proteine_sature',
    isWorkoutCrash && 'workout_crash'
  ].filter(Boolean);
  const scale = (v) => (v == null || Number.isNaN(Number(v))) ? v : (Number(v) / 100) * targetKcalChart;

  const wakeHourForRiserva = (() => {
    const sleepEntry = (activeLog || []).find(i => i?.type === 'sleep');
    return sleepEntry?.wakeTime ?? sleepEntry?.sleepEnd ?? 7.5;
  })();
  const piccoMattutinoRiserva = 85;

  const renderDataWithSegments = renderData.map(d => {
    const h = d.time ?? d.hour ?? 0;
    const riservaFisica = h < wakeHourForRiserva
      ? Math.min(100, 25 + (h / Math.max(0.1, wakeHourForRiserva)) * (piccoMattutinoRiserva - 25))
      : Math.max(0, piccoMattutinoRiserva - (h - wakeHourForRiserva) * 3.5);
    return {
    ...d,
    riservaFisica,
    anabolicScore: getAnabolicAtTime(anabolicCurve, d.time),
    cortisolScore: getCortisolAtTime(cortisolCurve, d.time),
    energyPast: d.time <= displayTime ? d.energy : null,
    energyFuture: d.time >= displayTime ? d.energy : null,
    kcalPast: d.time <= displayTime ? scale(d.energy) : null,
    kcalFuture: d.time >= displayTime ? scale(d.energy) : null,
    glicemiaPast: d.time <= displayTime ? d.glicemia : null,
    glicemiaFuture: d.time >= displayTime ? d.glicemia : null,
    idratazionePast: d.time <= displayTime ? d.idratazione : null,
    idratazioneFuture: d.time >= displayTime ? d.idratazione : null,
    cortisoloPast: d.time <= displayTime ? d.cortisolo : null,
    cortisoloFuture: d.time >= displayTime ? d.cortisolo : null,
    digestionePast: d.time <= displayTime ? d.digestione : null,
    digestioneFuture: d.time >= displayTime ? d.digestione : null,
    neuroPast: d.time <= displayTime ? d.neuro : null,
    neuroFuture: d.time >= displayTime ? d.neuro : null
  };
  });

  const trafficLight = getWorkoutTrafficLight(displayTime, anabolicCurve, activeLog, { fullHistory, currentTrackerDate, userTargets });

  const mealPieData = useMemo(() => {
    // Palette Sci-Fi per distinguere i vari pasti in modo univoco
    const PIE_COLORS = ['#00e5ff', '#b388ff', '#00e676', '#ffea00', '#ff9800', '#f48fb1', '#4fc3f7', '#aed581', '#ffb74d'];

    const mealsById = {};

    (activeLog || []).forEach(item => {
      if (item.type !== 'food' && item.type !== 'recipe' && item.type !== 'meal') return;

      // Chiave univoca basata sull'orario per raggruppare gli alimenti dello STESSO pasto
      const timeKey = typeof item.mealTime === 'number' ? item.mealTime.toString() : 'unknown';
      const typeKey = item.mealType || 'pasto';
      const uniqueMealId = `${typeKey}_${timeKey}`;

      if (!mealsById[uniqueMealId]) {
        // Calcoliamo la label dell'orario (es. "10:30") per rendere chiara la fetta
        let timeLabel = '';
        if (typeof item.mealTime === 'number') {
          const h = Math.floor(item.mealTime).toString().padStart(2, '0');
          const m = Math.round((item.mealTime % 1) * 60).toString().padStart(2, '0');
          timeLabel = ` (${h}:${m})`;
        }

        // Prova a usare MEAL_LABELS_SAVE se esiste nel file, altrimenti usa item.mealType
        const slot = item.mealType ? (item.mealType.split('_')[0] || 'snack') : 'snack';
        const baseName = typeof MEAL_LABELS_SAVE !== 'undefined' ? (MEAL_LABELS_SAVE[slot] || item.mealType || 'Pasto') : (item.mealType || 'Pasto');

        mealsById[uniqueMealId] = {
          id: uniqueMealId,
          name: `${baseName}${timeLabel}`,
          value: 0,
          prot: 0,
          carb: 0,
          fat: 0,
          timeValue: typeof item.mealTime === 'number' ? item.mealTime : 0
        };
      }

      // Sommiamo i macro di tutti gli alimenti che fanno parte di QUESTO specifico pasto
      mealsById[uniqueMealId].value += Number(item.kcal || item.cal || 0);
      mealsById[uniqueMealId].prot += Number(item.prot || item.proteine || 0);
      mealsById[uniqueMealId].carb += Number(item.carb || item.carboidrati || 0);
      mealsById[uniqueMealId].fat += Number(item.fatTotal || item.fat || item.grassi || 0);
    });

    // Trasformiamo l'oggetto in array, lo ordiniamo cronologicamente e assegniamo i colori
    const calculatedPieData = Object.values(mealsById)
      .sort((a, b) => a.timeValue - b.timeValue)
      .map((meal, index) => ({
        ...meal,
        macros: { pro: meal.prot, carb: meal.carb, fat: meal.fat },
        color: PIE_COLORS[index % PIE_COLORS.length],
        fill: PIE_COLORS[index % PIE_COLORS.length]
      }));

    let data = calculatedPieData.filter(d => d.value > 0);
    const currentTotal = data.reduce((s, d) => s + d.value, 0);
    const targetKcal = dynamicDailyKcal || (userTargets?.kcal ?? 2000);
    if (currentTotal < targetKcal) {
      data = [...data, {
        name: 'Rimanenti',
        value: targetKcal - currentTotal,
        macros: null,
        id: 'rimanenti',
        fill: 'rgba(255, 255, 255, 0.05)',
        color: 'rgba(255, 255, 255, 0.05)'
      }];
    }
    if (data.length === 0) {
      data = [{
        name: 'Rimanenti',
        value: userTargets?.kcal ?? 2000,
        macros: null,
        id: 'rimanenti',
        fill: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.05)'
      }];
    }
    const sortedPieData = [...data].sort((a, b) => {
      if (a.id === 'rimanenti') return 1;
      if (b.id === 'rimanenti') return -1;
      const tA = a.timeValue ?? a.time ?? 0;
      const tB = b.timeValue ?? b.time ?? 0;
      return (Number(tA) || 0) - (Number(tB) || 0);
    });
    return sortedPieData;
  }, [activeLog, userTargets?.kcal, dynamicDailyKcal]);

  const mealPieDisplayData = useMemo(() => {
    if (activeDialMode === 'kcal') return mealPieData;

    const macroKey =
      activeDialMode === 'pro' ? 'prot' : activeDialMode === 'cho' ? 'carb' : 'fat';
    const targetG =
      activeDialMode === 'pro'
        ? userTargets?.prot ?? 150
        : activeDialMode === 'cho'
          ? userTargets?.carb ?? 200
          : userTargets?.fatTotal ?? userTargets?.fat ?? 65;

    const mealsOnly = mealPieData.filter((e) => e.id !== 'rimanenti');
    const slices = mealsOnly.map((m) => ({
      ...m,
      value: Math.max(0, Number(m[macroKey]) || 0),
    }));
    const consumed = slices.reduce((s, d) => s + d.value, 0);
    let data = slices.filter((d) => d.value > 0);
    if (consumed < targetG) {
      data = [
        ...data,
        {
          name: 'Rimanenti',
          value: targetG - consumed,
          macros: null,
          id: 'rimanenti',
          fill: 'rgba(255, 255, 255, 0.05)',
          color: 'rgba(255, 255, 255, 0.05)',
          prot: 0,
          carb: 0,
          fat: 0,
          timeValue: 0,
        },
      ];
    }
    if (data.length === 0) {
      data = [
        {
          name: 'Rimanenti',
          value: targetG,
          macros: null,
          id: 'rimanenti',
          fill: 'rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.05)',
          prot: 0,
          carb: 0,
          fat: 0,
          timeValue: 0,
        },
      ];
    }
    return [...data].sort((a, b) => {
      if (a.id === 'rimanenti') return 1;
      if (b.id === 'rimanenti') return -1;
      const tA = a.timeValue ?? 0;
      const tB = b.timeValue ?? 0;
      return (Number(tA) || 0) - (Number(tB) || 0);
    });
  }, [mealPieData, activeDialMode, userTargets?.prot, userTargets?.carb, userTargets?.fat, userTargets?.fatTotal]);

  const finalChartData = renderDataWithSegments;
  const mainChartData = chartUnit === 'calorieTimeline' ? safeCalorieTimelineData : finalChartData;
  const dotYCalorieTimeline = (() => {
    if (chartUnit !== 'calorieTimeline' && expandedChart !== 'calorieTimeline') return null;
    const tl = safeCalorieTimelineData;
    const idx = Math.floor(displayTime);
    const next = Math.min(24, idx + 1);
    const frac = displayTime - idx;
    const a = tl[idx]?.kcal;
    const b = tl[next]?.kcal;
    return a != null ? (b != null ? a + (b - a) * frac : a) : 0;
  })();
  const modalChartData = expandedChart === 'calorieTimeline' ? safeCalorieTimelineData : finalChartData;
  const finalDotY = chartUnit === 'calorieTimeline' ? (dotYCalorieTimeline ?? 0) : (chartUnit === 'glicemia' ? dotGlicemia : (chartUnit === 'idratazione' ? dotIdratazione : (chartUnit === 'cortisolo' ? dotCortisolo : (chartUnit === 'digestione' ? dotDigestione : (chartUnit === 'neuro' ? dotNeuro : (chartUnit === 'percent' ? dotY : (chartUnit === 'kcal' ? scale(dotY) : dotY)))))));

  const energyAt20Percent = energyAt20 ?? 50;

  // Radar metabolico: stato attuale da glicemia e digestione
  const gl = typeof dotGlicemia === 'number' && !Number.isNaN(dotGlicemia) ? dotGlicemia : 85;
  const dig = typeof dotDigestione === 'number' && !Number.isNaN(dotDigestione) ? dotDigestione : 0;
  const metabolicState = (() => {
    if (gl < 85 && dig < 25) return { key: 'autofagia', label: 'Autofagia', color: '#22c55e' };
    if (gl >= 85 && gl < 140 && dig < 50) return { key: 'lipolisi', label: 'Lipolisi', color: '#eab308' };
    return { key: 'anabolismo', label: 'Anabolismo', color: '#3b82f6' };
  })();

  const currentMealTotals = addedFoods.reduce((acc, food) => ({
    kcal: acc.kcal + (Number(food.kcal) || Number(food.cal) || 0),
    prot: acc.prot + (Number(food.prot) || 0),
    carb: acc.carb + (Number(food.carb) || 0),
    fat: acc.fat + (Number(food.fatTotal) || 0),
    fibre: acc.fibre + (Number(food.fibre) || 0)
  }), { kcal: 0, prot: 0, carb: 0, fat: 0, fibre: 0 });

  const mealNutrientKeys = ['kcal', ...Object.values(TARGETS).flatMap(g => Object.keys(g))];
  const mealTotaliFull = addedFoods.reduce((acc, food) => {
    acc.kcal = (acc.kcal || 0) + (Number(food.kcal) || Number(food.cal) || 0);
    mealNutrientKeys.forEach(k => {
      if (k === 'kcal') return;
      acc[k] = (acc[k] || 0) + (Number(food[k]) || 0);
    });
    return acc;
  }, {});

  const dailyLogForDynamicTargets = useMemo(() => {
    const log = activeLog || [];
    if (!editingMealId) return log;
    const items = getFoodItemsForMealSlot(log, editingMealId);
    const keys = new Set(
      items.map((f) => {
        const base = String(f.mealType ?? '').split('_')[0];
        const t = typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime) ? f.mealTime : 'na';
        return `${base}|${t}`;
      })
    );
    return log.filter((e) => {
      if (e.type !== 'food' && e.type !== 'recipe') return true;
      const base = String(e.mealType ?? '').split('_')[0];
      const t = typeof e.mealTime === 'number' && !Number.isNaN(e.mealTime) ? e.mealTime : 'na';
      return !keys.has(`${base}|${t}`);
    });
  }, [activeLog, editingMealId, getFoodItemsForMealSlot]);

  const targetMacrosPasto = useMemo(() => {
    const h =
      typeof drawerMealTime === 'number' && !Number.isNaN(drawerMealTime)
        ? drawerMealTime
        : typeof displayTime === 'number' && !Number.isNaN(displayTime)
          ? displayTime
          : 12;
    return getDynamicMealTargets(mealType, dailyLogForDynamicTargets, {
      kcal: userTargets?.kcal ?? 2000,
      prot: userTargets?.prot ?? 150,
      carb: userTargets?.carb ?? 200,
      fatTotal: userTargets?.fatTotal ?? userTargets?.fat ?? 60,
      fat: userTargets?.fat ?? userTargets?.fatTotal ?? 60,
      fibre: userTargets?.fibre ?? 30,
    }, {
      currentDecimalHour: h,
      calorieStrategy: kentuDailyCalorieStrategy,
      burnedKcalBonus: burnedKcal,
    });
  }, [mealType, dailyLogForDynamicTargets, userTargets, kentuDailyCalorieStrategy, burnedKcal, drawerMealTime, displayTime]);

  const targetMacrosPastoWithPlanning = useMemo(() => {
    const base =
      targetMacrosPasto && typeof targetMacrosPasto === 'object' ? { ...targetMacrosPasto } : {};
    const canon = toCanonicalMealType(String(mealType || 'pranzo').split('_')[0]);
    const sk = getStrategyKey(canon);
    const planK = idealStrategy?.[sk];
    // Cena: niente quota fissa da idealStrategy — resta il residuo da getDynamicMealTargets (Tkcal − consumate).
    if (
      canon !== 'cena' &&
      planK != null &&
      Number.isFinite(Number(planK)) &&
      Number(planK) > 0
    ) {
      base.kcal = Math.round(Number(planK));
    }
    return base;
  }, [targetMacrosPasto, mealType, idealStrategy]);

  const handleSmartMealCompletion = useCallback(
    async (currentFoods, aiMealConstraints) => {
      const foods = Array.isArray(currentFoods) ? currentFoods : [];
      const present = foods.map((f) => f.desc || f.name).filter(Boolean);
      const anchor = currentTrackerDate || getTodayString();
      const recent7 = buildLast7DaysMealLinesForDraftPrompt(fullHistory, anchor);
      const constraintsBlock = buildAiMealConstraintsPromptBlock(aiMealConstraints);
      const prompt = `SMART MEAL COMPLETION: Devo completare il pasto '${String(mealType)}'. Target ricalcolato: ${JSON.stringify(targetMacrosPastoWithPlanning)}. Cibi già presenti (da NON rimuovere): ${present.join(', ') || 'Nessuno'}. Genera cibi suggeriti per raggiungere il target (pescando da storico o DB utente), coerenti con le abitudini reali degli ultimi giorni.
${constraintsBlock}

ULTIMI 7 GIORNI (pasti registrati):
${recent7}

Genera SOLO E UNICAMENTE la stringa [COMPLETION_JSON: {"foods": [{"desc": "...", "weight": 100}]}]. NON SCRIVERE ALTRO. NON USARE MARKDOWN o backticks.`;
      try {
        const raw = await callGeminiAPIWithRotation(prompt);
        const items = parseSmartCompletionJsonFromAiResponse(raw);
        const newEntries = items.map((it) => estraiDatiFoodDb(it.desc, it.weight, mealType));
        setAddedFoods((prev) => [...prev, ...newEntries]);
      } catch (e) {
        const msg = e?.message ? String(e.message) : 'Completamento non riuscito';
        window.alert(msg);
      }
    },
    [mealType, targetMacrosPastoWithPlanning, callGeminiAPIWithRotation, estraiDatiFoodDb, fullHistory, currentTrackerDate]
  );

  const dailyKcal = userTargets.kcal ?? 2000;
  const ratio = dailyKcal > 0 ? targetMacrosPastoWithPlanning.kcal / dailyKcal : 0.25;

  const isReadyToDelete = draggingNode && Math.abs(dragOffsetY) > 50;

  const checkBilanciamentoPasto = () => {
    if (addedFoods.length === 0) return null;
    const kcal = mealTotaliFull.kcal || 0;
    const prot = mealTotaliFull.prot || 0;
    const carb = mealTotaliFull.carb || 0;
    const fatTotal = mealTotaliFull.fatTotal ?? mealTotaliFull.fat ?? 0;
    if (kcal < 150) return null;
    if (carb > (prot * 4) && prot < 15) return { text: '⚠️ Povero di proteine e ricco di carboidrati. Rischio picco glicemico.', color: '#ff9800' };
    if (prot < 10 && kcal > 400) return { text: '⚠️ Pasto molto calorico ma carente di fonti proteiche.', color: '#ff9800' };
    if (fatTotal > 30 && carb > 60) return { text: '⚠️ Combinazione alta di grassi e carboidrati. Impegno digestivo severo.', color: '#ff4d4d' };
    if (prot >= 20 && carb <= 80 && fatTotal <= 25) return { text: '✅ Pasto ottimamente bilanciato.', color: '#00e676' };
    return null;
  };

  // --- ZONA SICURA HOOKS: MOTORE METABOLICO E BODY BATTERY ---
  const fastingData = useMemo(() => {
    let lastMealTime = null;
    let lastMealDate = null;
    const todayMeals = (activeLog || []).filter(i => (i.type === 'food' || i.type === 'recipe') && typeof i.mealTime === 'number' && i.mealTime <= currentTime).sort((a, b) => b.mealTime - a.mealTime);
    if (todayMeals.length > 0) { lastMealTime = todayMeals[0].mealTime; lastMealDate = 'today'; }
    if (lastMealDate === null && fullHistory) {
      const yesterdayObj = new Date(currentDateObj);
      yesterdayObj.setDate(yesterdayObj.getDate() - 1);
      const offset = yesterdayObj.getTimezoneOffset() * 60000;
      const yesterdayStr = new Date(yesterdayObj.getTime() - offset).toISOString().slice(0, 10);
      const yesterdayNode = fullHistory[TRACKER_STORICO_KEY(yesterdayStr)];
      if (yesterdayNode && yesterdayNode.log) {
        const yesterdayLog = normalizeLogData(Array.isArray(yesterdayNode.log) ? yesterdayNode.log : Object.values(yesterdayNode.log));
        const yestMeals = yesterdayLog.filter(i => i.type === 'food' || i.type === 'recipe');
        let maxYestTime = -1;
        yestMeals.forEach(m => {
          const t = yesterdayNode.mealTimes?.[m.mealType] ?? m.mealTime ?? 20;
          if (t > maxYestTime) maxYestTime = t;
        });
        if (maxYestTime >= 0) { lastMealTime = maxYestTime; lastMealDate = 'yesterday'; }
      }
    }
    let hoursFasted = 0;
    if (lastMealDate === 'today') hoursFasted = currentTime - lastMealTime;
    else if (lastMealDate === 'yesterday') hoursFasted = (24 - lastMealTime) + currentTime;
    hoursFasted = Math.max(0, hoursFasted);
    const h = Math.floor(hoursFasted);
    const m = Math.round((hoursFasted - h) * 60);
    const timeString = `${h}h ${m}m`;
    let phaseName = 'ASSORBIMENTO'; let phaseColor = '#00e676'; let phaseDesc = 'Digestione attiva • Sintesi glicogeno'; let progress = Math.min((hoursFasted / 4) * 100, 100);
    if (hoursFasted >= 16) { phaseName = 'AUTOFAGIA'; phaseColor = '#9c27b0'; phaseDesc = 'Rigenerazione profonda • Pulizia cellulare'; progress = 100; }
    else if (hoursFasted >= 12) { phaseName = 'CHETOSI / LIPOLISI'; phaseColor = '#ffea00'; phaseDesc = 'Uso intensivo grassi • Chetoni attivi'; progress = ((hoursFasted - 12) / 4) * 100; }
    else if (hoursFasted >= 4) { phaseName = 'DIGIUNO / CATABOLISMO'; phaseColor = '#00e5ff'; phaseDesc = 'Esaurimento scorte • Calo insulina'; progress = ((hoursFasted - 4) / 8) * 100; }
    return { hoursFasted, timeString, phaseName, phaseColor, phaseDesc, progress };
  }, [activeLog, currentTime, fullHistory, currentDateObj]);

  const trainingWaveResult = useMemo(() => {
    const anchor = currentTrackerDate || getTodayString();
    const lastMeal = getLastMealMacrosForTrainingWave(fullHistory, anchor, displayTime);
    const sveglia = Number(userTargets?.sveglia);
    return getTrainingWaveCurves(lastMeal, displayTime, {
      wakeHour: Number.isFinite(sveglia) ? sveglia : 7,
      stressLoad: Number(accumuloSNC) || 0,
      steps: 25,
    });
  }, [fullHistory, currentTrackerDate, displayTime, userTargets?.sveglia, accumuloSNC]);

  const renderCustomizedLabel = (props) => {
    const { cx, cy, midAngle, outerRadius, value, name, fill, payload } = props;
    if (name === 'Rimanenti' || value === 0) return null;
    const radius = outerRadius + 14;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    let icon = '🍎';
    const n = (name || '').toLowerCase();
    if (n.includes('pranzo')) icon = '🍝';
    else if (n.includes('cena')) icon = '🍽️';
    else if (n.includes('colazion')) icon = '🍳';
    else if (n.includes('snack') || n.includes('merenda')) icon = '🫐';
    const fullEntry = payload && typeof payload === 'object' ? payload : null;
    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={(e) => {
          e.stopPropagation();
          if (!fullEntry || fullEntry.id === 'rimanenti') return;
          setSelectedMealCenter(fullEntry);
        }}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        <circle cx="0" cy="0" r="16" fill="#111" stroke={fill} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 4px ${fill}80)` }} />
        <text x="0" y="0" dy="4.5" textAnchor="middle" fontSize="14">{icon}</text>
      </g>
    );
  };

  const renderActiveMealShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#00e5ff"
        strokeWidth={2}
      />
    );
  };

  const selectedMealCenterIndex = selectedMealCenter
    ? mealPieDisplayData.findIndex((e) => e.id === selectedMealCenter.id)
    : -1;

  // ========================================================
  // Contenuto principale (un solo return finale per mantenere montato l’overlay caricamento Firebase)
  // ========================================================
  /** Barra Kentu + navigazione: sempre montata dopo login, anche durante caricamento dati (Bussola sempre visibile). */
  const fixedAppBottomChrome = (
    <BottomChrome
      kentuChatNotificationBadge={kentuChatNotificationBadge}
      setActiveAction={setActiveAction}
      setIsDrawerOpen={setIsDrawerOpen}
      isFabOpen={isFabOpen}
      trackEventUsage={trackEventUsage}
      handleAddEventMenuItem={handleAddEventMenuItem}
      setIsFabOpen={setIsFabOpen}
      mostUsedEventButtons={mostUsedEventButtons}
      setShowChoiceModal={setShowChoiceModal}
      BOTTOM_NAV_ITEMS={BOTTOM_NAV_ITEMS}
      handleBottomNavTabSelect={handleBottomNavTabSelect}
      activeBottomTab={activeBottomTab}
    />
  );

  let salaContent;

  if (!authReady) {
    salaContent = <div style={{ minHeight: '100dvh', width: '100%', background: '#050a12' }} aria-hidden />;
  } else if (!isAuthenticated) {
    salaContent = (
      <div style={{ backgroundColor: '#000', color: '#00e5ff', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', overflow: 'hidden', position: 'relative' }}>
        <style>
          {`
            .login-box { background: rgba(10,10,10,0.9); border: 1px solid #333; padding: 40px; border-radius: 15px; z-index: 10; width: 90%; max-width: 400px; box-shadow: 0 0 40px rgba(0, 229, 255, 0.1); position: relative; }
            .login-box::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 50px; height: 2px; background: #00e5ff; box-shadow: 0 0 10px #00e5ff; }
            .sys-title { text-align: center; letter-spacing: 4px; margin-bottom: 30px; font-size: 1.2rem; }
            .login-input { width: 100%; background: #050505; border: 1px solid #333; padding: 15px; color: #fff; font-family: monospace; margin-bottom: 15px; border-radius: 5px; outline: none; transition: 0.3s; }
            .login-input:focus { border-color: #00e5ff; box-shadow: inset 0 0 10px rgba(0,229,255,0.1); }
            .login-btn { width: 100%; background: transparent; border: 1px solid #00e5ff; color: #00e5ff; padding: 15px; font-family: monospace; font-weight: bold; letter-spacing: 2px; cursor: pointer; transition: 0.3s; border-radius: 5px; margin-top: 10px; }
            .login-btn:hover { background: #00e5ff; color: #000; box-shadow: 0 0 20px rgba(0,229,255,0.4); }
            .spinner { border: 2px solid transparent; border-top-color: #00e5ff; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 20px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}
        </style>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle at center, #050505 0%, #000 100%)', opacity: 0.8, pointerEvents: 'none' }}></div>
        {isBooting ? (
          <div className="login-box" style={{textAlign: 'center', color: '#fff', fontSize: '0.8rem', lineHeight: '1.8'}}>
            <div className="spinner"></div>
            <div>VERIFICA CREDENZIALI...</div>
            <div style={{color: '#888'}}>CONNESSIONE CLOUD [OK]</div>
            <div style={{color: '#00e676', marginTop: '10px'}}>ACCESSO CONSENTITO</div>
          </div>
        ) : (
          <form className="login-box" onSubmit={handleLogin}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <img
                src="/nuovo%20logo%20trasparente2.png"
                alt="Kentuos Logo"
                decoding="async"
                style={{
                  maxHeight: 52,
                  width: 'auto',
                  maxWidth: 'min(280px, 88vw)',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
            <p
              className="kentu-intro-phrase-text kentu-intro-phrase-text--glow"
              style={{
                textAlign: 'center',
                fontSize: '0.72rem',
                fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                fontWeight: 300,
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.42)',
                marginBottom: '16px',
                lineHeight: 1.5,
              }}
            >
              {introPhrase}
            </p>
            <p style={{textAlign: 'center', fontSize: '0.65rem', color: '#666', marginBottom: '20px'}}>SYSTEM ENCRYPTED. REQUIRE AUTHENTICATION.</p>
            <input type="email" placeholder="USER ID (EMAIL)" className="login-input" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
            <input type="password" placeholder="PASSWORD" className="login-input" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            <button type="submit" className="login-btn">INIZIALIZZA</button>
          </form>
        )}
      </div>
    );
  } else if (!isInitialLoadComplete) {
    salaContent = (
      <>
        <div style={{ minHeight: '100dvh', width: '100%', background: '#050a12' }} aria-hidden />
        {fixedAppBottomChrome}
      </>
    );
  } else if (isFullScreenGraph) {
    const currentChartType = availableFullscreenCharts[fullscreenChartIndex] || 'percent';
    const fullscreenChartLabel = currentChartType === 'percent' ? 'Energia SNC %' : currentChartType === 'cortisolo' ? 'Cortisolo' : currentChartType === 'calorieTimeline' ? 'Bilancio Calorico' : currentChartType === 'glicemia' ? 'Glicemia' : currentChartType === 'idratazione' ? 'Idratazione' : currentChartType === 'neuro' ? 'Recupero Neurologico' : currentChartType === 'digestione' ? 'Digestione' : currentChartType === 'kcal' ? 'Kcal' : 'Grafico';

    salaContent = (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100dvw', height: '100dvh', maxHeight: '100dvh', backgroundColor: '#121212', zIndex: 100020, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        {/* HEADER COMANDI (fisso) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', background: '#1e1e1e', borderBottom: '1px solid #333', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button type="button" onClick={() => setFullscreenChartIndex(prev => prev > 0 ? prev - 1 : availableFullscreenCharts.length - 1)} style={{ background: '#333', color: '#00e5ff', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>◀</button>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1.2rem', textTransform: 'uppercase' }}>{fullscreenChartLabel}</h2>
            <button type="button" onClick={() => setFullscreenChartIndex(prev => prev < availableFullscreenCharts.length - 1 ? prev + 1 : 0)} style={{ background: '#333', color: '#00e5ff', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>▶</button>
          </div>
          <button type="button" onClick={exitFullscreen} style={{ backgroundColor: '#ff0000', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✖ Chiudi</button>
        </div>

        {/* SCROLL WRAPPER ORIZZONTALE */}
        <div ref={fullscreenChartScrollRef} style={{ flex: 1, minHeight: 0, width: '100%', overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* INNER WIDE CONTAINER (zoom) */}
          <div style={{ width: `${220 * zoomLevel}%`, minWidth: `${800 * zoomLevel}px`, flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 10px)' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {currentChartType === 'percent' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorEnergiaFullscreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00e676" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#ffea00" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorRiservaFullscreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00e676" stopOpacity={0.5}/>
                      <stop offset="100%" stopColor="#00e676" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1c', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                    formatter={(value, name) => {
                      const formattedValue = typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—');
                      const displayName = name === 'energyPast' || name === 'Energia SNC' ? 'Energia SNC' : name === 'riservaFisica' ? 'Riserva Fisica' : name === 'energyFuture' ? 'Previsione' : name;
                      return [formattedValue, displayName];
                    }}
                    labelFormatter={(label) => {
                      if (typeof label === 'number') {
                        const ore = Math.floor(label);
                        const min = Math.round((label - ore) * 60);
                        return `Ore ${String(ore).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                      }
                      return label;
                    }}
                  />
                  {nodesForEnergySimulation.filter(n => n.type === 'sleep').map((node, index) => (
                    <ReferenceLine key={`fs-sleep-${node.id ?? index}`} x={node.wakeTime ?? 7.5} stroke="#00e5ff" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11 }} />
                  ))}
                  <ReferenceDot x={displayTime} y={dotY} isFront r={10} fill="#00e676" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="riservaFisica" name="Riserva Fisica" stroke="#00e676" fill="url(#colorRiservaFullscreen)" fillOpacity={0.3} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="energyPast" name="Energia SNC" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#colorEnergiaFullscreen)" connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="energyFuture" name="Previsione" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                  <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                  <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'cortisolo' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorCortisoloFullscreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9c27b0" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#9c27b0" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value, 'Cortisolo']} labelFormatter={(label) => `Ore ${label}:00`} />
                  <ReferenceDot x={displayTime} y={dotCortisolo} isFront r={10} fill="#9c27b0" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="cortisoloPast" stroke="#9c27b0" fill="url(#colorCortisoloFullscreen)" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="cortisoloFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'calorieTimeline' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={safeCalorieTimelineData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="time" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 'auto']} stroke="#666" fontSize={11} tickFormatter={(v) => Math.round(v)} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [Math.round(value), 'kcal']} labelFormatter={(label) => `Ore ${label}:00`} />
                  <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'glicemia' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[40, 220]} stroke="#666" fontSize={11} tickFormatter={(tick) => tick} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value != null ? Number(value).toFixed(0) : '—', 'Glicemia']} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
                  <ReferenceDot x={displayTime} y={dotGlicemia} isFront r={10} fill="#ef4444" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="glicemiaPast" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="glicemiaFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'idratazione' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—'), name === 'idratazionePast' ? 'Idratazione' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
                  <ReferenceDot x={displayTime} y={dotIdratazione} isFront r={10} fill="#00e5ff" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="idratazionePast" stroke="#00e5ff" fill="#00e5ff" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="idratazioneFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'neuro' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—'), name === 'neuroPast' ? 'Neuro' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
                  <ReferenceDot x={displayTime} y={dotNeuro} isFront r={10} fill="#6366f1" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="neuroPast" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="neuroFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'digestione' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—'), name === 'digestionePast' ? 'Digestione' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
                  <ReferenceDot x={displayTime} y={dotDigestione} isFront r={10} fill="#9333ea" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="digestionePast" stroke="#9333ea" fill="#9333ea" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="digestioneFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'kcal' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={finalChartData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={[0, Math.max(targetKcalChart || 2500, totalCaloriesTimeline || 0)]} stroke="#666" fontSize={11} tickFormatter={(v) => Math.round(v)} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value, name) => [value != null ? Math.round(Number(value)) : '—', name === 'kcalPast' ? 'Kcal' : name]} labelFormatter={(label) => typeof label === 'number' ? `Ore ${String(Math.floor(label)).padStart(2, '0')}:${String(Math.round((label % 1) * 60)).padStart(2, '0')}` : label} />
                  <ReferenceDot x={displayTime} y={scale(dotY)} isFront r={10} fill="#00e676" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                  <Area type="monotone" dataKey="kcalPast" stroke="#00e676" fill="#00e676" fillOpacity={0.3} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="kcalFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
            <TimeAlignmentChartDebugOverlay />
            </div>

            <div
              style={{
                flexShrink: 0,
                position: 'relative',
                width: '100%',
                paddingLeft: CHART_AXIS_GUTTER_LEFT_PX,
                paddingRight: CHART_AXIS_GUTTER_RIGHT_PX,
                boxSizing: 'border-box',
                marginTop: 10,
                marginBottom: 10,
              }}
            >
              <TimelineNodi
                activeNodesWithStack={activeNodesWithStack}
                chartUnit={chartUnit}
                activeAction={activeAction}
                analysisTabActive={activeBottomTab === 'analisi'}
                idealStrategy={idealStrategy}
                realTotals={realTotals}
                NODE_IMPORTANCE={NODE_IMPORTANCE}
                NODE_TYPE_ICON={NODE_TYPE_ICON}
                draggingNode={draggingNode}
                touchingNodeId={touchingNodeId}
                dragOffsetY={dragOffsetY}
                dragLiveTime={dragLiveTime}
                timelineContainerRef={timelineContainerRef}
                startNodeDrag={startNodeDrag}
                releaseNodePointer={releaseNodePointer}
                onNodeClick={onTimelineNodeClick}
                onTimelineTrackClick={openTimelineQuickAddAtPointer}
                onTimelineTrackLongPress={openTimelineQuickAddAtPointer}
                handleNodeTap={handleNodeTap}
                decimalToTimeStr={decimalToTimeStr}
                syncDatiFirebase={syncDatiFirebase}
                setManualNodes={setManualNodes}
                setDailyLog={setDailyLog}
                energyPercent={bodyBattery?.currentEnergy ?? 0}
                nowLineDecimalHour={!isViewingPastDate ? currentTime : undefined}
                timelineEnergySeries={timelineEnergySeries}
                timelineQualityChartData={chartData}
                updateMealTime={updateMealTime}
                onStripDragChartPreviewStart={onTimelineStripPreviewDragStart}
                onStripDragChartPreview={scheduleTimelineStripEnergyPreview}
                onStripDragChartPreviewEnd={clearTimelineStripEnergyPreview}
                onStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
              />
            </div>
            </div>
          </div>
        </div>
        {/* Pulsantiera Zoom ancorata al bordo destro, indipendente dallo scroll (position: fixed) */}
        <div
          role="group"
          aria-label="Controlli zoom fullscreen"
          style={{
            position: 'fixed',
            right: '15px',
            top: '40%',
            transform: 'translateY(-50%)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            background: 'rgba(20, 20, 20, 0.7)',
            padding: '10px',
            borderRadius: '30px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}
        >
          <button
            type="button"
            className="zoom-btn-vertical"
            onClick={openTimelineQuickAddAtCenter}
            title="Aggiungi sulla timeline (ora centrale striscia)"
            aria-label="Aggiungi sulla timeline"
            style={{
              background: 'linear-gradient(145deg, rgba(0,229,255,0.35), rgba(0,120,140,0.45))',
              borderColor: 'rgba(0,229,255,0.45)',
            }}
          >
            ⊕
          </button>
          <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 1.5))} title="Ingrandisci">+</button>
          <button type="button" className="zoom-btn-vertical" onClick={handleCenterZoomAndPan} title="Centra su ora attuale (30%)">🎯</button>
          <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.45))} title="Riduci">−</button>
        </div>
      </div>
    );
  } else {
    salaContent = (
    <div style={{ backgroundColor: isSimulationMode ? '#1a1625' : '#000', color: '#fff', height: '100dvh', maxHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 'max(10px, 1.5vh) 15px max(15px, 2vh) 15px', paddingBottom: 0, fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      <style>
        {`
          html, body {
            touch-action: pan-x pan-y;
            overscroll-behavior: none;
          }
          * { touch-action: manipulation; }

          /* Scrollbar nascosta per contenitori scorrevoli generici */
          .scrollbar-hide { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }

          .future { stroke-dasharray: 4 6; animation: f-flow 2s linear infinite; opacity: 0.2; }
          @keyframes f-flow { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }

          /* Mini-timeline: hitbox 44x44 e feedback :active stile iOS */
          .mini-timeline-hitbox { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; touch-action: none; cursor: grab; transition: transform 0.15s ease-out; }
          .mini-timeline-hitbox:active { transform: scale(1.08); cursor: grabbing; }
          .mini-timeline-bar-wrap { transition: transform 0.15s ease-out; }
          .mini-timeline-bar-wrap:active { transform: scale(1.03); }
          .mini-timeline-point-bubble { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
          .mini-timeline-point-bubble:active { transform: translate(-50%, -50%) scale(2); }

          /* Tasti header più grandi per il pollice */
          
          .drawer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); opacity: 0; pointer-events: none; transition: opacity 0.4s ease; z-index: 99998; }
          .drawer-overlay.open { opacity: 1; pointer-events: all; }
          
          /* Ottimizzazione Drawer per Mobile */
          .drawer-content { position: fixed; bottom: -100%; left: 0; right: 0; background: rgba(15, 15, 15, 0.95); border-top: 1px solid #2a2a2a; border-radius: 25px 25px 0 0 !important; padding: 30px 20px !important; padding-bottom: max(20px, env(safe-area-inset-bottom)); transition: bottom 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05); z-index: 99999; box-shadow: 0 -10px 50px rgba(0,0,0,0.9); max-height: 92dvh !important; overflow-y: auto; backdrop-filter: blur(25px); -webkit-overflow-scrolling: touch; }
          .drawer-content.open { bottom: 0; }
          
          /* Barra zoom verticale (pollice-friendly, bordo destro) - stessa definizione in index.css */
          .zoom-vertical-bar { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 14px; z-index: 50; background: rgba(0, 0, 0, 0.5); padding: 10px 6px; border-radius: 30px; backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.12); pointer-events: auto; }
          .zoom-btn-vertical { width: 40px; height: 40px; border-radius: 50%; background: #2c2c2e; color: white; border: 1px solid #444; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer; }
          .zoom-btn-vertical:active { background: #444; transform: scale(0.9); }
          @keyframes pulseDot {
            0%, 100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 3px rgba(0, 229, 255, 0.35)); }
            50% { transform: scale(1.1); opacity: 0.94; filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.5)) drop-shadow(0 0 14px rgba(255, 255, 255, 0.12)); }
          }
          .pulsing-dot { animation: pulseDot 2.8s infinite ease-in-out; transform-box: fill-box; transform-origin: center; }
          @media (prefers-reduced-motion: reduce) {
            .pulsing-dot { animation: none; filter: drop-shadow(0 0 4px rgba(0, 229, 255, 0.45)); }
          }
          .tachimeter-center.tachimeter-center-reset:hover { filter: brightness(1.08); box-shadow: 0 0 45px rgba(255,255,255,0.12); }

          /* Macro widgets: ~30% più piccoli, formato assunto/obiettivo */
          .macro-widget { position: absolute; width: 63px; height: 63px; z-index: 10; pointer-events: none; border-radius: 12px; overflow: hidden; }
          .macro-widget svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }
          .macro-text { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; pointer-events: none; }
          .macro-widget.macro-tl .macro-text { align-items: flex-start; padding: 6px 0 0 6px; }
          .macro-widget.macro-tr .macro-text { align-items: flex-end; padding: 6px 6px 0 0; }
          .macro-widget.macro-bl .macro-text { align-items: flex-start; padding: 0 0 6px 6px; }
          .macro-widget.macro-br .macro-text { align-items: flex-end; padding: 0 6px 6px 0; }
          .macro-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; }
          .macro-value { font-size: 0.9rem; font-weight: bold; color: #fff; }

          .macrosRow {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }
          .macrosRow .macroBox {
            min-width: 0;
            text-align: center;
          }
          
          /* Contenitore per lo scroll del grafico */
          .chart-scroll-container { width: 100%; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; cursor: grab; }
          .chart-scroll-container::-webkit-scrollbar { display: none; }

          .chartTitle {
            position: sticky;
            top: 0;
            z-index: 5;
            background: #0f1115;
            padding: 6px 0;
            font-weight: 600;
          }
          
          /* Super FAB Menu */
          .fab-container { position: fixed; bottom: 25px; right: 25px; z-index: 1000; }
          .fab-main { width: 65px; height: 65px; background: #00e5ff; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 2rem; color: #000; box-shadow: 0 4px 20px rgba(0,229,255,0.5); border: none; transition: 0.3s; z-index: 2; cursor: pointer; -webkit-tap-highlight-color: transparent; }
          .fab-main.open { transform: rotate(45deg); background: #ff4d4d; }
          .fab-menu { position: absolute; bottom: 80px; right: 5px; display: flex; flex-direction: column; gap: 15px; pointer-events: none; opacity: 0; transition: 0.3s; transform: translateY(20px); }
          .fab-menu.open { pointer-events: all; opacity: 1; transform: translateY(0); }
          .fab-item { position: relative; width: 50px; height: 50px; background: #1a1a1a; border: 1px solid #333; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; box-shadow: 0 4px 15px rgba(0,0,0,0.5); cursor: pointer; }
          .fab-label { position: absolute; right: 65px; background: #000; padding: 5px 12px; border-radius: 8px; font-size: 0.7rem; color: #00e5ff; white-space: nowrap; border: 1px solid #00e5ff; }
          
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          .view-animate { animation: fadeIn 0.3s ease forwards; }

          /* Carosello Telemetria: scroll orizzontale con snap */
          .telemetry-carousel { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; scroll-behavior: smooth; }
          .telemetry-carousel::-webkit-scrollbar { display: none; }
          .telemetry-carousel-slide { flex: 0 0 100%; scroll-snap-align: start; scroll-snap-stop: always; min-width: 100%; box-sizing: border-box; }
          .telemetry-carousel.finecorsa { scroll-snap-type: none; }

          .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          .action-btn { background: rgba(255,255,255,0.04); border: 1px solid #2a2a2a; color: #fff; padding: 18px 16px; min-height: 48px; min-width: 48px; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; -webkit-tap-highlight-color: transparent; }
          .action-btn:active { transform: scale(0.95); border-color: #555; background: rgba(255,255,255,0.08); }
          .action-btn.full-width { grid-column: 1 / -1; flex-direction: row; padding: 20px; gap: 15px; }
          .action-btn.full-width .action-icon { font-size: 2rem; }
          .action-icon { font-size: 1.6rem; filter: drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
          .action-icon-img { width: 1.6rem; height: 1.6rem; object-fit: contain; display: block; flex-shrink: 0; }
          .action-icon-img-lg { width: 1.8rem; height: 1.8rem; }
          .action-icon-img-fab { width: 1.35rem; height: 1.35rem; }
          .action-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1.5px; color: #aaa; font-weight: 600; }

          .type-btn { flex: 1; background: transparent; border: 1px solid #333; color: #777; padding: 12px 0; border-radius: 14px; font-size: 0.7rem; letter-spacing: 1px; cursor: pointer; transition: 0.3s; text-align: center; }
          .type-btn.active { background: #fff; color: #000; border-color: #fff; font-weight: bold; box-shadow: 0 0 15px rgba(255,255,255,0.2); }
          .type-btn.active.orange { background: #ff6d00; color: #000; border-color: #ff6d00; box-shadow: 0 0 15px rgba(255, 109, 0, 0.4); }
          .type-btn.active.blue { background: #00e5ff; color: #000; border-color: #00e5ff; box-shadow: 0 0 15px rgba(0, 229, 255, 0.4); }

          .burn-slider-container { background: #111; padding: 30px 20px; border-radius: 20px; border: 1px solid #222; text-align: center; margin-bottom: 20px; position: relative; overflow: hidden; }
          .burn-value { font-size: 3.5rem; font-weight: bold; color: #fff; line-height: 1; margin-bottom: 5px; }
          .burn-value.tuning { color: #00e5ff; text-shadow: 0 0 20px rgba(0,229,255,0.3); }
          .burn-value.workout { color: #ff6d00; text-shadow: 0 0 20px rgba(255,109,0,0.3); }
          .burn-label { font-size: 0.75rem; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 25px; display: block; }
          .custom-range { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: #2a2a2a; outline: none; position: relative; z-index: 2; }
          .custom-range.orange::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 26px; height: 26px; border-radius: 50%; background: #ff6d00; cursor: pointer; box-shadow: 0 0 15px #ff6d00, inset 0 0 5px rgba(255,255,255,0.8); border: 2px solid #fff; }
          .custom-range.blue::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 26px; height: 26px; border-radius: 50%; background: #00e5ff; cursor: pointer; box-shadow: 0 0 15px #00e5ff, inset 0 0 5px rgba(255,255,255,0.8); border: 2px solid #fff; }

          .food-pill { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.5); border: 1px solid #2a2a2a; padding: 12px 15px; border-radius: 14px; margin-bottom: 8px; animation: fadeIn 0.2s ease; }
          .food-pill-name { font-size: 0.85rem; font-weight: 500; color: #eee; }
          .food-pill-weight { font-size: 0.75rem; color: #00e5ff; margin-left: 10px; font-weight: bold; }
          .food-pill-actions { display: flex; gap: 10px; align-items: center; }
          .food-pill-btn { background: none; border: none; cursor: pointer; font-size: 1rem; opacity: 0.6; transition: 0.2s; padding: 0; }
          .food-pill-btn:hover { opacity: 1; }
          .btn-info { color: #fff; } .btn-delete { color: #ff4d4d; }
          .calibration-btn { min-width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(0, 229, 255, 0.4); background: rgba(0, 229, 255, 0.1); color: #00e5ff; font-size: 1.1rem; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.15s, background 0.2s; -webkit-tap-highlight-color: transparent; }
          .calibration-btn:active { transform: scale(0.92); background: rgba(0, 229, 255, 0.25); }
          .quick-add-bar { display: flex; width: 100%; background: rgba(255,255,255,0.05); border-radius: 18px; border: 1px solid #333; overflow: hidden; margin-bottom: 20px; transition: border-color 0.3s; }
          .quick-add-bar:focus-within { border-color: #00e5ff; box-shadow: 0 0 15px rgba(0, 229, 255, 0.1); }
          .quick-input { background: transparent; border: none; color: #fff; padding: 16px; font-size: 0.9rem; outline: none; }
          .input-name { flex: 2; min-width: 0; border-right: 1px solid #333; }
          .input-weight { flex: 1; min-width: 0; text-align: center; }
          .quick-add-btn { flex-shrink: 0; padding: 0 18px; background: #00e5ff; color: #000; border: none; font-weight: bold; font-size: 1.2rem; cursor: pointer; transition: 0.2s; }
          
          /* Tasto Vyta AI in basso a sinistra */
          .ai-chat-btn { position: fixed; bottom: 25px; left: 20px; background: linear-gradient(135deg, #b388ff, #00e5ff); color: #000; border: none; border-radius: 25px; padding: 12px 20px; font-weight: bold; font-size: 0.9rem; box-shadow: 0 4px 15px rgba(179, 136, 255, 0.3); z-index: 1000; display: flex; align-items: center; gap: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
          
          /* Blocca lo scroll del grafico quando si trascina un nodo */
          .chart-scroll-container.dragging { overflow-x: hidden !important; }
          
          .diary-group-title { font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 2px; margin: 20px 0 10px 10px; border-left: 2px solid #00e5ff; padding-left: 10px; }
          
          .water-fill-container { height: 12px; background: #222; border-radius: 6px; overflow: hidden; margin: 20px 0 40px 0; position: relative; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5); }
          .water-fill-bar { height: 100%; background: linear-gradient(90deg, #007aff, #00e5ff); border-radius: 6px; transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); box-shadow: 0 0 15px rgba(0, 229, 255, 0.6); position: relative; }
          .water-quick-btn { background: rgba(0, 229, 255, 0.05); border: 1px solid rgba(0, 229, 255, 0.2); color: #00e5ff; padding: 25px 0; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; flex: 1; }
          .water-rectify-btn { background: transparent; border: 1px solid #333; color: #888; border-radius: 12px; padding: 8px 15px; font-size: 0.75rem; cursor: pointer; transition: 0.2s; }
          
          /* Modulo Acqua: Glassmorphism + Sfera con onda */
          .water-glass { background: rgba(255, 255, 255, 0.06); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08); }
          .water-sphere { position: relative; width: 180px; height: 180px; border-radius: 50%; background: rgba(0, 30, 50, 0.4); border: 2px solid rgba(0, 229, 255, 0.35); box-shadow: inset 0 0 40px rgba(0, 229, 255, 0.1), 0 0 40px rgba(0, 229, 255, 0.15); overflow: hidden; }
          .water-sphere-inner { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; }
          .water-wave { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, rgba(0, 150, 255, 0.5) 0%, rgba(0, 229, 255, 0.85) 50%, rgba(0, 234, 255, 0.95) 100%); transition: height 0.8s cubic-bezier(0.33, 1, 0.68, 1); }
          .water-wave::before { content: ''; position: absolute; left: -50%; top: -100%; width: 200%; height: 200%; background: radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255,255,255,0.15) 0%, transparent 60%); animation: waterShine 4s ease-in-out infinite; }
          .water-wave::after { content: ''; position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120' preserveAspectRatio='none'%3E%3Cpath d='M0 60 Q300 20 600 60 T1200 60 L1200 120 L0 120 Z' fill='rgba(255,255,255,0.08)'/%3E%3C/svg%3E") repeat-x bottom center/200% 80px; animation: waveDrift 6s linear infinite; pointer-events: none; }
          @keyframes waterShine { 0%, 100% { opacity: 0.5; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-5px); } }
          @keyframes waveDrift { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          
          .chat-container { display: flex; flex-direction: column; flex: 1; min-height: 0; height: auto; max-height: none; }
          .chat-messages { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; padding-right: 5px; padding-bottom: 20px; -webkit-overflow-scrolling: touch; }
          .chat-bubble { max-width: 88%; padding: 16px 18px; border-radius: 20px; font-size: 1.0625rem; line-height: 1.65; white-space: pre-wrap; word-break: break-word; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .bubble-ai { background: #1f1f1f; border: 1px solid #333; color: #eee; border-bottom-left-radius: 4px; align-self: flex-start; }
          .bubble-user { background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.14); color: #e2e8f0; font-weight: 500; border-bottom-right-radius: 4px; align-self: flex-end; box-shadow: 0 2px 16px rgba(0, 0, 0, 0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
          .typing-indicator { display: flex; gap: 4px; padding: 5px; }
          .dot { width: 6px; height: 6px; background: #888; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
          .dot:nth-child(1) { animation-delay: -0.32s; } .dot:nth-child(2) { animation-delay: -0.16s; }
          @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); background: #fff; } }
          .chat-input-wrapper { display: flex; align-items: center; gap: 10px; background: #1a1a1a; border-radius: 30px; padding: 6px 6px 6px 20px; border: 1px solid #333; margin-top: 10px; }
          .chat-input { flex: 1; background: transparent; border: none; color: #fff; font-size: 1.05rem; line-height: 1.5; outline: none; }
          .chat-send-btn { background: #fff; color: #000; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: 0.2s; font-size: 1.1rem; }
          .chat-send-btn.has-text { background: #b388ff; color: #fff; }

          .delete-overlay { position: fixed; inset: 0; background: radial-gradient(circle, rgba(220, 38, 38, 0.0) 40%, rgba(220, 38, 38, 0.25) 100%); z-index: 45; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; display: flex; align-items: center; justify-content: center; flex-direction: column; }
          .delete-overlay.active { opacity: 1; }
          .delete-icon { font-size: 5rem; filter: drop-shadow(0 0 20px rgba(220, 38, 38, 0.8)); opacity: 0.5; transform: scale(0.8); transition: transform 0.2s ease; }
          .delete-overlay.active .delete-icon { transform: scale(1); opacity: 0.8; }
          .delete-text { color: #ef4444; font-size: 1.2rem; letter-spacing: 4px; font-weight: bold; margin-top: 20px; text-shadow: 0 0 10px rgba(220, 38, 38, 0.5); }

          /* Blocco selezione nativa e preparazione animazione nodi timeline */
          .timeline-node, .meal-node {
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
            -webkit-user-drag: none;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
            cursor: grab;
          }
          .timeline-node.is-dragging, .meal-node.is-dragging {
            z-index: 10 !important;
            box-shadow: 0 15px 25px rgba(0,0,0,0.6);
            cursor: grabbing;
            transition: box-shadow 0.2s ease;
          }
          .node-time-label {
            pointer-events: none;
            user-select: none;
            -webkit-user-select: none;
          }
          .is-dragging .node-time-label {
            font-size: 1.2rem;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          }

          @media print {
            body * { visibility: hidden; }
            .report-modal-overlay, .report-modal-overlay * { visibility: visible; }
            .report-modal-overlay { position: absolute; left: 0; top: 0; padding: 0; background: white; }
            .report-no-print { display: none !important; }
          }
          
          /* Tooltip grafico invisibile di default, visibile solo con tap prolungato */
          .hide-tooltip .recharts-tooltip-wrapper { visibility: hidden !important; opacity: 0 !important; transition: opacity 0.2s ease; }
          .show-tooltip .recharts-tooltip-wrapper { visibility: visible !important; opacity: 1 !important; transition: opacity 0.2s ease; }

          /* Console di Telemetria */
          .telemetry-btn { padding: 4px 10px; font-size: 0.7rem; border-radius: 8px; border: 1px solid #333; background: transparent; color: #666; cursor: pointer; transition: 0.3s; font-weight: normal; -webkit-tap-highlight-color: transparent; }
          .telemetry-btn.active { background: rgba(0, 229, 255, 0.15); border-color: #00e5ff; color: #00e5ff; font-weight: bold; }
          .telemetry-btn.active.blood { background: rgba(239, 68, 68, 0.15); border-color: #ef4444; color: #ef4444; }
          .pulse-alert { animation: pulseAlert 1.5s infinite; color: #ef4444; border-color: #ef4444; font-weight: bold; }
          @keyframes pulseAlert { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); } 70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
          .telemetry-btn.active.water { background: rgba(0, 229, 255, 0.15); border-color: #00e5ff; color: #00e5ff; }
          .pulse-alert-water { animation: pulseWater 1.5s infinite; color: #00e5ff; border-color: #00e5ff; font-weight: bold; }
          @keyframes pulseWater { 0% { box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.6); } 70% { box-shadow: 0 0 0 8px rgba(0, 229, 255, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 229, 255, 0); } }
          .telemetry-btn.active.cortisol { background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #f59e0b; }
          .pulse-alert-cortisol { animation: pulseCortisol 1.5s infinite; color: #f59e0b; border-color: #f59e0b; font-weight: bold; }
          @keyframes pulseCortisol { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); } 70% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }
          .telemetry-btn-alarm { box-shadow: 0 0 8px rgba(255, 50, 50, 0.8); border: 1px solid #ff4444 !important; animation: pulseAlertOpacity 2s infinite; }
          @keyframes pulseAlertOpacity { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }

          /* Barre Live Telemetria */
          @keyframes neonPulse {
            0% { filter: brightness(1); opacity: 0.8; }
            100% { filter: brightness(1.3); opacity: 1; box-shadow: 0 0 10px currentColor; }
          }
          .live-bar-addition {
            animation: neonPulse 1s infinite alternate;
            background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 5px, transparent 5px, transparent 10px);
            border-left: 1px solid rgba(0,0,0,0.5);
          }
          .live-bar-overflow { background: #ff1744 !important; box-shadow: 0 0 10px #ff1744; }

          /* Ottimizzazione Desktop per Costruttore */
          @media (min-width: 768px) {
            .drawer-content.open { height: 95dvh; max-height: 95dvh !important; display: flex; flex-direction: column; }
            .pasto-container { display: flex; gap: 30px; height: 100%; }
            .pasto-telemetry-panel { flex: 1; border-right: 1px solid #333; padding-right: 20px; overflow-y: auto; }
            .pasto-builder-panel { flex: 1.5; overflow-y: auto; padding-left: 10px; }
          }
        `}
      </style>

      <div
        className={`delete-overlay ${isReadyToDelete ? 'active' : ''}`}
        style={{
          opacity: isReadyToDelete ? 1 : 0,
          visibility: isReadyToDelete ? 'visible' : 'hidden',
          pointerEvents: 'none'
        }}
      >
        <div className="delete-icon">🗑️</div>
        <div className="delete-text">RILASCIA PER ELIMINARE</div>
      </div>

      {ghostProgramDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ghost-delete-title"
          onClick={() => setGhostProgramDeleteModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100025,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              padding: '22px 20px',
              borderRadius: 18,
              border: '1px solid rgba(0, 229, 255, 0.22)',
              background: 'linear-gradient(155deg, rgba(28, 32, 40, 0.92) 0%, rgba(14, 16, 22, 0.88) 100%)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <h3 id="ghost-delete-title" style={{ margin: '0 0 8px 0', color: '#e8fdff', fontSize: '1.05rem', fontWeight: 800 }}>
              Programmazione Kentu
            </h3>
            <p style={{ margin: '0 0 18px 0', color: 'rgba(200, 220, 230, 0.88)', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Questo slot è pianificato dall&apos;AI. Vuoi rimuovere solo questo elemento o tutta la programmazione fantasma di oggi?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  const { nodeId, dragType } = ghostProgramDeleteModal;
                  setGhostProgramDeleteModal(null);
                  const dl = dailyLogRef.current || [];
                  const mn = manualNodesRef.current || [];
                  if (dragType === 'ghost_meal') {
                    const nextLog = dl.filter((e) => e.id !== nodeId);
                    setDailyLog(nextLog);
                    syncDatiFirebase(nextLog, mn);
                    pushTimelineUndoSnapshot(nextLog, mn);
                  } else {
                    const nextNodes = mn.filter((n) => n.id !== nodeId);
                    setManualNodes(nextNodes);
                    syncDatiFirebase(dl, nextNodes);
                    pushTimelineUndoSnapshot(dl, nextNodes);
                  }
                }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(0, 229, 255, 0.45)',
                  background: 'rgba(0, 229, 255, 0.12)',
                  color: '#00e5ff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Cancella solo questo
              </button>
              <button
                type="button"
                onClick={() => {
                  setGhostProgramDeleteModal(null);
                  const dl = dailyLogRef.current || [];
                  const mn = manualNodesRef.current || [];
                  const nextLog = dl.filter((e) => !(e.isGhost === true || e.type === 'ghost_meal'));
                  const nextNodes = mn.filter((n) => !(n.isGhost === true || n.type === 'ghost_workout'));
                  setDailyLog(nextLog);
                  setManualNodes(nextNodes);
                  syncDatiFirebase(nextLog, nextNodes);
                  pushTimelineUndoSnapshot(nextLog, nextNodes);
                  setProgrammingRemovedToast(true);
                  setTimeout(() => setProgrammingRemovedToast(false), 4000);
                }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  background: 'rgba(248, 113, 113, 0.1)',
                  color: '#fca5a5',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Cancella tutta la programmazione
              </button>
              <button
                type="button"
                onClick={() => setGhostProgramDeleteModal(null)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent',
                  color: 'rgba(180, 190, 200, 0.95)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {programmingRemovedToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 'calc(80px + 75px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100026,
            padding: '12px 22px',
            background: 'rgba(20, 24, 32, 0.92)',
            border: '1px solid rgba(0, 229, 255, 0.35)',
            borderRadius: 16,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.4)',
          }}
        >
          <span style={{ color: '#00e5ff', fontSize: '0.9rem', fontWeight: 600 }}>Programmazione giornaliera rimossa.</span>
        </div>
      )}

      {/* Header compatto: logo | data | energia (spazio per futura bottom bar) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '6px 4px 8px', marginBottom: '8px', gap: '6px', boxSizing: 'border-box' }}>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { handleCoreOsClick(); setActiveAction(null); setIsDrawerOpen(false); setShowChoiceModal(false); setShowReport(false); setShowProfile(false); setSelectedNodeReport(null); setShowReportModal(false); }}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                maxWidth: 'min(46vw, 168px)',
              }}
            >
              <img
                src="/nuovo%20logo%20trasparente2.png"
                alt="Kentuos Logo"
                decoding="async"
                draggable={false}
                style={{
                  maxHeight: 52,
                  height: 'auto',
                  width: 'auto',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  objectPosition: 'left center',
                  display: 'block',
                }}
              />
            </button>
          </div>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              <button
                type="button"
                onClick={() => changeDate(-1)}
                style={{ background: 'none', border: 'none', color: '#00e5ff', fontSize: '1.1rem', padding: '6px', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                aria-label="Giorno precedente"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarMonthIso(currentTrackerDate.slice(0, 7));
                  setShowDateCalendarModal(true);
                }}
                style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap', padding: '0 6px', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Apri calendario storico"
                title="Apri calendario storico"
              >
                {currentDateObj.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
              </button>
              <button
                type="button"
                onClick={() => changeDate(1)}
                disabled={currentTrackerDate === getTodayString()}
                style={{ background: 'none', border: 'none', color: '#00e5ff', fontSize: '1.1rem', padding: '6px', flexShrink: 0, cursor: currentTrackerDate === getTodayString() ? 'default' : 'pointer', opacity: currentTrackerDate === getTodayString() ? 0.3 : 1, display: 'flex', alignItems: 'center' }}
                aria-label="Giorno successivo"
              >
                ▶
              </button>
            </div>
          </div>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
            {sncStressLevel > 65 && (
              <button
                type="button"
                onClick={() => setShowSncPopup(true)}
                title={sncStressLevel >= 85 ? 'Allarme overtraining SNC' : 'Affaticamento SNC'}
                aria-label={sncStressLevel >= 85 ? 'Allarme overtraining SNC' : 'Affaticamento SNC'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.15rem',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: 1,
                  animation: sncStressLevel >= 85 ? 'pulseDot 1.5s infinite ease-in-out' : 'none',
                  flexShrink: 0,
                }}
              >
                {sncStressLevel >= 85 ? '⚠️' : '⚡'}
              </button>
            )}
            <div
              role="button"
              tabIndex={0}
              aria-label={`Body Battery ${bodyBattery?.currentEnergy ?? 0} per cento. Apri dettaglio.`}
              title="Body Battery — dettaglio"
              onClick={() => setShowBatteryModal(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowBatteryModal(true);
                }
              }}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, position: 'relative' }}
            >
              <EnergyArc
                percentage={bodyBattery?.currentEnergy ?? 0}
                size="small"
                hasNapBoost={!!bodyBattery?.hasNapBoost}
                showText={false}
              />
              <span style={{ fontSize: '0.7rem', color: '#a1a1aa', marginTop: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                🔋 Energia {bodyBattery?.currentEnergy ?? 0}%
              </span>
            </div>
          </div>
        </div>

        {isSimulationMode && (
          <div style={{
            background: 'linear-gradient(90deg, #6200ea, #b388ff)',
            color: '#fff',
            padding: '8px 15px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            boxShadow: '0 4px 15px rgba(98, 0, 234, 0.4)',
            zIndex: 100
          }}>
            <span>🧪 MODALITÀ SIMULAZIONE ATTIVA</span>
            <button
              type="button"
              onClick={() => {
                setIsSimulationMode(false);
                setSimulatedLog(null);
              }}
              style={{ background: 'rgba(0,0,0,0.3)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ESCI ✖
            </button>
          </div>
        )}

      {MAIN_BOTTOM_TAB_ORDER.includes(activeBottomTab) && (
      <div
        key={activeBottomTab}
        className={`main-tab-swipe-area ${slideDirection}`}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px) + 78px)', boxSizing: 'border-box', width: '100%' }}
        onTouchStart={handleMainTabTouchStart}
        onTouchMove={handleMainTabTouchMove}
        onTouchEnd={handleMainTabTouchEnd}
        onTouchCancel={handleMainTabTouchCancel}
      >
      {(activeBottomTab === 'oggi' || activeBottomTab === 'analisi') && (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', width: '100%' }}>
      {/* Barra Telemetria Rapida Premium - wrap attivato e centrato (solo tab Oggi) */}
      {activeBottomTab === 'oggi' && (
      <div onClick={() => setShowSpieInfo(true)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: 'max(8px, 1vh)', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' }}>
          <span style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.35)', padding: '8px 12px', borderRadius: '20px', color: '#7dd3fc', whiteSpace: 'nowrap', fontSize: '0.62rem' }} title="Strategia calorica da Kentu (chat)">
            🎯 Target oggi: {calorieStrategyShortLabelIt(kentuDailyCalorieStrategy)}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${((Number(totali?.omega3) ?? 0) < 1) ? '#ff5555' : '#00e676'}`, padding: '8px 12px', borderRadius: '20px', color: ((Number(totali?.omega3) ?? 0) < 1) ? '#ff5555' : '#00e676', boxShadow: `0 0 10px ${((Number(totali?.omega3) ?? 0) < 1) ? 'rgba(255,85,85,0.2)' : 'rgba(0,230,118,0.1)'}`, whiteSpace: 'nowrap' }}>
            {((Number(totali?.omega3) ?? 0) < 1) ? '🔴 Carenza Micro' : '🟢 Micro OK'}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${energyAt20Percent < 40 ? '#ff9800' : '#00e676'}`, padding: '8px 12px', borderRadius: '20px', color: energyAt20Percent < 40 ? '#ff9800' : '#00e676', boxShadow: `0 0 10px ${energyAt20Percent < 40 ? 'rgba(255,152,0,0.2)' : 'rgba(0,230,118,0.1)'}`, whiteSpace: 'nowrap' }}>
            {energyAt20Percent < 40 ? '🟠 Rischio Serali' : '🟢 Serali OK'}
          </span>
        </div>
      </div>
      )}

      {activeBottomTab === 'oggi' && (!activeAction || activeAction === 'home') && homeLongevityInsightLine ? (
        <div style={{ fontSize: '13px', opacity: 0.7, color: '#94a3b8', marginBottom: '6px' }}>
          {homeLongevityInsightLine}
        </div>
      ) : null}

      {(activeBottomTab === 'analisi' || (activeBottomTab === 'oggi' && userProfile?.level === 'pro')) && (
      <>
      {/* Cruscotto energetico giornaliero 0-24h */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '16px', padding: 'max(10px, 1.5vh) 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div
          className="analisi-pre-chart-controls"
          style={{
            flexShrink: 0,
            marginBottom: '10px',
            order: activeBottomTab === 'analisi' ? 2 : 0,
          }}
        >
          {/* Dashboard Allarmi: Analisi = riga scrollabile icona+testo; Oggi Pro = pill compatte */}
          {activeBottomTab === 'analisi' ? (
            <div className="chart-selector-container">
              {(() => {
                const activeAlerts = [];
                if (hasCrashRisk) activeAlerts.push('glicemia');
                if (hasWaterRisk) activeAlerts.push('idratazione');
                if (hasCortisolRisk) activeAlerts.push('cortisolo');
                if (hasDigestionRisk) activeAlerts.push('digestione');
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setChartUnit('percent')}
                      aria-pressed={chartUnit === 'percent'}
                      className={`chart-selector-btn${chartUnit === 'percent' ? ' active' : ''}${activeAlerts.includes('percent') ? ' chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">⚡</span>
                      <span className="chart-btn-label">TDEE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('calorieTimeline')}
                      aria-pressed={chartUnit === 'calorieTimeline'}
                      className={`chart-selector-btn chart-selector-btn--cumul${chartUnit === 'calorieTimeline' ? ' active' : ''}${activeAlerts.includes('calorieTimeline') ? ' chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">🔥</span>
                      <span className="chart-btn-label">Kcal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('glicemia')}
                      aria-pressed={chartUnit === 'glicemia'}
                      className={`chart-selector-btn chart-selector-btn--blood${chartUnit === 'glicemia' ? ' active' : ''}${hasCrashRisk && chartUnit !== 'glicemia' ? ' pulse-alert chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">🩸</span>
                      <span className="chart-btn-label">Glic</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('idratazione')}
                      aria-pressed={chartUnit === 'idratazione'}
                      className={`chart-selector-btn chart-selector-btn--water${chartUnit === 'idratazione' ? ' active' : ''}${hasWaterRisk && chartUnit !== 'idratazione' ? ' pulse-alert-water chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">💧</span>
                      <span className="chart-btn-label">Acqua</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('neuro')}
                      aria-pressed={chartUnit === 'neuro'}
                      className={`chart-selector-btn chart-selector-btn--neuro${chartUnit === 'neuro' ? ' active' : ''}${activeAlerts.includes('neuro') ? ' chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">🧠</span>
                      <span className="chart-btn-label">Neuro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('cortisolo')}
                      aria-pressed={chartUnit === 'cortisolo'}
                      className={`chart-selector-btn chart-selector-btn--cortisol${chartUnit === 'cortisolo' ? ' active' : ''}${hasCortisolRisk && chartUnit !== 'cortisolo' ? ' pulse-alert-cortisol chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">😰</span>
                      <span className="chart-btn-label">Stress</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartUnit('digestione')}
                      aria-pressed={chartUnit === 'digestione'}
                      className={`chart-selector-btn chart-selector-btn--digest${chartUnit === 'digestione' ? ' active' : ''}${hasDigestionRisk && chartUnit !== 'digestione' ? ' pulse-alert chart-selector-alarm' : ''}`}
                    >
                      <span className="chart-btn-icon">🥑</span>
                      <span className="chart-btn-label">Macro</span>
                    </button>
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-start', paddingBottom: '10px', alignItems: 'center' }}>
              {(() => {
                const activeAlerts = [];
                if (hasCrashRisk) activeAlerts.push('glicemia');
                if (hasWaterRisk) activeAlerts.push('idratazione');
                if (hasCortisolRisk) activeAlerts.push('cortisolo');
                if (hasDigestionRisk) activeAlerts.push('digestione');
                return (
                  <>
                    <button type="button" onClick={() => setChartUnit('percent')} className={`telemetry-btn ${chartUnit === 'percent' ? 'active' : ''} ${activeAlerts.includes('percent') ? 'telemetry-btn-alarm' : ''}`}>⚡ %</button>
                    <button type="button" onClick={() => setChartUnit('calorieTimeline')} className={`telemetry-btn ${chartUnit === 'calorieTimeline' ? 'active' : ''} ${activeAlerts.includes('calorieTimeline') ? 'telemetry-btn-alarm' : ''}`} style={chartUnit === 'calorieTimeline' ? { color: '#ff9800', borderColor: '#ff9800' } : undefined}>📈 CUMUL</button>
                    <button type="button" onClick={() => setChartUnit('glicemia')} className={`telemetry-btn ${chartUnit === 'glicemia' ? 'active blood' : ''} ${hasCrashRisk && chartUnit !== 'glicemia' ? 'pulse-alert telemetry-btn-alarm' : ''}`}>🩸 GLICEM</button>
                    <button type="button" onClick={() => setChartUnit('idratazione')} className={`telemetry-btn ${chartUnit === 'idratazione' ? 'active water' : ''} ${hasWaterRisk && chartUnit !== 'idratazione' ? 'pulse-alert-water telemetry-btn-alarm' : ''}`}>💧 IDRAT</button>
                    <button type="button" onClick={() => setChartUnit('neuro')} className={`telemetry-btn ${chartUnit === 'neuro' ? 'active' : ''} ${activeAlerts.includes('neuro') ? 'telemetry-btn-alarm' : ''}`} style={chartUnit === 'neuro' ? { color: '#6366f1', borderColor: '#6366f1' } : undefined}>🧠 NEURO</button>
                    <button type="button" onClick={() => setChartUnit('cortisolo')} className={`telemetry-btn ${chartUnit === 'cortisolo' ? 'active cortisol' : ''} ${hasCortisolRisk && chartUnit !== 'cortisolo' ? 'pulse-alert-cortisol telemetry-btn-alarm' : ''}`}>🧠 CORTISOL</button>
                    <button type="button" onClick={() => setChartUnit('digestione')} className={`telemetry-btn ${chartUnit === 'digestione' ? 'active' : ''} ${hasDigestionRisk && chartUnit !== 'digestione' ? 'pulse-alert telemetry-btn-alarm' : ''}`} style={chartUnit === 'digestione' ? { color: '#9333ea', borderColor: '#9333ea' } : undefined}>⚙️ DIGEST</button>
                  </>
                );
              })()}
            </div>
          )}
          <MetabolicPhaseCompact
            stateLabel={metabolicState.label}
            stateColor={metabolicState.color}
            glycemiaValue={gl}
            digestionValue={dig}
            style={{ marginTop: '6px' }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => { if (trafficLight.text === 'IN DIGESTIONE') setShowTrainingPopup(true); }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && trafficLight.text === 'IN DIGESTIONE') { e.preventDefault(); setShowTrainingPopup(true); } }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#1a1a1a', padding: '10px 15px', borderRadius: '12px', border: `1px solid ${trafficLight.color}`, marginTop: '8px', cursor: trafficLight.text === 'IN DIGESTIONE' ? 'pointer' : 'default' }}
          >
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: trafficLight.color, boxShadow: `0 0 10px ${trafficLight.color}` }} />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: trafficLight.color }}>{trafficLight.text}</div>
              <div style={{ fontSize: '0.65rem', color: '#aaa' }}>{trafficLight.msg}</div>
            </div>
          </div>
        </div>
        <div
          className="analisi-top-visual-container"
          style={{
            flex: 1,
            minHeight: 0,
            order: activeBottomTab === 'analisi' ? 1 : 0,
          }}
        >
        <div className="chart-wrapper" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="chartTitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '2px', textTransform: 'uppercase' }}>
              {chartUnit === 'percent' ? 'Energia SNC (%)' : chartUnit === 'calorieTimeline' ? 'Calorie cumulative' : chartUnit === 'glicemia' ? 'Simulatore Glicemico' : chartUnit === 'idratazione' ? 'Simulatore Idratazione' : chartUnit === 'cortisolo' ? 'Cortisolo / Stress' : chartUnit === 'digestione' ? 'Grafico della Digestione' : chartUnit === 'neuro' ? 'Recupero Neurologico' : 'Energia SNC (%)'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button type="button" onClick={handleUndo} disabled={historyIndex <= 0} title="Annulla" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: historyIndex <= 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: '8px', color: historyIndex <= 0 ? '#444' : '#00e5ff', fontSize: '1.1rem', cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer' }} aria-label="Annulla">↩</button>
              <button type="button" onClick={handleRedo} disabled={historyIndex >= historyStack.length - 1} title="Ripeti" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: historyIndex >= historyStack.length - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: '8px', color: historyIndex >= historyStack.length - 1 ? '#444' : '#00e5ff', fontSize: '1.1rem', cursor: historyIndex >= historyStack.length - 1 ? 'not-allowed' : 'pointer' }} aria-label="Ripeti">↪</button>
              {chartUnit === 'idratazione' && isWaterHydrationAutoPilot && (
                <span title="Nessun record acqua: il motore assume idratazione ottimale (100%). Aggiungi acqua dal diario per il tracking reale." style={{ fontSize: '0.65rem', color: '#00e5ff', opacity: 0.9, maxWidth: '140px', lineHeight: 1.2, textAlign: 'right' }}>🤖 Pilota idratazione attivo</span>
              )}
              <button type="button" onClick={() => { setExpandedChart(chartUnit); setActiveHighlight(null); }} title="Dettagli / Telemetria" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: '8px', color: '#00e5ff', fontSize: '1rem', cursor: 'pointer' }} aria-label="Dettagli grafico">🎯</button>
              <button type="button" onClick={enterFullscreen} title="Fullscreen" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: '8px', color: '#00e5ff', fontSize: '1rem', cursor: 'pointer' }} aria-label="Apri a tutto schermo">⛶</button>
            </div>
          </div>
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', transform: 'none' }}>
            {(activeBottomTab === 'analisi' || !activeAction || activeAction === 'home') && (
            <div className="zoom-vertical-bar" aria-label="Controlli zoom">
              <button
                type="button"
                className="zoom-btn-vertical"
                onClick={openTimelineQuickAddAtCenter}
                title="Aggiungi sulla timeline (ora centrale)"
                aria-label="Aggiungi sulla timeline"
                style={{
                  background: 'linear-gradient(145deg, rgba(0,229,255,0.35), rgba(0,120,140,0.45))',
                  borderColor: 'rgba(0,229,255,0.45)',
                }}
              >
                ⊕
              </button>
              <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 1.5))} title="Ingrandisci">+</button>
              <button type="button" className="zoom-btn-vertical" onClick={handleCenterZoomAndPan} title="Centra su ora attuale (30%)">🎯</button>
              <button type="button" className="zoom-btn-vertical" onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.45))} title="Riduci">−</button>
            </div>
            )}
            <div className={`chart-scroll-container ${draggingNode ? 'dragging' : ''}`} ref={chartScrollRef} onTouchStart={handleChartTouchStart} onTouchMove={handleChartTouchMove} onTouchEnd={handleChartTouchEnd} style={{ display: 'flex', flex: 1, minHeight: 0, background: 'linear-gradient(180deg, #000 0%, #050505 100%)', borderRadius: '15px' }}>
            <div
              className={isChartTooltipActive ? 'show-tooltip' : 'hide-tooltip'}
              onTouchStart={() => { chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400); }}
              onTouchMove={() => { if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; }}
              onTouchEnd={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
              onMouseDown={() => { chartTouchTimerRef.current = setTimeout(() => setIsChartTooltipActive(true), 400); }}
              onMouseMove={() => { if (!isChartTooltipActive) clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; }}
              onMouseUp={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
              onMouseLeave={() => { clearTimeout(chartTouchTimerRef.current); chartTouchTimerRef.current = null; setIsChartTooltipActive(false); }}
              style={{
                flexShrink: 0,
                width: `${220 * zoomLevel}%`,
                minWidth: `${800 * zoomLevel}px`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: 'width 0.3s ease',
                boxSizing: 'border-box',
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => { if (!draggingNode) { setExpandedChart(chartUnit); setActiveHighlight(null); } }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !draggingNode) { e.preventDefault(); setExpandedChart(chartUnit); setActiveHighlight(null); } }}
                style={{ flex: 1, minHeight: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative' }}
                aria-label="Apri grafico a tutto schermo"
              >
                {chartUnit === 'percent' ? (
              <div style={{ background: '#111', paddingTop: 15, paddingBottom: 15, borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ position: 'relative', width: '100%', height: '280px', paddingBottom: '60px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={mainChartData} margin={{ top: 10, right: 15, left: 15, bottom: 15 }}>
                      <defs>
                        <linearGradient id="colorEnergia" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00e676" stopOpacity={0.6}/>
                          <stop offset="95%" stopColor="#ffea00" stopOpacity={0.0}/>
                        </linearGradient>
                        <linearGradient id="colorRiserva" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00e676" stopOpacity={0.5}/>
                          <stop offset="100%" stopColor="#00e676" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} padding={{ left: 0, right: 0 }} />
                      <YAxis domain={[0, 100]} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}%`} width={35} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1c', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#00e676', fontWeight: 'bold' }}
                        formatter={(value, name) => {
                          const formattedValue = typeof value === 'number' ? `${value.toFixed(1)}%` : (value != null ? `${Number(value).toFixed(1)}%` : '—');
                          const displayName = name === 'energyPast' || name === 'Energia SNC' ? 'Energia SNC' : name === 'riservaFisica' ? 'Riserva Fisica' : name === 'energyFuture' ? 'Previsione' : name;
                          return [formattedValue, displayName];
                        }}
                        labelFormatter={(label) => {
                          if (typeof label === 'number') {
                            const ore = Math.floor(label);
                            const min = Math.round((label - ore) * 60);
                            return `Ore ${String(ore).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                          }
                          return label;
                        }}
                      />
                      {nodesForEnergySimulation.filter(n => n.type === 'sleep').map((node, index) => (
                        <ReferenceLine
                          key={`snc-sleep-${node.id ?? index}`}
                          x={node.wakeTime ?? 7.5}
                          stroke="#00e5ff"
                          strokeDasharray="3 3"
                          strokeWidth={1.5}
                          label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11, fontWeight: 'bold' }}
                        />
                      ))}
                      <ReferenceDot x={displayTime} y={finalDotY} isFront r={8} fill="#00e676" stroke="#fff" strokeWidth={2} className="pulsing-dot" />
                      <Area type="monotone" dataKey="riservaFisica" name="Riserva Fisica" stroke="#00e676" fill="url(#colorRiserva)" fillOpacity={0.3} strokeWidth={2} dot={false} isAnimationActive={!draggingNode} />
                      <Area type="monotone" dataKey="energyPast" name="Energia SNC" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#colorEnergia)" connectNulls={false} isAnimationActive={!draggingNode} />
                      <Area type="monotone" dataKey="energyFuture" name="Previsione" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" connectNulls={false} isAnimationActive={!draggingNode} />
                      <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
                  <TimeAlignmentChartDebugOverlay />
                </div>
              </div>
                ) : (
                <>
                <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mainChartData} margin={{ top: 10, right: 15, left: 15, bottom: 15 }}>
                  <defs>
                    <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#047857" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="colorKcal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00b4d8" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#047857" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="vitalFlow" x1="0" y1="0" x2="1" y2="0">
                      <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="4s" repeatCount="indefinite" />
                      <animate attributeName="x2" values="0.7;2.3;0.7" dur="4s" repeatCount="indefinite" />
                      <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#b388ff" stopOpacity="1" />
                      <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="colorGlicemia" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="bloodFlow" x1="0" y1="0" x2="1" y2="0">
                      <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#fca5a5" stopOpacity="1" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#007aff" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#00e5ff" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#007aff" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="waterFlow" x1="0" y1="0" x2="1" y2="0">
                      <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                      <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#007aff" stopOpacity="1" />
                      <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="colorCortisol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="cortisolFlow" x1="0" y1="0" x2="1" y2="0">
                      <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#fcd34d" stopOpacity="1" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="colorAnabolic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCortisol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9c27b0" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#9c27b0" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDigestion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9333ea" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#a855f7" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#9333ea" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="digestionFlow" x1="0" y1="0" x2="1" y2="0">
                      <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                      <stop offset="0%" stopColor="#9333ea" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#c084fc" stopOpacity="1" />
                      <stop offset="100%" stopColor="#9333ea" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="colorNeuro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                      <stop offset="50%" stopColor="#818cf8" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="neuroFlow" x1="0" y1="0" x2="1" y2="0">
                      <animate attributeName="x1" values="-0.3;1.3;-0.3" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="x2" values="0.7;2.3;0.7" dur="3s" repeatCount="indefinite" />
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#818cf8" stopOpacity="1" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <XAxis dataKey={chartUnit === 'calorieTimeline' ? 'time' : 'hour'} type="number" domain={[0, 24]} allowDataOverflow={true} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} tickFormatter={(val) => `${val}:00`} axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 13 }} padding={{ left: 0, right: 0 }} />
                  <YAxis domain={chartUnit === 'glicemia' ? [40, 220] : (chartUnit === 'kcal' || chartUnit === 'calorieTimeline' ? [0, Math.max(targetKcalChart, totalCaloriesTimeline || 0)] : [0, 100])} tickFormatter={(val) => (chartUnit === 'kcal' || chartUnit === 'calorieTimeline') ? Math.round(Number(val)) : (chartUnit === 'glicemia' ? val : `${val}%`)} tick={{ fill: '#555', fontSize: 12 }} axisLine={false} tickLine={false} width={35} />
                  <YAxis yAxisId="anabolic" orientation="right" domain={[0, 150]} width={0} hide />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                  {nodesForEnergySimulation.filter(n => n.type === 'sleep').map((node, index) => (
                    <ReferenceLine
                      key={`sleep-ref-${node.id ?? index}`}
                      x={node.wakeTime ?? 7.5}
                      stroke="#00e5ff"
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                      label={{
                        position: 'insideTopLeft',
                        value: '🌅 Sveglia',
                        fill: '#4ba3e3',
                        fontSize: 11,
                        fontWeight: 'bold'
                      }}
                    />
                  ))}
                  {chartUnit !== 'calorieTimeline' && (
                    <>
                      <Area type="monotone" dataKey="anabolicScore" fill="url(#colorAnabolic)" stroke="transparent" strokeWidth={0} fillOpacity={0.35} yAxisId="anabolic" isAnimationActive={!draggingNode} />
                      <Area type="monotone" dataKey="cortisolScore" fill="url(#colorCortisol)" stroke="#9c27b0" strokeWidth={2} strokeDasharray="5 5" fillOpacity={0.3} yAxisId="anabolic" isAnimationActive={!draggingNode} />
                    </>
                  )}
                  {chartUnit === 'glicemia' && (
                    <>
                      <ReferenceArea y1={40} y2={85} fill="#22c55e20" stroke="none" />
                      <ReferenceArea y1={85} y2={140} fill="#eab30820" stroke="none" />
                      <ReferenceArea y1={140} y2={220} fill="#3b82f620" stroke="none" />
                    </>
                  )}
                  <Tooltip content={<CustomChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '5 5' }} />
                  {chartUnit === 'calorieTimeline' ? (
                    <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={2} dot={false} isAnimationActive={!draggingNode} />
                  ) : (
                    <>
                      <Area type="monotone"
                        dataKey={chartUnit === 'kcal' ? 'kcalPast' : (chartUnit === 'glicemia' ? 'glicemiaPast' : (chartUnit === 'idratazione' ? 'idratazionePast' : chartUnit === 'cortisolo' ? 'cortisoloPast' : chartUnit === 'digestione' ? 'digestionePast' : chartUnit === 'neuro' ? 'neuroPast' : 'energyPast'))}
                        stroke={chartUnit === 'glicemia' ? 'url(#bloodFlow)' : (chartUnit === 'idratazione' ? 'url(#waterFlow)' : chartUnit === 'cortisolo' ? 'url(#cortisolFlow)' : chartUnit === 'digestione' ? 'url(#digestionFlow)' : chartUnit === 'neuro' ? 'url(#neuroFlow)' : 'url(#vitalFlow)')}
                        strokeWidth={6}
                        fill={chartUnit === 'glicemia' ? 'url(#colorGlicemia)' : (chartUnit === 'idratazione' ? 'url(#colorWater)' : chartUnit === 'cortisolo' ? 'url(#colorCortisol)' : chartUnit === 'digestione' ? 'url(#colorDigestion)' : chartUnit === 'neuro' ? 'url(#colorNeuro)' : 'url(#colorEnergy)')}
                        filter="url(#glow)" isAnimationActive={!draggingNode} animationDuration={600} animationEasing="ease-in-out" connectNulls={false}
                      />
                      <Area type="monotone"
                        dataKey={chartUnit === 'kcal' ? 'kcalFuture' : (chartUnit === 'glicemia' ? 'glicemiaFuture' : (chartUnit === 'idratazione' ? 'idratazioneFuture' : chartUnit === 'cortisolo' ? 'cortisoloFuture' : chartUnit === 'digestione' ? 'digestioneFuture' : chartUnit === 'neuro' ? 'neuroFuture' : 'energyFuture'))}
                        stroke={chartUnit === 'glicemia' ? '#7f1d1d' : (chartUnit === 'idratazione' ? '#003a8c' : chartUnit === 'cortisolo' ? '#78350f' : chartUnit === 'digestione' ? '#581c87' : chartUnit === 'neuro' ? '#3730a3' : '#444')}
                        strokeWidth={4} strokeDasharray="10 10" fill="transparent" isAnimationActive={!draggingNode} animationDuration={600} animationEasing="ease-in-out" connectNulls={false} className="future"
                      />
                    </>
                  )}
                  {chartUnit === 'glicemia' ? (
                    <ReferenceLine y={85} stroke="rgba(255, 255, 255, 0.2)" strokeDasharray="5 5" label={{ position: 'insideTopLeft', value: 'Basale', fill: '#555', fontSize: 10 }} />
                  ) : chartUnit === 'calorieTimeline' || chartUnit === 'kcal' ? null : (
                    <Line type="monotone" dataKey="idealEnergy" stroke="rgba(255, 255, 255, 0.2)" strokeWidth={4} strokeDasharray="8 8" dot={false} isAnimationActive={!draggingNode} animationDuration={600} animationEasing="ease-in-out" />
                  )}
                  <ReferenceDot x={displayTime} y={finalDotY} isFront shape={(props) => {
                    const cx = props?.cx;
                    const cy = props?.cy;
                    if (cx == null || cy == null || typeof cx !== 'number' || typeof cy !== 'number') return <path d="M0 0" />;
                    const fillColor = chartUnit === 'glicemia' ? '#ef4444' : (chartUnit === 'cortisolo' ? '#f59e0b' : chartUnit === 'digestione' ? '#9333ea' : chartUnit === 'neuro' ? '#6366f1' : chartUnit === 'calorieTimeline' ? '#ff9800' : '#00e5ff');
                    return (
                      <g className="pulsing-dot">
                        <circle cx={cx} cy={cy} r={10} fill={fillColor} />
                        <circle cx={cx} cy={cy} r={10} fill="none" stroke={fillColor} strokeWidth={3} opacity={0.5}>
                          <animate attributeName="r" values="10;17;10" dur="2.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.8s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    );
                  }} />
                </ComposedChart>
              </ResponsiveContainer>
                {!isViewingPastDate ? <NowVerticalLineOverlay hour={currentTime} visible /> : null}
                <TimeAlignmentChartDebugOverlay />
                </>
                )}
              </div>
              <div
                style={{
                  flexShrink: 0,
                  position: 'relative',
                  width: '100%',
                  paddingLeft: CHART_AXIS_GUTTER_LEFT_PX,
                  paddingRight: CHART_AXIS_GUTTER_RIGHT_PX,
                  boxSizing: 'border-box',
                  paddingTop: 6,
                  zIndex: 10,
                }}
              >
                <TimelineNodi
                  activeNodesWithStack={activeNodesWithStack}
                  chartUnit={chartUnit}
                  activeAction={activeAction}
                  analysisTabActive={activeBottomTab === 'analisi'}
                  idealStrategy={idealStrategy}
                  realTotals={realTotals}
                  NODE_IMPORTANCE={NODE_IMPORTANCE}
                  NODE_TYPE_ICON={NODE_TYPE_ICON}
                  draggingNode={draggingNode}
                  touchingNodeId={touchingNodeId}
                  dragOffsetY={dragOffsetY}
                  dragLiveTime={dragLiveTime}
                  timelineContainerRef={timelineContainerRef}
                  startNodeDrag={startNodeDrag}
                  releaseNodePointer={releaseNodePointer}
                  onNodeClick={onTimelineNodeClick}
                  onTimelineTrackClick={openTimelineQuickAddAtPointer}
                onTimelineTrackLongPress={openTimelineQuickAddAtPointer}
                  handleNodeTap={handleNodeTap}
                  decimalToTimeStr={decimalToTimeStr}
                  syncDatiFirebase={syncDatiFirebase}
                  setManualNodes={setManualNodes}
                  setDailyLog={setDailyLog}
                  energyPercent={bodyBattery?.currentEnergy ?? 0}
                  nowLineDecimalHour={!isViewingPastDate ? currentTime : undefined}
                  timelineEnergySeries={timelineEnergySeries}
                  timelineQualityChartData={chartData}
                  updateMealTime={updateMealTime}
                  onStripDragChartPreviewStart={onTimelineStripPreviewDragStart}
                  onStripDragChartPreview={scheduleTimelineStripEnergyPreview}
                  onStripDragChartPreviewEnd={clearTimelineStripEnergyPreview}
                  onStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
                />
              </div>
            </div>
            {/* SPACER PER PULSANTIERA: permette di scrollare oltre la fine del grafico */}
            <div style={{ width: '80px', flexShrink: 0 }} />
          </div>
        </div>
        </div>
        </div>
        </div>

        {/* Modale Grafico Fullscreen con Glossario e Carosello Swipe */}
        {expandedChart != null && (
          <ChartModal
            expandedChart={expandedChart}
            onClose={() => setExpandedChart(null)}
            setExpandedChart={setExpandedChart}
            setActiveHighlight={setActiveHighlight}
            modalChartData={modalChartData}
            safeCalorieTimelineData={safeCalorieTimelineData}
            displayTime={displayTime}
            timeLabel={timeLabel}
            dotY={dotY}
            dotGlicemia={dotGlicemia}
            dotIdratazione={dotIdratazione}
            dotCortisolo={dotCortisolo}
            dotDigestione={dotDigestione}
            dotNeuro={dotNeuro}
            dotYCalorieTimeline={dotYCalorieTimeline}
            idealDotY={idealDotY}
            targetKcalChart={targetKcalChart}
            scale={scale}
            dailyLog={activeLog}
            activeHighlight={activeHighlight}
            activeNodesWithStack={activeNodesWithStack}
            bottomTab={bottomTab}
            setBottomTab={setBottomTab}
            aiInsightsList={aiInsightsList}
            setAiInsightsList={setAiInsightsList}
            currentAiIndex={currentAiIndex}
            setCurrentAiIndex={setCurrentAiIndex}
            isAiLoading={isAiLoading}
            setIsAiLoading={setIsAiLoading}
            callGeminiAPIWithRotation={callGeminiAPIWithRotation}
            totalCaloriesTimeline={totalCaloriesTimeline}
            isSimulationMode={isSimulationMode}
            onTimeChange={handleSimulatedTimeChange}
            activeAlerts={activeAlertsArray}
            wallClockNowLineHour={!isViewingPastDate ? currentTime : undefined}
            timelineEnergySeries={timelineEnergySeries}
          />
        )}
      </>
      )}

      {/* Cruscotto Essenziale (Modalità Base) - ottimizzazione spaziale */}
      {userProfile?.level !== 'pro' && activeBottomTab === 'oggi' && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '4px 14px 0', marginBottom: 0, overflowX: 'hidden', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {/* --- CRUSCOTTO BIOLOGICO: Anello Calorie + Box Macro Neon + Fase Metabolica --- */}
          {(() => {
            const targetProt = userTargets?.prot ?? 150;
            const targetCarb = userTargets?.carb ?? 200;
            const targetFat = userTargets?.fatTotal ?? userTargets?.fat ?? 65;
            const dialDailyTargetKcal = Math.round(
              Number(dynamicDailyKcal) || Number(baseKcal) || Number(userTargets?.kcal ?? 2500)
            );
            const dialConsumedKcal = Math.round(Number(totali?.kcal) || 0);
            const dialKcalSurplus =
              dialConsumedKcal > dialDailyTargetKcal ? dialConsumedKcal - dialDailyTargetKcal : 0;
            const dialKcalRemaining = Math.max(0, dialDailyTargetKcal - dialConsumedKcal);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', flex: 1, minHeight: 0 }}>
                {/* Quadrante Biologico: grafico circolare pasti (tachimetro) */}
                <div
                  style={{ position: 'relative', width: '310px', height: '310px', margin: '0 auto 0 auto', zIndex: 10, flexShrink: 0 }}
                  onClick={() => {
                    setSelectedMealCenter(null);
                    setActiveDialMode('kcal');
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAiCoachSuggestionModal();
                      }}
                      onMouseEnter={() => setIsAiCoachBulbHovered(true)}
                      onMouseLeave={() => setIsAiCoachBulbHovered(false)}
                      disabled={!isAiCoachSuggestionActive || !isAiCoachInsightArmed}
                      aria-label={isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'Apri suggerimento metabolico' : 'Nessun suggerimento metabolico attivo'}
                      title={isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'Suggerimento attivo' : 'Nessun suggerimento attivo'}
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        zIndex: 2,
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 999,
                        width: 32,
                        height: 32,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                        lineHeight: 1,
                        padding: 0,
                        cursor: isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'pointer' : 'default',
                        color: isAiCoachSuggestionActive && isAiCoachInsightArmed ? '#facc15' : '#64748b',
                        opacity: isAiCoachSuggestionActive && isAiCoachInsightArmed ? 0.85 : 0.55,
                        transform: isAiCoachBulbHovered && isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 140ms ease, opacity 180ms ease, box-shadow 180ms ease',
                        animation: isAiCoachSuggestionActive && isAiCoachInsightArmed && aiCoachBulbPulseCycles > 0
                          ? `pulseDot 460ms ease-in-out ${aiCoachBulbPulseCycles}`
                          : 'none',
                        boxShadow: isAiCoachSuggestionActive && isAiCoachInsightArmed ? '0 0 5px rgba(250,204,21,0.12)' : 'none',
                      }}
                    >
                      💡
                    </button>
                    {/* Layer 1: Centro Interattivo (Totali o Dettaglio Pasto) */}
                    <div
                      className={selectedMealCenter ? 'tachimeter-center tachimeter-center-reset' : 'tachimeter-center'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedMealCenter && selectedMealCenter.id && selectedMealCenter.id !== 'rimanenti') {
                          loadMealToConstructor(String(selectedMealCenter.id));
                          return;
                        }
                        setDailyMacroSheetOpen(true);
                      }}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '66%',
                        height: '66%',
                        borderRadius: '50%',
                        background: '#0a0a0a',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '3px solid #111',
                        zIndex: 15,
                        boxShadow: `0 0 35px ${(dynamicDailyKcal - (totali?.kcal || 0)) >= 0 ? 'rgba(0,229,255,0.15)' : 'rgba(255,77,77,0.3)'}`,
                        cursor: 'pointer',
                        transition: 'box-shadow 0.2s ease, filter 0.2s ease',
                        pointerEvents: 'auto',
                      }}
                      title={!selectedMealCenter ? 'Apri raggi X giornalieri' : undefined}
                    >
                      {selectedMealCenter ? (
                        <div className="pieCenterInfo" style={{ textAlign: 'center', cursor: 'pointer' }}>
                          <div className="pieMealTitle" style={{ fontSize: '1rem', fontWeight: 'bold', color: selectedMealCenter.color ?? selectedMealCenter.fill ?? '#00e5ff' }}>
                            {selectedMealCenter.name || selectedMealCenter.label}
                          </div>
                          {selectedMealCenter.timeValue != null && (
                            <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                              {`${String(Math.floor(selectedMealCenter.timeValue)).padStart(2, '0')}:${String(Math.round((selectedMealCenter.timeValue % 1) * 60)).padStart(2, '0')}`}
                            </div>
                          )}
                          {activeDialMode === 'kcal' && (
                            <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#888', marginTop: '2px' }}>
                              {Math.round(selectedMealCenter.kcal ?? selectedMealCenter.value ?? 0)} kcal
                            </div>
                          )}
                          {activeDialMode === 'pro' && (
                            <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#b666d2', marginTop: '2px' }}>
                              {Math.round(selectedMealCenter.prot ?? selectedMealCenter.payload?.macros?.pro ?? 0)} g Proteine
                            </div>
                          )}
                          {activeDialMode === 'cho' && (
                            <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#00ff88', marginTop: '2px' }}>
                              {Math.round(selectedMealCenter.carb ?? selectedMealCenter.payload?.macros?.carb ?? 0)} g Carboidrati
                            </div>
                          )}
                          {activeDialMode === 'fat' && (
                            <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#ffd700', marginTop: '2px' }}>
                              {Math.round(selectedMealCenter.fat ?? selectedMealCenter.payload?.macros?.fat ?? 0)} g Grassi
                            </div>
                          )}
                          <div className="pieMealMacros">
                            P {Math.round(selectedMealCenter.prot ?? selectedMealCenter.payload?.macros?.pro ?? 0)}g
                            C {Math.round(selectedMealCenter.carb ?? selectedMealCenter.payload?.macros?.carb ?? 0)}g
                            F {Math.round(selectedMealCenter.fat ?? selectedMealCenter.payload?.macros?.fat ?? 0)}g
                          </div>
                        </div>
                      ) : (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                          <div
                            style={{
                              fontSize: '3rem',
                              fontWeight: 'bold',
                              color:
                                activeDialMode === 'kcal' && dialKcalSurplus > 0
                                  ? '#ef4444'
                                  : activeDialMode === 'pro'
                                    ? '#b666d2'
                                    : activeDialMode === 'cho'
                                      ? '#00ff88'
                                      : activeDialMode === 'fat'
                                        ? '#ffd700'
                                        : '#ff6b00',
                              textShadow:
                                activeDialMode === 'kcal' && dialKcalSurplus > 0
                                  ? '0 0 18px rgba(239, 68, 68, 0.45)'
                                  : '0 0 15px rgba(255, 107, 0, 0.35)',
                            }}
                          >
                            {activeDialMode === 'kcal' && dialKcalSurplus > 0 && (
                              <span style={{ fontSize: '2.35rem', letterSpacing: '0.02em' }}>
                                + {dialKcalSurplus}{' '}
                                <span style={{ fontSize: '0.42em', fontWeight: 700 }}>kcal</span>
                              </span>
                            )}
                            {activeDialMode === 'kcal' && dialKcalSurplus <= 0 && dialKcalRemaining}
                            {activeDialMode === 'pro' && Math.round(totali?.prot || 0)}
                            {activeDialMode === 'cho' && Math.round(totali?.carb || 0)}
                            {activeDialMode === 'fat' && Math.round(totali?.fatTotal ?? totali?.fat ?? 0)}
                          </div>
                          <div style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
                            {activeDialMode === 'kcal' && (dialKcalSurplus > 0 ? 'SURPLUS' : 'restanti')}
                            {activeDialMode === 'pro' && 'g Proteine'}
                            {activeDialMode === 'cho' && 'g Carboidrati'}
                            {activeDialMode === 'fat' && 'g Grassi'}
                          </div>
                          <div style={{ color: '#555', fontSize: '0.8rem', marginTop: '4px' }}>
                            {activeDialMode === 'kcal' &&
                              (dialKcalSurplus > 0
                                ? `obiettivo ${dialDailyTargetKcal} kcal · assunte ${dialConsumedKcal}`
                                : `obiettivo ${dialDailyTargetKcal} kcal`)}
                            {activeDialMode === 'pro' && `obiettivo ${Math.round(targetProt)} g`}
                            {activeDialMode === 'cho' && `obiettivo ${Math.round(targetCarb)} g`}
                            {activeDialMode === 'fat' && `obiettivo ${Math.round(targetFat)} g`}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Layer 2: Grafico a Torta */}
                    <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={mealPieDisplayData}
                            cx="50%"
                            cy="50%"
                            innerRadius="68%"
                            outerRadius="85%"
                            paddingAngle={3}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            stroke="none"
                            labelLine={false}
                            label={renderCustomizedLabel}
                            activeShape={renderActiveMealShape}
                            activeIndex={selectedMealCenterIndex}
                            onClick={(data, index, e) => {
                              if (e && e.stopPropagation) e.stopPropagation();
                              if (data.id === 'rimanenti') return;
                              const pastoCorrente = mealPieDisplayData.find((m) => m?.id === data.id);
                              if (!pastoCorrente) {
                                console.warn('[SalaComandi] meal pie entry not found', { id: data.id });
                                return;
                              }
                              const entry = pastoCorrente;
                              const mealName = entry.name || entry.id || 'Pasto';
                              const compositeId = String(entry.id);

                              if (selectedMealCenter && selectedMealCenter.id === data.id) {
                                loadMealToConstructor(compositeId);
                                return;
                              }
                              setSelectedMealCenter(pastoCorrente);
                              setSelectedNodeReport(null);
                            }}
                            style={{ cursor: 'pointer', outline: 'none' }}
                          >
                            {mealPieDisplayData.map((entry, index) => {
                              const isSelected = selectedMealCenter && entry.id === selectedMealCenter.id;
                              const hasSelection = !!selectedMealCenter;
                              return (
                                <Cell
                                  key={entry.id}
                                  fill={entry.color}
                                  style={{
                                    filter: isSelected ? `drop-shadow(0 0 15px ${entry.color})` : 'none',
                                    opacity: hasSelection && !isSelected ? 0.3 : 1,
                                    outline: 'none'
                                  }}
                                />
                              );
                            })}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div style={{ flexGrow: 1, minHeight: '2vh' }} aria-hidden />
                {/* Macro + Fase */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', marginBottom: '16px', gap: '8px', flexShrink: 0 }}>
                  {/* Box macronutrienti neon (3 colonne) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', width: '100%', flexShrink: 0 }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setActiveDialMode('pro');
                        }
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setActiveDialMode('pro');
                      }}
                      style={{
                        flex: 1,
                        background: '#1a1a1c',
                        border: activeDialMode === 'pro' ? '1px solid #b666d2' : '1px solid #333',
                        borderRadius: '12px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        boxShadow:
                          activeDialMode === 'pro'
                            ? '0 0 0 2px rgba(182, 102, 210, 0.45), 0 4px 14px rgba(182, 102, 210, 0.2)'
                            : '0 4px 10px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ color: '#b666d2', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', whiteSpace: 'nowrap' }}>Proteine</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {Math.round(totali?.prot || 0)} <span style={{ color: '#555', fontSize: '0.75rem' }}>/ {Math.round(targetProt)} g</span>
                      </div>
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setActiveDialMode('cho');
                        }
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setActiveDialMode('cho');
                      }}
                      style={{
                        flex: 1,
                        background: '#1a1a1c',
                        border: activeDialMode === 'cho' ? '1px solid #00ff88' : '1px solid #333',
                        borderRadius: '12px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        boxShadow:
                          activeDialMode === 'cho'
                            ? '0 0 0 2px rgba(0, 255, 136, 0.35), 0 4px 14px rgba(0, 255, 136, 0.15)'
                            : '0 4px 10px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ color: '#00ff88', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', whiteSpace: 'nowrap' }}>Carboidrati</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {Math.round(totali?.carb || 0)} <span style={{ color: '#555', fontSize: '0.75rem' }}>/ {Math.round(targetCarb)} g</span>
                      </div>
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setActiveDialMode('fat');
                        }
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setActiveDialMode('fat');
                      }}
                      style={{
                        flex: 1,
                        background: '#1a1a1c',
                        border: activeDialMode === 'fat' ? '1px solid #ffd700' : '1px solid #333',
                        borderRadius: '12px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        boxShadow:
                          activeDialMode === 'fat'
                            ? '0 0 0 2px rgba(255, 215, 0, 0.4), 0 4px 14px rgba(255, 215, 0, 0.12)'
                            : '0 4px 10px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ color: '#ffd700', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', whiteSpace: 'nowrap' }}>Grassi</div>
                      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {Math.round(totali?.fatTotal ?? totali?.fat ?? 0)} <span style={{ color: '#555', fontSize: '0.75rem' }}>/ {Math.round(targetFat)} g</span>
                      </div>
                    </div>
                  </div>
                  {/* Widget Fase Metabolica (versione compatta Analisi) */}
                  <MetabolicPhaseCompact
                    stateLabel={metabolicState.label}
                    stateColor={metabolicState.color}
                    glycemiaValue={gl}
                    digestionValue={dig}
                  />
                </div>
              </div>
            );
          })()}
          {/* Riga widget macro: griglia 4 colonne (nascosta - sostituita da Cruscotto Biologico) */}
            <div className="macrosRow" style={{ display: 'none', width: '100%', marginTop: '25px', padding: '0 10px', position: 'relative', zIndex: 10 }}>
              <div className="macroBox" style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '12px', border: '1px solid rgba(179,136,255,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', zIndex: 10 }}>
                <span style={{ fontSize: '0.65rem', color: '#b388ff', fontWeight: 'bold', letterSpacing: '1px' }}>PRO</span>
                <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginTop: '2px', whiteSpace: 'nowrap' }}>{Math.round(totali?.prot || 0)}<span style={{ fontSize: '0.7rem', color: '#888' }}>/{Math.round(userTargets?.prot || 0)}g</span></span>
              </div>
              <div className="macroBox" style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '12px', border: '1px solid rgba(0,230,118,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', zIndex: 10 }}>
                <span style={{ fontSize: '0.65rem', color: '#00e676', fontWeight: 'bold', letterSpacing: '1px' }}>CARB</span>
                <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginTop: '2px', whiteSpace: 'nowrap' }}>{Math.round(totali?.carb || 0)}<span style={{ fontSize: '0.7rem', color: '#888' }}>/{Math.round(userTargets?.carb || 0)}g</span></span>
              </div>
              <div className="macroBox" style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '12px', border: '1px solid rgba(255,234,0,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', zIndex: 10 }}>
                <span style={{ fontSize: '0.65rem', color: '#ffea00', fontWeight: 'bold', letterSpacing: '1px' }}>FAT</span>
                <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginTop: '2px', whiteSpace: 'nowrap' }}>{Math.round(totali?.fatTotal ?? totali?.fat ?? 0)}<span style={{ fontSize: '0.7rem', color: '#888' }}>/{Math.round(userTargets?.fatTotal ?? userTargets?.fat ?? 0)}g</span></span>
              </div>
              <div className="macroBox" style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '12px', border: '1px solid rgba(249,115,22,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', zIndex: 10 }}>
                <span style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: 'bold', letterSpacing: '1px' }}>FIBRE</span>
                <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginTop: '2px', whiteSpace: 'nowrap' }}>{Math.round(totali?.fibre || 0)}<span style={{ fontSize: '0.7rem', color: '#888' }}>/{Math.round(userTargets?.fibre || 30)}g</span></span>
              </div>
            </div>

        </div>
      )}

      {nutrientModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: '20px' }} onClick={() => setNutrientModal(null)}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '16px', maxWidth: '350px', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '1px' }}>Fonti di {nutrientModal.label}</h3>
              <button style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setNutrientModal(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {getNutrientSources(nutrientModal.key, nutrientModal.target, nutrientModal.isWeekly).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>Nessuna fonte registrata.</p>
              ) : (
                getNutrientSources(nutrientModal.key, nutrientModal.target, nutrientModal.isWeekly).map((src, idx) => (
                  <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 15px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.85rem', color: '#eee', fontWeight: '500', flex: 1 }}>{src.name}</span>
                    <div style={{ textAlign: 'right', marginLeft: '10px' }}>
                      <div style={{ fontSize: '0.9rem', color: src.percent > 50 ? '#00e676' : '#00e5ff', fontWeight: 'bold' }}>{src.percent.toFixed(1)}%</div>
                      <div style={{ fontSize: '0.65rem', color: '#888' }}>{src.amount.toFixed(1)} {nutrientModal.unit}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {showReport && (
        <div className="report-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#fff', color: '#000', zIndex: 100020, overflowY: 'auto', padding: '20px' }}>
          <div className="report-no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', background: '#f0f0f0', padding: '15px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { val: '7', label: '1 Settimana' },
                { val: '30', label: '1 Mese' },
                { val: '90', label: '3 Mesi' },
                { val: '180', label: '6 Mesi' },
                { val: '365', label: '1 Anno' }
              ].map(p => (
                <button key={p.val} onClick={() => setReportPeriod(p.val)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', background: reportPeriod === p.val ? '#0d47a1' : '#ccc', color: reportPeriod === p.val ? '#fff' : '#000', cursor: 'pointer', fontWeight: 'bold' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => window.print()} style={{ padding: '8px 16px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <img src="/icon-pdf-32.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
                Stampa PDF
              </button>
              <button onClick={() => setShowReport(false)} style={{ padding: '8px 16px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Chiudi</button>
            </div>
          </div>

          <div className="report-print-area">
            <h1 style={{ borderBottom: '2px solid #0d47a1', paddingBottom: '10px' }}>Analisi Carenze Nutrizionali - Core</h1>
            <p><strong>Periodo analizzato:</strong> Ultimi {reportPeriod} giorni</p>

            {(() => {
              const data = generateReportData();
              if (!data) return <p>Nessun dato sufficiente in questo periodo.</p>;

              const nutrientLabels = { kcal: 'Kcal', prot: 'Proteine (g)', carb: 'Carboidrati (g)', fatTotal: 'Grassi (g)', fibre: 'Fibre (g)', vitc: 'Vit. C (mg)', vitD: 'Vit. D (µg)', omega3: 'Omega 3 (g)', mg: 'Magnesio (mg)', k: 'Potassio (mg)', fe: 'Ferro (mg)', ca: 'Calcio (mg)' };
              return (
                <>
                  <p><strong>Giorni con dati registrati:</strong> {data.daysFound} su {reportPeriod}</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Nutriente</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Media Assunta</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Target</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {REPORT_NUTRIENT_KEYS.map(key => {
                        const avg = data.averages[key];
                        const target = userTargets[key] ?? getTargetForNutrient(key);
                        if (target == null || target === 0) return null;

                        const percent = (avg / target) * 100;
                        const isDeficient = percent < 80;
                        const isWarning = percent >= 80 && percent < 95;

                        let statusColor = '#2e7d32';
                        let statusText = '✅ Ottimale';
                        if (isDeficient) { statusColor = '#d32f2f'; statusText = '❌ Carenza'; }
                        else if (isWarning) { statusColor = '#f57c00'; statusText = '⚠️ Attenzione'; }

                        return (
                          <tr key={key} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '12px', fontWeight: 'bold' }}>{nutrientLabels[key] || key}</td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>{avg.toFixed(1)}</td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>{target}</td>
                            <td style={{ padding: '12px', textAlign: 'center', color: statusColor, fontWeight: 'bold' }}>
                              {statusText} ({percent.toFixed(0)}%)
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </div>
        </div>
      )}
      </div>
      )}
      {activeBottomTab === 'planning' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            padding: '20px 16px',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            width: '100%',
            boxSizing: 'border-box',
            gap: 14,
          }}
        >
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(200,210,220,0.95)', lineHeight: 1.45 }}>
            Pianifica attività, fasce orarie e pasti (ghost) per oggi. I dati confermati restano su Firebase sotto{' '}
            <code style={{ fontSize: '0.75rem', color: '#7dd3fc' }}>planning/</code>.
          </p>
          <button
            type="button"
            onClick={() => {
              setPlanningWizardHydrateNonce((n) => n + 1);
              setPlanningWizardOverlayOpen(true);
            }}
            style={{
              padding: '14px 18px',
              borderRadius: 14,
              border: '1px solid rgba(0, 229, 255, 0.45)',
              background: 'rgba(0, 229, 255, 0.15)',
              color: '#e0faff',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Apri pianificazione guidata
          </button>
          <div
            style={{
              marginTop: 8,
              paddingTop: 18,
              borderTop: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#e8f4ff' }}>Piano settimanale</h3>
            <WeeklyPlanning
              value={weeklyPlan}
              onChange={setWeeklyPlan}
              anchorDate={new Date(`${currentTrackerDate || getTodayString()}T12:00:00`)}
              profileDailyKcal={Number(userTargets?.kcal) || 2000}
            />
          </div>
        </div>
      )}
      {activeBottomTab === 'longevita' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', width: '100%' }}>
          <LongevityView
            data={longevityData}
            minimalOnly={false}
            showPriorityFocus
            userAge={userAge}
            bodyMetricsHistory={bodyMetricsHistory}
            scoreHistory={longevityScoreHistory}
            periodAnchorDate={currentTrackerDate}
            fullHistory={fullHistory}
            userTargets={userTargets}
            userProfile={userProfile}
            onUpdateTDEE={handleUpdateTDEE}
            tdeeHistory={tdeeHistory}
            predictionCalibration={predictiveCalibration}
            onBalanceCsvImport={handleCSVUpload}
            onQuickWeighInSubmit={handleQuickWeighInFromHistory}
            pastDaysStorico={pastDaysStorico}
            weeklyTrendData={weeklyTrendData}
            weeklyMicrosTotals={weeklyMicrosTotals}
            weeklyKcalChartReference={weeklyKcalChartReference}
          />
        </div>
      )}
      {activeBottomTab === 'bussola' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '16px 12px',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <MetabolicUnifiedView
            dailyHistory={metabolicCompassDailyHistory}
            bodyMetricsHistory={bodyMetricsHistory}
            compassScreenActive={activeBottomTab === 'bussola'}
            fullHistory={fullHistory}
            userTargets={userTargets}
            projectionAnchorDate={currentTrackerDate}
          />
        </div>
      )}
      </div>
      )}
      {/* --- CASSETTO AZIONI (sempre montato: visibile da ogni tab bottom) --- */}
      <MenuDrawerShell isDrawerOpen={isDrawerOpen} onClose={closeDrawer}>
        
        {/* VISTA MENU PRINCIPALE */}
        {(!activeAction || activeAction === 'home') && (
          <div className="view-animate">
            <AddEventMenuGrid
              menuOrder={addEventMenuOrder}
              onOrderCommit={commitAddEventMenuOrder}
              onItemActivate={(id) => handleAddEventMenuItem(id, 'drawer')}
            />
            <div style={{ padding: '15px', background: '#1e1e1e', borderRadius: '12px', marginTop: '0' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '0.8rem' }}>⚡ Inserimento Rapido / Output AI</h4>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  id="fast-ai-input"
                  placeholder="Es: [Pollo | 150 | pranzo] oppure incolla qui la risposta AI"
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff', fontSize: '0.85rem' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      processTestoAI(e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('fast-ai-input');
                    if (input) {
                      processTestoAI(input.value);
                      input.value = '';
                    }
                  }}
                  style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '0 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Invia
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VISTA MENU SECONDARIO (☰) */}
        {activeAction === 'menu_secondary' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>☰ MENU</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button className="action-btn" onClick={() => setActiveAction('storico')}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(176, 190, 197, 0.5))' }}>📚</span><span className="action-label" style={{ color: '#b0bec5' }}>Archivio Storico</span></button>
              <button className="action-btn" onClick={() => { setShowReport(true); setActiveAction(null); closeDrawer(); }}><span className="action-icon">📊</span><span className="action-label">Report</span></button>
              <button className="action-btn" onClick={() => { setShowProfile(true); setActiveAction(null); closeDrawer(); }}><span className="action-icon">⚙️</span><span className="action-label">Profilo & Target</span></button>
              <button className="action-btn" onClick={() => setActiveAction('strategia')}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.4))' }}>🎯</span><span className="action-label" style={{ color: '#00e5ff' }}>Protocollo</span></button>
              <button className="action-btn" onClick={() => setActiveAction('focus')}><img src="/icon-neural-128.png" alt="" className="action-icon-img action-icon-img-lg" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 192, 45, 0.45))' }} width={29} height={29} decoding="async" /><span className="action-label" style={{ color: '#fbc02d' }}>Neural Reset</span></button>
              <button type="button" className="action-btn" onClick={() => setActiveAction('ai_chat')} style={{ position: 'relative', background: 'linear-gradient(145deg, rgba(26, 26, 36, 0.9), rgba(18, 16, 28, 0.9))', borderColor: '#3a2a4a' }}>
                {kentuChatNotificationBadge ? (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 8,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#f59e0b',
                      boxShadow: '0 0 8px rgba(245, 158, 11, 0.65)',
                      zIndex: 2,
                    }}
                  />
                ) : null}
                <img src="/nuova-icona.png" alt="" className="action-icon-img action-icon-img-lg" style={{ filter: 'drop-shadow(0 0 10px rgba(179, 136, 255, 0.45))' }} width={29} height={29} decoding="async" /><span className="action-label" style={{ color: '#b388ff' }}>Kentu</span>
              </button>
            </div>
          </div>
        )}

        {/* VISTA STRATEGIA */}
        {activeAction === 'strategia' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; MENU</button>
              <h2 style={{ fontSize: '0.8rem', color: '#00e5ff', letterSpacing: '2px', margin: 0 }}>🎯 PROTOCOLLO</h2>
              <div style={{ width: '60px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '25px' }}>
              {Object.keys(STRATEGY_PROFILES).map(key => (
                <button key={key} className={`type-btn ${dayProfile === key ? 'active blue' : ''}`} onClick={() => setDayProfile(key)}>
                  {STRATEGY_PROFILES[key].label}
                </button>
              ))}
            </div>
            <div className="burn-slider-container">
              <span className="burn-label" style={{color: '#00e5ff'}}>TUNING CALORICO (OVERRIDE)</span>
              <div className="burn-value tuning">{calorieTuning > 0 ? `+${calorieTuning}` : calorieTuning}</div>
              <input type="range" min="-500" max="500" step="50" value={calorieTuning} onChange={(e) => setCalorieTuning(Number(e.target.value))} className="custom-range blue" style={{ marginTop: '20px' }} />
            </div>
            <button onClick={() => closeDrawer()} style={{ width: '100%', padding: '18px', backgroundColor: '#00e5ff', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.2s', boxShadow: '0 0 20px rgba(0, 229, 255, 0.4)' }}>SYNC STRATEGIA</button>
          </div>
        )}

        {/* VISTA CHAT AI */}
        {activeAction === 'ai_chat' && (
          <div
            className="view-animate"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              height: '100%',
              maxHeight: '100%',
            }}
          >
          <AiCluster
            chatHistory={chatHistory}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatImages={chatImages}
            setChatImages={setChatImages}
            onSendMessage={handleChatSubmit}
            onChatQuickAction={(kind) => {
              const anchor = currentTrackerDate || getTodayString();
              const burnedKcalContext = (activeLog || [])
                .filter((item) => item.type === 'workout')
                .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
              const dynamicDailyKcalCtx =
                applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) +
                burnedKcalContext;
              if (kind === 'briefing') {
                const secret = buildQuickBriefingSecretPrompt({
                  bodyBatteryPercent: bodyBattery?.currentEnergy ?? 0,
                  dynamicDailyKcal: dynamicDailyKcalCtx,
                  totali,
                  userTargets,
                });
                void handleChatSubmit(null, { secretPrompt: secret, displayText: '📊 Briefing' });
              } else if (kind === 'yesterday') {
                const secret = buildYesterdayGapSecretPrompt(fullHistory, anchor, userTargets);
                void handleChatSubmit(null, { secretPrompt: secret, displayText: '🔍 Analisi Ieri' });
              } else if (kind === 'mealIdea') {
                void handleChatSubmit(null, {
                  secretPrompt: buildMealIdeaFromDispensaSecretPrompt(),
                  displayText: '💡 Idea Pasto',
                });
              } else if (kind === 'checkOggi') {
                void handleChatSubmit('⚖️ Check Oggi', { fromQuickReply: true });
              } else if (kind === 'trainingCheck') {
                void handleChatSubmit('🏃‍♂️ Posso allenarmi?', { fromQuickReply: true });
              } else if (kind === 'reportMese') {
                void handleChatSubmit('📅 Report Mese', { fromQuickReply: true });
              } else if (kind === 'scannerMetabolico') {
                void handleChatSubmit('🧬 Scanner Metabolico', { fromQuickReply: true });
              }
            }}
            onLogDinnerOption={handleAutoLogDinner}
            onLoadAgenda={handleAutoLogAgenda}
            onMealProposalConfirm={handleMealProposalConfirm}
            onMealProposalCancel={handleMealProposalCancel}
            onMealProposalSwap={handleMealProposalSwap}
            onDailyPlanConfirm={handleDailyPlanConfirm}
            onDailyPlanCancel={handleDailyPlanCancel}
            onGeneratePlanGhostMealDraft={handleGeneratePlanGhostMealDraft}
            dailyLog={activeLog || []}
            showAiSettings={showAiSettings}
            setShowAiSettings={setShowAiSettings}
            apiKeys={apiKeys}
            onKeyChange={handleKeyChange}
            onRemoveKey={handleRemoveKey}
            onAddKey={handleAddKey}
            onSaveApiCluster={saveApiCluster}
            onBack={() => setActiveAction(null)}
            introPhrase={introPhrase}
          />
          </div>
        )}

        {/* VISTA ACQUA */}
        {activeAction === 'acqua' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#00e5ff', letterSpacing: '2px', margin: 0 }}>💧 IDRATAZIONE</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '0.7rem', marginBottom: '8px' }}>
                <span>0:00</span>
                <input type="time" value={decimalToTimeStr(drawerWaterTime)} onChange={(e) => setDrawerWaterTime(parseTimeStrToDecimal(e.target.value))} style={{ width: '130px', minWidth: '110px', padding: '8px 10px', background: '#1a1a1a', border: '1px solid #00e5ff', borderRadius: '8px', color: '#00e5ff', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center', letterSpacing: '1px' }} />
                <span>24:00</span>
              </div>
              <div ref={miniTimelineWaterRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
                {allNodes.map(n => {
                  const isWork = n.type === 'work';
                  const startP = getTimePositionPercent(n.time);
                  const durP = isWork ? getTimePositionPercent(n.duration || 1) : 0;
                  if (isWork) {
                    return (
                      <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
                    );
                  }
                  return (
                    <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
                  );
                })}
                <div className="mini-timeline-hitbox" role="slider" aria-label="Ora acqua" onPointerDown={(e) => handleMiniTimelineDrag(e, miniTimelineWaterRef, 'point', drawerWaterTime, null, setDrawerWaterTime, null)} style={{ position: 'absolute', left: `${getTimePositionPercent(drawerWaterTime)}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, touchAction: 'none' }}>
                  <div className="mini-timeline-point-bubble" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '28px', height: '28px', borderRadius: '50%', background: '#00e5ff', border: '2px solid #fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(0,229,255,0.5)', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>{decimalToTimeStr(drawerWaterTime)}</span>
                    <span style={{ lineHeight: 1 }}>💧</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="water-glass" style={{ padding: '28px 20px', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <div className="water-sphere">
                  <div className="water-sphere-inner">
                    <div className="water-wave" style={{ height: `${waterProgress}%` }} />
                  </div>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
                    <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.95)', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>{Math.round(waterProgress)}%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>{waterIntake} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)', fontWeight: 'normal' }}>ml</span></div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(0, 229, 255, 0.9)', letterSpacing: '1px' }}>obiettivo {dailyWaterGoal} ml</div>
                </div>
              </div>
            </div>
            <div className="water-glass" style={{ padding: '16px', display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <button onClick={() => handleAddWater(250)} className="water-quick-btn" style={{ flex: 1 }}><span style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🥛</span><span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>+ 250</span></button>
              <button onClick={() => handleAddWater(500)} className="water-quick-btn" style={{ flex: 1 }}><span style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🚰</span><span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>+ 500</span></button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => handleAddWater(-250)} className="water-rectify-btn">− 250</button>
              <button onClick={() => handleAddWater(-500)} className="water-rectify-btn">− 500</button>
              <button onClick={() => { if (isSimulationMode) return; const next = manualNodes.filter(n => n.type !== 'water'); setManualNodes(next); syncDatiFirebase(dailyLog, next); }} className="water-rectify-btn" style={{ borderColor: 'rgba(255, 77, 77, 0.4)', color: '#ff4d4d' }}>Azzera</button>
            </div>
          </div>
        )}

        {/* VISTA FAST CHARGE - PISOLINO */}
        {activeAction === 'fast_charge_nap' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#818cf8', letterSpacing: '2px', margin: 0 }}>😴 PISOLINO</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '16px', backdropFilter: 'blur(12px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Durata (Minuti)
                  </div>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    step={5}
                    value={(() => {
                      let d = Number(drawerFastChargeEnd) - Number(drawerFastChargeStart);
                      if (d < 0) d += 24;
                      return Math.max(0, Math.round(d * 60));
                    })()}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const durationMin = Number.isFinite(n) ? Math.max(5, Math.min(1440, Math.round(n))) : 30;
                      const fixedEnd = Number(drawerFastChargeEnd) || 0;
                      let nextStart = fixedEnd - durationMin / 60;
                      while (nextStart < 0) nextStart += 24;
                      while (nextStart >= 24) nextStart -= 24;
                      setDrawerFastChargeStart(nextStart);
                    }}
                    style={{ width: '100%', minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #818cf8', borderRadius: '10px', color: '#a5b4fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Ora del risveglio
                  </div>
                  <input
                    type="time"
                    value={decimalToTimeStr(drawerFastChargeEnd)}
                    onChange={(e) => {
                      const nextEnd = parseTimeStrToDecimal(e.target.value);
                      let durationHours = Number(drawerFastChargeEnd) - Number(drawerFastChargeStart);
                      if (durationHours < 0) durationHours += 24;
                      durationHours = Math.max(0, durationHours);
                      let nextStart = nextEnd - durationHours;
                      while (nextStart < 0) nextStart += 24;
                      while (nextStart >= 24) nextStart -= 24;
                      setDrawerFastChargeEnd(nextEnd);
                      setDrawerFastChargeStart(nextStart);
                    }}
                    style={{ width: '100%', minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #818cf8', borderRadius: '10px', color: '#a5b4fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }}
                  />
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '10px' }}>Durata: {(() => { let d = drawerFastChargeEnd - drawerFastChargeStart; if (d < 0) d += 24; d = Math.max(0, d); return `${Math.floor(d * 60)} min`; })()}</div>
            </div>
            <button onClick={() => handleSaveFastCharge('nap')} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(129,140,248,0.4)' }}>SALVA</button>
          </div>
        )}

        {/* VISTA FAST CHARGE - MEDITAZIONE */}
        {activeAction === 'fast_charge_meditation' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#22c55e', letterSpacing: '2px', margin: 0 }}>🧘 MEDITAZIONE</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '16px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '12px', textTransform: 'uppercase' }}>ORA INIZIO – ORA FINE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input type="time" value={decimalToTimeStr(drawerFastChargeStart)} onChange={(e) => setDrawerFastChargeStart(parseTimeStrToDecimal(e.target.value))} style={{ flex: 1, minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #22c55e', borderRadius: '10px', color: '#4ade80', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }} />
                <span style={{ color: '#666' }}>–</span>
                <input type="time" value={decimalToTimeStr(drawerFastChargeEnd)} onChange={(e) => setDrawerFastChargeEnd(parseTimeStrToDecimal(e.target.value))} style={{ flex: 1, minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #22c55e', borderRadius: '10px', color: '#4ade80', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '10px' }}>Durata: {(() => { let d = drawerFastChargeEnd - drawerFastChargeStart; if (d < 0) d += 24; return `${Math.floor(Math.max(0, d) * 60)} min`; })()}</div>
            </div>
            <button onClick={() => handleSaveFastCharge('meditation')} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(34,197,94,0.4)' }}>SALVA</button>
          </div>
        )}

        {/* VISTA FAST CHARGE - INTEGRAZIONE */}
        {activeAction === 'fast_charge_supplements' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#a855f7', letterSpacing: '2px', margin: 0 }}>💊 INTEGRAZIONE</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '12px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '12px', textTransform: 'uppercase' }}>ORARIO</div>
              <input type="time" value={decimalToTimeStr(drawerFastChargeTime)} onChange={(e) => setDrawerFastChargeTime(parseTimeStrToDecimal(e.target.value))} style={{ width: '100%', padding: '10px', background: '#1a1a1a', border: '1px solid #a855f7', borderRadius: '10px', color: '#c084fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '12px' }} />
              <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '8px', textTransform: 'uppercase' }}>Nome supplemento (opzionale)</div>
              <input type="text" value={fastChargeSupplementName} onChange={(e) => setFastChargeSupplementName(e.target.value)} placeholder="Es. Magnesio, Vitamina D..." style={{ width: '100%', padding: '10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '10px', color: '#fff', fontSize: '0.9rem' }} />
            </div>
            <button onClick={() => handleSaveFastCharge('supplements')} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(168,85,247,0.4)' }}>SALVA</button>
          </div>
        )}

        {/* VISTA ALLENAMENTO */}
        {activeAction === 'allenamento' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#ff6d00', letterSpacing: '2px', margin: 0 }}>⚡ ATTIVITÀ</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', flexWrap: 'wrap' }}>
              {WORKOUT_ACTIVITY_SELECTOR_IDS.map((typeId) => {
                const ad = getWorkoutActivityTypeDef(typeId);
                return (
                  <button
                    key={typeId}
                    type="button"
                    className={`type-btn ${workoutType === typeId ? 'active orange' : ''}`}
                    onClick={() => setWorkoutType(typeId)}
                  >
                    {ad?.selectorButtonLabel ?? typeId}
                  </button>
                );
              })}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '14px', marginBottom: '10px' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Ora di inizio
                  </div>
                  <input
                    type="time"
                    value={decimalToTimeStr(workoutStartTime)}
                    onChange={(e) => {
                      const startTime = Math.min(24, Math.max(0, parseTimeStrToDecimal(e.target.value)));
                      const durationHours = Math.max(0, Number(workoutDurationMin) || 0) / 60;
                      let computedEndTime = startTime + durationHours;
                      while (computedEndTime >= 24) computedEndTime -= 24;
                      while (computedEndTime < 0) computedEndTime += 24;
                      setWorkoutEndTime(computedEndTime);
                    }}
                    style={{
                      width: '100%',
                      maxWidth: '160px',
                      padding: '8px 10px',
                      background: '#1a1a1a',
                      border: '1px solid #ff6d00',
                      borderRadius: '8px',
                      color: '#ff6d00',
                      fontSize: '1.05rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                  <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Durata (min)
                  </div>
                  <input
                    type="number"
                    min={15}
                    max={600}
                    step={5}
                    value={workoutDurationMin}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setWorkoutDurationMin(
                        Number.isFinite(n) ? Math.max(15, Math.min(600, Math.round(n))) : 30,
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#1a1a1a',
                      border: '1px solid #ff6d00',
                      borderRadius: '8px',
                      color: '#ff6d00',
                      fontSize: '1.05rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#666', fontSize: '0.65rem', marginBottom: '8px' }}>
                <span>0:00</span>
                <span>Inizio calcolato: {decimalToTimeStr(workoutStartTime)}</span>
                <span>24:00</span>
              </div>
              <div ref={miniTimelineActivityRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
                {allNodes.filter(n => n.id !== editingWorkoutId).map(n => {
                  const isWork = n.type === 'work';
                  const isCognitive = n.type === 'cognitive';
                  const startP = getTimePositionPercent(n.time);
                  const durP = (isWork || isCognitive) ? getTimePositionPercent(n.duration || 1) : 0;
                  const isPesi = n.type === 'workout' && n.subType === 'pesi' && n.muscles?.length > 0;
                  const iconContent = isPesi ? n.muscles.map(m => m.substring(0, 2).toUpperCase()).join('+') : (n.icon || '•');
                  if (isWork) {
                    return (
                      <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }}></div>
                    );
                  }
                  if (isCognitive) {
                    return (
                      <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(0, 229, 255, 0.2)', borderLeft: '2px solid #00e5ff', borderRight: '2px solid #00e5ff', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }}></div>
                    );
                  }
                  return (
                    <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none', fontSize: '0.5rem' }}>
                      <span style={{ lineHeight: 1 }}>{iconContent}</span>
                    </div>
                  );
                })}
                <div
                  className="mini-timeline-bar-wrap"
                  onPointerDown={(e) =>
                    handleMiniTimelineDrag(
                      e,
                      miniTimelineActivityRef,
                      'bar-all',
                      workoutStartTime,
                      workoutEndTime,
                      () => {},
                      setWorkoutEndTime,
                      { fixedDurationHours: workoutDurationHours },
                    )
                  }
                  style={{
                    position: 'absolute',
                    left: `${getTimePositionPercent(workoutStartTime)}%`,
                    width: `${getTimePositionPercent(workoutDurationHours)}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '24px',
                    background: 'rgba(255, 109, 0, 0.4)',
                    border: '1px solid #ff6d00',
                    borderRadius: '4px',
                    cursor: 'grab',
                    zIndex: 10,
                    touchAction: 'none',
                  }}
                >
                  <div
                    className="mini-timeline-hitbox"
                    role="slider"
                    aria-label="Fine attività"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleMiniTimelineDrag(
                        e,
                        miniTimelineActivityRef,
                        'bar-end',
                        workoutStartTime,
                        workoutEndTime,
                        () => {},
                        setWorkoutEndTime,
                        { fixedDurationHours: workoutDurationHours },
                      );
                    }}
                    style={{
                      position: 'absolute',
                      right: '-22px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '44px',
                      height: '44px',
                      minWidth: 44,
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 11,
                    }}
                  >
                    <div style={{ width: '12px', height: '24px', background: '#ff6d00', borderRadius: '4px', pointerEvents: 'none' }}></div>
                  </div>
                </div>
              </div>
            </div>
            {workoutType === 'pesi' && (() => {
              const pesiMuscleSet = new Set(normalizeMuscleGroupArray(workoutMuscles));
              return (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>
                    Gruppi muscolari
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {WORKOUT_MUSCLE_GROUP_DEFS.map(({ id: mId, label: mLabel }) => {
                      const isActive = pesiMuscleSet.has(mId);
                      return (
                        <button
                          key={mId}
                          type="button"
                          onClick={() => {
                            setWorkoutMuscles((prev) => {
                              const p = normalizeMuscleGroupArray(prev);
                              if (p.includes(mId)) return p.filter((x) => x !== mId);
                              return [...p, mId];
                            });
                          }}
                          style={{
                            padding: '10px 12px',
                            fontSize: '0.75rem',
                            borderRadius: '20px',
                            border: `1px solid ${isActive ? '#ff6d00' : '#444'}`,
                            background: isActive ? '#ff6d00' : '#222',
                            color: isActive ? '#000' : '#aaa',
                            fontWeight: isActive ? 'bold' : 'normal',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          {mLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {workoutActivityRequiresStrengthDetailNote(workoutType) && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>
                  Dettaglio workout <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={workoutStrengthDetail}
                  onChange={(e) => setWorkoutStrengthDetail(e.target.value)}
                  rows={3}
                  placeholder="Es. Push day — petto + tricipiti, esercizi e volumi…"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    background: '#1a1a1a',
                    border: `1px solid ${String(workoutStrengthDetail).trim() ? '#444' : 'rgba(239,68,68,0.55)'}`,
                    borderRadius: '10px',
                    color: '#e8e8e8',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                    minHeight: '72px',
                  }}
                />
              </div>
            )}
            <div className="burn-slider-container">
              <span className="burn-label" style={{color: '#ff6d00'}}>OUTPUT ENERGETICO STIMATO</span>
              <div className="burn-value workout">{Math.min(750, workoutKcal)}</div>
              <input type="range" min="50" max="750" step="10" value={Math.min(750, workoutKcal)} onChange={(e) => setWorkoutKcal(Math.min(750, Number(e.target.value)))} className="custom-range orange" style={{ marginTop: '20px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#666', marginTop: '6px' }}>
                <span>0</span><span>375</span><span>750</span>
              </div>
            </div>
            <button onClick={handleSaveWorkout} style={{ width: '100%', padding: '18px', backgroundColor: '#ff6d00', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.2s', boxShadow: '0 0 20px rgba(255, 109, 0, 0.4)' }}>SALVA ATTIVITÀ</button>
            <div style={{ marginTop: '30px' }}>
              {workoutsLog.length > 0 && <h4 style={{ fontSize: '0.65rem', color: '#666', letterSpacing: '2px', marginBottom: '10px' }}>OUTPUT REGISTRATI OGGI</h4>}
              {workoutsLog.map(wk => (
                <div key={wk.id} className="food-pill" style={{ borderLeft: '3px solid #ff6d00' }}>
                  <div><span className="food-pill-name">{wk.desc || wk.name}</span><span className="food-pill-weight" style={{color: '#ff6d00'}}>{Math.round(wk.kcal)} kcal</span></div>
                  <div className="food-pill-actions"><button className="food-pill-btn btn-delete" onClick={() => removeLogItem(wk.id)}>✕</button></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VISTA PASTO RAPIDO - CON BOTTONI CANONICI */}
        <PastoDrawer
          activeAction={activeAction}
          onClose={handleAttemptCloseMeal}
          mealType={mealType}
          setMealType={setMealType}
          drawerMealTime={drawerMealTime}
          setDrawerMealTime={setDrawerMealTime}
          setDrawerMealTimeStr={setDrawerMealTimeStr}
          getDefaultMealTime={getDefaultMealTime}
          decimalToTimeStr={decimalToTimeStr}
          parseTimeStrToDecimal={parseTimeStrToDecimal}
          miniTimelinePastoRef={miniTimelinePastoRef}
          handleMiniTimelineDrag={handleMiniTimelineDrag}
          allNodes={allNodes}
          totali={macroDailyReals}
          userTargets={userTargets}
          dynamicDailyKcal={dynamicDailyKcal}
          renderLiveProgressBar={renderLiveProgressBar}
          renderMiniBar={renderMiniBar}
          renderProgressBar={renderProgressBar}
          renderRatioBar={renderRatioBar}
          mealTotaliFull={mealTotaliFull}
          targetMacrosPasto={targetMacrosPastoWithPlanning}
          ratio={ratio}
          energyAt20Percent={energyAt20Percent}
          isBarcodeScannerOpen={isBarcodeScannerOpen}
          setIsBarcodeScannerOpen={setIsBarcodeScannerOpen}
          barcodeVideoRef={barcodeVideoRef}
          onCloseBarcodeScanner={closeBarcodeScanner}
          foodNameInput={foodNameInput}
          setFoodNameInput={setFoodNameInput}
          foodWeightInput={foodWeightInput}
          setFoodWeightInput={setFoodWeightInput}
          foodInputRef={foodInputRef}
          foodDropdownSuggestions={foodDropdownSuggestions}
          creaResults={creaResults}
          isCreaLoading={isCreaLoading}
          getLastQuantityForFood={getLastQuantityForFood}
          showFoodDropdown={showFoodDropdown}
          setShowFoodDropdown={setShowFoodDropdown}
          generateFoodWithAI={generateFoodWithAI}
          triggerCreaSearch={triggerCreaSearch}
          isGeneratingFood={isGeneratingFood}
          handleAddFoodManual={handleAddFoodManual}
          abitudiniIeri={abitudiniIeri}
          addedFoods={addedFoods}
          setAddedFoods={setAddedFoods}
          handleCalibrateFoodWeight={handleCalibrateFoodWeight}
          setSelectedFoodForInfo={setSelectedFoodForInfo}
          setSelectedFoodForEdit={setSelectedFoodForEdit}
          setEditQuantityValue={setEditQuantityValue}
          userProfile={userProfile}
          checkBilanciamentoPasto={checkBilanciamentoPasto}
          TELEMETRY_TABS={TELEMETRY_TABS}
          TARGETS={TARGETS}
          MEAL_LABELS_SAVE={MEAL_LABELS_SAVE}
          saveMealToDiary={saveMealToDiary}
          editingMealId={editingMealId}
          callGeminiAPIWithRotation={callGeminiAPIWithRotation}
          saveCustomRecipeToFoodDb={saveCustomRecipeToFoodDb}
          foodDb={foodDb}
          saveFoodEntryPer100ToFoodDb={saveFoodEntryPer100ToFoodDb}
          deleteRecipeFromFoodDb={deleteRecipeFromFoodDb}
          estraiDatiFoodDb={estraiDatiFoodDb}
          plannerNoteFromAi={mealPlannerGhostNote}
          onSmartComplete={handleSmartMealCompletion}
          smartMealLaunchKey={mealBuilderSmartLaunchKey}
          coachPracticalLaunchKey={mealBuilderCoachPracticalKey}
          mealBuilderBarcodeBootstrap={mealBuilderBarcodeBootstrap}
          onMealBuilderBarcodeBootstrapConsumed={consumeMealBuilderBarcodeBootstrap}
          persistBarcodeNutritionCorrection={persistBarcodeNutritionCorrection}
        />

        {/* VISTA DIARIO GIORNALIERO */}
        {activeAction === 'diario_giornaliero' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#00e676', letterSpacing: '2px', margin: 0 }}>📓 DIARIO GIORNALIERO</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#111', padding: '5px', borderRadius: '15px' }}>
              <button className={`type-btn ${diarioTab === 'storico' ? 'active blue' : ''}`} onClick={() => setDiarioTab('storico')} style={{ border: 'none' }}>Registro voci</button>
              <button className={`type-btn ${diarioTab === 'telemetria' ? 'active blue' : ''}`} onClick={() => setDiarioTab('telemetria')} style={{ border: 'none' }}>Bioscan 40</button>
            </div>
            {diarioTab === 'storico' && (
              <div style={{ minHeight: '200px' }}>
                {(activeLog || []).filter(item => item.type === 'sleep').map(item => (
                  <div
                    key={item.id}
                    style={{
                      background: 'linear-gradient(145deg, #1a1c29, #11121a)',
                      borderLeft: '4px solid #4ba3e3',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#4ba3e3', fontWeight: 'bold', fontSize: '1.1rem' }}>🌙 Riposo Notturno</span>
                      <span style={{ color: '#888', fontSize: '0.85rem', textAlign: 'right' }}>
                        {(() => {
                          const bed = item.bedtime ?? item.sleepStart;
                          const wak = item.wakeTime ?? item.sleepEnd;
                          const bedStr =
                            typeof bed === 'number' && Number.isFinite(bed)
                              ? `${Math.floor(bed)}:${String(Math.round((bed % 1) * 60)).padStart(2, '0')}`
                              : '—';
                          const wakeStr =
                            typeof wak === 'number' && Number.isFinite(wak)
                              ? `${Math.floor(wak)}:${String(Math.round((wak % 1) * 60)).padStart(2, '0')}`
                              : '—';
                          return (
                            <>
                              Addormentato {bedStr}
                              <br />
                              Risveglio {wakeStr}
                            </>
                          );
                        })()}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '5px' }}>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>Durata Totale</div>
                        <div style={{ color: '#fff', fontWeight: 'bold' }}>{item.hours != null ? `${Number(item.hours).toFixed(1)}h` : '--'}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>Battito Medio</div>
                        <div style={{ color: '#ff4d4d', fontWeight: 'bold' }}>{item.hr != null ? `${item.hr} bpm` : '--'}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>Sonno Profondo</div>
                        <div style={{ color: '#8c52ff', fontWeight: 'bold' }}>{item.deepMin != null ? `${Math.floor(item.deepMin / 60)}h ${item.deepMin % 60}m` : '--'}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>Fase REM</div>
                        <div style={{ color: '#00e5ff', fontWeight: 'bold' }}>{item.remMin != null ? `${Math.floor(item.remMin / 60)}h ${item.remMin % 60}m` : '--'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSleepModal({ editingId: item.id })}
                        style={{ background: 'transparent', border: '1px solid #4ba3e3', color: '#4ba3e3', fontSize: '0.8rem', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px' }}
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLogItem(item.id)}
                        style={{ background: 'transparent', border: 'none', color: '#ff4d4d', fontSize: '0.8rem', cursor: 'pointer', padding: '6px 0' }}
                      >
                        Rimuovi dati
                      </button>
                    </div>
                  </div>
                ))}
                {workoutsLog.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.7rem', color: '#ff6d00', letterSpacing: '1px', marginBottom: '8px' }}>OUTPUT ENERGETICO</h4>
                    {workoutsLog.map(wk => (
                      <div key={wk.id} className="food-pill" style={{ borderLeft: '3px solid #ff6d00', background: 'rgba(255, 109, 0, 0.05)' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff' }}>{wk.desc || wk.name}</div>
                          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>Stima: {wk.duration || Math.round((wk.kcal || 0) / 6)} min</div>
                        </div>
                        <div className="food-pill-actions">
                          <div style={{ color: '#ff6d00', fontWeight: 'bold', fontSize: '1rem', marginRight: '10px' }}>🔥 {Math.round(wk.kcal || wk.cal || 0)}</div>
                          <button className="food-pill-btn btn-delete" onClick={() => removeLogItem(wk.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {Object.keys(groupedFoods).length === 0 && workoutsLog.length === 0 && !(activeLog || []).some(i => i.type === 'sleep') ? (
                  <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic' }}>Nessuna traccia registrata oggi.</p>
                ) : (
                  Object.keys(groupedFoods)
                    .sort((a, b) => {
                      const timeA = Math.min(...(groupedFoods[a] || []).map(f => Number(f.mealTime ?? f.time ?? 12) || 0));
                      const timeB = Math.min(...(groupedFoods[b] || []).map(f => Number(f.mealTime ?? f.time ?? 12) || 0));
                      return timeA - timeB;
                    })
                    .map(slotKey => {
                    const items = groupedFoods[slotKey];
                    const mType = items[0]?.mealType || slotKey.split('_')[0];
                    const baseType = mType.split('_')[0];
                    const suffixType = mType.includes('_') ? ` ${mType.split('_')[1]}` : '';
                    const mTime = items[0]?.mealTime ?? 12;
                    const label = `${MEAL_LABELS_SAVE[toCanonicalMealType(baseType)] || baseType}${suffixType} (${decimalToTimeStr(mTime)})`;

                    return (
                      <div key={slotKey} style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '0.7rem', color: '#888', letterSpacing: '1px', margin: 0, cursor: 'pointer', flex: 1 }} onClick={() => loadMealToConstructor(slotKey)}>
                            {label}
                          </h4>
                          <button type="button" className="food-pill-btn" onClick={() => loadMealToConstructor(slotKey)} title="Modifica pasto">✏️</button>
                        </div>
                        {items.map(food => {
                          const recipeExpandable = (food.type === 'recipe' || food.isRecipe === true)
                            && Array.isArray(food.ingredients)
                            && food.ingredients.length > 0;
                          const recipeKey = food.id != null ? String(food.id) : '';
                          const recipeExpanded = recipeKey && !!expandedRecipes[recipeKey];
                          return (
                            <div key={food.id} style={{ marginBottom: '8px' }}>
                              <div className="food-pill" style={{ borderLeft: '3px solid #333', cursor: 'pointer' }} onClick={() => loadMealToConstructor(slotKey)}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                    <span className="food-pill-name">{food.desc || food.name}</span>
                                    {recipeExpandable && (
                                      <button
                                        type="button"
                                        className="food-pill-btn"
                                        aria-expanded={recipeExpanded}
                                        aria-label={recipeExpanded ? 'Nascondi ingredienti' : 'Mostra ingredienti'}
                                        title={recipeExpanded ? 'Nascondi ingredienti' : 'Mostra ingredienti'}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRecipe(food.id);
                                        }}
                                        style={{ fontSize: '0.65rem', opacity: 0.85, padding: '2px 6px' }}
                                      >
                                        {recipeExpanded ? '▲' : '▼'}
                                      </button>
                                    )}
                                    <span className="food-pill-weight">{food.qta || food.weight}g</span>
                                  </div>
                                </div>
                                <div className="food-pill-actions" onClick={(e) => e.stopPropagation()}>
                                  <button className="food-pill-btn" onClick={(e) => { e.stopPropagation(); setSelectedFoodForInfo(food); }} title="Info macro/micro">ℹ️</button>
                                  <button className="food-pill-btn" onClick={(e) => { e.stopPropagation(); loadMealToConstructor(slotKey); }} title="Modifica pasto">✏️</button>
                                  <div style={{ fontSize: '0.75rem', color: '#888', marginRight: '10px' }}>{Math.round(food.kcal || food.cal || 0)} kcal</div>
                                  <button className="food-pill-btn btn-delete" onClick={(e) => { e.stopPropagation(); removeLogItem(food.id); }}>✕</button>
                                </div>
                              </div>
                              {recipeExpandable && recipeExpanded && (
                                <div
                                  style={{
                                    marginTop: '8px',
                                    marginLeft: '4px',
                                    paddingLeft: '15px',
                                    paddingTop: '8px',
                                    paddingBottom: '8px',
                                    paddingRight: '10px',
                                    borderLeft: '2px solid #444',
                                    background: 'rgba(0,0,0,0.28)',
                                    borderRadius: '0 10px 10px 0'
                                  }}
                                >
                                  {food.ingredients.map((ing, ingIdx) => {
                                    const w = Number(ing.weight);
                                    const wg = Number.isFinite(w) ? `${Math.round(w)}g` : '—';
                                    const kc = Math.round(Number(ing.kcal) || 0);
                                    const p = Number(ing.prot);
                                    const c = Number(ing.carb);
                                    const g = Number(ing.fat);
                                    const pStr = Number.isFinite(p) ? p.toFixed(1) : '0';
                                    const cStr = Number.isFinite(c) ? c.toFixed(1) : '0';
                                    const gStr = Number.isFinite(g) ? g.toFixed(1) : '0';
                                    const nm = ing.name != null ? String(ing.name) : 'Ingrediente';
                                    return (
                                      <div
                                        key={ing.id != null ? String(ing.id) : `ing_${ingIdx}`}
                                        style={{
                                          fontSize: '0.85rem',
                                          color: '#aaa',
                                          lineHeight: 1.45,
                                          marginBottom: ingIdx < food.ingredients.length - 1 ? '6px' : 0
                                        }}
                                      >
                                        {nm} · {wg} · {kc} kcal · P {pStr}g · C {cStr}g · G {gStr}g
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            )}
            {diarioTab === 'telemetria' && (
              <div className="view-animate">
                <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px', flexShrink: 0 }}>
                  {TELEMETRY_TABS.map((t, idx) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTelemetrySubTab(t);
                        if (telemetryScrollRef.current) {
                          telemetryScrollRef.current.scrollTo({ left: telemetryScrollRef.current.clientWidth * idx, behavior: 'smooth' });
                        }
                      }}
                      style={{ padding: '8px 15px', fontSize: '0.7rem', background: telemetrySubTab === t ? '#00e676' : '#111', color: telemetrySubTab === t ? '#000' : '#888', border: 'none', borderRadius: '20px', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer' }}
                    >{t}</button>
                  ))}
                </div>
                <div
                  ref={telemetryScrollRef}
                  className="telemetry-carousel"
                  onScroll={() => {
                    const el = telemetryScrollRef.current;
                    if (!el) return;
                    const idx = Math.round(el.scrollLeft / el.clientWidth);
                    const tab = TELEMETRY_TABS[idx];
                    if (tab && tab !== telemetrySubTab) setTelemetrySubTab(tab);
                  }}
                  style={{ width: '100%', flex: 1, minHeight: 0 }}
                >
                  <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
                    <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
                      {renderProgressBar('Calorie', totali.kcal || 0, dynamicDailyKcal, 'kcal', 'kcal')}
                      {renderProgressBar('PROTEINE', totali.prot, userTargets.prot ?? TARGETS.macro.prot, 'g', 'prot')}
                      {renderProgressBar('CARBOIDRATI', totali.carb, userTargets.carb ?? TARGETS.macro.carb, 'g', 'carb')}
                      {renderProgressBar('GRASSI TOTALI', totali.fatTotal, userTargets.fatTotal ?? TARGETS.macro.fatTotal, 'g', 'fatTotal')}
                    </div>
                  </div>
                  <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
                    <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
                      <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '15px' }}>RAPPORTI BIOCHIMICI</h4>
                      {renderRatioBar('Equilibrio Elettrolitico (Idratazione)', 'Sodio (Na)', totali?.na, 'Potassio (K)', totali?.k, 'Ideale: Na < K', (Number(totali?.na) || 0) < (Number(totali?.k) || 0))}
                      {renderRatioBar('Indice Infiammatorio (Grassi)', 'Omega 6', totali?.omega6, 'Omega 3', totali?.omega3, 'Ideale: W6:W3 < 4:1', (Number(totali?.omega6) || 0) <= (Number(totali?.omega3) || 1) * 4)}
                    </div>
                  </div>
                  <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
                    <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
                      {Object.keys(TARGETS.amino).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.amino[k], 'mg', k))}
                    </div>
                  </div>
                  <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
                    <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
                      {Object.keys(TARGETS.vit).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.vit[k], k === 'vitA' || k === 'b9' ? 'µg' : 'mg', k))}
                    </div>
                  </div>
                  <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
                    <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
                      {Object.keys(TARGETS.min).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.min[k], k === 'se' ? 'µg' : 'mg', k))}
                    </div>
                  </div>
                  <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
                    <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
                      {renderProgressBar('Grassi Totali', totali.fatTotal || totali.fat || 0, userTargets.fatTotal ?? userTargets.fat ?? 70, 'g', 'fatTotal')}
                      {Object.keys(TARGETS.fat).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.fat[k], 'g', k))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VISTA ARCHIVIO STORICO */}
        {activeAction === 'storico' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>📚 ARCHIVIO STORICO</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', letterSpacing: '1px', marginBottom: '8px' }}>Cerca per data</label>
              <input
                type="date"
                value={selectedHistoryDate}
                onChange={(e) => setSelectedHistoryDate(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
            {selectedHistoryDate && (
              <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(176, 190, 197, 0.06)', border: '1px solid rgba(176, 190, 197, 0.2)', borderRadius: '12px' }}>
                {selectedDayData ? (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', fontSize: '0.8rem' }}>
                      <span style={{ color: '#b0bec5' }}>{new Date(selectedHistoryDate + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      <span style={{ color: '#00e5ff' }}>{Math.round(selectedDayData.calorie)} kcal</span>
                      <span style={{ color: '#b388ff' }}>{selectedDayData.proteine.toFixed(1)} g prot</span>
                      <span style={{ color: selectedDayData.deficit < 0 ? '#00e676' : selectedDayData.deficit > 0 ? '#ff6d00' : '#888' }}>
                        {selectedDayData.deficit < 0 ? `${selectedDayData.deficit} kcal (Deficit)` : selectedDayData.deficit > 0 ? `+${selectedDayData.deficit} kcal (Surplus)` : '0 kcal (Pari)'}
                      </span>
                    </div>
                    <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '8px' }}>Dettaglio</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(selectedDayData.log || []).map((entry, idx) => {
                        if (entry.type === 'meal' && entry.items) {
                          const tot = (entry.items || []).reduce((a, it) => ({ prot: a.prot + (it.prot || 0), cal: a.cal + ((it.cal || it.kcal) || 0) }), { prot: 0, cal: 0 });
                          return (
                            <div key={idx}>
                              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e4e6eb' }}>{entry.desc || 'Pasto'} — {tot.prot.toFixed(1)} g prot, {Math.round(tot.cal)} kcal</div>
                              {(entry.items || []).map((item, i) => (
                                <div key={i} style={{ paddingLeft: '12px', fontSize: '0.75rem', color: '#b0b3b8' }}>{item.desc} · {(item.qta || item.weight) || ''}g · {Math.round((item.cal || item.kcal) || 0)} kcal</div>
                              ))}
                            </div>
                          );
                        }
                        if (entry.type === 'single' || !entry.type) {
                          return <div key={idx} style={{ fontSize: '0.8rem', color: '#b0b3b8' }}>{entry.desc} · {Math.round((entry.cal || entry.kcal) || 0)} kcal</div>;
                        }
                        if (entry.type === 'workout') {
                          return <div key={idx} style={{ fontSize: '0.8rem', color: '#ff6d00' }}>{entry.desc} — {Math.round((entry.cal || entry.kcal) || 0)} kcal (bruciate)</div>;
                        }
                        return null;
                      })}
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>Nessun dato registrato per questa data.</p>
                )}
              </div>
            )}
            <h3 className="diary-group-title" style={{ borderLeftColor: '#b0bec5', marginBottom: '12px' }}>Tutti i giorni</h3>
            {pastDaysStorico.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic' }}>Nessun giorno passato in archivio.</p>
            ) : (
              <div className="storico-accordion">
                {pastDaysStorico.map(({ dataStr, log, calorie, proteine, deficit }) => {
                  const isExpanded = expandedStoricoDate === dataStr;
                  const dataFormatted = new Date(dataStr + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const deficitText = deficit < 0 ? `${deficit} kcal (Deficit)` : deficit > 0 ? `+${deficit} kcal (Surplus)` : '0 kcal (Pari)';
                  return (
                    <div key={dataStr} style={{ marginBottom: '8px', border: '1px solid #2a2a2a', borderRadius: '12px', overflow: 'hidden', background: isExpanded ? 'rgba(176, 190, 197, 0.06)' : 'rgba(255,255,255,0.02)' }}>
                      <button type="button" onClick={() => setExpandedStoricoDate(isExpanded ? null : dataStr)} style={{ width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{dataFormatted}</span>
                        <span style={{ fontSize: '0.75rem', color: '#00e5ff' }}>{Math.round(calorie)} kcal</span>
                        <span style={{ fontSize: '0.75rem', color: '#b388ff' }}>{proteine.toFixed(1)} g prot</span>
                        <span style={{ fontSize: '0.75rem', color: deficit < 0 ? '#00e676' : deficit > 0 ? '#ff6d00' : '#888' }}>{deficitText}</span>
                        <span style={{ fontSize: '1rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                      </button>
                      {isExpanded && (
                        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #2a2a2a', background: 'rgba(0,0,0,0.3)' }}>
                          <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '10px' }}>Dettaglio pasti e alimenti</h4>
                          {(log || []).length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>Nessun dettaglio per questo giorno.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {(log || []).map((entry, idx) => {
                                if (entry.type === 'meal' && entry.items) {
                                  const totPasto = (entry.items || []).reduce((a, it) => ({ prot: a.prot + (it.prot || 0), cal: a.cal + ((it.cal || it.kcal) || 0) }), { prot: 0, cal: 0 });
                                  return (
                                    <div key={idx} style={{ marginBottom: '4px' }}>
                                      <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e4e6eb', marginBottom: '4px' }}>{entry.desc || 'Pasto'} — {totPasto.prot.toFixed(1)} g prot, {Math.round(totPasto.cal)} kcal</div>
                                      {(entry.items || []).map((item, i) => (
                                        <div key={i} style={{ paddingLeft: '16px', fontSize: '0.8rem', color: '#b0b3b8', display: 'flex', justifyContent: 'space-between' }}>
                                          <span>{item.desc}</span>
                                          <span>{item.qta || item.weight}g · {(item.prot || 0).toFixed(1)} g · {Math.round((item.cal || item.kcal) || 0)} kcal</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                if (entry.type === 'single' || !entry.type) {
                                  return (
                                    <div key={idx} style={{ fontSize: '0.8rem', color: '#b0b3b8', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>{entry.desc}</span>
                                      <span>{(entry.qta || entry.weight) || ''}g · {(entry.prot || 0).toFixed(1)} g · {Math.round((entry.cal || entry.kcal) || 0)} kcal</span>
                                    </div>
                                  );
                                }
                                if (entry.type === 'workout') {
                                  return (
                                    <div key={idx} style={{ fontSize: '0.8rem', color: '#ff6d00', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>{entry.desc}</span>
                                      <span>{Math.round((entry.cal || entry.kcal) || 0)} kcal (bruciate)</span>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VISTA ZEN — Neural Reset fullscreen (portal su document.body) */}
        {activeAction === 'focus' && createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100dvw',
              height: '100dvh',
              maxHeight: '100dvh',
              margin: 0,
              padding: 0,
              borderRadius: 0,
              zIndex: 100000,
              boxSizing: 'border-box',
              background: 'radial-gradient(circle at center, #00e5ff 0%, #004d66 60%, #000000 100%)',
              display: 'flex',
              flexDirection: 'column',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            }}
          >
            <audio
              ref={neuralResetAudioRef}
              loop
              preload="auto"
              aria-hidden
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
            <audio
              ref={neuralResetBellRef}
              src="/campana.mp3"
              preload="auto"
              aria-hidden
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
            <audio
              ref={zenAmbientForestRef}
              src="/foresta.mp3"
              loop
              preload="auto"
              aria-hidden
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 18px', gap: '12px', position: 'relative', zIndex: 30 }}>
              <button
                type="button"
                onClick={() => {
                  if (zenEndSessionTimeoutRef.current) {
                    clearTimeout(zenEndSessionTimeoutRef.current);
                    zenEndSessionTimeoutRef.current = null;
                  }
                  clearZenAmbientFade();
                  const amb = zenAmbientForestRef.current;
                  if (amb) {
                    amb.pause();
                    amb.currentTime = 0;
                    amb.volume = 0;
                  }
                  setZenForestAmbientOn(false);
                  setZenGracefulEnd(false);
                  setIsZenActive(false);
                  setActiveAction(null);
                }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}
              >
                &lt; INDIETRO
              </button>
              <h2 style={{ fontSize: '0.85rem', color: '#FFD700', letterSpacing: '2px', margin: 0, textShadow: '0 0 12px rgba(255,215,0,0.35)', flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <img
                  src="/nuovo%20logo%20trasparente2.png"
                  alt="Kentuos Logo"
                  decoding="async"
                  style={{ maxHeight: 26, width: 'auto', maxWidth: 'min(140px, 38vw)', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.45))' }}
                />
                <span style={{ whiteSpace: 'nowrap' }}>NEURAL RESET</span>
              </h2>
              <div style={{ width: '48px', height: '48px', flexShrink: 0 }} aria-hidden />
            </div>
            <div style={{ flexShrink: 0, padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '420px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Pattern di respirazione
                <select
                  value={zenBreathPatternId}
                  onChange={(e) => setZenBreathPatternId(e.target.value)}
                  disabled={isZenActive}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fff',
                    fontSize: '0.8rem',
                    cursor: isZenActive ? 'not-allowed' : 'pointer',
                    opacity: isZenActive ? 0.55 : 1,
                  }}
                >
                  {Object.values(NEURAL_RESET_PATTERNS).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Durata sessione
                <select
                  value={zenSessionDurationKey}
                  onChange={(e) => setZenSessionDurationKey(e.target.value)}
                  disabled={isZenActive}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fff',
                    fontSize: '0.8rem',
                    cursor: isZenActive ? 'not-allowed' : 'pointer',
                    opacity: isZenActive ? 0.55 : 1,
                  }}
                >
                  {ZEN_SESSION_DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <p style={{ flexShrink: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', margin: '0 20px 24px', lineHeight: 1.5 }}>
              {NEURAL_RESET_PATTERNS[zenBreathPatternId]?.hint ?? ''}
            </p>
            <div
              style={{
                position: 'relative',
                flex: 1,
                minHeight: 0,
                width: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 'clamp(32px, 7.5vh, 56px)',
                paddingBottom: 'clamp(28px, 6.5vh, 48px)',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '80px',
                  height: '80px',
                  marginLeft: '-40px',
                  marginTop: '-40px',
                  transform: 'scale(1.25)',
                  transformOrigin: 'center center',
                  zIndex: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    flexShrink: 0,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${zenSunScale})`,
                    transformOrigin: 'center center',
                    transition: `transform ${zenSunTransitionMs}ms ease-in-out, opacity ${zenSunTransitionMs}ms ease-in-out`,
                    opacity: isZenActive && zenSunDimHold ? 0.07 : 1,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: '-6px',
                      borderRadius: '50%',
                      border: '1px solid rgba(255, 215, 0, 0.45)',
                      boxShadow: '0 0 24px rgba(255, 215, 0, 0.2)',
                    }}
                  />
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: '#FFD700',
                      boxShadow: '0 0 40px 18px rgba(255, 215, 0, 0.55), 0 0 80px 36px rgba(255, 200, 80, 0.22)',
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 'max(24px, env(safe-area-inset-bottom))',
                  left: '20px',
                  right: '20px',
                  textAlign: 'center',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#fff',
                  textShadow: '0 2px 12px rgba(0,0,0,0.65)',
                }}
              >
                <span>{isZenActive && zenBreathPhase ? zenBreathPhase : zenGracefulEnd ? 'Completamento…' : 'In attesa'}</span>
                {zenTimerLine && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.35em', color: 'rgba(255,215,0,0.85)' }}>
                    {zenTimerLine}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0, padding: '12px 20px max(20px, env(safe-area-inset-bottom))' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '20px',
                  marginBottom: '14px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setAudioMode(m => (m === 'sea' ? 'muted' : 'sea'))}
                  title="Suono mare"
                  aria-label="Suono mare"
                  aria-pressed={audioMode === 'sea'}
                  style={{
                    width: '52px',
                    height: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '14px',
                    border: `1px solid ${audioMode === 'sea' ? 'rgba(0,229,255,0.55)' : 'rgba(255,255,255,0.12)'}`,
                    background: audioMode === 'sea' ? 'rgba(0,229,255,0.1)' : 'rgba(0,0,0,0.2)',
                    cursor: 'pointer',
                    transition: 'filter 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
                    filter: audioMode === 'sea' ? 'none' : 'grayscale(100%)',
                    opacity: audioMode === 'sea' ? 1 : 0.4,
                    boxShadow: audioMode === 'sea' ? '0 0 18px rgba(0, 229, 255, 0.5), 0 0 32px rgba(0, 229, 255, 0.2)' : 'none',
                    color: '#00e5ff',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12c1.5 0 2.5-2 4-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2" />
                    <path d="M2 16c1.5 0 2.5-2 4-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2" />
                    <path d="M2 8c1.5 0 2.5-2 4-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = zenAmbientForestRef.current;
                    if (!el) return;
                    if (zenForestAmbientOn) {
                      fadeZenAmbientVolume(0, ZEN_AMBIENT_FADE_MS, () => {
                        el.pause();
                        el.currentTime = 0;
                        setZenForestAmbientOn(false);
                      });
                    } else {
                      setZenForestAmbientOn(true);
                      el.volume = 0;
                      el.play().catch(() => {
                        setZenForestAmbientOn(false);
                      });
                      fadeZenAmbientVolume(ZEN_AMBIENT_TARGET_VOL, ZEN_AMBIENT_FADE_MS, null);
                    }
                  }}
                  title={zenForestAmbientOn ? 'Spegni paesaggio foresta' : 'Accendi paesaggio foresta'}
                  aria-label={zenForestAmbientOn ? 'Spegni paesaggio sonoro foresta' : 'Accendi paesaggio sonoro foresta'}
                  aria-pressed={zenForestAmbientOn}
                  style={{
                    width: '52px',
                    height: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '14px',
                    border: `1px solid ${zenForestAmbientOn ? 'rgba(0,255,136,0.55)' : 'rgba(255,255,255,0.12)'}`,
                    background: zenForestAmbientOn ? 'rgba(0,255,136,0.08)' : 'rgba(0,0,0,0.2)',
                    cursor: 'pointer',
                    transition: 'filter 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
                    filter: zenForestAmbientOn ? 'none' : 'grayscale(100%)',
                    opacity: zenForestAmbientOn ? 1 : 0.4,
                    boxShadow: zenForestAmbientOn ? '0 0 18px rgba(0, 255, 136, 0.45), 0 0 32px rgba(0, 255, 136, 0.18)' : 'none',
                    color: '#00ff88',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.5L7.2 11.2h9.6L12 2.5z" />
                    <path d="M12 7.5L5.5 16.5h13L12 7.5z" />
                    <rect x="10" y="16.2" width="4" height="6.3" rx="0.45" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                disabled={zenGracefulEnd}
                onClick={() => {
                  if (zenGracefulEnd) return;
                  setIsZenActive(!isZenActive);
                }}
                style={{
                  width: '100%',
                  padding: '18px',
                  backgroundColor: zenGracefulEnd ? 'rgba(0,0,0,0.25)' : isZenActive ? 'rgba(0,0,0,0.35)' : '#FFD700',
                  color: zenGracefulEnd ? 'rgba(255,215,0,0.5)' : isZenActive ? '#FFD700' : '#000',
                  border: isZenActive || zenGracefulEnd ? '1px solid #FFD700' : 'none',
                  borderRadius: '15px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  letterSpacing: '2px',
                  cursor: zenGracefulEnd ? 'default' : 'pointer',
                  transition: '0.3s',
                  boxShadow: isZenActive || zenGracefulEnd ? 'none' : '0 0 24px rgba(255, 215, 0, 0.35)',
                  opacity: zenGracefulEnd ? 0.85 : 1,
                }}
              >
                {zenGracefulEnd ? 'Completamento…' : isZenActive ? 'TERMINA SESSIONE' : 'AVVIA CICLO'}
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* Modale Edit quantità */}
        {selectedFoodForEdit && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => setSelectedFoodForEdit(null)}>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '16px', maxWidth: '340px', width: '100%', padding: '20px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#00e676' }}>Modifica quantità</h3>
                <button style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setSelectedFoodForEdit(null)}>✕</button>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '8px' }}>{selectedFoodForEdit.food?.desc || selectedFoodForEdit.food?.name}</p>
              <input type="number" min="1" step="1" inputMode="decimal" value={editQuantityValue} onChange={(e) => setEditQuantityValue(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', borderRadius: '8px', color: '#fff', fontSize: '1rem', marginBottom: '16px' }} placeholder="Grammi" />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button style={{ padding: '10px 18px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setSelectedFoodForEdit(null)}>Annulla</button>
                <button style={{ padding: '10px 18px', background: '#00e676', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => {
                  const qta = parseFloat(editQuantityValue);
                  if (!Number.isFinite(qta) || qta <= 0) return;
                  const { food, source } = selectedFoodForEdit;
                  const newItem = { ...estraiDatiFoodDb(food.desc || food.name, qta, food.mealType), id: food.id, locked: true };
                  if (source === 'queue') setAddedFoods(prev => prev.map(f => f.id === food.id ? newItem : f));
                  else if (source === 'diary') {
                    if (isSimulationMode) {
                      setSimulatedLog(prev => (prev || []).map(f => {
                        if (f.id !== food.id) return f;
                        return { ...newItem, mealTime: f.mealTime };
                      }));
                    } else {
                      const newLog = dailyLog.map(f => {
                        if (f.id !== food.id) return f;
                        return { ...newItem, mealTime: f.mealTime };
                      });
                      setDailyLog(newLog);
                      syncDatiFirebase(newLog, manualNodes);
                    }
                  }
                  setSelectedFoodForEdit(null);
                }}>Salva</button>
              </div>
            </div>
          </div>
        )}

      </MenuDrawerShell>

      {isAiCoachSuggestionModalOpen && aiCoachSuggestion
        ? createPortal(
          <div
            role="presentation"
            onClick={handleAiCoachClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(2, 6, 23, 0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '18px',
              zIndex: 100070,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Suggerimento metabolico"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 380,
                borderRadius: 16,
                border: '1px solid rgba(250, 204, 21, 0.35)',
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))',
                boxShadow: '0 24px 52px rgba(0,0,0,0.5)',
                padding: '16px 16px 14px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#fde68a', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                Suggerimento metabolico
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#fef9c3' }}>
                {aiCoachSuggestionTitle}
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: '0.9rem', color: '#fefce8', lineHeight: 1.45 }}>
                {aiCoachSuggestion.message}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleAiCoachCreateMeal}
                  disabled={!aiCoachSuggestion.action}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: 'none',
                    background: aiCoachSuggestion.action ? '#facc15' : 'rgba(148,163,184,0.35)',
                    color: aiCoachSuggestion.action ? '#422006' : '#cbd5e1',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: aiCoachSuggestion.action ? 'pointer' : 'not-allowed',
                    opacity: aiCoachSuggestion.action ? 1 : 0.8,
                  }}
                >
                  Crea pasto
                </button>
                <button
                  type="button"
                  onClick={handleAiCoachIgnore}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.22)',
                    background: 'transparent',
                    color: '#cbd5e1',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Ignora
                </button>
                <button
                  type="button"
                  onClick={handleAiCoachClose}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: 'rgba(15,23,42,0.65)',
                    color: '#94a3b8',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}

      {createPortal(
        <>
          <DailyMacroSheet
            open={dailyMacroSheetOpen}
            onClose={() => setDailyMacroSheetOpen(false)}
            dailyLog={activeLog || []}
            userTargets={userTargets}
            dailyKcalTarget={dynamicDailyKcal}
          />
          {selectedFoodForInfo ? (
            <FoodLabelModal foodItem={selectedFoodForInfo} foodDb={csvFoodDb} onClose={() => setSelectedFoodForInfo(null)} />
          ) : null}
        </>,
        document.body
      )}

      {showProfile && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 100020, overflowY: 'auto', padding: '20px' }}>
          <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '16px', maxWidth: '600px', margin: '0 auto', color: '#fff' }}>
            <h2 style={{ color: '#00e5ff', borderBottom: '1px solid #333', paddingBottom: '10px' }}>⚙️ Impostazioni Universali</h2>

            <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>1. Dati Biometrici</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <label style={{ display: 'block' }}>Sesso: <select value={userProfile.gender} onChange={e => setUserProfile({ ...userProfile, gender: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}><option value="M">Uomo</option><option value="F">Donna</option></select></label>
                <label style={{ display: 'block' }}>Data di Nascita
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginTop: '4px', background: '#2c2c2e', border: '1px solid #444', color: '#fff', borderRadius: '8px', boxSizing: 'border-box' }}
                  />
                </label>
                {calculateAge(birthDate) != null ? (
                  <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: '#00e5ff', marginTop: '-4px', marginBottom: '4px' }}>
                    Età calcolata: <strong>{calculateAge(birthDate)}</strong> anni
                  </div>
                ) : null}
                <label style={{ display: 'block' }}>Età: <input type="number" min="1" max="120" inputMode="numeric" value={userProfile.age} onChange={e => setUserProfile({ ...userProfile, age: parseInt(e.target.value, 10) || 30 })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} /></label>
                <label style={{ display: 'block' }}>Peso (kg): <input type="number" min="1" step="0.1" inputMode="decimal" value={userProfile.weight} onChange={e => setUserProfile({ ...userProfile, weight: parseFloat(e.target.value) || 75 })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} /></label>
                <label style={{ display: 'block' }}>Altezza (cm): <input type="number" min="1" inputMode="decimal" value={userProfile.height} onChange={e => setUserProfile({ ...userProfile, height: parseFloat(e.target.value) || 175 })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} /></label>
                <label style={{ display: 'block' }}>Stile di Vita:
                  <select value={userProfile.activityLevel} onChange={e => setUserProfile({ ...userProfile, activityLevel: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                    <option value="1.2">Sedentario</option>
                    <option value="1.375">Leggero (1-3 allenamenti)</option>
                    <option value="1.55">Moderato (3-5 allenamenti)</option>
                    <option value="1.725">Attivo (6-7 allenamenti)</option>
                  </select>
                </label>
                <label style={{ display: 'block' }}>Obiettivo nutrizionale:
                  <select
                    value={userProfile.nutritionGoal || 'maintain'}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUserProfile({
                        ...userProfile,
                        nutritionGoal: v,
                        goal: v === 'cut' ? 'lose' : v === 'bulk' ? 'gain' : 'maintain',
                      });
                    }}
                    style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                  >
                    <option value="cut">Deficit (cut)</option>
                    <option value="maintain">Mantenimento</option>
                    <option value="bulk">Surplus (bulk)</option>
                  </select>
                </label>
                <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                  Calorie target (giornaliere)
                  <input
                    type="number"
                    min={800}
                    max={12000}
                    inputMode="numeric"
                    value={userProfile.targetCalories ?? userTargets.kcal ?? ''}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      const nextCal = Number.isFinite(n) ? n : null;
                      setUserProfile({ ...userProfile, targetCalories: nextCal });
                      if (Number.isFinite(n)) {
                        setUserTargets((prev) => ({ ...prev, kcal: n }));
                      }
                    }}
                    style={{ width: '100%', marginTop: '4px', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                  />
                </label>
                <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                  Proteine (g) — opzionale, lascia vuoto per usare il valore dai macro
                  <input
                    type="number"
                    min={30}
                    max={400}
                    inputMode="numeric"
                    placeholder="Auto"
                    value={userProfile.proteinTarget ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') {
                        setUserProfile({ ...userProfile, proteinTarget: null });
                        return;
                      }
                      const n = parseInt(raw, 10);
                      if (Number.isFinite(n)) {
                        setUserProfile({ ...userProfile, proteinTarget: n });
                        setUserTargets((prev) => ({ ...prev, prot: n }));
                      }
                    }}
                    style={{ width: '100%', marginTop: '4px', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                  />
                </label>
                <label style={{ display: 'block' }}>Livello interfaccia:
                  <select value={userProfile.level || 'pro'} onChange={e => setUserProfile({ ...userProfile, level: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                    <option value="base">Base (semplificata)</option>
                    <option value="pro">Pro (grafici e telemetria)</option>
                  </select>
                </label>
              </div>
              <button type="button" onClick={calculateSmartTargets} style={{ width: '100%', padding: '12px', marginTop: '15px', background: '#ff9800', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <img src="/nuova-icona.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
                Auto-Calcola Target
              </button>
            </div>

            <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>2. Modifica Manuale Target</h3>
              <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '15px' }}>Correggi manualmente i valori calcolati se il tuo nutrizionista (o l'AI) ti ha fornito numeri specifici.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                {Object.keys(userTargets).map(key => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem' }}>
                    <span style={{ textTransform: 'uppercase', color: '#00e5ff' }}>{key}</span>
                    <input type="number" min="0" step={key === 'omega3' || key === 'vitD' ? 0.1 : 1} inputMode="decimal" value={userTargets[key] ?? ''} onChange={e => setUserTargets({ ...userTargets, [key]: parseFloat(e.target.value) || 0 })} style={{ padding: '8px', border: '1px solid #444', background: '#111', color: '#fff', borderRadius: '4px' }} />
                  </label>
                ))}
              </div>
            </div>

            <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#00e5ff' }}>3. Sincronizzazione Bilancia (CSV)</h3>
              <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '15px', lineHeight: 1.4 }}>
                Importa lo storico delle pesate dalla tua bilancia smart. Il sistema leggerà automaticamente Peso, Massa Grassa, Massa Muscolare e Idratazione, assegnandoli ai giorni corretti nel tuo diario.
              </p>
              <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} />
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                style={{ width: '100%', padding: '12px', background: 'rgba(0, 229, 255, 0.1)', color: '#00e5ff', border: '1px dashed #00e5ff', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                <span style={{ fontSize: '1.2rem' }}>📊</span> Carica File CSV Bilancia
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              {longevityData && (
                <button
                  type="button"
                  onClick={() => { setShowProfile(false); setShowLongevityModal(true); }}
                  style={{ flex: '1 1 140px', padding: '10px 12px', background: 'transparent', border: `1px solid ${longevityData.color}55`, color: longevityData.color, borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                >
                  🧬 Statistiche
                </button>
              )}
              <button
                type="button"
                onClick={() => auth.signOut()}
                style={{ flex: '1 1 140px', padding: '10px 12px', background: 'rgba(244,67,54,0.12)', border: '1px solid rgba(244,67,54,0.45)', color: '#f87171', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
              >
                Esci
              </button>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button type="button" onClick={() => setShowProfile(false)} style={{ flex: 1, padding: '12px', background: '#444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Annulla</button>
              <button
                type="button"
                onClick={() => {
                  const computedAge = calculateAge(birthDate);
                  let profilePayload = { ...userProfile, birthDate: birthDate || '' };
                  if (computedAge != null) profilePayload.age = computedAge;
                  if (profilePayload.targetCalories == null && userTargets.kcal != null) {
                    profilePayload.targetCalories = Math.round(Number(userTargets.kcal));
                  }
                  profilePayload = mergeProfileNutritionFromServer(profilePayload);
                  setUserProfile(profilePayload);
                  saveProfileToFirebase(profilePayload, userTargets);
                }}
                style={{ flex: 2, padding: '12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                💾 Salva Profilo
              </button>
            </div>
          </div>
        </div>
      )}
      {showDateCalendarModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100040,
            padding: '16px',
          }}
          onClick={() => setShowDateCalendarModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#0b0b0c',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 16,
              padding: 14,
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => {
                  const [y, m] = calendarMonthIso.split('-').map(Number);
                  const d = new Date(y, m - 2, 1);
                  const mo = String(d.getMonth() + 1).padStart(2, '0');
                  setCalendarMonthIso(`${d.getFullYear()}-${mo}`);
                }}
                style={{ background: 'none', border: 'none', color: '#7dd3fc', fontSize: '1rem', cursor: 'pointer' }}
                aria-label="Mese precedente"
              >
                ◀
              </button>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                {(() => {
                  const [y, m] = calendarMonthIso.split('-').map(Number);
                  return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
                })()}
              </div>
              <button
                type="button"
                onClick={() => {
                  const [y, m] = calendarMonthIso.split('-').map(Number);
                  const d = new Date(y, m, 1);
                  const mo = String(d.getMonth() + 1).padStart(2, '0');
                  setCalendarMonthIso(`${d.getFullYear()}-${mo}`);
                }}
                style={{ background: 'none', border: 'none', color: '#7dd3fc', fontSize: '1rem', cursor: 'pointer' }}
                aria-label="Mese successivo"
              >
                ▶
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
              {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((wd, idx) => (
                <div key={`${wd}_${idx}`} style={{ textAlign: 'center', color: '#71717a', fontSize: '0.68rem', fontWeight: 700 }}>
                  {wd}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {calendarGridDays.map((iso, idx) => {
                if (!iso) return <div key={`empty_${idx}`} style={{ height: 36 }} />;
                const zone = calendarZoneByDate[iso]?.zone ?? null;
                const zoneStyle =
                  zone === 'blue'
                    ? { background: 'linear-gradient(180deg, #1d4ed8 0%, #0ea5e9 100%)', color: '#e0f2fe' }
                    : zone === 'green'
                      ? { background: 'linear-gradient(180deg, #15803d 0%, #22c55e 100%)', color: '#ecfdf5' }
                      : zone === 'orange'
                        ? { background: 'linear-gradient(180deg, #c2410c 0%, #f59e0b 100%)', color: '#fff7ed' }
                        : zone === 'red'
                          ? { background: 'linear-gradient(180deg, #b91c1c 0%, #ef4444 100%)', color: '#fee2e2' }
                          : { background: 'rgba(255,255,255,0.04)', color: '#cbd5e1' };
                const isSelected = iso === currentTrackerDate;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      navigateToDate(iso);
                      setShowDateCalendarModal(false);
                    }}
                    style={{
                      height: 36,
                      borderRadius: 10,
                      border: isSelected ? '2px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      ...zoneStyle,
                    }}
                    title={calendarZoneByDate[iso]?.score != null ? `Score ${calendarZoneByDate[iso].score}` : iso}
                  >
                    {iso.slice(-2)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: '0.64rem', color: '#94a3b8', flexWrap: 'wrap' }}>
              <span>🔵 ottimale</span>
              <span>🟢 buono</span>
              <span>🟠 warning</span>
              <span>🔴 critico</span>
            </div>
          </div>
        </div>
      )}
      {/* Pop-up Scelta Azione (Ottimizzato per schermi piccoli) */}
      {showChoiceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100020, padding: '15px' }} onClick={() => { setShowChoiceModal(false); setAddChoiceView('main'); }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '25px', padding: '20px', width: '100%', maxWidth: '350px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 10px 50px rgba(0,0,0,0.9)' }} onClick={e => e.stopPropagation()}>
            {addChoiceView === 'stimulant' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <button type="button" onClick={() => setAddChoiceView('main')} style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.9rem', cursor: 'pointer' }}>← Indietro</button>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', letterSpacing: '1px' }}>☕ Sostanza energizzante</h3>
                  <div style={{ width: '70px' }} />
                </div>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#aaa' }}>Tipo</p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {['caffè', 'tè', 'energy drink'].map((sub) => (
                    <button key={sub} type="button" onClick={() => setStimulantSubtype(sub)} style={{ flex: 1, padding: '10px', borderRadius: '12px', border: stimulantSubtype === sub ? '2px solid #f59e0b' : '1px solid #333', background: stimulantSubtype === sub ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)', color: stimulantSubtype === sub ? '#f59e0b' : '#fff', fontSize: '0.85rem', fontWeight: stimulantSubtype === sub ? 'bold' : 'normal', cursor: 'pointer' }}>
                      {sub === 'caffè' ? '☕ Caffè' : sub === 'tè' ? '🍵 Tè' : '🥤 Energy'}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#aaa' }}>Orario</p>
                <input type="range" min={0} max={24} step={0.25} value={stimulantTime} onChange={(e) => setStimulantTime(Number(e.target.value))} style={{ width: '100%', marginBottom: '8px' }} />
                <span style={{ fontSize: '0.9rem', color: '#00e5ff', marginBottom: '16px' }}>{Math.floor(stimulantTime)}:{String(Math.round((stimulantTime % 1) * 60)).padStart(2, '0')}</span>
                <button type="button" onClick={() => {
                  const id = Date.now().toString();
                  const node = { id, type: 'stimulant', subtype: stimulantSubtype, time: stimulantTime };
                  const next = [...manualNodes, node];
                  setManualNodes(next);
                  syncDatiFirebase(dailyLog, next);
                  setShowChoiceModal(false);
                  setAddChoiceView('main');
                }} style={{ padding: '14px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  Salva
                </button>
              </>
            ) : (
              <AddEventMenuGrid
                menuOrder={addEventMenuOrder}
                onOrderCommit={commitAddEventMenuOrder}
                onItemActivate={(id) => handleAddEventMenuItem(id, 'modal')}
                title="AGGIUNGI EVENTO"
                headingStyle={{ marginBottom: 0 }}
              />
            )}
          </div>
        </div>
      )}

      <OverlayHost
        showUnsavedMealWarning={showUnsavedMealWarning}
        setShowUnsavedMealWarning={setShowUnsavedMealWarning}
        finalizeMealBuilderCloseEmpty={finalizeMealBuilderCloseEmpty}
        showWeightModal={showWeightModal}
        setShowWeightModal={setShowWeightModal}
        inputWeight={inputWeight}
        setInputWeight={setInputWeight}
        inputFat={inputFat}
        setInputFat={setInputFat}
        drawerMuscleMass={drawerMuscleMass}
        setDrawerMuscleMass={setDrawerMuscleMass}
        drawerBodyWater={drawerBodyWater}
        setDrawerBodyWater={setDrawerBodyWater}
        drawerVisceralFat={drawerVisceralFat}
        setDrawerVisceralFat={setDrawerVisceralFat}
        handleSaveBodyMetrics={handleSaveBodyMetrics}
        planningWizardOverlayOpen={planningWizardOverlayOpen}
        setPlanningWizardOverlayOpen={setPlanningWizardOverlayOpen}
        activeLog={activeLog}
        userTargets={userTargets}
        kentuDailyCalorieStrategy={kentuDailyCalorieStrategy}
        planningWizardBurnedKcal={planningWizardBurnedKcal}
        remotePlanning={remotePlanning}
        planningWizardInitialMeals={planningWizardInitialMeals}
        planningWizardHydrateNonce={planningWizardHydrateNonce}
        weeklyPlan={weeklyPlan}
        planningDateKey={currentTrackerDate || getTodayString()}
        handlePlanningWizardConfirm={handlePlanningWizardConfirm}
        handleGeneratePlanGhostMealDraft={handleGeneratePlanGhostMealDraft}
        showUndoToast={showUndoToast}
        handleUndo={handleUndo}
        bodyMetricsSaveToast={bodyMetricsSaveToast}
      />

      {/* Pop-up Info Spie (Ottimizzato per schermi piccoli) */}
      {showSpieInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100020, padding: '15px' }} onClick={() => setShowSpieInfo(false)}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '25px', padding: '20px', width: '100%', maxWidth: '350px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 50px rgba(0,0,0,0.9)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 15px 0', color: '#00e5ff', fontSize: '1rem', letterSpacing: '2px', textAlign: 'center' }}>TELEMETRIA SISTEMA</h3>

            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#00e676', fontSize: '0.9rem' }}>🟢 Micro OK:</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.4' }}>Vitamine e minerali essenziali sono coperti dai pasti inseriti.</p>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#ff9800', fontSize: '0.9rem' }}>🟠 Livelli Serali:</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.4' }}>Stato del serbatoio energetico. Previene il rischio di picchi di cortisolo.</p>
            </div>

            <div>
              <strong style={{ color: '#00e5ff', fontSize: '0.9rem' }}>🔥 Deficit / Surplus:</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.4' }}>Il bilancio istantaneo rispetto al tuo target di calorie giornaliere.</p>
            </div>

            <button onClick={() => setShowSpieInfo(false)} style={{ width: '100%', marginTop: '20px', background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}>CHIUDI</button>
          </div>
        </div>
      )}

      {showSleepPrompt && (
        <div className="sleepPromptModal">
          <div className="sleepPromptCard">
            <h3>Dati sonno mancanti</h3>
            <p>Per calcolare correttamente l'energia della giornata inserisci i dati del sonno.</p>
            <div className="sleepPromptActions">
              <button
                type="button"
                onClick={() => {
                  setShowSleepPrompt(false);
                  setSleepModal({ editingId: null });
                }}
              >
                Inserisci sonno
              </button>
              <button
                type="button"
                onClick={() => {
                  const bed = 23;
                  const wake = 6;
                  const hours = computeSleepDurationHours(bed, wake);
                  const sleepEntry = {
                    type: 'sleep',
                    id: `sleep_avg_${Date.now()}`,
                    hours,
                    duration: hours,
                    sleepHours: hours,
                    deepMin: 60,
                    remMin: 60,
                    wakeTime: wake,
                    bedtime: bed,
                    sleepStart: bed,
                    sleepEnd: wake,
                  };
                  if (isSimulationMode) {
                    setSimulatedLog((prev) => [...(prev || []), sleepEntry]);
                  } else {
                    const next = [...(dailyLog || []), sleepEntry];
                    setDailyLog(next);
                    syncDatiFirebase(next, manualNodes || []);
                  }
                  dismissKentuSleepTrigger();
                  setShowSleepPrompt(false);
                }}
              >
                Usa valori medi
              </button>
              <button type="button" onClick={() => setShowSleepPrompt(false)}>
                Dopo
              </button>
            </div>
          </div>
        </div>
      )}

      {sleepModal != null && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100025,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSleepModal(null)}
        >
          <div
            className="modal-content"
            style={{
              background: '#1a1a20',
              color: '#fff',
              padding: '24px',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '380px',
              border: '1px solid #333',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0', color: '#4ba3e3', fontSize: '1.05rem' }}>
              {sleepModal.editingId ? 'Modifica sonno' : 'Registra sonno'}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
              Inserisci ora di addormentamento e di risveglio; la durata si calcola automaticamente (anche oltre mezzanotte).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 600 }}>
                  Ora in cui ti sei addormentato
                </label>
                <input
                  type="time"
                  value={sleepFormBedStr}
                  onChange={(e) => setSleepFormBedStr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: '#111',
                    border: '1px solid #444',
                    color: '#fff',
                    fontSize: '1rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 600 }}>
                  Ora del risveglio
                </label>
                <input
                  type="time"
                  value={sleepFormWakeStr}
                  onChange={(e) => setSleepFormWakeStr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: '#111',
                    border: '1px solid #444',
                    color: '#fff',
                    fontSize: '1rem',
                  }}
                />
              </div>
            </div>
            <div
              style={{
                marginBottom: '18px',
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(75, 163, 227, 0.12)',
                border: '1px solid rgba(75, 163, 227, 0.35)',
                fontSize: '0.9rem',
                color: '#e2e8f0',
              }}
            >
              Durata stimata:{' '}
              <strong style={{ color: '#4ba3e3' }}>
                {(() => {
                  const dur = computeSleepDurationHours(
                    parseTimeStrToDecimal(sleepFormBedStr),
                    parseTimeStrToDecimal(sleepFormWakeStr)
                  );
                  const hh = Math.floor(dur);
                  const mm = Math.round((dur % 1) * 60);
                  return `${hh}h ${String(mm).padStart(2, '0')}m`;
                })()}
              </strong>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setSleepModal(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  const bedDec = parseTimeStrToDecimal(sleepFormBedStr);
                  const wakeDec = parseTimeStrToDecimal(sleepFormWakeStr);
                  const hours = computeSleepDurationHours(bedDec, wakeDec);
                  if (!(hours > 0)) {
                    window.alert('Controlla gli orari di addormentamento e risveglio.');
                    return;
                  }
                  const id = sleepModal.editingId || `sleep_${Date.now()}`;
                  const logLook = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
                  const existing = sleepModal.editingId
                    ? logLook.find((e) => e?.id === sleepModal.editingId && e?.type === 'sleep')
                    : null;
                  if (sleepModal.editingId && !existing) {
                    console.warn('[SalaComandi] sleep entry not found while saving edit', { editingId: sleepModal.editingId });
                  }
                  const entry = {
                    type: 'sleep',
                    id,
                    wakeTime: wakeDec,
                    bedtime: bedDec,
                    sleepStart: bedDec,
                    sleepEnd: wakeDec,
                    hours,
                    duration: hours,
                    sleepHours: hours,
                    deepMin: existing?.deepMin ?? 60,
                    remMin: existing?.remMin ?? 60,
                    ...(existing?.hr != null ? { hr: existing.hr } : {}),
                    ...(existing?.quality != null ? { quality: existing.quality } : {}),
                  };
                  if (isSimulationMode) {
                    setSimulatedLog((prev) => {
                      const base = prev || [];
                      const rest = sleepModal.editingId ? base.filter((e) => e.id !== sleepModal.editingId) : base;
                      return [...rest, entry];
                    });
                  } else {
                    const base = dailyLog || [];
                    const rest = sleepModal.editingId ? base.filter((e) => e.id !== sleepModal.editingId) : base;
                    const next = [...rest, entry];
                    setDailyLog(next);
                    syncDatiFirebase(next, manualNodes || []);
                  }
                  dismissKentuSleepTrigger();
                  setSleepModal(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#4ba3e3',
                  color: '#000',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuickNode && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100020, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditingQuickNode(null)}>
          <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '350px', border: '1px solid #333' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>Modifica {editingQuickNode.name || (editingQuickNode.type === 'nap' ? 'Pisolino' : editingQuickNode.type === 'meditation' ? 'Meditazione' : 'Attività')}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ width: '45%' }}>
                <label style={{ display: 'block', color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Ora Inizio</label>
                <input
                  type="time"
                  defaultValue={decimalToTimeStr(editingQuickNode.time ?? editingQuickNode.startTime ?? 14)}
                  id="quick-start-time"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#333', color: '#fff', border: 'none' }}
                />
              </div>
              <div style={{ width: '45%' }}>
                <label style={{ display: 'block', color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Ora Fine</label>
                <input
                  type="time"
                  defaultValue={decimalToTimeStr((editingQuickNode.time ?? editingQuickNode.startTime ?? 14) + (editingQuickNode.duration ?? 0.25))}
                  id="quick-end-time"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#333', color: '#fff', border: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  if (window.confirm('Vuoi eliminare questa attività?')) {
                    const next = manualNodes.filter(n => n.id !== editingQuickNode.id);
                    setManualNodes(next);
                    syncDatiFirebase(dailyLog, next);
                    setEditingQuickNode(null);
                  }
                }}
                style={{ flex: 1, padding: '12px', background: '#ff3b30', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
              >
                Elimina
              </button>
              <button
                onClick={() => setEditingQuickNode(null)}
                style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  const newStart = document.getElementById('quick-start-time')?.value;
                  const newEnd = document.getElementById('quick-end-time')?.value;
                  if (newStart != null && newEnd != null && newStart !== '' && newEnd !== '') {
                    const startDec = parseTimeStrToDecimal(newStart);
                    const endDec = parseTimeStrToDecimal(newEnd);
                    let duration = endDec - startDec;
                    if (duration <= 0) duration += 24;
                    duration = Math.max(0.08, Math.min(24, duration));
                    const next = manualNodes.map(n => n.id === editingQuickNode.id ? { ...n, time: startDec, startTime: startDec, endTime: endDec, duration } : n);
                    setManualNodes(next);
                    syncDatiFirebase(dailyLog, next);
                  }
                  setEditingQuickNode(null);
                }}
                style={{ flex: 1, padding: '12px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {timelineInsertUI != null && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100019,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            paddingLeft: 12,
            paddingRight: 12,
          }}
          onClick={() => setTimelineInsertUI(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Aggiungi sulla timeline"
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 400,
              marginBottom: 8,
              borderRadius: 20,
              background: 'linear-gradient(180deg, #1a1f2e 0%, #12151c 100%)',
              border: '1px solid rgba(0,229,255,0.25)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
              padding: '18px 16px 20px',
              color: '#e8f4ff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#7dd3fc', letterSpacing: '0.12em', fontWeight: 700 }}>
                  INSERIMENTO TIMELINE
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  🕐 {decimalToTimeStr(timelineInsertUI.hour)}
                </div>
              </div>
              <button
                type="button"
                aria-label="Chiudi"
                onClick={() => setTimelineInsertUI(null)}
                style={{
                  width: 36,
                  height: 36,
                  border: 'none',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                  color: '#cbd5e1',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            {timelineInsertUI.view === 'main' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    const hour = timelineInsertUI.hour;
                    setTimelineInsertUI(null);
                    const predicted = predictMealType(hour);
                    setAddedFoods([]);
                    setEditingMealId(null);
                    setMealPlannerGhostNote('');
                    setMealType(predicted);
                    setDrawerMealTime(hour);
                    setDrawerMealTimeStr(decimalToTimeStr(hour));
                    setActiveAction('pasto');
                    setIsDrawerOpen(true);
                    setMealBuilderSmartLaunchKey((k) => k + 1);
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: '1px solid rgba(0,229,255,0.35)',
                    background: 'rgba(0,229,255,0.12)',
                    color: '#e0f2fe',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🍽️ Aggiungi pasto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hour = timelineInsertUI.hour;
                    setTimelineInsertUI(null);
                    setEditingWorkoutId(null);
                    setWorkoutEndTime(Math.min(24, hour + 0.5));
                    setWorkoutDurationMin(45);
                    setWorkoutStrengthDetail('');
                    setActiveAction('allenamento');
                    setIsDrawerOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,109,0,0.4)',
                    background: 'rgba(255,109,0,0.12)',
                    color: '#ffedd5',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  ⚡ Aggiungi attività / allenamento
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineInsertUI((u) => (u ? { ...u, view: 'events' } : u))}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#cbd5e1',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  📌 Altro evento (acqua, riposo…)
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setTimelineInsertUI((u) => (u ? { ...u, view: 'main' } : u))}
                  style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: 2,
                    padding: '4px 0',
                  }}
                >
                  ‹ Indietro
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hour = timelineInsertUI.hour;
                    setTimelineInsertUI(null);
                    setDrawerWaterTime(hour);
                    setActiveAction('acqua');
                    setIsDrawerOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(0,229,255,0.3)',
                    background: 'rgba(0,229,255,0.08)',
                    color: '#bae6fd',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  💧 Acqua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hour = timelineInsertUI.hour;
                    setTimelineInsertUI(null);
                    setDrawerFastChargeStart(hour);
                    setDrawerFastChargeEnd(Math.min(24, hour + 0.5));
                    setActiveAction('fast_charge_nap');
                    setIsDrawerOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(129,140,248,0.35)',
                    background: 'rgba(99,102,241,0.1)',
                    color: '#c7d2fe',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  😴 Pisolino
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hour = timelineInsertUI.hour;
                    setTimelineInsertUI(null);
                    setDrawerFastChargeStart(hour);
                    setDrawerFastChargeEnd(Math.min(24, hour + 0.5));
                    setActiveAction('fast_charge_meditation');
                    setIsDrawerOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(34,197,94,0.35)',
                    background: 'rgba(22,163,74,0.1)',
                    color: '#bbf7d0',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🧘 Meditazione
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hour = timelineInsertUI.hour;
                    setTimelineInsertUI(null);
                    setDrawerFastChargeTime(hour);
                    setActiveAction('fast_charge_supplements');
                    setIsDrawerOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(168,85,247,0.35)',
                    background: 'rgba(126,34,206,0.12)',
                    color: '#e9d5ff',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  💊 Integrazione
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedNodeReport && (
        <div className="modal-overlay" onClick={() => setSelectedNodeReport(null)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 100020, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#1e1e1e', color: '#fff', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 20px 0', borderBottom: '1px solid #333', paddingBottom: '10px', color: '#00e5ff' }}>
              {selectedNodeReport.type === 'meal' || selectedNodeReport.type === 'ghost_meal' ? '🍽️ Dettaglio Pasto' : '💪 Dettaglio Attività'}
            </h2>
            {(() => {
              const mealSlotKey = String(selectedNodeReport.mealId || selectedNodeReport.id);
              const nodeTime =
                selectedNodeReport.type === 'meal' || selectedNodeReport.type === 'ghost_meal'
                  ? (typeof selectedNodeReport.time === 'number' && !Number.isNaN(selectedNodeReport.time)
                      ? selectedNodeReport.time
                      : (() => {
                          const list = getFoodItemsForMealSlot(activeLog || [], mealSlotKey);
                          const t = list[0] != null ? getMealTimeFromLogItem(list[0]) : null;
                          return t != null ? t : 12;
                        })())
                  : (selectedNodeReport.time ?? 12);
              const currentHour = displayTime ?? currentTime;
              const isFuture = nodeTime > currentHour;
              return (
                <div style={{ marginBottom: '16px' }}>
                  {isFuture ? (
                    <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff', border: '1px solid #00e5ff' }}>🔮 PIANIFICAZIONE (Futuro)</span>
                  ) : (
                    <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', background: '#2c2c2c', color: '#9e9e9e', border: '1px solid #555' }}>⏳ STORICO (Avvenuto)</span>
                  )}
                </div>
              );
            })()}
            {selectedNodeReport.isGhost === true || selectedNodeReport.type === 'ghost_meal' || selectedNodeReport.type === 'ghost_workout' ? (
              <div style={{ marginBottom: '24px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(0, 229, 255, 0.35)',
                    background: 'rgba(0, 229, 255, 0.08)',
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: '1.35rem' }} aria-hidden>🎯</span>
                  <span style={{ color: '#00e5ff', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em' }}>Pianificato da Kentu</span>
                </div>
                {(selectedNodeReport.name || selectedNodeReport.title) ? (
                  <p style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: 700, color: '#e8faff' }}>
                    {selectedNodeReport.name || selectedNodeReport.title}
                  </p>
                ) : null}
                <div
                  style={{
                    fontSize: '0.95rem',
                    lineHeight: 1.65,
                    color: 'rgba(230, 245, 255, 0.92)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {String(selectedNodeReport.microDesc || '').trim() || (
                    <span style={{ color: '#888', fontStyle: 'italic' }}>Nessuna nota biochimica per questo slot.</span>
                  )}
                </div>
                {selectedNodeReport.isGhost === true || selectedNodeReport.type === 'ghost_meal' ? (
                  (() => {
                    if (selectedNodeReport.type === 'ghost_workout') return null;
                    const rows = ghostMealModalFoodRows(selectedNodeReport);
                    const toN = (v) => {
                      const n = Number(v);
                      return Number.isFinite(n) ? n : 0;
                    };
                    const totals = rows.reduce(
                      (acc, f) => ({
                        kcal: acc.kcal + toN(f.kcal),
                        prot: acc.prot + toN(f.prot),
                        carb: acc.carb + toN(f.carb),
                        fat: acc.fat + toN(f.fat),
                      }),
                      { kcal: 0, prot: 0, carb: 0, fat: 0 }
                    );
                    return (
                      <div style={{ marginTop: 16, marginBottom: 4 }}>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            color: '#7dd3fc',
                            marginBottom: 8,
                            letterSpacing: '0.06em',
                          }}
                        >
                          Alimenti
                        </div>
                        {rows.length === 0 ? (
                          <span
                            style={{
                              color: 'rgba(255,255,255,0.38)',
                              fontStyle: 'italic',
                              fontSize: '0.9rem',
                            }}
                          >
                            Empty meal
                          </span>
                        ) : (
                          <>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '10px 16px',
                                padding: '10px 12px',
                                marginBottom: 12,
                                background: 'rgba(0, 229, 255, 0.08)',
                                borderRadius: 10,
                                border: '1px solid rgba(0, 229, 255, 0.22)',
                                fontSize: '0.78rem',
                                color: '#bae6fd',
                              }}
                            >
                              <span>
                                <strong style={{ color: '#e0f2fe' }}>Tot.</strong>{' '}
                                {Math.round(totals.kcal)} kcal
                              </span>
                              <span>P {Math.round(totals.prot * 10) / 10} g</span>
                              <span>C {Math.round(totals.carb * 10) / 10} g</span>
                              <span>F {Math.round(totals.fat * 10) / 10} g</span>
                            </div>
                            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                              {rows.map((f, i) => {
                                const name = String(f.name || '').trim() || 'Alimento';
                                const qty = Math.round(toN(f.qty));
                                const hasQty = qty > 0;
                                return (
                                  <div
                                    key={`ghost_meal_row_${i}_${name.slice(0, 24)}`}
                                    style={{
                                      padding: '10px 0',
                                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                                      fontSize: '0.85rem',
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, color: '#e8f4ff' }}>{name}</div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '10px 14px',
                                        marginTop: 4,
                                        color: '#94a3b8',
                                        fontSize: '0.78rem',
                                      }}
                                    >
                                      <span>{hasQty ? `${qty} g` : '—'}</span>
                                      <span>{Math.round(toN(f.kcal)) || '—'} kcal</span>
                                      <span>P {toN(f.prot) ? Math.round(toN(f.prot) * 10) / 10 : '—'} g</span>
                                      <span>C {toN(f.carb) ? Math.round(toN(f.carb) * 10) / 10 : '—'} g</span>
                                      <span>F {toN(f.fat) ? Math.round(toN(f.fat) * 10) / 10 : '—'} g</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : null}
              </div>
            ) : selectedNodeReport.type === 'meal' ? (
              <div>
                {(() => {
                  const slotKey = String(selectedNodeReport.mealId || selectedNodeReport.id);
                  const items =
                    Array.isArray(selectedNodeReport.items) && selectedNodeReport.items.length > 0
                      ? selectedNodeReport.items
                      : Array.isArray(selectedNodeReport.foods) && selectedNodeReport.foods.length > 0
                        ? selectedNodeReport.foods
                        : getFoodItemsForMealSlot(activeLog || [], slotKey);
                  if (items.length === 0) return <p>Nessun alimento trovato.</p>;

                  const totals = items.reduce((acc, item) => {
                    acc.kcal += parseFloat(item.kcal || item.cal || 0);
                    acc.prot += parseFloat(item.prot || 0);
                    acc.carb += parseFloat(item.carb || 0);
                    acc.fat += parseFloat(item.fatTotal || item.fat || 0);
                    return acc;
                  }, { kcal: 0, prot: 0, carb: 0, fat: 0 });

                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', background: '#2c2c2c', padding: '15px', borderRadius: '8px', fontWeight: 'bold' }}>
                        <span style={{ color: '#ff9800' }}>🔥 {Math.round(totals.kcal)} kcal</span>
                        <span style={{ color: '#f44336' }}>🥩 {Math.round(totals.prot)}g</span>
                        <span style={{ color: '#4caf50' }}>🍞 {Math.round(totals.carb)}g</span>
                        <span style={{ color: '#ffeb3b' }}>🥑 {Math.round(totals.fat)}g</span>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 25px 0', maxHeight: '280px', overflowY: 'auto' }}>
                        {items.map(item => {
                          const recipeExpandableModal = (item.type === 'recipe' || item.isRecipe === true)
                            && Array.isArray(item.ingredients)
                            && item.ingredients.length > 0;
                          const rk = item.id != null ? String(item.id) : '';
                          const recipeOpenModal = rk && !!expandedRecipes[rk];
                          return (
                            <li key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', minWidth: 0 }}>
                                  {item.name || item.desc}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedFoodForInfo(item);
                                    }}
                                    title="Etichetta nutrizionale"
                                    aria-label="Etichetta nutrizionale"
                                    style={{
                                      opacity: 0.4,
                                      background: 'none',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      fontSize: '0.65rem',
                                      padding: '0 4px',
                                      lineHeight: 1,
                                      fontWeight: 600,
                                    }}
                                  >
                                    ℹ
                                  </button>
                                  {recipeExpandableModal && (
                                    <button
                                      type="button"
                                      onClick={() => toggleRecipe(item.id)}
                                      aria-expanded={recipeOpenModal}
                                      aria-label={recipeOpenModal ? 'Nascondi ingredienti' : 'Mostra ingredienti'}
                                      style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px' }}
                                    >
                                      {recipeOpenModal ? '▲' : '▼'}
                                    </button>
                                  )}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <span style={{ color: '#aaa' }}>{item.qta || item.weight}g</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInspectedFood(item);
                                      setEditFoodData({ ...item });
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: '#00e5ff', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' }}
                                    title="Ispeziona/Modifica Nutrienti"
                                  >
                                    🔍
                                  </button>
                                </span>
                              </div>
                              {recipeExpandableModal && recipeOpenModal && (
                                <div
                                  style={{
                                    marginTop: '8px',
                                    marginLeft: '4px',
                                    paddingLeft: '12px',
                                    paddingTop: '6px',
                                    paddingBottom: '6px',
                                    borderLeft: '2px solid #444',
                                    background: 'rgba(0,0,0,0.25)',
                                    borderRadius: '0 8px 8px 0'
                                  }}
                                >
                                  {item.ingredients.map((ing, ingIdx) => {
                                    const w = Number(ing.weight);
                                    const wg = Number.isFinite(w) ? `${Math.round(w)}g` : '—';
                                    const kc = Math.round(Number(ing.kcal) || 0);
                                    const p = Number(ing.prot);
                                    const c = Number(ing.carb);
                                    const g = Number(ing.fat);
                                    const nm = ing.name != null ? String(ing.name) : 'Ingrediente';
                                    return (
                                      <div
                                        key={ing.id != null ? String(ing.id) : `ding_${ingIdx}`}
                                        style={{ fontSize: '0.85rem', color: '#aaa', lineHeight: 1.45, marginBottom: ingIdx < item.ingredients.length - 1 ? '6px' : 0 }}
                                      >
                                        {nm} · {wg} · {kc} kcal · P {(Number.isFinite(p) ? p : 0).toFixed(1)}g · C {(Number.isFinite(c) ? c : 0).toFixed(1)}g · G {(Number.isFinite(g) ? g : 0).toFixed(1)}g
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div style={{ marginBottom: '25px', fontSize: '1.1rem', lineHeight: '1.8' }}>
                <p style={{ margin: '5px 0' }}><strong>Attività:</strong> {selectedNodeReport.name || selectedNodeReport.desc || 'Allenamento'}</p>
                <p style={{ margin: '5px 0' }}><strong>Impatto:</strong> 🔥 {Math.round(selectedNodeReport.kcal || selectedNodeReport.cal || 0)} kcal bruciate</p>
                {selectedNodeReport.duration != null && <p style={{ margin: '5px 0' }}><strong>Durata:</strong> ⏱️ {Math.round(selectedNodeReport.duration * 60)} minuti</p>}
                {(selectedNodeReport.muscles || selectedNodeReport.workoutMuscles) && (selectedNodeReport.muscles || selectedNodeReport.workoutMuscles).length > 0 && (
                  <p style={{ margin: '5px 0', textTransform: 'capitalize' }}>
                    <strong>Muscoli target:</strong> 🦾 {(selectedNodeReport.muscles || selectedNodeReport.workoutMuscles).join(', ')}
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '15px' }}>
              <button type="button" onClick={() => setSelectedNodeReport(null)} style={{ flex: 1, padding: '12px', background: '#444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                Chiudi
              </button>
              <button type="button" onClick={() => {
                const node = selectedNodeReport;
                setSelectedNodeReport(null);
                if (node.type === 'ghost_meal') {
                  openGhostMealEditorFromTimelineNode(node);
                  return;
                }
                if (node.type === 'meal') {
                  loadMealToConstructor(String(node.mealId || node.id));
                  return;
                }
                if (node.type === 'ghost_workout') {
                  const t = typeof node.time === 'number' && !Number.isNaN(node.time) ? node.time : 18;
                  setEditingWorkoutId(node.id);
                  const ghostSt = node.subType || 'pesi';
                  setWorkoutType(resolveWorkoutActivityTypeId(ghostSt) ?? ghostSt);
                  const durH = Math.max(0.25, Number(node.duration) || 1);
                  setWorkoutEndTime(Math.min(24, t + durH));
                  setWorkoutDurationMin(Math.max(15, Math.min(600, Math.round(durH * 60))));
                  setWorkoutKcal(node.kcal || node.cal || 300);
                  setWorkoutStrengthDetail(String(node.workoutDetailNote || '').trim());
                  setWorkoutMuscles(
                    normalizeMuscleGroupArray(
                      Array.isArray(node.muscles)
                        ? node.muscles
                        : Array.isArray(node.workoutMuscles)
                          ? node.workoutMuscles
                          : []
                    )
                  );
                  setActiveAction('allenamento');
                  setIsDrawerOpen(true);
                  return;
                }
                setEditingWorkoutId(node.id);
                const editSt = node.subType || (node.type === 'work' ? 'lavoro' : 'pesi');
                setWorkoutType(resolveWorkoutActivityTypeId(editSt) ?? editSt);
                const startT = node.time ?? 12;
                const durH = Math.max(0.25, Number(node.duration) || 1);
                setWorkoutEndTime(Math.min(24, startT + durH));
                setWorkoutDurationMin(Math.max(15, Math.min(600, Math.round(durH * 60))));
                setWorkoutKcal(node.kcal || node.cal || 300);
                setWorkoutStrengthDetail(String(node.workoutDetailNote || '').trim());
                setWorkoutMuscles(
                  normalizeMuscleGroupArray(
                    Array.isArray(node.muscles)
                      ? node.muscles
                      : Array.isArray(node.workoutMuscles)
                        ? node.workoutMuscles
                        : []
                  )
                );
                setActiveAction('allenamento');
                setIsDrawerOpen(true);
              }} style={{ flex: 1, padding: '12px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                ✏️ Modifica
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE ISPEZIONE E MODIFICA ALIMENTO */}
      {inspectedFood && editFoodData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100020, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '5px', textAlign: 'center' }}>
              {editFoodData.name || editFoodData.nome || editFoodData.desc || 'Alimento'}
            </h3>
            <div style={{ textAlign: 'center', color: '#888', fontSize: '0.8rem', marginBottom: '20px' }}>
              Modifica i valori nutrizionali
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Quantità (g/ml)</label>
                <input type="number" value={editFoodData.qty ?? editFoodData.quantita ?? editFoodData.weight ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, qty: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Calorie (kcal)</label>
                <input type="number" value={editFoodData.kcal ?? editFoodData.calorie ?? editFoodData.cal ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, kcal: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#b388ff', fontSize: '0.8rem', marginBottom: '5px' }}>Proteine (g)</label>
                <input type="number" value={editFoodData.prot ?? editFoodData.proteine ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, prot: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #b388ff55', color: '#fff', padding: '10px', borderRadius: '8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#00e676', fontSize: '0.8rem', marginBottom: '5px' }}>Carboidrati (g)</label>
                <input type="number" value={editFoodData.carb ?? editFoodData.carboidrati ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, carb: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #00e67655', color: '#fff', padding: '10px', borderRadius: '8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#ffea00', fontSize: '0.8rem', marginBottom: '5px' }}>Grassi (g)</label>
                <input type="number" value={editFoodData.fat ?? editFoodData.grassi ?? editFoodData.fatTotal ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, fat: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #ffea0055', color: '#fff', padding: '10px', borderRadius: '8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#f97316', fontSize: '0.8rem', marginBottom: '5px' }}>Fibre (g)</label>
                <input type="number" value={editFoodData.fibre ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, fibre: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #f9731655', color: '#fff', padding: '10px', borderRadius: '8px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  const qty = editFoodData.qty ?? editFoodData.quantita ?? editFoodData.weight ?? 0;
                  const kcal = editFoodData.kcal ?? editFoodData.calorie ?? editFoodData.cal ?? 0;
                  const prot = editFoodData.prot ?? editFoodData.proteine ?? 0;
                  const carb = editFoodData.carb ?? editFoodData.carboidrati ?? 0;
                  const fat = editFoodData.fat ?? editFoodData.grassi ?? editFoodData.fatTotal ?? 0;
                  const updated = {
                    ...inspectedFood,
                    weight: qty,
                    qta: qty,
                    kcal,
                    cal: kcal,
                    prot,
                    carb,
                    fat,
                    fatTotal: fat,
                    fibre: editFoodData.fibre,
                    name: editFoodData.name ?? editFoodData.nome ?? editFoodData.desc,
                    desc: editFoodData.desc ?? editFoodData.name ?? editFoodData.nome
                  };
                  if (isSimulationMode) {
                    setSimulatedLog(prev => (prev || []).map(item => item.id === inspectedFood.id ? updated : item));
                    setInspectedFood(null);
                    setEditFoodData(null);
                    return;
                  }
                  const nextLog = dailyLog.map(item => item.id === inspectedFood.id ? updated : item);
                  setDailyLog(nextLog);
                  syncDatiFirebase(nextLog, manualNodes);
                  setInspectedFood(null);
                  setEditFoodData(null);
                }}
                style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
              >
                💾 Salva Modifiche
              </button>
              <button
                type="button"
                onClick={handleVerifyFoodAI}
                disabled={isAIVerifying}
                style={{ background: '#2a2a2a', color: isAIVerifying ? '#888' : '#00e5ff', border: `1px solid ${isAIVerifying ? '#444' : '#00e5ff'}`, padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1rem', cursor: isAIVerifying ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', transition: 'all 0.3s' }}
              >
                {isAIVerifying ? (
                  '⏳ Analisi in corso...'
                ) : (
                  <>
                    <img src="/nuova-icona.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
                    Verifica Correttezza (AI)
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setInspectedFood(null); setEditFoodData(null); }}
                style={{ background: 'transparent', color: '#888', border: 'none', padding: '12px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', marginTop: '5px' }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPORT GIORNALIERO A 5 STELLE */}
      {showReportModal && dailyReport?.ready && dailyReportDisplay && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100020, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={() => setShowReportModal(false)}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '25px', maxWidth: '380px', width: '100%', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '8px', borderBottom: '1px solid #222', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#ffc107' }}>★</span> Report Giornaliero
            </h3>
            <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '20px' }}>
              {currentDateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {[
              { key: 'muscle', label: 'Crescita Muscolare', emoji: '💪' },
              { key: 'fat', label: 'Perdita di Grasso', emoji: '🔥' },
              { key: 'neuro', label: 'Recupero Neurologico', emoji: '🧠' },
              { key: 'fast', label: 'Pulizia Cellulare (Digiuno)', emoji: '🕐' }
            ].map(({ key, label, emoji }) => {
              const item = dailyReportDisplay[key];
              const score = typeof item === 'object' && item != null && 'score' in item ? item.score : (Number(item) || 0);
              const reason = typeof item === 'object' && item != null && 'reason' in item ? item.reason : '';
              return (
                <div key={key} style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span>{emoji} {label}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setTrendModalMetric(key); }}
                      style={{ background: 'transparent', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', padding: '4px 8px', marginLeft: '10px' }}
                      title="Vedi Trend Storico"
                    >
                      📈
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} style={{ color: n <= score ? '#ffc107' : '#333', fontSize: '1.1rem' }}>★</span>
                    ))}
                  </div>
                  {reason ? (
                    <div style={{ fontSize: '0.85rem', color: '#888', fontStyle: 'italic', marginTop: '4px', lineHeight: '1.2' }}>
                      {reason}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button onClick={() => setShowReportModal(false)} style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '12px', width: '100%', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* Trend storico valutazioni report (cumulativo) */}
      {trendModalMetric && (
        <div
          role="presentation"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100001, backdropFilter: 'blur(4px)' }}
          onClick={() => setTrendModalMetric(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{ background: '#1a1a1c', padding: '20px', borderRadius: '16px', border: '1px solid #333', width: '95%', maxWidth: '600px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ color: '#fff', margin: 0 }}>Trend Storico</h3>
                <div style={{ fontSize: '0.85rem', color: '#00e5ff', textTransform: 'uppercase', marginTop: '4px' }}>
                  {trendModalMetric === 'muscle' ? 'Crescita Muscolare' : trendModalMetric === 'fat' ? 'Dimagrimento' : trendModalMetric === 'neuro' ? 'Recupero Neurologico' : 'Finestra di Digiuno'}
                </div>
              </div>

              <select
                value={trendDays}
                onChange={(e) => setTrendDays(Number(e.target.value))}
                style={{ background: '#2a2a2c', color: '#fff', border: '1px solid #444', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', outline: 'none', fontSize: '0.9rem' }}
              >
                <option value={7}>Ultima Settimana</option>
                <option value={30}>Ultimo Mese</option>
                <option value={90}>Ultimi 3 Mesi</option>
                <option value={180}>Ultimi 6 Mesi</option>
                <option value={365}>Ultimo Anno</option>
              </select>
            </div>

            <div style={{ width: '100%', height: 250, marginBottom: '20px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 52 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis
                    dataKey="date"
                    tick={<CustomDateTick />}
                    tickLine={false}
                    axisLine={{ stroke: '#333' }}
                    minTickGap={40}
                    height={60}
                  />
                  <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 10 }} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: '8px' }}
                    labelStyle={{ color: '#aaa' }}
                    formatter={(value, name) => [value, name === 'score' ? 'Score cumulativo' : name]}
                    labelFormatter={(label) => `Data ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#00e5ff"
                    strokeWidth={trendDays > 90 ? 2 : 3}
                    dot={trendDays <= 30 ? { r: 4, fill: '#00e5ff', stroke: '#1a1a1c', strokeWidth: 2 } : false}
                    activeDot={{ r: 6, fill: '#fff' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <button
              type="button"
              onClick={() => setTrendModalMetric(null)}
              style={{ width: '100%', padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {showBatteryModal && (
        <BodyBatteryModal onClose={() => setShowBatteryModal(false)} batteryData={bodyBattery} />
      )}

      {showSncPopup && (
        <div
          role="presentation"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}
          onClick={() => setShowSncPopup(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="snc-popup-title"
            style={{
              background: '#1a1a1c',
              padding: '24px',
              borderRadius: '16px',
              border: sncStressLevel >= 85 ? '1px solid #f44336' : '1px solid #ff9800',
              width: '90%',
              maxWidth: '350px',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{sncStressLevel >= 85 ? '⚠️' : '⚡'}</div>
            <h3 id="snc-popup-title" style={{ color: '#fff', marginTop: 0 }}>
              {sncStressLevel >= 85 ? 'Allarme Overtraining' : 'Affaticamento SNC'}
            </h3>
            <p style={{ color: '#b0b0b0', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>
              Sistema Nervoso Centrale saturo al <strong>{Math.round(sncStressLevel)}%</strong>.<br /><br />
              {sncStressLevel >= 85
                ? "Si consigliano 3-5 giorni di scarico attivo (niente allenamenti pesanti) per resettare l'energia massima ed evitare lo stallo metabolico."
                : 'Il carico allostatico sta aumentando. Presta attenzione al recupero nei prossimi giorni.'}
            </p>
            <button
              type="button"
              onClick={() => setShowSncPopup(false)}
              style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
            >
              Ho capito
            </button>
          </div>
        </div>
      )}

      {/* POP-UP READY TO TRAIN (digestione) */}
      {showTrainingPopup && (() => {
        const pastoRecente = (activeLog || []).find(item => (item?.type === 'food' || item?.type === 'recipe') && displayTime - item?.mealTime >= 0 && displayTime - item?.mealTime <= 1);
        const mealTime = pastoRecente?.mealTime ?? 0;
        const waitMinutesTotal = 90;
        const elapsedMinutes = (displayTime - mealTime) * 60;
        const residualMinutes = Math.max(0, Math.ceil(waitMinutesTotal - elapsedMinutes));
        const startTime = displayTime + residualMinutes / 60;
        const startHours = Math.floor(startTime) % 24;
        const startMins = Math.round((startTime % 1) * 60);
        const startStr = `${startHours}:${String(startMins).padStart(2, '0')}`;
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100020, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={() => setShowTrainingPopup(false)}>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '25px', maxWidth: '400px', width: '100%', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #222', paddingBottom: '10px' }}>
                ⏱️ Ready to Train
              </h3>
              <div style={{ marginBottom: '14px', padding: '12px', background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b', borderRadius: '10px', fontSize: '0.9rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Tempo di attesa residuo</div>
                <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '1.1rem' }}>{residualMinutes} minuti</div>
              </div>
              <div style={{ marginBottom: '14px', padding: '12px', background: 'rgba(0,229,118,0.1)', border: '1px solid #00e676', borderRadius: '10px', fontSize: '0.9rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#00e676', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Orario stimato di inizio</div>
                <div style={{ color: '#39ff14', fontWeight: 'bold', fontSize: '1.1rem' }}>Puoi iniziare alle {startStr}</div>
              </div>
              <p style={{ color: '#b0b0b0', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '18px', fontStyle: 'italic' }}>
                In questa fase il sangue è concentrato nell&apos;area splancnica per la digestione. Allenarsi ora ridurrebbe la performance e causerebbe stress gastrointestinale.
              </p>
              <button type="button" onClick={() => setShowTrainingPopup(false)} style={{ background: '#333', color: '#fff', border: 'none', padding: '12px', width: '100%', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                Chiudi
              </button>
            </div>
          </div>
        );
      })()}

      {showAlcoholPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, backdropFilter: 'blur(4px)' }} onClick={() => setShowAlcoholPopup(false)}>
          <div style={{ background: '#1a1a1c', padding: '24px', borderRadius: '20px', width: '90%', maxWidth: '380px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.8rem' }}>🍷</span>
              <h3 style={{ margin: 0, color: '#fff' }}>Aggiungi Drink</h3>
            </div>

            {/* Timeline Interattiva Alcol */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>00:00</span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase', marginBottom: '2px' }}>Orario</div>
                  <div style={{ color: '#00e5ff', fontWeight: 'bold', fontSize: '1.2rem', background: '#111', padding: '4px 12px', borderRadius: '8px', border: '1px solid #333' }}>
                    {alcoholForm.timeStr}
                  </div>
                </div>
                <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>23:59</span>
              </div>

              <div style={{ position: 'relative', height: '44px', background: '#111', borderRadius: '22px', border: '1px solid #222', display: 'flex', alignItems: 'center' }}>
                {/* Background Line */}
                <div style={{ position: 'absolute', left: '20px', right: '20px', height: '4px', background: '#333', borderRadius: '2px' }} />

                {/* Nodi Esistenti (Sfondo) - Pallini grigi per dare contesto */}
                {manualNodes.map(n => {
                  if (typeof n.time !== 'number') return null;
                  const percent = getTimePositionPercent(n.time);
                  return (
                    <div key={n.id} style={{ position: 'absolute', left: `calc(20px + ${percent}% - ${percent * 0.4}px)`, width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', transform: 'translate(-50%, -50%)', top: '50%', pointerEvents: 'none' }} />
                  );
                })}

                {(() => {
                  const [h, m] = alcoholForm.timeStr.split(':').map(Number);
                  const currentFloat = (h || 0) + ((m || 0) / 60);
                  const currentPercent = getTimePositionPercent(currentFloat);
                  const icon = alcoholForm.subtype === 'birra' ? '🍺' : alcoholForm.subtype === 'vino' ? '🍷' : '🥃';

                  return (
                    <>
                      {/* Range Input: Invisibile ma permette il trascinamento tattile perfetto */}
                      <input
                        type="range"
                        min="0"
                        max="23.99"
                        step="0.25"
                        value={currentFloat}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const newH = Math.floor(val);
                          const newM = Math.round((val - newH) * 60);
                          setAlcoholForm({ ...alcoholForm, timeStr: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}` });
                        }}
                        style={{ position: 'absolute', left: '10px', right: '10px', width: 'calc(100% - 20px)', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10, margin: 0 }}
                      />

                      {/* Maniglia Personalizzata: Il nodo visibile che si muove */}
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: `calc(20px + ${currentPercent}% - ${currentPercent * 0.4}px)`,
                        transform: 'translate(-50%, -50%)',
                        width: '32px', height: '32px',
                        borderRadius: '50%',
                        background: '#f44336',
                        border: '2px solid #fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 12px rgba(244,67,54,0.6)',
                        pointerEvents: 'none', zIndex: 5,
                        transition: 'left 0.1s ease-out'
                      }}>
                        <span style={{ fontSize: '14px' }}>{icon}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {[
                { id: 'birra', label: 'Birra 🍺', ml: 330, abv: 5 },
                { id: 'vino', label: 'Vino 🍷', ml: 150, abv: 12 },
                { id: 'superalcolico', label: 'Shot/Cocktail 🥃', ml: 40, abv: 40 }
              ].map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAlcoholForm({ ...alcoholForm, subtype: preset.id, ml: preset.ml, abv: preset.abv })}
                  style={{
                    flex: 1,
                    padding: '10px 5px',
                    background: alcoholForm.subtype === preset.id ? '#00e5ff' : '#2a2a2c',
                    color: alcoholForm.subtype === preset.id ? '#000' : '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: '0.2s'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', padding: '15px 0', marginBottom: '10px' }}>
              {[...Array(5)].map((_, i) => {
                const baseMl = getAlcoholBaseMl(alcoholForm.subtype);
                const glassIcon = getAlcoholGlassIcon(alcoholForm.subtype);
                const mlNum = Number(alcoholForm.ml) || 0;
                const isFilled = mlNum >= baseMl * (i + 1);
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setAlcoholForm({ ...alcoholForm, ml: baseMl * (i + 1) });
                      }
                    }}
                    onClick={() => setAlcoholForm({ ...alcoholForm, ml: baseMl * (i + 1) })}
                    style={{
                      fontSize: '2.2rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      opacity: isFilled ? 1 : 0.25,
                      filter: isFilled ? 'drop-shadow(0 0 8px rgba(255,255,255,0.2))' : 'grayscale(100%)',
                      transform: isFilled ? 'scale(1.1)' : 'scale(1)'
                    }}
                  >
                    {glassIcon}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#b0b0b0', marginBottom: '20px' }}>
              Tocca i bicchieri per impostare la quantità
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Quantità (ml)</label>
                <input type="number" value={alcoholForm.ml} onChange={e => setAlcoholForm({ ...alcoholForm, ml: e.target.value })} style={{ width: '100%', padding: '10px', background: '#111', border: '1px solid #444', borderRadius: '8px', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Gradazione (%)</label>
                <input type="number" step="0.1" value={alcoholForm.abv} onChange={e => setAlcoholForm({ ...alcoholForm, abv: e.target.value })} style={{ width: '100%', padding: '10px', background: '#111', border: '1px solid #444', borderRadius: '8px', color: '#fff' }} />
              </div>
            </div>

            <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(244, 67, 54, 0.1)', border: '1px solid #f44336', borderRadius: '10px', fontSize: '0.85rem', color: '#ffbaba' }}>
              <div>
                Alcol puro:{' '}
                <strong>{((Number(alcoholForm.ml) * (Number(alcoholForm.abv) / 100)) * 0.8).toFixed(1)}g</strong>
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.8 }}>
                Calorie vuote stimate: {Math.round(((Number(alcoholForm.ml) * (Number(alcoholForm.abv) / 100)) * 0.8) * 7)} kcal
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setShowAlcoholPopup(false)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Annulla</button>
              <button type="button" onClick={handleSaveAlcohol} style={{ flex: 2, padding: '12px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Aggiungi Drink</button>
            </div>
          </div>
        </div>
      )}

      {showLongevityModal && longevityData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,12,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100000, overflowY: 'auto', padding: '20px', backdropFilter: 'blur(10px)' }}>
          <div style={{ width: '100%', maxWidth: '500px', marginTop: '40px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
              <div>
                <h2 style={{ color: '#fff', margin: '0 0 5px 0', fontSize: '1.8rem' }}>Healthspan</h2>
                <select
                  value={longevityDays}
                  onChange={(e) => setLongevityDays(Number(e.target.value))}
                  style={{ background: 'transparent', color: '#00e5ff', border: 'none', borderBottom: '1px dashed #00e5ff', padding: '2px 0', cursor: 'pointer', outline: 'none', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}
                >
                  <option value={7} style={{ background: '#1a1a1c' }}>Ultimi 7 Giorni</option>
                  <option value={30} style={{ background: '#1a1a1c' }}>Ultimo Mese</option>
                  <option value={90} style={{ background: '#1a1a1c' }}>Ultimi 3 Mesi</option>
                  <option value={365} style={{ background: '#1a1a1c' }}>Ultimo Anno</option>
                </select>
              </div>
              <button type="button" onClick={() => { setShowLongevityModal(false); setExpandedRiskId(null); }} style={{ background: '#222', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px', position: 'relative' }}>
              <div style={{ width: '180px', height: '180px', borderRadius: '50%', border: `4px solid ${longevityData.color}`, background: `${longevityData.color}10`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${longevityData.color}30` }}>
                <span style={{ color: longevityData.color, fontSize: '4rem', fontWeight: 'bold', lineHeight: '1' }}>{longevityData.masterScore}</span>
                <span style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Score statistiche</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLongevityModal(false);
                  handleBottomNavTabSelect('analisi');
                }}
                aria-label="Apri timeline"
                title="Apri Timeline"
                style={{
                  position: 'absolute',
                  right: 'calc(50% - 108px)',
                  bottom: -6,
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(2,6,23,0.72)',
                  color: '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                  backdropFilter: 'blur(6px)',
                }}
              >
                🕒
              </button>
            </div>

            <HomeView
              longevity={longevityEngineScore}
              explanation={longevityExplanation}
              dailyKcalConsumed={Math.round(Number(totali?.kcal) || 0)}
              dailyKcalTarget={Math.round(Number(dynamicDailyKcal) || Number(userTargets?.kcal) || 2000)}
            />

            <div style={{ marginBottom: '32px', color: '#e8e8e8' }}>
              <LongevityView
                data={longevityEngineScore}
                minimalOnly={false}
                showPriorityFocus={false}
                userAge={userAge}
                bodyMetricsHistory={bodyMetricsHistory}
                scoreHistory={longevityScoreHistory}
                periodAnchorDate={currentTrackerDate}
                fullHistory={fullHistory}
                userTargets={userTargets}
                userProfile={userProfile}
                onUpdateTDEE={handleUpdateTDEE}
                tdeeHistory={tdeeHistory}
                predictionCalibration={predictiveCalibration}
                onBalanceCsvImport={handleCSVUpload}
                onQuickWeighInSubmit={handleQuickWeighInFromHistory}
                pastDaysStorico={pastDaysStorico}
                weeklyTrendData={weeklyTrendData}
                weeklyMicrosTotals={weeklyMicrosTotals}
                weeklyKcalChartReference={weeklyKcalChartReference}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
              {longevityModalRiskRows.map(risk => {
                let rColor = '#00e5ff';
                if (risk.data.score > 40) rColor = '#f44336';
                else if (risk.data.score > 20) rColor = '#ffb300';

                const isExpanded = expandedRiskId === risk.id;

                return (
                  <div
                    key={risk.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedRiskId(isExpanded ? null : risk.id);
                      }
                    }}
                    onClick={() => setExpandedRiskId(isExpanded ? null : risk.id)}
                    style={{ background: '#1a1a1c', padding: '16px', borderRadius: '16px', border: `1px solid ${isExpanded ? rColor : '#2a2a2c'}`, cursor: 'pointer', transition: 'all 0.3s ease' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.5rem' }}>{risk.icon}</span>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1rem' }}>{risk.label}</div>
                          <div style={{ color: '#666', fontSize: '0.75rem' }}>{risk.desc}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: rColor, fontWeight: 'bold', fontSize: '1.2rem' }}>{risk.data.score}%</span>
                        <span style={{ color: '#555', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>▼</span>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: '#111', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, risk.data.score)}%`, height: '100%', background: rColor, borderRadius: '3px', transition: 'width 1s ease-out' }} />
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a2c' }}>
                        <div style={{ fontSize: '0.75rem', color: '#00e5ff', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Insight Diagnostico</div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: '#ccc', fontSize: '0.85rem', lineHeight: '1.5' }}>
                          {risk.data.details.map((detail, idx) => (
                            <li key={idx} style={{ marginBottom: '6px' }}>{detail}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {fixedAppBottomChrome}
    </div>
  );
  }

  const isDataLoaded = isInitialLoadComplete;
  const startupOverlayBlocking =
    !startupSafetyBypass && (!authReady || (isAuthenticated && !isDataLoaded));

  return (
    <UserNutritionGoalsProvider value={nutritionGoalsValue}>
      <>
        <FirebaseDataLoadingLayer blocking={startupOverlayBlocking} />
        {salaContent}
      </>
    </UserNutritionGoalsProvider>
  );
}