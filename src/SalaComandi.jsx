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
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './styles/SalaComandiInline.css';
import { createPortal } from 'react-dom';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, PieChart, Pie, Cell, Sector } from 'recharts';

import { ref, get, set, push, onValue, remove } from 'firebase/database';

import {
  calculateConsolidatedAverageScore,
  calculateProjectedAge,
  buildKentuAiVitalsContextParagraph,
  buildKentuAiMetabolicRecompositionContext,
} from './longevityStats';
import { calculateMetabolicVariance } from './metabolicEngine';

import { useFirebase } from './useFirebase';
import { useFoodDb } from './useFoodDb';
import { useKentuChatHandler } from './hooks/useKentuChatHandler';
import { useProfileAndTargets } from './hooks/useProfileAndTargets';
import { useTimelineDrag } from './hooks/useTimelineDrag';
import MainDashboardCharts from './features/charts/MainDashboardCharts';
import { recordMealFoodCooccurrence } from './foodCooccurrence';
import { recordMealSuggestionHabits } from './mealSuggestionHabits';
import {
  enrichDbRowWithFoodUnits,
  recordMealFoodUnitUsageFromItems,
} from './foodUnits';
import ChartModal from './ChartModal';
import TimelineNodi from './TimelineNodi';
import { applyTimelineStripHourToPreviewInputs } from './timelineDragPreview';
import KentuChatUI from './features/chat/KentuChatUI';
import TargetSettingsModal from './components/modals/TargetSettingsModal';
import MainMenuDrawer from './layout/MainMenuDrawer';
import StrategicPlannerOverlay from './features/planning/StrategicPlannerOverlay';
import TodayStrategyBanner from './features/planning/TodayStrategyBanner';
import { useStrategicPlanner } from './hooks/useStrategicPlanner';
import { UserNutritionGoalsProvider } from './UserNutritionGoalsContext';
import { mergeProfileNutritionFromServer, buildNutritionGoalsSnapshot } from './userNutritionGoals';
import {
  getTimePositionPercent,
  getWallClockDecimalHour,
  CHART_AXIS_GUTTER_LEFT_PX,
  CHART_AXIS_GUTTER_RIGHT_PX,
} from './timeLayout';
import DailyMacroSheet from './DailyMacroSheet';
import FoodLabelModal from './FoodLabelModal';
import FirebaseDataLoadingLayer from './components/FirebaseDataLoadingLayer';
import TimelineNodeReport from './components/TimelineNodeReport';
import BodyBatteryModal from './components/BodyBatteryModal';
import CustomDateTick from './components/CustomDateTick';
import {
  MAIN_BOTTOM_TAB_ORDER,
  BOTTOM_NAV_ITEMS,
  ACTIVE_BOTTOM_TAB_LS_KEY,
  AI_COACH_DISMISSED_INSIGHTS_LS_KEY,
  EVENT_USAGE_LS_KEY,
  EVENT_USAGE_DEFAULT,
  NODE_DRAG_ARM_CANCEL_MOVE_PX,
  REPORT_NUTRIENT_KEYS,
  EMPTY_ENERGY_CHART_DATA,
  LONGEVITY_NIGHT_PENDING_ENERGY_SIM,
  ADD_MENU_ORDER_LS_KEY,
  AI_COACH_EVAL_INACTIVE,
  AI_COACH_EMPTY_HISTORY,
} from './constants/salaComandiConstants';
import LongevityView from './LongevityView';
import DailyCoachSection from '@/features/salaComandi/components/DailyCoachSection';
import { takeNextKentuIntroPhrase } from './kentuIntroPhrases';
import {
  getWorkoutActivityTypeDef,
  getWorkoutActivityLogDescription,
  getCognitiveMetForActivity,
  normalizeMuscleGroupArray,
  resolveWorkoutActivityTypeId,
} from './activityCatalog';
import WorkoutView, { workoutActivityRequiresStrengthDetailNote } from './drawers/vistas/WorkoutView';
import {
  createInitialWeeklyPlan,
  getWeekStartMondayKeyLocal,
  sanitizeWeeklyPlanFromFirebase,
  weeklyPlanStableJson,
  weeklyPlanToFirebasePayload,
} from './weeklyPlanning';
import WeeklyPlanning from './components/WeeklyPlanning';
import MealBuilderOverlay from './features/mealBuilder/MealBuilderOverlay';
import {
  resolveDistributionMealId,
  sumConsumedMacrosExcludingMeal,
  buildRemainingDistributionMeals,
} from './utils/mealStrategy';
import {
  parseDurationMinutesInput,
  WORKOUT_DURATION_DEFAULT,
  WORKOUT_DURATION_MIN,
  WORKOUT_DURATION_MAX,
} from './utils/durationMinutesInput';
import AppBottomNavigation from './layout/AppBottomNavigation';
import AppHeader from './layout/AppHeader';
import FullscreenGraphView from './features/charts/FullscreenGraphView';
import MenuDrawerShell from './features/salaComandi/MenuDrawerShell';
import OverlayHost from './features/salaComandi/OverlayHost';
import ChoiceModalOverlay from './features/salaComandi/overlays/ChoiceModalOverlay';
import DateCalendarOverlay from './features/salaComandi/overlays/DateCalendarOverlay';
import BatteryModalOverlay from './features/salaComandi/overlays/BatteryModalOverlay';
import ReportModalOverlay from './features/salaComandi/overlays/ReportModalOverlay';
import AlcoholPopupOverlay from './features/salaComandi/overlays/AlcoholPopupOverlay';
import SleepModalOverlay from './features/salaComandi/overlays/SleepModalOverlay';
import SpieInfoOverlay from './features/salaComandi/overlays/SpieInfoOverlay';
import SleepPromptOverlay from './features/salaComandi/overlays/SleepPromptOverlay';
import QuickNodeEditOverlay from './features/salaComandi/overlays/QuickNodeEditOverlay';
import WaterActionModal from './components/modals/WaterActionModal';
import {
  FastChargeNapQuickPanel,
  FastChargeMeditationQuickPanel,
  FastChargeSupplementsQuickPanel,
} from './components/modals/FastChargeQuickActionPanels';
import TimelineInsertOverlay from './components/modals/TimelineInsertOverlay';
import FoodInspectorModal from './components/modals/FoodInspectorModal';
import HealthspanOverlay from './features/longevity/HealthspanOverlay';
import useFoodInputEngine from './features/salaComandi/hooks/useFoodInputEngine';
import useBodyMetricsEngine from './features/salaComandi/hooks/useBodyMetricsEngine';
import {
  estraiDatiFoodDb as resolveFoodDataFromEngine,
  getAverageEstimate as getAverageEstimateFromEngine,
} from './features/salaComandi/engines/foodDataEngine';
import {
  deriveEffectiveBodyMetricsForDate,
  deriveCurrentBodyMetricsFromHistory,
  resolveTargetConfigForDate,
  upsertTargetHistoryEntry,
} from './features/salaComandi/engines/bodyMetricsEngine';
import {
  findBestFoodMatch,
  findRecentFoodHabit,
  draftStringsToFoods,
  parsePlanMealDraftAiResponse,
  structuredFoodsToProposalItems,
  ghostSurfaceDraftToProposalItems,
} from './features/salaComandi/utils/foodUtils';
import {
  mealFoodsRead,
  planningMealSlotKeyForFirebase,
  normalizeTimingByMacroForPlanningDoc,
  buildPlanningFirebaseDoc,
} from './features/salaComandi/utils/planningUtils';
import {
  stripInvisibleContextFromVisibleUserText,
  collectDispensaProbableFoods,
  getInvisibleContext,
  extractAndStripMealProposal,
  normalizeDailyPlanTimeForInput,
  normalizeDailyPlanFromToken,
  extractAndStripDailyPlan,
  parseSmartCompletionJsonFromAiResponse,
} from './features/salaComandi/utils/aiContextUtils';
import { normalizeAddMenuOrderState } from './features/salaComandi/utils/menuUtils';
import {
  getMealTimeFromLogItem,
  normalizeWorkoutSearchKey,
  formatDecimalHourIt,
  parseFlexibleTimeToDecimal,
  resolveActivityOrWorkoutTimelineHour,
  extractWorkoutSearchKeysFromMessage,
  detectWorkoutIntentFromChat,
  findLastMatchingWorkoutSlot,
  buildPastOnlyRealMealTypeSet,
  buildBaseLogForGhostPlanMerge,
  dedupeGhostMealsPayloadForConfirm,
  ghostMealLogEntryIdFromPayload,
  normalizeGhostFoodsForTimelineNode,
} from './features/salaComandi/utils/timelineUtils';
import MetabolicUnifiedView from './MetabolicUnifiedView';
import SleepCoachCompact from '@/features/salaComandi/components/SleepCoachCompact';
import DailyIndicatorsBar from '@/features/salaComandi/components/DailyIndicatorsBar';
import { useSleepCoach } from '@/features/salaComandi/hooks/useSleepCoach';
import useMetabolicMapEngine from './features/salaComandi/hooks/useMetabolicMapEngine';
import { buildMetabolicCompassDailyHistory } from './metabolicCompassDailyHistory';
import { computeMetabolicNotification } from './notificationEngine';
import { setBarcodeNutritionOverride as setBarcodeNutritionOverrideStorage } from './barcodeFoodOverrides';
import {
  evaluateAiDayCoach,
  getCoachPeriod,
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

import {
  buildQuickBriefingSecretPrompt,
  buildYesterdayGapSecretPrompt,
  buildMealIdeaFromDispensaSecretPrompt,
  buildRecentMealsContextForDinner,
  buildAiMealConstraintsPromptBlock,
  buildLast7DaysMealLinesForDraftPrompt,
  buildRecentActivitiesContext,
  buildKentuAgendaSecretPrompt,
  buildAiCoachFoodLogFingerprint,
} from './features/chat/aiPromptBuilders';
import {
  migrateIdealStrategy,
  readPersistedActiveBottomTab,
  readPersistedEventUsage,
  readDismissedAiCoachInsights,
  computeSleepDurationHours,
  kentuChatStorageKey,
  readKentuChatHistoryFromLocalStorage,
  kentuChatHistoryForPersistence,
  getNowDecimalHourForPlanMerge,
  tryAcquireMealConfirmGuard,
  releaseMealConfirmGuard,
  coachEvalSemanticEqual,
} from './utils/salaComandiUtils';

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
  const [showFoodDropdown, setShowFoodDropdown] = useState(false);
  const [selectedFoodForCard, setSelectedFoodForCard] = useState(null);
  const [inspectedFood, setInspectedFood] = useState(null);
  const [editFoodData, setEditFoodData] = useState(null);
  const [isAIVerifying, setIsAIVerifying] = useState(false);
  /** One-shot bootstrap per MealBuilder dopo scansione OFF (nonce + match con row Firebase o bozza locale). */
  const [mealBuilderBarcodeBootstrap, setMealBuilderBarcodeBootstrap] = useState(null);
  const foodInputRef = useRef(null);
  const getLastQuantityForFoodRef = useRef(null);
  const callGeminiAPIWithRotationRef = useRef(null);
  const fullHistoryForFoodEngineRef = useRef({});

  const {
    foodNameInput,
    setFoodNameInput,
    foodWeightInput,
    setFoodWeightInput,
    foodDropdownSuggestions,
    creaResults,
    isCreaLoading,
    isBarcodeScannerOpen,
    setIsBarcodeScannerOpen,
    isGeneratingFood,
    triggerCreaSearch,
    closeBarcodeScanner,
    generateFoodWithAI,
    handleAddFoodManual,
    barcodeVideoRef,
  } = useFoodInputEngine({
    foodDb,
    mealType,
    addedFoods,
    userUid,
    fullHistoryRef: fullHistoryForFoodEngineRef,
    db,
    csvFoodDb,
    csvFoodDbLoading,
    setFoodDb,
    setAddedFoods,
    setShowFoodDropdown,
    setMealBuilderBarcodeBootstrap,
    getLastQuantityForFoodRef,
    callGeminiAPIWithRotationRef,
  });

  const [selectedFoodForInfo, setSelectedFoodForInfo] = useState(null);
  const [selectedFoodForEdit, setSelectedFoodForEdit] = useState(null);
  const [nutrientModal, setNutrientModal] = useState(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [inputWeightDate, setInputWeightDate] = useState(() => getTodayString());
  const [inputWeight, setInputWeight] = useState('');
  const [inputFat, setInputFat] = useState('');
  const [drawerMuscleMass, setDrawerMuscleMass] = useState('');
  const [drawerBodyWater, setDrawerBodyWater] = useState('');
  const [drawerVisceralFat, setDrawerVisceralFat] = useState('');
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

  const [planningWizardOverlayOpen, setPlanningWizardOverlayOpen] = useState(false);
  const [showStrategicPlanner, setShowStrategicPlanner] = useState(false);
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
  const [userTargets, setUserTargets] = useState({
    ...DEFAULT_TARGETS,
    autoCalculated: false,
    targetHistory: [],
  });
  const [birthDate, setBirthDate] = useState('');
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;

  const nutritionGoalsValue = useMemo(
    () => buildNutritionGoalsSnapshot(userProfile, userTargets),
    [userProfile, userTargets]
  );

  const { strategicPlan, isPlannerLoading, updateDayPlan, updateSettings, saveCalorieMemory, shiftPlanForward } = useStrategicPlanner(
    db,
    userProfile?.uid || user?.uid
  );

  const [workoutType, setWorkoutType] = useState('pesi');
  const [workoutKcal, setWorkoutKcal] = useState(300);
  const [workoutEndTime, setWorkoutEndTime] = useState(19);
  const [workoutDurationMin, setWorkoutDurationMin] = useState(String(WORKOUT_DURATION_DEFAULT));
  const [workoutStrengthDetail, setWorkoutStrengthDetail] = useState('');
  const [workoutMuscles, setWorkoutMuscles] = useState([]);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);

  const workoutDurationHours = Math.max(
    0.25,
    Math.min(
      24,
      parseDurationMinutesInput(workoutDurationMin, {
        min: WORKOUT_DURATION_MIN,
        max: WORKOUT_DURATION_MAX,
        fallback: WORKOUT_DURATION_DEFAULT,
      }) / 60,
    ),
  );
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
  fullHistoryForFoodEngineRef.current = fullHistory;
  const {
    bodyMetricsHistory,
    predictiveCalibration,
    tdeeHistory,
    bodyMetricsSaveToast,
    recalibrationProposal,
    handleSaveBodyMetrics,
    handleQuickWeighInFromHistory,
    handleDeleteBodyMetrics,
    applyRecalibrationProposal,
    dismissRecalibrationProposal,
    handleUpdateTDEE,
    applyAutomaticTargetRecalibration,
  } = useBodyMetricsEngine({
    auth,
    db,
    user,
    fullHistory,
    userProfile,
    userTargets,
    setUserProfile,
    setUserTargets,
    computeMetabolicNotification,
    metricEntryToIsoDay,
    getTodayString,
    inputWeightDate,
    inputWeight,
    inputFat,
    drawerMuscleMass,
    drawerBodyWater,
    drawerVisceralFat,
    setShowWeightModal,
    setInputWeightDate,
    setInputWeight,
    setInputFat,
    setDrawerMuscleMass,
    setDrawerBodyWater,
    setDrawerVisceralFat,
  });
  const [showReport, setShowReport] = useState(false);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [showDateCalendarModal, setShowDateCalendarModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRecalibrationDetails, setShowRecalibrationDetails] = useState(false);
  const [trendModalMetric, setTrendModalMetric] = useState(null);
  const [trendDays, setTrendDays] = useState(30);
  const [reportViewedDates, setReportViewedDates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reportViewedDates')) || {}; } catch { return {}; }
  });
  const [reportPeriod, setReportPeriod] = useState('7');
  const [currentDateObj, setCurrentDateObj] = useState(() => new Date());
  const [calendarMonthIso, setCalendarMonthIso] = useState(() => getTodayString().slice(0, 7));

  useEffect(() => {
    if (!recalibrationProposal?.show) setShowRecalibrationDetails(false);
  }, [recalibrationProposal?.show]);

  const currentTrackerDate = useMemo(() => {
    const offset = currentDateObj.getTimezoneOffset() * 60000;
    return new Date(currentDateObj.getTime() - offset).toISOString().slice(0, 10);
  }, [currentDateObj]);

  const effectiveTargetsForCurrentDate = useMemo(
    () =>
      resolveTargetConfigForDate({
        targets: userTargets,
        date: currentTrackerDate || getTodayString(),
        todayDate: getTodayString(),
      }),
    [userTargets, currentTrackerDate]
  );

  const applyTargetModeUpdate = useCallback(
    ({ updater, mode, source }) => {
      const effectiveDate = currentTrackerDate || getTodayString();
      setUserTargets((prev) => {
        const nextRaw = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        const nextHistory = upsertTargetHistoryEntry({
          history: nextRaw?.targetHistory,
          effectiveDate,
          targets: nextRaw,
          todayDate: getTodayString(),
          source,
          seedPreviousTargets: prev,
        });
        return {
          ...nextRaw,
          autoCalculated: mode === 'auto',
          targetHistory: nextHistory,
        };
      });
    },
    [currentTrackerDate, getTodayString]
  );

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

  const [metabolicCompassTimeframe, setMetabolicCompassTimeframe] = useState('7d');
  const metabolicMapData = useMetabolicMapEngine({
    dailyHistory: metabolicCompassDailyHistory,
    bodyMetricsHistory,
    fullHistory,
    userTargets,
    projectionAnchorDate: currentTrackerDate,
    selectedTimeframe: metabolicCompassTimeframe,
  });

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
  const [touchingNodeId, setTouchingNodeId] = useState(null);
  const [historyStack, setHistoryStack] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showUndoToast, setShowUndoToast] = useState(false);
  /** Modale trascina-in-zona-cancella per ghost_meal / ghost_workout */
  const [ghostProgramDeleteModal, setGhostProgramDeleteModal] = useState(null);
  const [programmingRemovedToast, setProgrammingRemovedToast] = useState(false);
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

  const {
    handleCSVUpload,
    calculateSmartTargets,
    navigateToDate,
    changeDate,
    generateReportData,
  } = useProfileAndTargets({
    userUid,
    db,
    userProfile,
    birthDate,
    userTargets,
    fullHistory,
    reportPeriod,
    currentDateObj,
    setUserProfile,
    applyTargetModeUpdate,
    applyAutomaticTargetRecalibration,
    setCurrentDateObj,
    setDailyLog,
    setManualNodes,
    calculateAge,
  });

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
        const normalizedTime = resolveActivityOrWorkoutTimelineHour(e);
        if (normalizedTime == null) return null;
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
      })
      .filter(Boolean);
  }, [activeLog]);

  const hasRealWorkoutInActiveLog = useMemo(
    () => (activeLog || []).some((n) => n && n.type === 'workout' && n.isGhost !== true),
    [activeLog]
  );

  /** Esclude ghost_workout senza ora definita o quando un workout reale nel diario li sostituisce. */
  const manualNodesForTimeline = useMemo(() => {
    return (manualNodes || []).filter((n) => {
      if (!n) return false;
      if (n.type !== 'ghost_workout') return true;
      if (hasRealWorkoutInActiveLog) return false;
      return resolveActivityOrWorkoutTimelineHour(n) != null;
    });
  }, [manualNodes, hasRealWorkoutInActiveLog]);

  const allNodes = useMemo(() => {
    const todayStr = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'][new Date().getDay()];
    const todayPlan = strategicPlan?.days?.[todayStr];

    // Verifica se esiste già un vero allenamento registrato oggi nel log
    const hasRealWorkoutToday = (activeLog || []).some(entry => entry.type === 'workout' && !entry.isGhost);

    const plannedHourDec = todayPlan?.hour != null ? parseFlexibleTimeToDecimal(String(todayPlan.hour)) : null;
    // Crea il fantasma solo se c'è un piano per oggi, ha un orario, e non ci siamo ancora allenati
    const plannedStrategicNode = (plannedHourDec != null && !hasRealWorkoutToday && todayPlan?.type !== 'REST') ? {
      id: `strategic_ghost_${todayStr}`,
      type: 'ghost_workout',
      isGhost: true,
      time: plannedHourDec,
      title: `Previsto: ${todayPlan.type === 'WORKOUT' ? 'Pesi' : todayPlan.type}`,
      subtitle: todayPlan.focus ? todayPlan.focus.join(', ') : '',
      kcal: todayPlan.kcal || 0
    } : null;

    return [...computedMealNodes, ...ghostMealTimelineNodes, ...computedActivityTimelineNodes, ...manualNodesForTimeline, ...(plannedStrategicNode ? [plannedStrategicNode] : [])]
      .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
  }, [computedMealNodes, ghostMealTimelineNodes, computedActivityTimelineNodes, manualNodesForTimeline, strategicPlan, activeLog]);

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
      setWeeklyPlan(createInitialWeeklyPlan());
      weeklyPlanningListenerReadyRef.current = false;
      weeklyPlanningRemoteSigRef.current = '';
      return;
    }
    let unsubToday = null;
    const today = getTodayString();
    const basePath = `users/${user.uid}/tracker_data`;

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
        if (data?.targets) {
          setUserTargets((prev) => ({
            ...prev,
            ...data.targets,
            autoCalculated: data?.targets?.autoCalculated === true,
            targetHistory: Array.isArray(data?.targets?.targetHistory)
              ? data.targets.targetHistory
              : prev.targetHistory || [],
          }));
        }
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

  const {
    draggingNode,
    setDraggingNode,
    dragOffsetY,
    dragOffsetYRef,
    dragLiveTime,
  } = useTimelineDrag({
    timelineContainerRef,
    dailyLogRef,
    manualNodesRef,
    isSimulationMode,
    pushTimelineUndoSnapshot,
    syncDatiFirebase,
    setDailyLog,
    setManualNodes,
    setGhostProgramDeleteModal,
    setTouchingNodeId,
  });

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

  useEffect(() => {
    if (!showWeightModal) return;
    setInputWeightDate(getTodayString());
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
  }, [showWeightModal, getTodayString]);

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
  const baseKcal = (effectiveTargetsForCurrentDate.kcal ?? STRATEGY_PROFILES[dayProfile].kcal) + calorieTuning;
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
    return computeDayEvaluations(activeLog, effectiveTargetsForCurrentDate);
  }, [activeLog, currentTrackerDate, effectiveTargetsForCurrentDate]);

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
        setWorkoutDurationMin(String(WORKOUT_DURATION_DEFAULT));
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
  getLastQuantityForFoodRef.current = getLastQuantityForFood;

  const consumeMealBuilderBarcodeBootstrap = useCallback(() => {
    setMealBuilderBarcodeBootstrap(null);
  }, []);

  /** Stima media verosimile per nutriente mancante (mai 0: usa contesto nome o media). */
  const getAverageEstimate = useCallback((nutrientKey, foodDesc = '') => {
    return getAverageEstimateFromEngine({ nutrientKey, foodDesc, fullHistory });
  }, [fullHistory]);

  // Estrazione dati da DB (preferredDbKey: da findBestFoodMatch nel flusso add_food)
  const estraiDatiFoodDb = useCallback((nome, qta, pastoType, preferredDbKey) => {
    return resolveFoodDataFromEngine({
      nome,
      qta,
      pastoType,
      preferredDbKey,
      foodDb,
      fullHistory,
    });
  }, [foodDb, fullHistory]);

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
    const normalizedDurationMin = parseDurationMinutesInput(workoutDurationMin, {
      min: WORKOUT_DURATION_MIN,
      max: WORKOUT_DURATION_MAX,
      fallback: WORKOUT_DURATION_DEFAULT,
    });
    setWorkoutDurationMin(String(normalizedDurationMin));
    const duration = Math.max(0.25, Math.min(24, normalizedDurationMin / 60));
    const def = getWorkoutActivityTypeDef(workoutType);
    const nodeKind = def?.nodeKind ?? 'workout';
    const isWork = nodeKind === 'work';
    const isCognitive = nodeKind === 'cognitive';
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
  callGeminiAPIWithRotationRef.current = callGeminiAPIWithRotation;

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
    () => calculateBodyBattery(fullHistory, currentTrackerDate, activeLog, effectiveTargetsForCurrentDate),
    [fullHistory, currentTrackerDate, activeLog, effectiveTargetsForCurrentDate]
  );

  const {
    activeTrigger: kentuActiveTrigger,
    chatNotificationBadge: kentuChatNotificationBadge,
    dismissKentuSleepTrigger,
    dismissKentuAgendaTrigger,
    dismissKentuActiveTrigger,
  } = useSmartKentuTriggers(
    activeLog,
    currentTrackerDate,
    fullHistory,
    effectiveTargetsForCurrentDate,
    bodyBattery?.maxCapacity ?? 100
  );

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
          if (newItem[k] == null) {
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
  const sleepCoach = useSleepCoach({
    activeLog,
    totali,
    dynamicDailyKcal,
    userProfile,
  });
  const targetKcalChart = dynamicDailyKcal;
  // --- NUOVI ALLARMI PREDITTIVI PERCENTUALI ---
  const targetKcalForAlerts = dynamicDailyKcal || baseKcal || (userTargets?.kcal ?? 2000);
  const targetMacros = { prot: userTargets?.prot ?? 150, carb: userTargets?.carb ?? 200, fat: userTargets?.fatTotal ?? userTargets?.fat ?? 65 };
  const totalMacrosTimeline = { prot: totali?.prot ?? 0, carb: totali?.carb ?? 0, fat: totali?.fatTotal ?? totali?.fat ?? 0 };

  const aiCoachFoodLogFingerprint = useMemo(
    () => buildAiCoachFoodLogFingerprint(activeLog),
    [activeLog],
  );

  const todayLogForCoachRef = useRef([]);
  const activeLogForCoachSyncRef = useRef(activeLog);
  activeLogForCoachSyncRef.current = activeLog;
  useEffect(() => {
    const a = activeLogForCoachSyncRef.current;
    todayLogForCoachRef.current = a == null ? [] : a;
  }, [aiCoachFoodLogFingerprint]);
  todayLogForCoachRef.current =
    activeLogForCoachSyncRef.current == null ? [] : activeLogForCoachSyncRef.current;

  const aiCoachCurrentTimeRef = useRef(currentTime);
  aiCoachCurrentTimeRef.current = currentTime;

  const aiCoachDecimalHour = isAuthenticated ? currentTime : getWallClockDecimalHour();
  const aiCoachPeriodKey = useMemo(() => getCoachPeriod(aiCoachDecimalHour), [aiCoachDecimalHour]);

  const aiCoachTargetKcalKey = useMemo(
    () => Math.round(Number(dynamicDailyKcal) || Number(targetKcalForAlerts) || 0),
    [dynamicDailyKcal, targetKcalForAlerts],
  );

  const aiCoachEvalCacheRef = useRef({
    key: '',
    value: AI_COACH_EVAL_INACTIVE,
  });

  const aiCoachEvalKey = useMemo(
    () =>
      [
        aiCoachFoodLogFingerprint,
        aiCoachTargetKcalKey,
        coachPrefsTick,
        aiCoachPeriodKey,
        currentTrackerDate,
        isAuthenticated ? 'auth' : 'guest',
        isSimulationMode ? 'sim' : 'real',
      ].join('|'),
    [
      aiCoachFoodLogFingerprint,
      aiCoachTargetKcalKey,
      coachPrefsTick,
      aiCoachPeriodKey,
      currentTrackerDate,
      isAuthenticated,
      isSimulationMode,
    ],
  );

  const aiCoachEvalComputed = useMemo(() => {
    const cache = aiCoachEvalCacheRef.current;
    if (cache.key === aiCoachEvalKey) {
      return cache.value;
    }

    const log = todayLogForCoachRef.current;
    if (!log || currentTrackerDate !== getTodayString() || isSimulationMode) {
      aiCoachEvalCacheRef.current = { key: aiCoachEvalKey, value: AI_COACH_EVAL_INACTIVE };
      return AI_COACH_EVAL_INACTIVE;
    }
    const decimalHour = isAuthenticated ? aiCoachCurrentTimeRef.current : getWallClockDecimalHour();
    const result = evaluateAiDayCoach({
      todayLog: log,
      userHistory: AI_COACH_EMPTY_HISTORY,
      targetCalories: aiCoachTargetKcalKey,
      decimalHour,
      todayStr: getTodayString(),
      toCanonicalMealType,
    });
    aiCoachEvalCacheRef.current = { key: aiCoachEvalKey, value: result };
    return result;
  }, [aiCoachEvalKey]);

  const aiCoachEvalStableRef = useRef(AI_COACH_EVAL_INACTIVE);
  if (!coachEvalSemanticEqual(aiCoachEvalStableRef.current, aiCoachEvalComputed)) {
    aiCoachEvalStableRef.current = aiCoachEvalComputed;
  }
  const aiCoachEval = aiCoachEvalStableRef.current;

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
      setHasNewInsight((v) => (v ? false : v));
      setAiCoachBulbPulseCycles((c) => (c !== 0 ? 0 : c));
      setIsAiCoachInsightArmed((v) => (v ? false : v));
      aiCoachLastInsightKeyRef.current = null;
      return;
    }

    const inCooldown = Date.now() < aiCoachCooldownUntilRef.current;
    if (inCooldown) {
      setHasNewInsight((v) => (v ? false : v));
      setAiCoachBulbPulseCycles((c) => (c !== 0 ? 0 : c));
      setIsAiCoachInsightArmed((v) => (v ? false : v));
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
      setIsAiCoachSuggestionModalOpen((open) => (open ? false : open));
      return;
    }
    if (dismissedAiCoachInsights[aiCoachSuggestionDismissKey]) {
      setIsAiCoachSuggestionModalOpen((open) => (open ? false : open));
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
      kcal: effectiveTargetsForCurrentDate?.kcal ?? 2000,
      prot: effectiveTargetsForCurrentDate?.prot ?? 150,
      carb: effectiveTargetsForCurrentDate?.carb ?? 200,
      fatTotal:
        effectiveTargetsForCurrentDate?.fatTotal ?? effectiveTargetsForCurrentDate?.fat ?? 60,
      fat: effectiveTargetsForCurrentDate?.fat ?? effectiveTargetsForCurrentDate?.fatTotal ?? 60,
      fibre: effectiveTargetsForCurrentDate?.fibre ?? 30,
    }, {
      currentDecimalHour: h,
      calorieStrategy: kentuDailyCalorieStrategy,
      burnedKcalBonus: burnedKcal,
    });
  }, [
    mealType,
    dailyLogForDynamicTargets,
    effectiveTargetsForCurrentDate,
    kentuDailyCalorieStrategy,
    burnedKcal,
    drawerMealTime,
    displayTime,
  ]);

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

  const mealBuilderDailyTarget = useMemo(
    () => ({
      pro: effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot ?? 150,
      carbo: effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb ?? 200,
      fat:
        effectiveTargetsForCurrentDate?.fatTotal ??
        effectiveTargetsForCurrentDate?.fat ??
        userTargets?.fatTotal ??
        userTargets?.fat ??
        60,
    }),
    [effectiveTargetsForCurrentDate, userTargets]
  );

  const mealBuilderCurrentMealId = useMemo(() => {
    const h =
      typeof drawerMealTime === 'number' && !Number.isNaN(drawerMealTime)
        ? drawerMealTime
        : typeof displayTime === 'number' && !Number.isNaN(displayTime)
          ? displayTime
          : 12;
    return resolveDistributionMealId(mealType, h);
  }, [mealType, drawerMealTime, displayTime]);

  const mealBuilderConsumedMacros = useMemo(() => {
    if (!mealBuilderCurrentMealId) return { pro: 0, carbo: 0, fat: 0 };
    return sumConsumedMacrosExcludingMeal(dailyLogForDynamicTargets, mealBuilderCurrentMealId);
  }, [dailyLogForDynamicTargets, mealBuilderCurrentMealId]);

  const mealBuilderRemainingMeals = useMemo(() => {
    if (!mealBuilderCurrentMealId) return [];
    return buildRemainingDistributionMeals(dailyLogForDynamicTargets, mealBuilderCurrentMealId);
  }, [dailyLogForDynamicTargets, mealBuilderCurrentMealId]);

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

  const metabolicVarianceForAi = useMemo(() => {
    const currentTdeeForAi =
      typeof userTargets?.kcal === 'number' && Number.isFinite(userTargets.kcal) ? userTargets.kcal : null;
    if (currentTdeeForAi == null) return null;
    return calculateMetabolicVariance(bodyMetricsHistory, fullHistory, currentTdeeForAi);
  }, [bodyMetricsHistory, fullHistory, userTargets?.kcal]);

  const { handleChatSubmit } = useKentuChatHandler({
    CHAT_HISTORY_WINDOW,
    accumuloSNC,
    activeAction,
    activeLog,
    anabolicCurve,
    applyKentuChatCmd,
    birthDate,
    bodyBattery,
    bodyMetricsHistory,
    buildKentuAgendaSecretPrompt,
    buildRecentActivitiesContext,
    buildRecentMealsContextForDinner,
    calculateAge,
    callGeminiAPIWithRotation,
    chatHistory,
    chatImages,
    chatInput,
    commitAddFoodChatPayload,
    computeSleepDurationHours,
    cortisolCurve,
    currentTime,
    currentTrackerDate,
    dailyLog,
    dailyLogForEnergy,
    dismissKentuSleepTrigger,
    estraiDatiFoodDb,
    foodDb,
    fullHistory,
    getCurrentTimeRoundedTo15Min,
    handleAutoLogDinner,
    idealStrategy,
    isSimulationMode,
    kentuAgendaAwaitingRef,
    kentuDailyCalorieStrategy,
    lastAgendaOptionsRef,
    lastDinnerOptionsRef,
    longevityData,
    longevityEngineScore,
    longevityScoreHistory,
    manualNodes,
    mealType,
    metabolicVarianceForAi,
    nervousSystemLoad,
    nodesForEnergySimulation,
    normalizeAiMealTypeToStorageId,
    pendingAiBatch,
    pendingHabit,
    pendingWorkoutFlowRef,
    predictMealType,
    scheduledWorkoutContextRef,
    setChatHistory,
    setChatImages,
    setChatInput,
    setDailyLog,
    setIdealStrategy,
    setManualNodes,
    setPendingAiBatch,
    setPendingHabit,
    setSimulatedLog,
    setSimulationNodes,
    simulatedLog,
    syncDatiFirebase,
    totali,
    trainingWaveResult,
    userModel,
    userProfile,
    userTargets,
  });

  const handleMealProposalSwap = useCallback(
    (itemId) => {
      const safe = String(itemId ?? '').replace(/'/g, "'");
      handleChatSubmit(`Sostituisci l'ingrediente con ID: '${safe}'`, { fromInput: true });
    },
    [handleChatSubmit]
  );

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

  const handlePrevCalendarMonth = () => {
    const [y, m] = calendarMonthIso.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    setCalendarMonthIso(`${d.getFullYear()}-${mo}`);
  };

  const handleNextCalendarMonth = () => {
    const [y, m] = calendarMonthIso.split('-').map(Number);
    const d = new Date(y, m, 1);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    setCalendarMonthIso(`${d.getFullYear()}-${mo}`);
  };

  const handleSelectCalendarDate = (iso) => {
    navigateToDate(iso);
    setShowDateCalendarModal(false);
  };

  const handleCloseChoiceModal = () => {
    setShowChoiceModal(false);
    setAddChoiceView('main');
  };

  const handleSaveChoiceStimulant = () => {
    const id = Date.now().toString();
    const node = { id, type: 'stimulant', subtype: stimulantSubtype, time: stimulantTime };
    const next = [...manualNodes, node];
    setManualNodes(next);
    syncDatiFirebase(dailyLog, next);
    setShowChoiceModal(false);
    setAddChoiceView('main');
  };

  const sleepDurationLabel = (() => {
    const dur = computeSleepDurationHours(
      parseTimeStrToDecimal(sleepFormBedStr),
      parseTimeStrToDecimal(sleepFormWakeStr)
    );
    const hh = Math.floor(dur);
    const mm = Math.round((dur % 1) * 60);
    return `${hh}h ${String(mm).padStart(2, '0')}m`;
  })();

  const handleSaveSleepModal = () => {
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
  };

  const handleSleepPromptInsertSleep = () => {
    setShowSleepPrompt(false);
    setSleepModal({ editingId: null });
  };

  const handleSleepPromptUseAverage = () => {
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
  };

  const handleCloseQuickNodeEdit = () => {
    setEditingQuickNode(null);
  };

  const handleDeleteQuickNodeEdit = () => {
    if (!editingQuickNode) return;
    if (window.confirm('Vuoi eliminare questa attività?')) {
      const next = manualNodes.filter((n) => n.id !== editingQuickNode.id);
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
      setEditingQuickNode(null);
    }
  };

  const handleSaveQuickNodeEdit = () => {
    if (!editingQuickNode) return;
    const newStart = document.getElementById('quick-start-time')?.value;
    const newEnd = document.getElementById('quick-end-time')?.value;
    if (newStart != null && newEnd != null && newStart !== '' && newEnd !== '') {
      const startDec = parseTimeStrToDecimal(newStart);
      const endDec = parseTimeStrToDecimal(newEnd);
      let duration = endDec - startDec;
      if (duration <= 0) duration += 24;
      duration = Math.max(0.08, Math.min(24, duration));
      const next = manualNodes.map((n) => (n.id === editingQuickNode.id ? { ...n, time: startDec, startTime: startDec, endTime: endDec, duration } : n));
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    }
    setEditingQuickNode(null);
  };

  const quickNodeEditStartTime = editingQuickNode
    ? decimalToTimeStr(editingQuickNode.time ?? editingQuickNode.startTime ?? 14)
    : '14:00';
  const quickNodeEditEndTime = editingQuickNode
    ? decimalToTimeStr((editingQuickNode.time ?? editingQuickNode.startTime ?? 14) + (editingQuickNode.duration ?? 0.25))
    : '14:15';

  // ========================================================
  // Contenuto principale (un solo return finale per mantenere montato l’overlay caricamento Firebase)
  // ========================================================
  /** Barra Kentu + navigazione: sempre montata dopo login, anche durante caricamento dati (Bussola sempre visibile). */
  const fixedAppBottomChrome = (
    <AppBottomNavigation
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
    salaContent = (
      <FullscreenGraphView
        fullscreenChartScrollRef={fullscreenChartScrollRef}
        availableFullscreenCharts={availableFullscreenCharts}
        fullscreenChartIndex={fullscreenChartIndex}
        setFullscreenChartIndex={setFullscreenChartIndex}
        exitFullscreen={exitFullscreen}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        handleCenterZoomAndPan={handleCenterZoomAndPan}
        openTimelineQuickAddAtCenter={openTimelineQuickAddAtCenter}
        openTimelineQuickAddAtPointer={openTimelineQuickAddAtPointer}
        finalChartData={finalChartData}
        safeCalorieTimelineData={safeCalorieTimelineData}
        displayTime={displayTime}
        dotY={dotY}
        dotCortisolo={dotCortisolo}
        dotGlicemia={dotGlicemia}
        dotIdratazione={dotIdratazione}
        dotNeuro={dotNeuro}
        dotDigestione={dotDigestione}
        nodesForEnergySimulation={nodesForEnergySimulation}
        targetKcalChart={targetKcalChart}
        totalCaloriesTimeline={totalCaloriesTimeline}
        scale={scale}
        isViewingPastDate={isViewingPastDate}
        currentTime={currentTime}
        chartUnit={chartUnit}
        activeBottomTab={activeBottomTab}
        activeNodesWithStack={activeNodesWithStack}
        idealStrategy={idealStrategy}
        realTotals={realTotals}
        draggingNode={draggingNode}
        touchingNodeId={touchingNodeId}
        dragOffsetY={dragOffsetY}
        dragLiveTime={dragLiveTime}
        timelineContainerRef={timelineContainerRef}
        startNodeDrag={startNodeDrag}
        releaseNodePointer={releaseNodePointer}
        onTimelineNodeClick={onTimelineNodeClick}
        handleNodeTap={handleNodeTap}
        decimalToTimeStr={decimalToTimeStr}
        syncDatiFirebase={syncDatiFirebase}
        setManualNodes={setManualNodes}
        setDailyLog={setDailyLog}
        bodyBattery={bodyBattery}
        timelineEnergySeries={timelineEnergySeries}
        chartData={chartData}
        updateMealTime={updateMealTime}
        onTimelineStripPreviewDragStart={onTimelineStripPreviewDragStart}
        scheduleTimelineStripEnergyPreview={scheduleTimelineStripEnergyPreview}
        clearTimelineStripEnergyPreview={clearTimelineStripEnergyPreview}
        onTimelineStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
        activeAction={activeAction}
        NODE_IMPORTANCE={NODE_IMPORTANCE}
        NODE_TYPE_ICON={NODE_TYPE_ICON}
      />
    );
  } else {
    salaContent = (
    <div style={{ backgroundColor: isSimulationMode ? '#1a1625' : '#000', color: '#fff', height: '100dvh', maxHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 'max(10px, 1.5vh) 15px max(15px, 2vh) 15px', paddingBottom: 0, fontFamily: 'sans-serif', overflow: 'hidden' }}>

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

      <AppHeader
        onLogoClick={() => {
          handleCoreOsClick();
          setActiveAction(null);
          setIsDrawerOpen(false);
          setShowChoiceModal(false);
          setShowReport(false);
          setShowProfile(false);
          setSelectedNodeReport(null);
          setShowReportModal(false);
        }}
        dateLabel={currentDateObj.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
        onPrevDay={() => changeDate(-1)}
        onNextDay={() => changeDate(1)}
        onOpenCalendar={() => {
          setCalendarMonthIso(currentTrackerDate.slice(0, 7));
          setShowDateCalendarModal(true);
        }}
        nextDayDisabled={currentTrackerDate === getTodayString()}
        sncStressLevel={sncStressLevel}
        onSncStressClick={() => setShowSncPopup(true)}
        bodyBattery={bodyBattery}
        onBatteryClick={() => setShowBatteryModal(true)}
        simulationActive={isSimulationMode}
        onExitSimulation={() => {
          setIsSimulationMode(false);
          setSimulatedLog(null);
        }}
      />

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
      <DailyIndicatorsBar
        calorieStrategyLabel={calorieStrategyShortLabelIt(kentuDailyCalorieStrategy)}
        omega3={totali?.omega3}
        energyAt20Percent={energyAt20Percent}
        onClick={() => setShowSpieInfo(true)}
      />
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
          <div style={{ marginTop: '6px' }}>
            <TodayStrategyBanner
              strategicPlan={strategicPlan}
              currentProfile={dayProfile}
              onSyncProfile={(profile) => {
                if (profile) setDayProfile(profile);
              }}
              onOpenPlanner={() => setShowStrategicPlanner(true)}
              onShiftPlan={(dayKey) => shiftPlanForward(dayKey)}
              onUpdateTime={(dayKey, dayData) => updateDayPlan(dayKey, dayData)}
              onExecute={(plan) => {
                if (!plan || plan.type === 'REST') return;
                const hourDec =
                  plan.hour != null && String(plan.hour).trim() !== ''
                    ? parseFlexibleTimeToDecimal(String(plan.hour))
                    : null;
                const endT =
                  hourDec != null && !Number.isNaN(hourDec) ? hourDec : getCurrentTimeRoundedTo15Min();
                setWorkoutEndTime(endT);
                setWorkoutDurationMin('45');
                const k = Number(plan.kcal);
                setWorkoutKcal(Number.isFinite(k) && k > 0 ? Math.round(k) : 300);
                setWorkoutStrengthDetail('');
                setEditingWorkoutId(null);
                if (plan.type === 'CARDIO') {
                  setWorkoutType('cardio');
                  setWorkoutMuscles([]);
                } else if (plan.type === 'WORKOUT') {
                  setWorkoutType('pesi');
                  setWorkoutMuscles(normalizeMuscleGroupArray(Array.isArray(plan.focus) ? plan.focus : []));
                } else if (plan.type === 'RECOVERY') {
                  setWorkoutType('cardio');
                  setWorkoutMuscles([]);
                }
                setActiveAction('allenamento');
                setIsDrawerOpen(true);
              }}
            />
          </div>
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
                <MainDashboardCharts
                  chartUnit={chartUnit}
                  mainChartData={mainChartData}
                  draggingNode={draggingNode}
                  nodesForEnergySimulation={nodesForEnergySimulation}
                  displayTime={displayTime}
                  finalDotY={finalDotY}
                  isViewingPastDate={isViewingPastDate}
                  currentTime={currentTime}
                  targetKcalChart={targetKcalChart}
                  totalCaloriesTimeline={totalCaloriesTimeline}
                />
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
                  <DailyCoachSection
                    activeLog={activeLog}
                    totali={totali}
                    dynamicDailyKcal={dynamicDailyKcal}
                    userProfile={userProfile}
                    metabolicMapData={metabolicMapData}
                    userTargets={userTargets}
                    metabolicCompassTimeframe={metabolicCompassTimeframe}
                    metabolicCompassDailyHistory={metabolicCompassDailyHistory}
                    energyAt20Percent={energyAt20Percent}
                    kentuDailyCalorieStrategy={kentuDailyCalorieStrategy}
                    aiDayCoach={aiCoachEval}
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
            onDeleteBodyMetrics={handleDeleteBodyMetrics}
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
            mapData={metabolicMapData}
            dailyHistory={metabolicCompassDailyHistory}
            bodyMetricsHistory={bodyMetricsHistory}
            compassScreenActive={activeBottomTab === 'bussola'}
            fullHistory={fullHistory}
            userTargets={userTargets}
            projectionAnchorDate={currentTrackerDate}
            selectedTimeframe={metabolicCompassTimeframe}
            onTimeframeChange={setMetabolicCompassTimeframe}
          />
          <div style={{ width: '100%', marginTop: 14, flexShrink: 0 }}>
            <SleepCoachCompact data={sleepCoach} />
          </div>
        </div>
      )}
      </div>
      )}
      {/* --- CASSETTO AZIONI (sempre montato: visibile da ogni tab bottom) --- */}
      <MenuDrawerShell isDrawerOpen={isDrawerOpen} onClose={closeDrawer}>
        <MainMenuDrawer
          activeAction={activeAction}
          setActiveAction={setActiveAction}
          addEventMenuOrder={addEventMenuOrder}
          commitAddEventMenuOrder={commitAddEventMenuOrder}
          handleAddEventMenuItem={handleAddEventMenuItem}
          processTestoAI={processTestoAI}
          setShowReport={setShowReport}
          closeDrawer={closeDrawer}
          setShowProfile={setShowProfile}
          kentuChatNotificationBadge={kentuChatNotificationBadge}
          calorieTuning={calorieTuning}
          setCalorieTuning={setCalorieTuning}
          onOpenStrategicPlanner={() => setShowStrategicPlanner(true)}
        />

        {/* VISTA CHAT AI */}
        {activeAction === 'ai_chat' && (
          <KentuChatUI
            chatHistory={chatHistory}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatImages={chatImages}
            setChatImages={setChatImages}
            handleChatSubmit={handleChatSubmit}
            currentTrackerDate={currentTrackerDate}
            activeLog={activeLog}
            userTargets={userTargets}
            kentuDailyCalorieStrategy={kentuDailyCalorieStrategy}
            bodyBattery={bodyBattery}
            totali={totali}
            fullHistory={fullHistory}
            buildQuickBriefingSecretPrompt={(payload) =>
              buildQuickBriefingSecretPrompt({ ...payload, strategicPlan })
            }
            buildYesterdayGapSecretPrompt={buildYesterdayGapSecretPrompt}
            buildMealIdeaFromDispensaSecretPrompt={buildMealIdeaFromDispensaSecretPrompt}
            onLogDinnerOption={handleAutoLogDinner}
            onLoadAgenda={handleAutoLogAgenda}
            onMealProposalConfirm={handleMealProposalConfirm}
            onMealProposalCancel={handleMealProposalCancel}
            onMealProposalSwap={handleMealProposalSwap}
            onDailyPlanConfirm={handleDailyPlanConfirm}
            onDailyPlanCancel={handleDailyPlanCancel}
            onGeneratePlanGhostMealDraft={handleGeneratePlanGhostMealDraft}
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
        )}

        {/* VISTA ACQUA */}
        {activeAction === 'acqua' && (
          <WaterActionModal
            onBack={() => setActiveAction(null)}
            drawerWaterTime={drawerWaterTime}
            setDrawerWaterTime={setDrawerWaterTime}
            miniTimelineWaterRef={miniTimelineWaterRef}
            handleMiniTimelineDrag={handleMiniTimelineDrag}
            allNodes={allNodes}
            getTimePositionPercent={getTimePositionPercent}
            decimalToTimeStr={decimalToTimeStr}
            parseTimeStrToDecimal={parseTimeStrToDecimal}
            waterProgress={waterProgress}
            waterIntake={waterIntake}
            dailyWaterGoal={dailyWaterGoal}
            handleAddWater={handleAddWater}
            isSimulationMode={isSimulationMode}
            manualNodes={manualNodes}
            setManualNodes={setManualNodes}
            dailyLog={dailyLog}
            syncDatiFirebase={syncDatiFirebase}
          />
        )}

        {/* VISTA FAST CHARGE - PISOLINO */}
        {activeAction === 'fast_charge_nap' && (
          <FastChargeNapQuickPanel
            onBack={() => setActiveAction(null)}
            drawerFastChargeStart={drawerFastChargeStart}
            setDrawerFastChargeStart={setDrawerFastChargeStart}
            drawerFastChargeEnd={drawerFastChargeEnd}
            setDrawerFastChargeEnd={setDrawerFastChargeEnd}
            decimalToTimeStr={decimalToTimeStr}
            parseTimeStrToDecimal={parseTimeStrToDecimal}
            onSaveNap={() => handleSaveFastCharge('nap')}
          />
        )}

        {/* VISTA FAST CHARGE - MEDITAZIONE */}
        {activeAction === 'fast_charge_meditation' && (
          <FastChargeMeditationQuickPanel
            onBack={() => setActiveAction(null)}
            drawerFastChargeStart={drawerFastChargeStart}
            setDrawerFastChargeStart={setDrawerFastChargeStart}
            drawerFastChargeEnd={drawerFastChargeEnd}
            setDrawerFastChargeEnd={setDrawerFastChargeEnd}
            decimalToTimeStr={decimalToTimeStr}
            parseTimeStrToDecimal={parseTimeStrToDecimal}
            onSaveMeditation={() => handleSaveFastCharge('meditation')}
          />
        )}

        {/* VISTA FAST CHARGE - INTEGRAZIONE */}
        {activeAction === 'fast_charge_supplements' && (
          <FastChargeSupplementsQuickPanel
            onBack={() => setActiveAction(null)}
            drawerFastChargeTime={drawerFastChargeTime}
            setDrawerFastChargeTime={setDrawerFastChargeTime}
            fastChargeSupplementName={fastChargeSupplementName}
            setFastChargeSupplementName={setFastChargeSupplementName}
            decimalToTimeStr={decimalToTimeStr}
            parseTimeStrToDecimal={parseTimeStrToDecimal}
            onSaveSupplements={() => handleSaveFastCharge('supplements')}
          />
        )}

        {/* VISTA ALLENAMENTO */}
        {activeAction === 'allenamento' && (
          <WorkoutView
            onBack={() => setActiveAction(null)}
            workoutType={workoutType}
            setWorkoutType={setWorkoutType}
            workoutStartTime={workoutStartTime}
            workoutEndTime={workoutEndTime}
            setWorkoutEndTime={setWorkoutEndTime}
            workoutDurationMin={workoutDurationMin}
            setWorkoutDurationMin={setWorkoutDurationMin}
            workoutDurationHours={workoutDurationHours}
            miniTimelineActivityRef={miniTimelineActivityRef}
            handleMiniTimelineDrag={handleMiniTimelineDrag}
            allNodes={allNodes}
            getTimePositionPercent={getTimePositionPercent}
            decimalToTimeStr={decimalToTimeStr}
            parseTimeStrToDecimal={parseTimeStrToDecimal}
            workoutMuscles={workoutMuscles}
            setWorkoutMuscles={setWorkoutMuscles}
            editingWorkoutId={editingWorkoutId}
            workoutStrengthDetail={workoutStrengthDetail}
            setWorkoutStrengthDetail={setWorkoutStrengthDetail}
            workoutKcal={workoutKcal}
            setWorkoutKcal={setWorkoutKcal}
            handleSaveWorkout={handleSaveWorkout}
            workoutsLog={workoutsLog}
            removeLogItem={removeLogItem}
          />
        )}

        {/* VISTA PASTO RAPIDO - CON BOTTONI CANONICI */}
        <MealBuilderOverlay
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
          csvFoodDb={csvFoodDb}
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
          currentMealId={mealBuilderCurrentMealId}
          dailyTarget={mealBuilderDailyTarget}
          consumedMacros={mealBuilderConsumedMacros}
          remainingMeals={mealBuilderRemainingMeals}
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

      {recalibrationProposal?.show && recalibrationProposal?.analysis && (() => {
        const ra = recalibrationProposal.analysis;
        const showRecalApply =
          ra.diagnosisType === 'tdee_mismatch' &&
          ra.confidence === 'high' &&
          ra.suggestion?.type !== 'no_change' &&
          Number.isFinite(Number(ra.suggestion?.kcalAdjustment)) &&
          Number(ra.suggestion?.kcalAdjustment) !== 0;
        return (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.86)',
            zIndex: 100060,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#161616',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 18,
              color: '#f8fafc',
            }}
          >
            <h3 style={{ margin: '0 0 12px', color: '#00e5ff', fontSize: '1rem' }}>
              Nuova pesata registrata
            </h3>
            <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '0.8rem' }}>
              Analisi sugli ultimi {ra.daysWindow} giorni
            </p>
            <div
              style={{
                background: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid rgba(0, 229, 255, 0.28)',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 12,
                fontSize: '0.92rem',
                lineHeight: 1.5,
                color: '#f1f5f9',
                fontWeight: 600,
              }}
            >
              {ra.diagnosisMessage || ra.suggestion?.explanation}
            </div>
            {showRecalibrationDetails && (
              <div
                style={{
                  marginBottom: 12,
                  background: '#0f172a',
                  border: '1px solid rgba(148,163,184,0.25)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: '0.78rem',
                  color: '#cbd5e1',
                  lineHeight: 1.45,
                }}
              >
                <div>Bilancio medio: {Math.round(Number(ra.avgKcalBalance) || 0)} kcal/giorno</div>
                <div>
                  Variazione peso: {(Number(ra.weightDelta) >= 0 ? '+' : '')}
                  {(Number(ra.weightDelta) || 0).toFixed(2)} kg
                </div>
                <div>
                  Variazione attesa: {(Number(ra.expectedWeightDelta) >= 0 ? '+' : '')}
                  {(Number(ra.expectedWeightDelta) || 0).toFixed(2)} kg
                </div>
                <div>
                  Scostamento: {(Number(ra.discrepancy) >= 0 ? '+' : '')}
                  {(Number(ra.discrepancy) || 0).toFixed(2)} kg
                </div>
                <div>Affidabilita: {String(ra.confidence || 'n/a')}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  dismissRecalibrationProposal();
                }}
                style={{
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.4)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Mantieni target attuali
              </button>
              {showRecalApply ? (
              <button
                type="button"
                onClick={() => {
                  applyRecalibrationProposal();
                }}
                style={{
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #00e5ff, #38bdf8)',
                  color: '#052236',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Applica correzione ({Number(ra.suggestion?.kcalAdjustment) >= 0 ? '+' : ''}{Math.round(Number(ra.suggestion?.kcalAdjustment) || 0)} kcal)
              </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowRecalibrationDetails((v) => !v)}
                style={{
                  padding: '9px 10px',
                  borderRadius: 10,
                  border: '1px dashed rgba(148,163,184,0.45)',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                }}
              >
                {showRecalibrationDetails ? 'Nascondi dettagli' : 'Vedi dettagli'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      <StrategicPlannerOverlay
        isOpen={showStrategicPlanner}
        onClose={() => setShowStrategicPlanner(false)}
        strategicPlan={strategicPlan}
        isPlannerLoading={isPlannerLoading}
        updateDayPlan={updateDayPlan}
        updateSettings={updateSettings}
        saveCalorieMemory={saveCalorieMemory}
      />
      <TargetSettingsModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        birthDate={birthDate}
        setBirthDate={setBirthDate}
        userTargets={userTargets}
        applyTargetModeUpdate={applyTargetModeUpdate}
        calculateAge={calculateAge}
        calculateSmartTargets={calculateSmartTargets}
        csvInputRef={csvInputRef}
        handleCSVUpload={handleCSVUpload}
        longevityData={longevityData}
        onOpenLongevityStats={() => { setShowProfile(false); setShowLongevityModal(true); }}
        auth={auth}
        saveProfileToFirebase={saveProfileToFirebase}
      />
      <DateCalendarOverlay
        showDateCalendarModal={showDateCalendarModal}
        onClose={() => setShowDateCalendarModal(false)}
        calendarMonthIso={calendarMonthIso}
        onPrevMonth={handlePrevCalendarMonth}
        onNextMonth={handleNextCalendarMonth}
        calendarGridDays={calendarGridDays}
        calendarZoneByDate={calendarZoneByDate}
        currentTrackerDate={currentTrackerDate}
        onSelectDate={handleSelectCalendarDate}
      />
      <ChoiceModalOverlay
        showChoiceModal={showChoiceModal}
        onClose={handleCloseChoiceModal}
        addChoiceView={addChoiceView}
        onBackToMain={() => setAddChoiceView('main')}
        stimulantSubtype={stimulantSubtype}
        setStimulantSubtype={setStimulantSubtype}
        stimulantTime={stimulantTime}
        setStimulantTime={setStimulantTime}
        onSaveStimulant={handleSaveChoiceStimulant}
        addEventMenuOrder={addEventMenuOrder}
        commitAddEventMenuOrder={commitAddEventMenuOrder}
        handleAddEventMenuItem={handleAddEventMenuItem}
      />

      <OverlayHost
        showUnsavedMealWarning={showUnsavedMealWarning}
        setShowUnsavedMealWarning={setShowUnsavedMealWarning}
        finalizeMealBuilderCloseEmpty={finalizeMealBuilderCloseEmpty}
        showWeightModal={showWeightModal}
        setShowWeightModal={setShowWeightModal}
        inputWeightDate={inputWeightDate}
        setInputWeightDate={setInputWeightDate}
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

      <SpieInfoOverlay showSpieInfo={showSpieInfo} onClose={() => setShowSpieInfo(false)} />

      <SleepPromptOverlay
        showSleepPrompt={showSleepPrompt}
        onInsertSleep={handleSleepPromptInsertSleep}
        onUseAverage={handleSleepPromptUseAverage}
        onLater={() => setShowSleepPrompt(false)}
      />

      <SleepModalOverlay
        sleepModal={sleepModal}
        onClose={() => setSleepModal(null)}
        sleepFormBedStr={sleepFormBedStr}
        setSleepFormBedStr={setSleepFormBedStr}
        sleepFormWakeStr={sleepFormWakeStr}
        setSleepFormWakeStr={setSleepFormWakeStr}
        sleepDurationLabel={sleepDurationLabel}
        onSave={handleSaveSleepModal}
      />

      <QuickNodeEditOverlay
        editingQuickNode={editingQuickNode}
        onClose={handleCloseQuickNodeEdit}
        defaultStartValue={quickNodeEditStartTime}
        defaultEndValue={quickNodeEditEndTime}
        onDelete={handleDeleteQuickNodeEdit}
        onSave={handleSaveQuickNodeEdit}
      />

      <TimelineInsertOverlay
        timelineInsertUI={timelineInsertUI}
        onDismiss={() => setTimelineInsertUI(null)}
        decimalToTimeStr={decimalToTimeStr}
        onAddMealAtHour={(hour) => {
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
        onAddWorkoutAtHour={(hour) => {
          setTimelineInsertUI(null);
          setEditingWorkoutId(null);
          setWorkoutEndTime(Math.min(24, hour + 0.5));
          setWorkoutDurationMin('45');
          setWorkoutStrengthDetail('');
          setActiveAction('allenamento');
          setIsDrawerOpen(true);
        }}
        onShowEventsView={() => setTimelineInsertUI((u) => (u ? { ...u, view: 'events' } : u))}
        onBackToMainView={() => setTimelineInsertUI((u) => (u ? { ...u, view: 'main' } : u))}
        onAddWaterAtHour={(hour) => {
          setTimelineInsertUI(null);
          setDrawerWaterTime(hour);
          setActiveAction('acqua');
          setIsDrawerOpen(true);
        }}
        onAddNapAtHour={(hour) => {
          setTimelineInsertUI(null);
          setDrawerFastChargeStart(hour);
          setDrawerFastChargeEnd(Math.min(24, hour + 0.5));
          setActiveAction('fast_charge_nap');
          setIsDrawerOpen(true);
        }}
        onAddMeditationAtHour={(hour) => {
          setTimelineInsertUI(null);
          setDrawerFastChargeStart(hour);
          setDrawerFastChargeEnd(Math.min(24, hour + 0.5));
          setActiveAction('fast_charge_meditation');
          setIsDrawerOpen(true);
        }}
        onAddSupplementsAtHour={(hour) => {
          setTimelineInsertUI(null);
          setDrawerFastChargeTime(hour);
          setActiveAction('fast_charge_supplements');
          setIsDrawerOpen(true);
        }}
      />

      {selectedNodeReport && (
        <TimelineNodeReport
          report={selectedNodeReport}
          activeLog={activeLog}
          displayTime={displayTime}
          currentTime={currentTime}
          onClose={() => setSelectedNodeReport(null)}
          getFoodItemsForMealSlot={getFoodItemsForMealSlot}
          expandedRecipes={expandedRecipes}
          toggleRecipe={toggleRecipe}
          setSelectedFoodForInfo={setSelectedFoodForInfo}
          setInspectedFood={setInspectedFood}
          setEditFoodData={setEditFoodData}
          onEditFromReport={(node) => {
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
              setWorkoutDurationMin(String(Math.max(15, Math.min(600, Math.round(durH * 60)))));
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
            setWorkoutDurationMin(String(Math.max(15, Math.min(600, Math.round(durH * 60)))));
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
          }}
        />
      )}

      {/* MODALE ISPEZIONE E MODIFICA ALIMENTO */}
      {inspectedFood && editFoodData && (
        <FoodInspectorModal
          inspectedFood={inspectedFood}
          editFoodData={editFoodData}
          setEditFoodData={setEditFoodData}
          isAIVerifying={isAIVerifying}
          onVerifyAI={handleVerifyFoodAI}
          onSave={() => {
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
          onCancel={() => { setInspectedFood(null); setEditFoodData(null); }}
        />
      )}

      <ReportModalOverlay
        showReportModal={showReportModal}
        dailyReport={dailyReport}
        dailyReportDisplay={dailyReportDisplay}
        onClose={() => setShowReportModal(false)}
        currentDateObj={currentDateObj}
        setTrendModalMetric={setTrendModalMetric}
      />

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

      <BatteryModalOverlay
        showBatteryModal={showBatteryModal}
        BodyBatteryModalComponent={BodyBatteryModal}
        onClose={() => setShowBatteryModal(false)}
        batteryData={bodyBattery}
      />

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

      <AlcoholPopupOverlay
        showAlcoholPopup={showAlcoholPopup}
        onClose={() => setShowAlcoholPopup(false)}
        alcoholForm={alcoholForm}
        setAlcoholForm={setAlcoholForm}
        manualNodes={manualNodes}
        getTimePositionPercent={getTimePositionPercent}
        getAlcoholBaseMl={getAlcoholBaseMl}
        getAlcoholGlassIcon={getAlcoholGlassIcon}
        handleSaveAlcohol={handleSaveAlcohol}
      />

      {showLongevityModal && longevityData && (
        <HealthspanOverlay
          longevityData={longevityData}
          longevityDays={longevityDays}
          setLongevityDays={setLongevityDays}
          onClose={() => { setShowLongevityModal(false); setExpandedRiskId(null); }}
          onOpenAnalisiTab={() => {
            setShowLongevityModal(false);
            handleBottomNavTabSelect('analisi');
          }}
          longevityEngineScore={longevityEngineScore}
          longevityExplanation={longevityExplanation}
          dailyKcalConsumed={Math.round(Number(totali?.kcal) || 0)}
          dailyKcalTarget={Math.round(Number(dynamicDailyKcal) || Number(userTargets?.kcal) || 2000)}
          userAge={userAge}
          bodyMetricsHistory={bodyMetricsHistory}
          longevityScoreHistory={longevityScoreHistory}
          currentTrackerDate={currentTrackerDate}
          fullHistory={fullHistory}
          userTargets={userTargets}
          userProfile={userProfile}
          onUpdateTDEE={handleUpdateTDEE}
          tdeeHistory={tdeeHistory}
          predictiveCalibration={predictiveCalibration}
          onBalanceCsvImport={handleCSVUpload}
          onQuickWeighInSubmit={handleQuickWeighInFromHistory}
          onDeleteBodyMetrics={handleDeleteBodyMetrics}
          pastDaysStorico={pastDaysStorico}
          weeklyTrendData={weeklyTrendData}
          weeklyMicrosTotals={weeklyMicrosTotals}
          weeklyKcalChartReference={weeklyKcalChartReference}
          longevityModalRiskRows={longevityModalRiskRows}
          expandedRiskId={expandedRiskId}
          setExpandedRiskId={setExpandedRiskId}
        />
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
