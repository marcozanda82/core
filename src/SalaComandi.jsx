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
import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import './styles/SalaComandiInline.css';
import { createPortal } from 'react-dom';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

import { ref, get, set, update, push, onValue, remove } from 'firebase/database';

import {
  calculateConsolidatedAverageScore,
  calculateProjectedAge,
  buildKentuAiVitalsContextParagraph,
  buildKentuAiMetabolicRecompositionContext,
} from './longevityStats';
import { calculateMetabolicVariance } from './metabolicEngine';

import { useFirebase } from './useFirebase';
import { useFoodDb } from './useFoodDb';
import { useCommandTerminal } from './features/commandTerminal/hooks/useCommandTerminal';
import { mapChatWorkoutToNativePayload } from './features/workout/workoutAdapter';
import { callGeminiAPIWithRotation } from './services/aiService';
import { useProfileAndTargets } from './hooks/useProfileAndTargets';
import {
  enrichDbRowWithFoodUnits,
} from './foodUnits';
import { withDefaultUsageStats } from './features/mealBuilder/utils/timeSlotUtils';
import { applyTimelineStripHourToPreviewInputs } from './timelineDragPreview';
import TargetSettingsModal from './components/modals/TargetSettingsModal';
import MainMenuDrawer from './layout/MainMenuDrawer';
import { getTodayPlannedKcal, useStrategicPlanner } from './hooks/useStrategicPlanner';
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
import DialMaintenanceMarker from './components/DialMaintenanceMarker';
import DayPlanWidget from './components/DayPlanWidget';
import DayPlanActionSheet from './components/DayPlanActionSheet';
import usePlannedDayDelta from './hooks/usePlannedDayDelta';
import { buildWorkoutDraftFromPlanBlock } from './features/weeklyBlocks/activityCatalog';
import {
  createBlockActivity,
  createCalorieStrategy,
  createDayBlock,
  createEmptyWeeklyBlockPlan,
  dayBlockToFirebasePayload,
  isUserAssignedDayBlock,
  sanitizeWeeklyBlockPlanFromFirebase,
} from './features/weeklyBlocks/weeklyBlockSchema';
import TimelineNodeReport from './components/TimelineNodeReport';
import MetabolicTimelineSheet from './components/MetabolicTimelineSheet';
import CustomDateTick from './components/CustomDateTick';
import {
  MAIN_BOTTOM_TAB_ORDER,
  PERSISTED_BOTTOM_TAB_IDS,
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
import { takeNextKentuIntroPhrase } from './kentuIntroPhrases';
import {
  getWorkoutActivityTypeDef,
  getWorkoutActivityLogDescription,
  getCognitiveMetForActivity,
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
import { normalizeMealSlotType } from './features/mealBuilder/utils/slotPredictor';
import {
  parseDurationMinutesInput,
  WORKOUT_DURATION_DEFAULT,
  WORKOUT_DURATION_MIN,
  WORKOUT_DURATION_MAX,
} from './utils/durationMinutesInput';
import { writeTodayTrackerLocalCache } from './utils/trackerCacheUtils';
import { workoutActivityRequiresStrengthDetailNote } from './utils/workoutActivityNotes';
import { calculateAge } from './utils/profileAge';
import { stripUndefined } from './utils/firebasePayloadUtils';
import { getCurrentTimeRoundedTo15Min } from './utils/decimalTimeUtils';
import {
  getStrategyKey,
  mealIdFromCanonical,
  normalizeAiMealTypeToStorageId,
} from './utils/mealTypeNormalization';
import { predictMealTypeFromHistory } from './utils/mealTypePrediction';
import { buildComputedMealNodes } from './utils/mealNodeAggregation';
import {
  buildMealProposalConfirmMessage,
  buildMealProposalLogEntries,
  buildMealUpdateConfirmMessage,
  replaceMealSlotInLog,
  sumMealProposalMacroTotals,
} from './utils/mealProposalBuilders';
import {
  buildDailyPlanGhostLogEntries,
  collectRealMealTitlesFromLog,
  dedupeDailyPlanGhostEntriesById,
  mergeDiaryLogWithGhostEntries,
} from './utils/dailyPlanGhostUtils';
import {
  isRestPlanBlockForSwap,
  buildUserRestDayBlock,
  relocatePlanBlockToDate,
} from './features/weeklyBlocks/planBlockSwapUtils';
import {
  NEURAL_RESET_PATTERNS,
  ZEN_SESSION_DURATION_OPTIONS,
  getNeuralResetZenStep,
  getZenBreathAudioFade,
} from './drawers/vistas/neuralResetZenModel';
import AppBottomNavigation from './layout/AppBottomNavigation';
import AppHeader from './layout/AppHeader';
import MetabolicMonitorCard from './components/MetabolicMonitorCard';
import EnergyArcWidget from './components/EnergyArcWidget';
import DiaryDetailsSheet from './components/DiaryDetailsSheet';
import EnergyBalanceSheet from './components/EnergyBalanceSheet';
import FatDetailsSheet from './components/FatDetailsSheet';
import CarbsDetailsSheet from './components/CarbsDetailsSheet';
import ProteinDetailsSheet from './components/ProteinDetailsSheet';
import MineralsDetailsSheet from './components/MineralsDetailsSheet';
import VitaminsDetailsSheet from './components/VitaminsDetailsSheet';
import HomeNutrientStrip from './components/HomeNutrientStrip';
import { buildFatDetailsData } from './features/nutrition/buildFatDetailsData';
import { buildCarbsDetailsData } from './features/nutrition/buildCarbsDetailsData';
import { buildProteinDetailsData } from './features/nutrition/buildProteinDetailsData';
import { buildMineralsDetailsData } from './features/nutrition/buildMineralsDetailsData';
import WeeklyMetabolicIndicator from './components/WeeklyMetabolicIndicator';
import MenuDrawerShell from './features/salaComandi/MenuDrawerShell';
import OverlayHost from './features/salaComandi/OverlayHost';
import ChoiceModalOverlay from './features/salaComandi/overlays/ChoiceModalOverlay';
import DateCalendarOverlay from './features/salaComandi/overlays/DateCalendarOverlay';
import useMetabolicPhaseState from './features/salaComandi/hooks/useMetabolicPhaseState';
import useWorkoutManager from './hooks/salaComandi/useWorkoutManager';
import useKentuMealHandlers from './hooks/salaComandi/useKentuMealHandlers';
import useDiaryFirebaseSync from './hooks/salaComandi/useDiaryFirebaseSync';
import useTimelineDiaryActions from './hooks/salaComandi/useTimelineDiaryActions';
import useSleepEngine from './hooks/useSleepEngine';
import ReportModalOverlay from './features/salaComandi/overlays/ReportModalOverlay';
import AlcoholPopupOverlay from './features/salaComandi/overlays/AlcoholPopupOverlay';
import SleepModalOverlay from './features/salaComandi/overlays/SleepModalOverlay';
import SleepPromptOverlay from './features/salaComandi/overlays/SleepPromptOverlay';
import QuickNodeEditOverlay from './features/salaComandi/overlays/QuickNodeEditOverlay';
import WaterActionModal from './components/modals/WaterActionModal';
import KentuLazySectionFallback from './components/KentuLazySectionFallback';
import SalaComandiLoginScreen from './components/auth/SalaComandiLoginScreen';
import { createMealPieCustomizedLabel, MealPieActiveShape } from './components/charts/mealPieChartRenderers';
import {
  FastChargeNapQuickPanel,
  FastChargeMeditationQuickPanel,
  FastChargeSupplementsQuickPanel,
} from './components/modals/FastChargeQuickActionPanels';
import TimelineInsertOverlay from './components/modals/TimelineInsertOverlay';
import FoodInspectorModal from './components/modals/FoodInspectorModal';
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
import {
  resolveMetabolicAccentColor,
  collectMetabolicTimelineMeals,
  buildMetabolicTimelineGradientStops,
  buildMetabolicFastingSnapshot,
  hoursFastedAtTimelineHour,
  resolveMetabolicColorForHoursFasted,
  resolveMealTimeFromLogItem,
  normalizeMealHour,
} from './features/salaComandi/utils/metabolicPhaseColors';
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
  normalizeMealFoodsArray,
  buildSmartMealPhysioContextSnippet,
  parseKentuInvisibleCmd,
  normalizeCalorieStrategyTarget,
  applyCalorieStrategyToProfileKcal,
  generateLocalNutritionalAudit,
  generateLocalTrainingAdvice,
  generateLocalMonthlyAudit,
  generateLocalHabitScanner,
  getDynamicMealTargets,
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

export { calculateAge } from './utils/profileAge';

const MainDashboardCharts = lazy(() => import('./features/charts/MainDashboardCharts'));
const TimelineNodi = lazy(() => import('./TimelineNodi'));
const ChartModal = lazy(() => import('./ChartModal'));
const FullscreenGraphView = lazy(() => import('./features/charts/FullscreenGraphView'));
const KentuChatUI = lazy(() => import('./features/chat/KentuChatUI'));
const LongevityView = lazy(() => import('./LongevityView'));
const MetabolicUnifiedView = lazy(() => import('./MetabolicUnifiedView'));
const WeeklyPlanning = lazy(() => import('./components/WeeklyPlanning'));
const WeeklyBuilder = lazy(() => import('./features/weeklyBlocks/components/WeeklyBuilder'));
const WorkoutView = lazy(() => import('./drawers/vistas/WorkoutView'));
const ApiDiary = lazy(() => import('./components/ApiDiary'));
const StrategicPlannerOverlay = lazy(() => import('./features/planning/StrategicPlannerOverlay'));
const HealthspanOverlay = lazy(() => import('./features/longevity/HealthspanOverlay'));
const TacticalCoach = lazy(() => import('./features/coach/TacticalCoach'));
const BiochemicalDiagnostics = lazy(() => import('./features/nutrition/BiochemicalDiagnostics'));
const FastMealLogger = lazy(() => import('./features/mealBuilder/FastMealLogger'));

export default function SalaComandi() {
  const navigate = useNavigate();
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
  const [showFastLogger, setShowFastLogger] = useState(false);
  const [mealToEdit, setMealToEdit] = useState(null);
  const [fastLoggerInitialSlot, setFastLoggerInitialSlot] = useState(null);
  /** Ghost meal in conferma: salvataggio = pasto reale + rimozione ghost dal log. */
  const [pendingGhostMealId, setPendingGhostMealId] = useState(null);
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
    if (!PERSISTED_BOTTOM_TAB_IDS.includes(activeBottomTab)) return;
    try {
      localStorage.setItem(ACTIVE_BOTTOM_TAB_LS_KEY, activeBottomTab);
    } catch {
      /* ignore */
    }
  }, [activeBottomTab]);

  useEffect(() => {
    if (!PERSISTED_BOTTOM_TAB_IDS.includes(activeBottomTab)) {
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
      if (el.closest('.chart-scroll-container') || el.closest('.mini-timeline-hitbox') || el.closest('.home-oggi-macros')) {
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
      if (tabId === 'pianifica') {
        setActiveBottomTab('pianifica');
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
    [activeBottomTab, navigate]
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
  const closeDrawerRef = useRef(null);
  useEffect(() => { isDrawerOpenRef.current = isDrawerOpen; }, [isDrawerOpen]);
  useEffect(() => { activeActionRef.current = activeAction; }, [activeAction]);
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
  const { masterDb: csvFoodDb, isLoading: csvFoodDbLoading } = useFoodDb();
  const [dailyLog, setDailyLog] = useState([]);
  const dailyLogRef = useRef(dailyLog);
  dailyLogRef.current = dailyLog;
  const activeLog = isSimulationMode && simulatedLog != null ? simulatedLog : dailyLog;

  // STATI MODULI (Pasti, Acqua, Allenamento, Zen)
  const [mealType, setMealType] = useState('cena');
  const [mealPlannerGhostNote, setMealPlannerGhostNote] = useState('');
  const [coachPrefsTick, setCoachPrefsTick] = useState(0);
  const [hasNewInsight, setHasNewInsight] = useState(false);
  const [aiCoachBulbPulseCycles, setAiCoachBulbPulseCycles] = useState(0);
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
  const [selectedFoodForCard, setSelectedFoodForCard] = useState(null);
  const [inspectedFood, setInspectedFood] = useState(null);
  const [editFoodData, setEditFoodData] = useState(null);
  const [isAIVerifying, setIsAIVerifying] = useState(false);
  const callGeminiAPIWithRotationRef = useRef(null);

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
  const [remotePlanning, setRemotePlanning] = useState(null);

  /** Piano settimanale: goal, kcal settimanale, giorni `{ [dateKey]: { type, kcalTarget } }`. Pasti non collegati. */
  const [weeklyPlan, setWeeklyPlan] = useState(createInitialWeeklyPlan);
  const weeklyPlanningRemoteSigRef = useRef('');
  const weeklyPlanningListenerReadyRef = useRef(false);
  const weeklyPlanRef = useRef(weeklyPlan);
  weeklyPlanRef.current = weeklyPlan;

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
  const [currentDateObj, setCurrentDateObj] = useState(() => new Date());
  const currentTrackerDate = useMemo(() => {
    const offset = currentDateObj.getTimezoneOffset() * 60000;
    return new Date(currentDateObj.getTime() - offset).toISOString().slice(0, 10);
  }, [currentDateObj]);

  const nutritionGoalsValue = useMemo(
    () => buildNutritionGoalsSnapshot(userProfile, userTargets),
    [userProfile, userTargets]
  );

  const { strategicPlan, isPlannerLoading, updateDayPlan, updateSettings, saveCalorieMemory, shiftPlanForward } = useStrategicPlanner(
    db,
    userProfile?.uid || user?.uid
  );
  const plannedWorkoutKcal = useMemo(
    () => getTodayPlannedKcal(strategicPlan, currentTrackerDate),
    [strategicPlan, currentTrackerDate]
  );

  const effectiveTargetsForCurrentDate = useMemo(
    () =>
      resolveTargetConfigForDate({
        targets: userTargets,
        date: currentTrackerDate || getTodayString(),
        todayDate: getTodayString(),
      }),
    [userTargets, currentTrackerDate]
  );

  const userProfileKcalBase = useMemo(() => {
    const effective = Number(effectiveTargetsForCurrentDate?.kcal);
    if (Number.isFinite(effective) && effective > 0) return Math.round(effective);
    const raw = Number(userTargets?.kcal);
    if (Number.isFinite(raw) && raw > 0) return Math.round(raw);
    return null;
  }, [effectiveTargetsForCurrentDate?.kcal, userTargets?.kcal]);

  const {
    plannedDelta,
    hasPlannedBlock,
    plannedTargetKcal,
    todayPlanBlock,
    dayPlanBlock,
  } = usePlannedDayDelta({
    db,
    user,
    dateKey: currentTrackerDate || getTodayString(),
    profileKcal: userProfileKcalBase,
    isSimulationMode,
  });

  const [isPlanActionSheetOpen, setIsPlanActionSheetOpen] = useState(false);

  const [editingMealId, setEditingMealId] = useState(null);

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

  // AI ASSISTANT
  const [showBiochemicalDiagnostics, setShowBiochemicalDiagnostics] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [biochemicalDetailModal, setBiochemicalDetailModal] = useState(null);
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
  const kentuAgendaAwaitingRef = useRef(false);
  /** Flusso chat: conferma orario allenamento prima del log. */
  const pendingWorkoutFlowRef = useRef(null);
  /** Contesto per prompt AI: allenamento programmato nel futuro (no pasti "adesso"). */
  const scheduledWorkoutContextRef = useRef(null);
  const csvInputRef = useRef(null);
  const [startupSafetyBypass, setStartupSafetyBypass] = useState(false);

  useEffect(() => {
    setStartupSafetyBypass(false);
    const t = window.setTimeout(() => setStartupSafetyBypass(true), 5000);
    return () => window.clearTimeout(t);
  }, [userUid]);

  const [fullStorico, setFullStorico] = useState(null);
  const [fullHistory, setFullHistory] = useState({});
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
  const [showMetabolicSheet, setShowMetabolicSheet] = useState(false);
  const [showDiarySheet, setShowDiarySheet] = useState(false);
  const [showEnergySheet, setShowEnergySheet] = useState(false);
  useEffect(() => {
    console.log('Stato diario:', showDiarySheet);
  }, [showDiarySheet]);
  const [showFatSheet, setShowFatSheet] = useState(false);
  const [showCarbsSheet, setShowCarbsSheet] = useState(false);
  const [showProteinSheet, setShowProteinSheet] = useState(false);
  const [showMineralsSheet, setShowMineralsSheet] = useState(false);
  const [showVitaminsSheet, setShowVitaminsSheet] = useState(false);
  const [showDateCalendarModal, setShowDateCalendarModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRecalibrationDetails, setShowRecalibrationDetails] = useState(false);
  const [trendModalMetric, setTrendModalMetric] = useState(null);
  const [trendDays, setTrendDays] = useState(30);
  const [reportViewedDates, setReportViewedDates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reportViewedDates')) || {}; } catch { return {}; }
  });
  const [reportPeriod, setReportPeriod] = useState('7');
  const [calendarMonthIso, setCalendarMonthIso] = useState(() => getTodayString().slice(0, 7));

  useEffect(() => {
    if (!recalibrationProposal?.show) setShowRecalibrationDetails(false);
  }, [recalibrationProposal?.show]);

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

  const [metabolicCompassTimeframe, setMetabolicCompassTimeframe] = useState('1d');
  const metabolicMapData = useMetabolicMapEngine({
    dailyHistory: metabolicCompassDailyHistory,
    bodyMetricsHistory,
    fullHistory,
    userTargets,
    projectionAnchorDate: currentTrackerDate,
    selectedTimeframe: metabolicCompassTimeframe,
    currentLog: activeLog,
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
  const timelineContainerRef = useRef(null);
  const chartScrollRef = useRef(null);
  const initialPinchDistance = useRef(null);
  const initialZoomLevel = useRef(1);
  const chartTouchTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressMoveCleanupRef = useRef(null);
  const pendingClickRef = useRef(null);
  const miniTimelineActivityRef = useRef(null);
  const miniTimelineWaterRef = useRef(null);
  const [drawerWaterTime, setDrawerWaterTime] = useState(12);
  const [drawerFastChargeStart, setDrawerFastChargeStart] = useState(12);
  const [drawerFastChargeEnd, setDrawerFastChargeEnd] = useState(12.5);
  const [drawerFastChargeTime, setDrawerFastChargeTime] = useState(12);
  const [fastChargeSupplementName, setFastChargeSupplementName] = useState('');
  const currentTrackerDateRef = useRef(currentTrackerDate);
  useEffect(() => { currentTrackerDateRef.current = currentTrackerDate; }, [currentTrackerDate]);

  const { syncDatiFirebase, isInitialLoadComplete } = useDiaryFirebaseSync({
    db,
    auth,
    user,
    currentTrackerDate,
    currentTrackerDateRef,
    isSimulationMode,
    setDailyLog,
    setManualNodes,
    fullHistory,
    setFullHistory,
    fullStorico,
    setFullStorico,
    setActiveAction,
    setUserProfile,
    setBirthDate,
    setUserTargets,
    setUserModel,
    setLastCalibrationWeek,
    setFoodDb,
    setWeeklyPlan,
    weeklyPlanningListenerReadyRef,
    weeklyPlanningRemoteSigRef,
  });

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
        scrollWidth - CHART_AXIS_GUTTER_LEFT_PX - CHART_AXIS_GUTTER_RIGHT_PX;
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
        scrollWidth - CHART_AXIS_GUTTER_LEFT_PX - CHART_AXIS_GUTTER_RIGHT_PX,
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

  const computedMealNodes = useMemo(
    () => buildComputedMealNodes(activeLog, fullHistory, currentTrackerDate),
    [activeLog, fullHistory, currentTrackerDate],
  );

  const ghostMealTimelineNodes = useMemo(() => {
    return (activeLog || [])
      .filter((e) => e && e.type === 'ghost_meal')
      .map((e) => {
        let t = e.mealTime;
        if (typeof t !== 'number' || Number.isNaN(t)) {
          const parsed = parseFlexibleTimeToDecimal(String(e.time || e.mealTime || '12:00'));
          t = parsed != null ? parsed : 12;
        }
        t = normalizeMealHour(t) ?? t;
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
    closeDrawerRef.current = closeDrawer;
  });

  // Motore biochimico
  const baseKcal = (effectiveTargetsForCurrentDate.kcal ?? STRATEGY_PROFILES[dayProfile].kcal) + calorieTuning;
  const { totali, obiettiviPasti } = useBiochimico(activeLog, baseKcal);
  const realFatData = useMemo(
    () => buildFatDetailsData(activeLog, userTargets),
    [activeLog, userTargets],
  );
  const realCarbsData = useMemo(
    () => buildCarbsDetailsData(activeLog, userTargets),
    [activeLog, userTargets],
  );
  const realProteinData = useMemo(
    () => buildProteinDetailsData(activeLog, userTargets),
    [activeLog, userTargets],
  );
  const realMineralsData = useMemo(
    () => buildMineralsDetailsData(activeLog, userTargets),
    [activeLog, userTargets],
  );
  const targetKcal = baseKcal + (totali?.workout ?? 0);

  const todayMicrosForDiagnostics = useMemo(
    () => ({
      sodium: Number(totali?.na) || 0,
      potassium: Number(totali?.k) || 0,
      omega3: Number(totali?.omega3) || 0,
      omega6: Number(totali?.omega6) || 0,
    }),
    [totali],
  );

  const aminoAcidProfileForDiagnostics = useMemo(
    () => ({
      leu: Number(totali?.leu) || 0,
      iso: Number(totali?.iso) || 0,
      val: Number(totali?.val) || 0,
      lys: Number(totali?.lys) || 0,
      met: Number(totali?.met) || 0,
      phe: Number(totali?.phe) || 0,
      thr: Number(totali?.thr) || 0,
      trp: Number(totali?.trp) || 0,
      his: Number(totali?.his) || 0,
      proteinGrams: Number(totali?.prot) || 0,
    }),
    [totali],
  );

  const weeklyVitaminHistoryForDiagnostics = useMemo(() => {
    const out = [];
    const seen = new Set();
    const parseDateFromKey = (key) => {
      const raw = String(key || '').trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      if (raw.startsWith('trackerStorico_')) {
        const d = raw.slice('trackerStorico_'.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      }
      return null;
    };
    const getNodeLog = (node) => {
      if (!node || typeof node !== 'object') return [];
      if (Array.isArray(node)) return node;
      if (Array.isArray(node.dailyLog)) return node.dailyLog;
      if (Array.isArray(node.log)) return node.log;
      if (Array.isArray(node.items)) return node.items;
      return [];
    };

    const pushDay = (dateKey, totalsLike) => {
      const dk = String(dateKey || '').trim();
      if (!dk || seen.has(dk)) return;
      seen.add(dk);
      out.push({
        date: dk,
        vitA: Number(totalsLike?.vitA) || 0,
        vitD: Number(totalsLike?.vitD) || 0,
        vitE: Number(totalsLike?.vitE) || 0,
        vitK: Number(totalsLike?.vitK) || 0,
        vitB12: Number(totalsLike?.vitB12) || 0,
      });
    };

    const todayKey = currentTrackerDate || getTodayString();
    pushDay(todayKey, totali || {});

    Object.entries(fullHistory || {})
      .map(([key, node]) => ({ date: parseDateFromKey(key), node }))
      .filter((x) => !!x.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .forEach(({ date, node }) => {
        if (out.length >= 7) return;
        if (seen.has(date)) return;
        const log = getNodeLog(node);
        const dayTotals = computeTotali(log || []);
        pushDay(date, dayTotals || {});
      });

    return out.slice(0, 7);
  }, [fullHistory, currentTrackerDate, totali]);

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

  function closeDrawer() {
    setEditingMealId(null);
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

  const predictMealType = useCallback(
    (timeDecimal) => predictMealTypeFromHistory(
      fullStorico,
      timeDecimal,
      getCurrentTimeRoundedTo15Min(),
    ),
    [fullStorico],
  );

  const parseTimeStrToDecimal = (value) => {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length === 0) return 12;
    const formatted = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2, 4) : digits;
    const [hh, mm] = formatted.includes(':') ? formatted.split(':') : [formatted.slice(0, 2) || '0', formatted.slice(2) || '0'];
    const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
    return h + m / 60;
  };

  const {
    workoutPlanDraft,
    setWorkoutPlanDraft,
    workoutType,
    setWorkoutType,
    workoutKcal,
    setWorkoutKcal,
    workoutEndTime,
    setWorkoutEndTime,
    workoutDurationMin,
    setWorkoutDurationMin,
    workoutStrengthDetail,
    setWorkoutStrengthDetail,
    workoutMuscles,
    setWorkoutMuscles,
    editingWorkoutId,
    setEditingWorkoutId,
    workoutDurationHours,
    workoutStartTime,
    openWorkoutFromTodayPlan,
    openWorkoutEditorFromLogItem,
    handleStartWorkoutSession,
    clearWorkoutPlanDraft,
    skipTodayPlanSession,
    handlePostponeWorkout,
    handleSaveWorkout,
    commitAddWorkoutCommand,
  } = useWorkoutManager({
    user,
    db,
    currentTrackerDate,
    isSimulationMode,
    todayPlanBlock,
    userProfileKcalBase,
    dailyLog,
    manualNodes,
    setDailyLog,
    setManualNodes,
    setSimulatedLog,
    syncDatiFirebase,
    manualNodesRef,
    closeDrawer,
    setActiveAction,
    setIsDrawerOpen,
    setIsPlanActionSheetOpen,
    setShowDiarySheet,
    parseFlexibleTimeToDecimal,
  });

  const {
    historyStack,
    historyIndex,
    showUndoToast,
    pushTimelineUndoSnapshot,
    draggingNode,
    setDraggingNode,
    dragOffsetY,
    dragOffsetYRef,
    dragLiveTime,
    touchingNodeId,
    setTouchingNodeId,
    getFoodItemsForMealSlot,
    updateMealTime,
    onTimelineStripDragOutsideDelete,
    handleUndo,
    handleRedo,
    handleFastLoggerSave,
    removeLogItem,
    handleMiniTimelineDrag,
    startNodeDrag,
    releaseNodePointer,
    handleCloseQuickNodeEdit,
    handleDeleteQuickNodeEdit,
    handleSaveQuickNodeEdit,
    quickNodeEditStartTime,
    quickNodeEditEndTime,
    ghostProgramDeleteModal,
    setGhostProgramDeleteModal,
    programmingRemovedToast,
    handleConfirmGhostDeleteSingle,
    handleConfirmGhostDeleteAll,
  } = useTimelineDiaryActions({
    dailyLog,
    manualNodes,
    simulatedLog,
    activeLog,
    isSimulationMode,
    isInitialLoadComplete,
    dailyLogRef,
    manualNodesRef,
    syncDatiFirebase,
    setDailyLog,
    setManualNodes,
    setSimulatedLog,
    setMealToEdit,
    setEditingMealId,
    setFastLoggerInitialSlot,
    setPendingGhostMealId,
    setShowFastLogger,
    editingQuickNode,
    setEditingQuickNode,
    parseFlexibleTimeToDecimal,
    parseTimeStrToDecimal,
    decimalToTimeStr,
    pendingGhostMealId,
    timelineContainerRef,
    longPressTimerRef,
    longPressMoveCleanupRef,
  });

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

  const loadMealToConstructor = useCallback((mTypeOrId) => {
    const log = isSimulationMode ? (simulatedLog ?? dailyLog ?? []) : (dailyLog ?? []);
    let items = getFoodItemsForMealSlot(log, mTypeOrId);

    if (items.length === 0 && mTypeOrId != null) {
      const canonical = toCanonicalMealType(String(mTypeOrId).split('_')[0]);
      const equivalents = getEquivalentMealTypes(canonical);
      items = log.filter(
        (item) =>
          (item.type === 'food' || item.type === 'recipe') &&
          equivalents.includes(item.mealType)
      );
    }

    const draftItems = items.map((f) => {
      const weight = Number(f.qta ?? f.weight) || 100;
      const dbKey = f.foodDbKey;
      const dbRow = dbKey && foodDb?.[dbKey] ? foodDb[dbKey] : null;
      const row = dbRow || {
        desc: f.desc || f.name,
        kcal: Number(f.kcal ?? f.cal) || 0,
        prot: Number(f.prot) || 0,
        carb: Number(f.carb) || 0,
        fatTotal: Number(f.fatTotal ?? f.fat) || 0,
      };
      return {
        ...f,
        type: f.type === 'recipe' ? 'recipe' : 'food',
        foodDbKey: dbKey,
        row,
        units: row.units ?? f.units,
        defaultUnit: row.defaultUnit ?? f.defaultUnit,
        selectedUnit: f.selectedUnit || 'g',
        multiplier: Number(f.multiplier) || weight,
        qta: weight,
        weight,
        kcal: Number(f.kcal ?? f.cal) || 0,
        cal: Number(f.cal ?? f.kcal) || 0,
        prot: Number(f.prot) || 0,
        carb: Number(f.carb) || 0,
        fat: Number(f.fatTotal ?? f.fat) || 0,
        fatTotal: Number(f.fatTotal ?? f.fat) || 0,
      };
    });

    setMealToEdit(draftItems.length > 0 ? draftItems : null);
    setEditingMealId(mTypeOrId != null ? String(mTypeOrId) : null);
    setPendingGhostMealId(null);
    setFastLoggerInitialSlot(
      mTypeOrId != null
        ? toCanonicalMealType(String(mTypeOrId).split('_')[0])
        : draftItems[0]?.mealType
          ? toCanonicalMealType(String(draftItems[0].mealType).split('_')[0])
          : null
    );
    setShowFastLogger(true);
  }, [
    isSimulationMode,
    simulatedLog,
    dailyLog,
    getFoodItemsForMealSlot,
    foodDb,
    toCanonicalMealType,
    getEquivalentMealTypes,
  ]);

  const closeFastLogger = useCallback(() => {
    setShowFastLogger(false);
    setMealToEdit(null);
    setEditingMealId(null);
    setFastLoggerInitialSlot(null);
    setPendingGhostMealId(null);
  }, []);

  const openFastLoggerNew = useCallback(() => {
    setMealToEdit(null);
    setEditingMealId(null);
    setFastLoggerInitialSlot(null);
    setPendingGhostMealId(null);
    setShowFastLogger(true);
  }, []);

  function handleAddEventMenuItem(itemId, source) {
    const fromModal = source === 'modal';
    switch (itemId) {
      case 'meal': {
        if (fromModal) setShowChoiceModal(false);
        if (isDrawerOpen) closeDrawer();
        openFastLoggerNew();
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
        closeDrawer();
        setPlanningWizardHydrateNonce((n) => n + 1);
        setPlanningWizardOverlayOpen(true);
        break;
      case 'diary':
        if (fromModal) setShowChoiceModal(false);
        closeDrawer();
        setShowDiarySheet(true);
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

  /** Normalizza righe diario / ghost → payload Smart Row per FastMealLogger. */
  const buildDraftPrefillItems = useCallback(
    (rawItems, mealSlotCanon) => {
      const slot = mealSlotCanon
        ? toCanonicalMealType(String(mealSlotCanon).split('_')[0])
        : null;
      return (rawItems || []).map((f) => {
        const desc = String(f.desc || f.name || '').trim();
        const weight = Number(f.qta ?? f.weight ?? f.qty) || 100;
        const dbKey =
          f.foodDbKey ??
          f.dbKey ??
          (desc ? findBestFoodMatch(desc, foodDb) : null);
        const dbRow = dbKey && foodDb?.[dbKey] ? foodDb[dbKey] : null;
        const row = dbRow || {
          desc: desc || f.name,
          kcal: Number(f.kcal ?? f.cal) || 0,
          prot: Number(f.prot) || 0,
          carb: Number(f.carb) || 0,
          fatTotal: Number(f.fatTotal ?? f.fat) || 0,
        };
        const fromDb =
          dbKey && desc
            ? estraiDatiFoodDb(desc, weight, slot || 'pranzo', dbKey)
            : null;
        return {
          ...f,
          type: f.type === 'recipe' ? 'recipe' : 'food',
          desc: desc || f.name,
          name: desc || f.name,
          foodDbKey: dbKey,
          row,
          units: row.units ?? f.units,
          defaultUnit: row.defaultUnit ?? f.defaultUnit,
          selectedUnit: f.selectedUnit || 'g',
          multiplier: Number(f.multiplier) || weight,
          qta: weight,
          weight,
          mealType: slot || f.mealType,
          kcal: Number(fromDb?.kcal ?? f.kcal ?? f.cal) || 0,
          cal: Number(fromDb?.cal ?? fromDb?.kcal ?? f.cal ?? f.kcal) || 0,
          prot: Number(fromDb?.prot ?? f.prot) || 0,
          carb: Number(fromDb?.carb ?? f.carb) || 0,
          fat: Number(fromDb?.fatTotal ?? fromDb?.fat ?? f.fatTotal ?? f.fat) || 0,
          fatTotal: Number(fromDb?.fatTotal ?? fromDb?.fat ?? f.fatTotal ?? f.fat) || 0,
        };
      });
    },
    [foodDb, estraiDatiFoodDb, toCanonicalMealType]
  );

  /**
   * Proposal items (nome, qty, est*, dbKey, matchedKey) → righe `food`/`recipe` per il diario.
   * Usato da chat add_food e da espansione ghost timeline → costruttore pasto.
   */
  const mapProposalItemsToDiaryFoods = useCallback(
    (addFoodItems, mealDecFood, explicitMealType = null, forcedMealSlot = null) => {
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return [];
      const canonicalMeal =
        toCanonicalMealType(String(explicitMealType || '').split('_')[0])
        || predictMealType(mealDecFood);
      const batchMealType = forcedMealSlot?.mealType
        || getGhostMealType(canonicalMeal, dailyLogRef.current || []);
      const mealDec = forcedMealSlot?.mealTime ?? mealDecFood;
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
            const dati = estraiDatiFoodDb(name, qty, batchMealType, matchedKey);
            const isRecipe = dati.type === 'recipe';
            return {
              ...dati,
              id: dati.id || `ai_${batchIdFood}_${index}`,
              mealType: batchMealType,
              mealTime: mealDec,
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
          const baseEst = estraiDatiFoodDb(name, qty, batchMealType);
          return {
            ...baseEst,
            id: `ai_food_${batchIdFood}_${index}`,
            type: 'food',
            mealType: batchMealType,
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
            mealTime: mealDec,
            batchId: batchIdFood,
            isEstimated: true,
          };
        })
        .filter(Boolean);
    },
    [predictMealType, getGhostMealType, foodDb, estraiDatiFoodDb, getAverageEstimate, toCanonicalMealType]
  );

  /** Apre FastMealLogger precompilato da ghost_meal (timeline / modale). */
  const openGhostMealEditorFromTimelineNode = useCallback(
    (node) => {
      if (!node || node.type !== 'ghost_meal') return;
      setSelectedNodeReport(null);

      const log = isSimulationMode ? (simulatedLog ?? dailyLog ?? []) : (dailyLog ?? []);
      const logEntry =
        node.id != null
          ? log.find(
              (e) =>
                e?.type === 'ghost_meal' &&
                e?.id != null &&
                String(e.id) === String(node.id)
            )
          : null;
      const src = logEntry || node;

      const canonicalFoods = normalizeGhostFoodsForTimelineNode(src);
      const mealSlot =
        toCanonicalMealType(String(src.mealType || node.mealType || 'pranzo').split('_')[0]) ||
        'pranzo';

      const draftItems = buildDraftPrefillItems(
        canonicalFoods.map((f) => ({
          type: 'food',
          name: f.name,
          desc: f.name,
          qta: f.qty,
          weight: f.qty,
          dbKey: f.dbKey,
          kcal: f.kcal,
          prot: f.prot,
          carb: f.carb,
          fat: f.fat,
          mealType: mealSlot,
        })),
        mealSlot
      );

      setMealToEdit(draftItems.length > 0 ? draftItems : null);
      setEditingMealId(null);
      setPendingGhostMealId(src.id ?? node.id ?? null);
      setFastLoggerInitialSlot(mealSlot);
      setShowFastLogger(true);
    },
    [
      isSimulationMode,
      simulatedLog,
      dailyLog,
      buildDraftPrefillItems,
      toCanonicalMealType,
    ]
  );

  /** Salvataggio pasto da payload add_food / pendingHabit; items possono includere matchedKey (abitudine). */
  const commitAddFoodChatPayload = useCallback(
    (payload) => {
      const {
        timeString: oraStringFood,
        mealDec: mealDecFood,
        items: addFoodItems,
        mealType: targetMealType,
      } = payload || {};
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return null;
      const alimentiProcessatiFood = mapProposalItemsToDiaryFoods(
        addFoodItems,
        mealDecFood,
        targetMealType,
      );
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
        setSimulatedLog((prev) => [...(prev || []), ...alimentiProcessatiFood]);
      } else {
        setDailyLog((prev) => {
          const nuovoLogFood = [...(prev || []), ...alimentiProcessatiFood];
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

  /** Sovrascrive un nodo pasto esistente (UPDATE_LOGGED_MEAL) invece di appendere nuove voci. */
  const commitUpdateMealChatPayload = useCallback(
    (payload) => {
      const {
        targetNodeId,
        timeString: oraStringFood,
        mealDec: mealDecFood,
        items: addFoodItems,
      } = payload || {};
      const slotId = String(targetNodeId || '').trim();
      if (!slotId || !Array.isArray(addFoodItems) || addFoodItems.length === 0) return null;

      const logSnap = dailyLogRef.current || [];
      const existing = getFoodItemsForMealSlot(logSnap, slotId);
      if (!existing.length) return null;

      const forcedMealSlot = {
        mealType: existing[0]?.mealType,
        mealTime: typeof existing[0]?.mealTime === 'number' && !Number.isNaN(existing[0].mealTime)
          ? existing[0].mealTime
          : mealDecFood,
      };
      const alimentiProcessatiFood = mapProposalItemsToDiaryFoods(
        addFoodItems,
        forcedMealSlot.mealTime,
        toCanonicalMealType(String(forcedMealSlot.mealType || '').split('_')[0]),
        forcedMealSlot,
      );
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
      const confirmTime = oraStringFood || decimalToTimeStr(forcedMealSlot.mealTime);
      const testoRispostaFood = buildMealUpdateConfirmMessage(confirmTime, {
        kcal: totKcal,
        prot: totPro,
        carbo: totCar,
        fat: totFat,
      });

      if (isSimulationMode) {
        setSimulatedLog((prev) => replaceMealSlotInLog(prev || [], slotId, alimentiProcessatiFood));
      } else {
        setDailyLog((prev) => {
          const next = replaceMealSlotInLog(prev || [], slotId, alimentiProcessatiFood);
          syncDatiFirebase(next, manualNodesRef.current);
          return next;
        });
      }
      return testoRispostaFood;
    },
    [
      mapProposalItemsToDiaryFoods,
      getFoodItemsForMealSlot,
      isSimulationMode,
      setSimulatedLog,
      setDailyLog,
      syncDatiFirebase,
      decimalToTimeStr,
      toCanonicalMealType,
    ]
  );

  const saveCustomRecipeToFoodDb = useCallback(async ({ desc, kcal, prot, carb, fatTotal, ingredients }, existingKey) => {
    if (!userUid || !desc) return null;
    const basePath = `users/${userUid}/tracker_data`;
    const slug = String(desc).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 40);
    const trimmed = existingKey != null && String(existingKey).trim() !== '' ? String(existingKey).trim() : '';
    const dbKey = trimmed || `recipe_${Date.now()}_${slug}`;
    const entryPer100 = withDefaultUsageStats({
      desc: String(desc).trim(),
      kcal: Number(kcal) || 0,
      prot: Number(prot) || 0,
      carb: Number(carb) || 0,
      fatTotal: fatTotal != null ? Number(fatTotal) : 0,
      isRecipe: true,
      ingredients: Array.isArray(ingredients) ? ingredients : [],
    });
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
    const payloadWithUnits = enrichDbRowWithFoodUnits(withDefaultUsageStats(payload), newKey);
    await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), payloadWithUnits);
    setFoodDb(prev => ({ ...(prev || {}), [newKey]: payloadWithUnits }));
    return { key: newKey, row: payloadWithUnits };
  }, [userUid, db, fullHistory]);

  /** Aggiorna parzialmente una voce del database personale (es. customImage, macro per100). */
  const patchFoodDbEntry = useCallback(async (foodDbKey, patch) => {
    if (!userUid || !db || !foodDbKey || !patch || typeof patch !== 'object') return;
    const prev = foodDb?.[foodDbKey];
    if (!prev) return;

    const basePath = `users/${userUid}/tracker_data`;
    const { row, customImage, customEmoji, customIcon, ...rest } = patch;
    const merged = { ...prev, ...rest };

    if (row && typeof row === 'object') {
      Object.assign(merged, row);
    }

    if ('customImage' in patch) {
      if (customImage) {
        merged.customImage = customImage;
        delete merged.customEmoji;
        delete merged.customIcon;
      } else {
        delete merged.customImage;
      }
    }

    if ('customIcon' in patch) {
      if (customIcon) {
        merged.customIcon = customIcon;
        delete merged.customImage;
        delete merged.customEmoji;
      } else {
        delete merged.customIcon;
      }
    }

    if ('customEmoji' in patch) {
      if (customEmoji) {
        merged.customEmoji = customEmoji;
        delete merged.customImage;
        delete merged.customIcon;
      } else {
        delete merged.customEmoji;
      }
    }

    Object.keys(TARGETS).forEach((g) =>
      Object.keys(TARGETS[g] || {}).forEach((k) => {
        if (merged[k] == null) merged[k] = getDefaultNutrientValue(k, fullHistory);
      }),
    );
    if (merged.kcal == null || Number(merged.kcal) === 0) {
      merged.kcal = getDefaultNutrientValue('kcal', fullHistory);
    }
    if (merged.fatTotal == null && merged.fat != null) merged.fatTotal = Number(merged.fat);

    const payload = enrichDbRowWithFoodUnits(withDefaultUsageStats(merged), foodDbKey);
    await set(ref(db, `${basePath}/trackerFoodDatabase/${foodDbKey}`), payload);
    setFoodDb((p) => ({ ...(p || {}), [foodDbKey]: payload }));
  }, [userUid, db, foodDb, fullHistory]);

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

  const fastLoggerInitialMealTime = useMemo(() => {
    if (!showFastLogger) return undefined;

    const logToUse = isSimulationMode ? (simulatedLog ?? dailyLog ?? []) : (dailyLog ?? []);

    if (mealToEdit?.[0]?.mealTime != null && typeof mealToEdit[0].mealTime === 'number') {
      return mealToEdit[0].mealTime;
    }

    if (editingMealId) {
      const existing = getFoodItemsForMealSlot(logToUse, String(editingMealId));
      if (existing.length > 0 && typeof existing[0].mealTime === 'number') {
        return existing[0].mealTime;
      }
    }

    return undefined;
  }, [
    showFastLogger,
    mealToEdit,
    editingMealId,
    isSimulationMode,
    simulatedLog,
    dailyLog,
    getFoodItemsForMealSlot,
  ]);

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

  // --- CLUSTER AI (BFF Firebase) ---
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

  const {
    handleAutoLogDinner,
    handleAutoLogAgenda,
    applyKentuChatCmd,
    handleMealProposalConfirm,
    handleMealProposalCancel,
    handleDailyPlanConfirm,
    handleDailyPlanCancel,
    handleGeneratePlanGhostMealDraft,
    savePlanning,
    handlePlanningWizardConfirm,
    lastAgendaOptionsRef,
  } = useKentuMealHandlers({
    auth,
    db,
    foodDb,
    dailyLog,
    manualNodes,
    simulatedLog,
    activeLog,
    fullHistory,
    currentTrackerDate,
    isSimulationMode,
    dailyLogRef,
    manualNodesRef,
    scheduledWorkoutContextRef,
    currentTrackerDateRef,
    syncDatiFirebase,
    predictMealType,
    estraiDatiFoodDb,
    getAverageEstimate,
    parseFlexibleTimeToDecimal,
    parseTimeStrToDecimal,
    setChatHistory,
    setKentuDailyCalorieStrategy,
    setDailyLog,
    setManualNodes,
    setSimulatedLog,
    setPlanningWizardOverlayOpen,
    dismissKentuAgendaTrigger,
    kentuDailyCalorieStrategy,
    userTargets,
  });

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

  const {
    recoveryScore: sleepRecoveryScore,
    metabolicPenalty: sleepMetabolicPenalty,
    mainNightSleep,
    totalSleepHours,
    hasSleepData: hasSleepEngineData,
  } = useSleepEngine(activeLog);

  const sleepWakeTime = mainNightSleep?.wakeTime ?? mainNightSleep?.sleepEnd ?? 7.5;
  
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
    const result = generateRealEnergyData(yesterdayNodes, yesterdayLog, idealStrategy, 0, 2500, null, null, userModel, 30, null, accumuloSNC, sleepMetabolicPenalty);
    const last = result?.chartData?.[24];
    if (!last) return null;
    return { energy: last.energy, idealEnergy: last.idealEnergy };
  }, [currentTrackerDate, fullHistory, idealStrategy, userModel, accumuloSNC, sleepMetabolicPenalty]);

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
      accumuloSNC,
      sleepMetabolicPenalty,
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
    accumuloSNC,
    sleepMetabolicPenalty,
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
    sleepMetabolicPenalty,
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
              d.accumuloSNC,
              d.sleepMetabolicPenalty ?? 1,
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

  const metabolicBiometrics = useMemo(
    () => ({
      stressLevel: sncStressLevel,
      recoveryScore: typeof longevityEngineScore?.score === 'number'
        ? longevityEngineScore.score
        : undefined,
    }),
    [sncStressLevel, longevityEngineScore?.score],
  );

  const metabolicSnapshot = useMetabolicPhaseState(
    fullHistory,
    activeLog,
    currentTrackerDate,
    metabolicBiometrics,
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

  const fastLoggerDailyLogForTargets = useMemo(() => {
    const log = activeLog || [];
    if (!editingMealId) return log;
    const items = getFoodItemsForMealSlot(log, editingMealId);
    const keys = new Set(
      items.map((f) => {
        const base = String(f.mealType ?? '').split('_')[0];
        const t = typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime) ? f.mealTime : 'na';
        return `${base}|${t}`;
      }),
    );
    return log.filter((e) => {
      if (e.type !== 'food' && e.type !== 'recipe') return true;
      const base = String(e.mealType ?? '').split('_')[0];
      const t = typeof e.mealTime === 'number' && !Number.isNaN(e.mealTime) ? e.mealTime : 'na';
      return !keys.has(`${base}|${t}`);
    });
  }, [activeLog, editingMealId, getFoodItemsForMealSlot]);

  const getFastLoggerMealTargetsForSlot = useCallback((mealSlot) => {
    const canon = toCanonicalMealType(String(mealSlot || 'pranzo').split('_')[0]);
    const baseTargets = {
      kcal: effectiveTargetsForCurrentDate?.kcal ?? userTargets?.kcal ?? 2000,
      prot: effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot ?? 150,
      carb: effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb ?? 200,
      fatTotal:
        effectiveTargetsForCurrentDate?.fatTotal
        ?? effectiveTargetsForCurrentDate?.fat
        ?? userTargets?.fatTotal
        ?? userTargets?.fat
        ?? 60,
      fat:
        effectiveTargetsForCurrentDate?.fat
        ?? effectiveTargetsForCurrentDate?.fatTotal
        ?? userTargets?.fat
        ?? userTargets?.fatTotal
        ?? 60,
      fibre: effectiveTargetsForCurrentDate?.fibre ?? userTargets?.fibre ?? 30,
    };
    const dynamic = getDynamicMealTargets(canon, fastLoggerDailyLogForTargets, baseTargets, {
      calorieStrategy: kentuDailyCalorieStrategy,
      burnedKcalBonus: burnedKcal,
    });
    const result = dynamic && typeof dynamic === 'object' ? { ...dynamic } : {};
    const sk = getStrategyKey(canon);
    const planK = idealStrategy?.[sk];
    if (
      canon !== 'cena'
      && planK != null
      && Number.isFinite(Number(planK))
      && Number(planK) > 0
    ) {
      result.kcal = Math.round(Number(planK));
    }
    return {
      kcal: Number(result.kcal) || baseTargets.kcal,
      prot: Number(result.prot) || baseTargets.prot,
      carb: Number(result.carb) || baseTargets.carb,
      fat: Number(result.fat ?? result.fatTotal) || baseTargets.fat,
    };
  }, [
    fastLoggerDailyLogForTargets,
    effectiveTargetsForCurrentDate,
    userTargets,
    kentuDailyCalorieStrategy,
    burnedKcal,
    idealStrategy,
  ]);

  const getFastLoggerMealConsumedForSlot = useCallback((mealSlot) => {
    if (editingMealId) {
      return { kcal: 0, prot: 0, carb: 0, fat: 0 };
    }
    const log = activeLog || [];
    const canon = toCanonicalMealType(String(mealSlot || 'pranzo').split('_')[0]);
    const items = log.filter(
      (e) =>
        (e.type === 'food' || e.type === 'recipe')
        && toCanonicalMealType(String(e.mealType || '').split('_')[0]) === canon,
    );
    return items.reduce(
      (acc, f) => ({
        kcal: acc.kcal + (Number(f.kcal ?? f.cal) || 0),
        prot: acc.prot + (Number(f.prot) || 0),
        carb: acc.carb + (Number(f.carb) || 0),
        fat: acc.fat + (Number(f.fatTotal ?? f.fat) || 0),
      }),
      { kcal: 0, prot: 0, carb: 0, fat: 0 },
    );
  }, [activeLog, editingMealId]);

  const profileKcalBase = userProfileKcalBase;
  const dynamicDailyKcal = hasPlannedBlock && profileKcalBase != null
    ? profileKcalBase + plannedDelta + burnedKcal
    : profileKcalBase != null
      ? applyCalorieStrategyToProfileKcal(profileKcalBase, kentuDailyCalorieStrategy) + burnedKcal
      : null;
  const profileTdeeKcal = profileKcalBase != null ? Math.round(profileKcalBase + burnedKcal) : null;
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

    const log = activeLogForCoachSyncRef.current;
    if (log == null || currentTrackerDate !== getTodayString() || isSimulationMode) {
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
  const isUserActivelyEditing = !!(showFastLogger);
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
    setMealType(mealIdFromCanonical(canon));
    setSelectedMealCenter(null);
    setEditingMealId(null);
    setMealToEdit(null);
    openFastLoggerNew();
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
  }, [aiCoachEval, mealIdFromCanonical, openFastLoggerNew]);

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

  const mealPieData = useMemo(() => {
    // Palette Sci-Fi per distinguere i vari pasti in modo univoco
    const PIE_COLORS = ['#00e5ff', '#b388ff', '#00e676', '#ffea00', '#ff9800', '#f48fb1', '#4fc3f7', '#aed581', '#ffb74d'];
    const rimanentiSliceColor = 'rgba(255, 255, 255, 0.05)';

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
    const targetKcal =
      Math.round(
        Number(dynamicDailyKcal) ||
        Number(baseKcal) ||
        Number(userProfileKcalBase) ||
        Number(userTargets?.kcal) ||
        2000
      ) || 2000;
    if (targetKcal > 0 && currentTotal < targetKcal) {
      data = [...data, {
        name: 'Rimanenti',
        value: targetKcal - currentTotal,
        macros: null,
        id: 'rimanenti',
        fill: rimanentiSliceColor,
        color: rimanentiSliceColor,
      }];
    }
    if (data.length === 0) {
      data = [{
        name: 'Rimanenti',
        value: targetKcal,
        macros: null,
        id: 'rimanenti',
        fill: rimanentiSliceColor,
        color: rimanentiSliceColor,
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
  }, [activeLog, userTargets?.kcal, dynamicDailyKcal, baseKcal, userProfileKcalBase]);

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

  const isReadyToDelete = draggingNode && Math.abs(dragOffsetY) > 50;

  // --- ZONA SICURA HOOKS: MOTORE METABOLICO E BODY BATTERY ---
  const metabolicContextOptions = useMemo(() => {
    const anchorDate = currentTrackerDate || getTodayString();
    return {
      fullHistory,
      anchorDate,
      mealTimesObj: fullHistory?.[TRACKER_STORICO_KEY(anchorDate)]?.mealTimes ?? {},
      referenceDateObj: currentDateObj,
    };
  }, [fullHistory, currentTrackerDate, currentDateObj, getTodayString]);

  const fastingData = useMemo(
    () => buildMetabolicFastingSnapshot(activeLog, currentTime, metabolicContextOptions),
    [activeLog, currentTime, metabolicContextOptions],
  );

  const currentMetabolicColor = useMemo(
    () => resolveMetabolicAccentColor(fastingData),
    [fastingData?.hoursFasted, fastingData?.phaseName],
  );

  const metabolicTimelineMeals = useMemo(
    () => collectMetabolicTimelineMeals(activeLog, metabolicContextOptions),
    [activeLog, metabolicContextOptions],
  );

  const metabolicGradientStops = useMemo(
    () => buildMetabolicTimelineGradientStops({
      ...metabolicTimelineMeals,
      activeLog,
      ...metabolicContextOptions,
    }),
    [activeLog, metabolicTimelineMeals, metabolicContextOptions],
  );

  const metabolicChartGradientStops = useMemo(
    () => buildMetabolicTimelineGradientStops({
      ...metabolicTimelineMeals,
      activeLog,
      ...metabolicContextOptions,
    }),
    [activeLog, metabolicTimelineMeals, metabolicContextOptions],
  );

  useEffect(() => {
    const referenceHour = isViewingPastDate ? 24 : currentTime;
    const hoursAtNow = hoursFastedAtTimelineHour(
      referenceHour,
      metabolicTimelineMeals.todayMealTimes,
      metabolicTimelineMeals.yesterdayLastMealTime,
    );
    const coloreCalcolatoPerOraCorrente = resolveMetabolicColorForHoursFasted(hoursAtNow);
    console.log(
      '[DEBUG TIMELINE] currentMetabolicColor:',
      currentMetabolicColor,
      '| Colore grafico ora corrente:',
      coloreCalcolatoPerOraCorrente,
      '| hoursFasted arc:',
      fastingData?.hoursFasted,
      '| hoursFasted timeline:',
      hoursAtNow,
      '| pasti oggi:',
      metabolicTimelineMeals.todayMealTimes,
    );
  }, [
    currentMetabolicColor,
    currentTime,
    fastingData?.hoursFasted,
    isViewingPastDate,
    metabolicTimelineMeals,
  ]);

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

  const commitAddFoodCommand = useCallback(
    (payload) => {
      const mealTypeCanonical = toCanonicalMealType(String(payload?.mealType || '').trim()) || 'pranzo';
      const defaultMealTimeMap = {
        colazione: 8,
        snack: 16,
        pranzo: 13,
        cena: 20,
      };
      let mealDec = null;
      if (payload?.timeString) {
        mealDec = parseFlexibleTimeToDecimal(String(payload.timeString).trim());
      }
      if (mealDec == null) {
        mealDec =
          defaultMealTimeMap[mealTypeCanonical] != null
            ? defaultMealTimeMap[mealTypeCanonical]
            : getCurrentTimeRoundedTo15Min();
      }
      const timeString = String(payload?.timeString || decimalToTimeStr(mealDec)).trim();

      const rawItems = Array.isArray(payload?.items) && payload.items.length > 0
        ? payload.items
        : payload?.foodName
          ? [{ foodName: payload.foodName, grams: payload.grams }]
          : [];
      if (!rawItems.length) throw new Error('Nessun alimento nel payload');

      const items = rawItems.map((item) => {
        const name = String(item?.foodName || item?.name || '').trim();
        const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qty) || 0));
        if (!name) throw new Error('foodName mancante');
        if (!Number.isFinite(grams) || grams <= 0) throw new Error('grams non valido');
        const dbKey = item?.foodDbKey ?? item?.matchedKey;
        return {
          name,
          qty: grams,
          ...(dbKey != null && String(dbKey).trim() !== ''
            ? { matchedKey: String(dbKey).trim(), foodDbKey: String(dbKey).trim() }
            : {}),
        };
      });

      const targetNodeId = String(payload?.targetNodeId || '').trim();
      if (targetNodeId) {
        const message = commitUpdateMealChatPayload({
          targetNodeId,
          timeString,
          mealDec,
          items,
        });
        if (message) return message;
        throw new Error('Aggiornamento pasto fallito');
      }

      const message = commitAddFoodChatPayload({
        timeString,
        mealDec,
        items,
        mealType: mealTypeCanonical,
      });
      if (message) return message;
      if (items.length > 1) {
        return `✅ ${items.length} alimenti aggiunti nel diario.`;
      }
      return `✅ ${items[0].name} (${items[0].qty}g) aggiunto nel diario.`;
    },
    [
      commitAddFoodChatPayload,
      commitUpdateMealChatPayload,
      decimalToTimeStr,
      getCurrentTimeRoundedTo15Min,
      parseFlexibleTimeToDecimal,
      toCanonicalMealType,
    ],
  );

  const commitLogSleepCommand = useCallback(
    (payload) => {
      const hours = Number(payload?.durationHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error('durationHours non valido');
      }
      const roundedHours = Math.round(hours * 100) / 100;
      const deepSleepPhase =
        payload?.deepSleepPhase != null ? Number(payload.deepSleepPhase) : null;
      const deepMin =
        deepSleepPhase != null && Number.isFinite(deepSleepPhase)
          ? Math.max(0, Math.round(deepSleepPhase * 60))
          : 60;
      const qualityScore =
        payload?.qualityScore != null ? Number(payload.qualityScore) : null;
      const wake = 7;
      let bed = wake - roundedHours;
      if (bed < 0) bed += 24;
      bed = Math.round(bed * 100) / 100;
      const entry = {
        type: 'sleep',
        id: `sleep_cmd_${Date.now()}`,
        hours: roundedHours,
        duration: roundedHours,
        sleepHours: roundedHours,
        wakeTime: wake,
        bedtime: bed,
        sleepStart: bed,
        sleepEnd: wake,
        deepMin,
        remMin: 60,
        ...(qualityScore != null && Number.isFinite(qualityScore) ? { quality: Math.round(qualityScore) } : {}),
      };
      if (isSimulationMode) {
        setSimulatedLog((prev) => {
          const base = prev || [];
          const rest = base.filter((e) => e?.type !== 'sleep');
          return [...rest, entry];
        });
      } else {
        setDailyLog((prev) => {
          const base = prev || [];
          const rest = base.filter((e) => e?.type !== 'sleep');
          const next = [...rest, entry];
          syncDatiFirebase(next, manualNodesRef.current || []);
          return next;
        });
      }
      dismissKentuSleepTrigger();
    },
    [
      dismissKentuSleepTrigger,
      isSimulationMode,
      setDailyLog,
      setSimulatedLog,
      syncDatiFirebase,
    ],
  );

  const {
    sendMessage,
    isLoading: isChatProcessing,
    chatInput: commandChatInput,
    setChatInput: setCommandChatInput,
    chatImages: commandChatImages,
    setChatImages: setCommandChatImages,
    activeQuickReplies,
    handleQuickReplyClick,
    handleAcceptAdvice,
    handleAcceptMealProposal,
    handleDraftConfirm,
    handleDraftCancel,
    handleDraftRemoveItem,
    handleDraftUpdateItemGrams,
    handleDraftUpdateMealMeta,
    handleDraftUpdateFoodItemName,
    handleWorkoutDraftUpdateMeta,
    handleWorkoutDraftUpdateExercise,
    handleWorkoutDraftRemoveExercise,
    handleSaveNewFoodEntry,
  } = useCommandTerminal({
    chatHistory,
    setChatHistory,
    onAddFoodCommand: commitAddFoodCommand,
    onAddWorkoutCommand: commitAddWorkoutCommand,
    onLogSleepCommand: commitLogSleepCommand,
    onSaveFoodDbEntry: async (entryPer100, donorMeta = null) => {
      const safe = entryPer100 && typeof entryPer100 === 'object' ? entryPer100 : null;
      if (!safe?.desc) throw new Error('missing_desc');
      const payload = { ...safe };
      if (donorMeta && typeof donorMeta === 'object') {
        payload.micronutrientDonor = donorMeta;
      }
      await saveFoodEntryPer100ToFoodDb(payload);
    },
    getCurrentState: () => {
      const todayWorkoutKcal = (activeLog || [])
        .filter((item) => item?.type === 'workout')
        .reduce((acc, item) => acc + (Number(item?.kcal ?? item?.cal) || 0), 0);
      return {
        activeDate: currentTrackerDate || getTodayString(),
        locale: 'it-IT',
        foodDatabase: foodDb,
        activeLog: activeLog || [],
        userTargets: effectiveTargetsForCurrentDate,
        dynamicDailyKcal:
          dynamicDailyKcal
          ?? (effectiveTargetsForCurrentDate?.kcal ?? userTargets?.kcal ?? 2000),
        fullHistory,
        decimalHour: getCurrentTimeRoundedTo15Min(),
        predictMealType,
        mealState: {
          mealType: toCanonicalMealType(mealType) || 'pranzo',
          recentFoods: [],
        },
        dailyStats: {
          todayWorkoutKcal,
          bodyBatteryPercent: Number(bodyBattery?.currentEnergy ?? 0),
          recoveryScore: Number(longevityEngineScore ?? 0),
        },
        todayPlanBlock: todayPlanBlock ?? null,
        hasRealWorkoutToday: hasRealWorkoutInActiveLog,
        isWorkoutDoneToday: hasRealWorkoutInActiveLog,
        scheduledWorkout: scheduledWorkoutContextRef.current,
        timelineNodes: allNodes,
        manualNodes: manualNodesForTimeline,
      };
    },
  });

  const renderCustomizedLabel = useMemo(
    () => createMealPieCustomizedLabel(setSelectedMealCenter),
    [setSelectedMealCenter],
  );

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

  // ========================================================
  // Contenuto principale (un solo return finale per mantenere montato l’overlay caricamento Firebase)
  // ========================================================
  /** Barra Kentu + navigazione: sempre montata dopo login, anche durante caricamento dati (Bussola sempre visibile). */
  const shouldHideBottomChatBar = isCoachOpen || biochemicalDetailModal != null;
  const fixedAppBottomChrome = shouldHideBottomChatBar ? null : (
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
      <SalaComandiLoginScreen
        isBooting={isBooting}
        introPhrase={introPhrase}
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        onSubmit={handleLogin}
      />
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
      <Suspense fallback={<KentuLazySectionFallback label="Grafico fullscreen…" />}>
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
        metabolicGradientStops={metabolicGradientStops}
        metabolicChartGradientStops={metabolicChartGradientStops}
        currentMetabolicColor={currentMetabolicColor}
      />
      </Suspense>
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
                onClick={handleConfirmGhostDeleteSingle}
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
                onClick={handleConfirmGhostDeleteAll}
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
        simulationActive={isSimulationMode}
        onExitSimulation={() => {
          setIsSimulationMode(false);
          setSimulatedLog(null);
        }}
        accessory={
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user?.uid && (
              <WeeklyMetabolicIndicator
                db={db}
                user={user}
                fullHistory={fullHistory}
                userTargets={userTargets}
                currentTrackerDate={currentTrackerDate}
                isSimulationMode={isSimulationMode}
                getTodayString={getTodayString}
              />
            )}
            <EnergyArcWidget
              variant="mini"
              recoveryScore={sleepRecoveryScore}
              wakeTime={sleepWakeTime}
              currentHour={currentTime}
              metabolicPhase={metabolicSnapshot?.phase}
              dynamicDailyKcal={dynamicDailyKcal}
              workoutsLog={workoutsLog}
              hasSleepData={hasSleepEngineData}
              onClick={() => setShowEnergySheet(true)}
            />
          </div>
        }
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
      {activeBottomTab === 'analisi' && (
      <div
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', width: '100%' }}
      >
      <>
      {/* Cruscotto energetico giornaliero 0-24h */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '16px', padding: 'max(10px, 1.5vh) 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div
          className="analisi-pre-chart-controls"
          style={{
            flexShrink: 0,
            marginBottom: '10px',
            order: 2,
          }}
        >
          {/* Dashboard Allarmi — Timeline */}
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
        </div>
        <div
          className="analisi-top-visual-container"
          style={{
            flex: 1,
            minHeight: 0,
            order: 1,
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
                <Suspense fallback={<KentuLazySectionFallback label="Cruscotto energetico…" />}>
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
                  metabolicGradientStops={metabolicGradientStops}
                  metabolicChartGradientStops={metabolicChartGradientStops}
                  currentMetabolicColor={currentMetabolicColor}
                  activeLog={activeLog}
                  metabolicContextOptions={metabolicContextOptions}
                  showMetabolicOverlay={true}
                  onMetabolicPhaseClick={() => setShowMetabolicSheet(true)}
                />
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
                  analysisTabActive={true}
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
                  nowLineDecimalHour={!isViewingPastDate ? currentTime : undefined}
                  timelineEnergySeries={timelineEnergySeries}
                  timelineQualityChartData={chartData}
                  updateMealTime={updateMealTime}
                  onStripDragChartPreviewStart={onTimelineStripPreviewDragStart}
                  onStripDragChartPreview={scheduleTimelineStripEnergyPreview}
                  onStripDragChartPreviewEnd={clearTimelineStripEnergyPreview}
                  onStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
                  metabolicGradientStops={metabolicGradientStops}
                />
                </div>
                </Suspense>
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
          <Suspense fallback={<KentuLazySectionFallback label="Dettaglio grafico…" />}>
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
            metabolicGradientStops={metabolicGradientStops}
            metabolicChartGradientStops={metabolicChartGradientStops}
            currentMetabolicColor={currentMetabolicColor}
          />
          </Suspense>
        )}
      </>

      </div>
      )}

      {activeBottomTab === 'oggi' && (
        <div className="home-oggi-scroll">
          <div className="home-oggi-column" style={{ paddingLeft: 0, paddingRight: 0 }}>
          {(() => {
            const targetProt = userTargets?.prot ?? 150;
            const targetCarb = userTargets?.carb ?? 200;
            const targetFat = userTargets?.fatTotal ?? userTargets?.fat ?? 65;
            const dialPlannedDelta = hasPlannedBlock ? plannedDelta : 0;
            const dialDailyTargetKcal = Math.round(
              hasPlannedBlock && profileKcalBase != null
                ? profileKcalBase + dialPlannedDelta + burnedKcal
                : Number(dynamicDailyKcal) || Number(baseKcal) || Number(userProfileKcalBase ?? userTargets?.kcal ?? 0) || 0
            );
            const dialConsumedKcal = Math.round(Number(totali?.kcal) || 0);
            const dialKcalSurplus =
              dialConsumedKcal > dialDailyTargetKcal ? dialConsumedKcal - dialDailyTargetKcal : 0;
            const dialKcalRemaining = Math.max(0, dialDailyTargetKcal - dialConsumedKcal);
            const dialTdeeKcal = Math.round(Number(profileTdeeKcal ?? userProfileKcalBase ?? 0) || 0);
            const dialKcalRestLabel =
              dialKcalSurplus > 0 ? 'SURPLUS' : 'RESTANTI';
            const dialKcalGoalLine =
              dialKcalSurplus > 0
                ? `Base ${dialTdeeKcal} kcal | Target ${dialDailyTargetKcal} kcal · assunte ${dialConsumedKcal}`
                : `Base ${dialTdeeKcal} kcal | Target ${dialDailyTargetKcal} kcal`;
            const showMaintenanceMarker =
              activeDialMode === 'kcal' && hasPlannedBlock && dialDailyTargetKcal > 0;
            const maintenanceMarkerRatio = showMaintenanceMarker && profileTdeeKcal != null
              ? profileTdeeKcal / dialDailyTargetKcal
              : 0;
            const maintenanceMarkerIsDeficit = dialPlannedDelta < 0;
            const macroCardBase =
              'flex-1 rounded-xl border backdrop-blur-sm bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 shadow-lg px-3 py-2.5 text-center overflow-hidden cursor-pointer transition-transform active:scale-[0.99]';
            const macroCardTone = (mode, borderClass, ringClass, shadowClass) =>
              `${macroCardBase} ${activeDialMode === mode ? `${borderClass} ring-2 ${ringClass} ${shadowClass}` : borderClass}`;
            return (
                <div className="nutrition-cluster">
                <div
                  className="kcal-dial-shell"
                  onClick={() => {
                    setSelectedMealCenter(null);
                    setActiveDialMode('kcal');
                  }}
                >
                  <div className="kcal-dial-inner">
                    {/* Layer 1: Centro Interattivo (Totali o Dettaglio Pasto) */}
                    <div
                      className={selectedMealCenter ? 'tachimeter-center tachimeter-center-reset' : 'tachimeter-center'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedMealCenter && selectedMealCenter.id && selectedMealCenter.id !== 'rimanenti') {
                          loadMealToConstructor(String(selectedMealCenter.id));
                          return;
                        }
                        console.log('[Diario] tap centro tachimetro → apertura sheet');
                        setShowDiarySheet(true);
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
                      title={!selectedMealCenter ? 'Apri diagnostica nutrizionale' : undefined}
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
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: '88%' }}>
                          <div
                            className="kcal-dial-center-value"
                            style={{
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
                              <span className="kcal-dial-center-surplus" style={{ letterSpacing: '0.02em' }}>
                                + {dialKcalSurplus}{' '}
                                <span style={{ fontSize: '0.42em', fontWeight: 700 }}>kcal</span>
                              </span>
                            )}
                            {activeDialMode === 'kcal' && dialKcalSurplus <= 0 && dialKcalRemaining}
                            {activeDialMode === 'pro' && Math.round(totali?.prot || 0)}
                            {activeDialMode === 'cho' && Math.round(totali?.carb || 0)}
                            {activeDialMode === 'fat' && Math.round(totali?.fatTotal ?? totali?.fat ?? 0)}
                          </div>
                          <div
                            className="kcal-dial-center-label"
                            style={{ color: '#888' }}
                          >
                            {activeDialMode === 'kcal' && dialKcalRestLabel}
                            {activeDialMode === 'pro' && 'g Proteine'}
                            {activeDialMode === 'cho' && 'g Carboidrati'}
                            {activeDialMode === 'fat' && 'g Grassi'}
                          </div>
                          <div className="kcal-dial-center-sub" style={{ color: '#555', marginTop: '4px' }}>
                            {activeDialMode === 'kcal' && dialKcalGoalLine}
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
                            activeShape={MealPieActiveShape}
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
                      {showMaintenanceMarker ? (
                        <DialMaintenanceMarker
                          tdeeRatio={maintenanceMarkerRatio}
                          isDeficit={maintenanceMarkerIsDeficit}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
                </div>
            );
          })()}

            <div
              className="flex w-full flex-col gap-2 box-border shrink-0"
              style={{ width: '100%', padding: '0 14px', boxSizing: 'border-box' }}
            >
              <HomeNutrientStrip
                totali={totali}
                targets={userTargets}
                targetProt={userTargets?.prot ?? 150}
                targetCarb={userTargets?.carb ?? 200}
                targetFat={userTargets?.fatTotal ?? userTargets?.fat ?? 65}
                onProteinClick={() => setShowProteinSheet(true)}
                onCarbsClick={() => setShowCarbsSheet(true)}
                onFatClick={() => setShowFatSheet(true)}
                onMineralsClick={() => setShowMineralsSheet(true)}
                onVitaminsClick={() => setShowVitaminsSheet(true)}
              />
              <DayPlanWidget
                todayPlanBlock={todayPlanBlock}
                isWorkoutDoneToday={hasRealWorkoutInActiveLog}
                onOpenActionSheet={() => setIsPlanActionSheetOpen(true)}
              />
              <MetabolicMonitorCard
                metabolicSnapshot={metabolicSnapshot}
                onClick={() => setShowMetabolicSheet(true)}
                onCenterTap={() => setShowDiarySheet(true)}
              />
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
            <Suspense fallback={<KentuLazySectionFallback label="Pianificazione…" />}>
            <WeeklyPlanning
              value={weeklyPlan}
              onChange={setWeeklyPlan}
              anchorDate={new Date(`${currentTrackerDate || getTodayString()}T12:00:00`)}
              profileDailyKcal={Number(userTargets?.kcal) || 2000}
            />
            </Suspense>
          </div>
        </div>
      )}
      {activeBottomTab === 'bussola' && (
        <div
          className="trend-tab-shell"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            padding: '12px 12px 0',
            overflowY: 'hidden',
            overflowX: 'hidden',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Suspense fallback={<KentuLazySectionFallback label="Bussola metabolica…" />}>
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
          </Suspense>
        </div>
      )}
      </div>
      )}
      {activeBottomTab === 'longevita' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px) + 78px)',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              width: '100%',
            }}
          >
            <Suspense fallback={<KentuLazySectionFallback label="Longevità…" />}>
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
            </Suspense>
          </div>
        </div>
      )}
      {activeBottomTab === 'pianifica' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            width: '100%',
            boxSizing: 'border-box',
            paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px) + 78px)',
          }}
        >
          <Suspense fallback={<KentuLazySectionFallback label="Planner settimanale…" />}>
          <WeeklyBuilder
            db={db}
            userUid={user?.uid ?? null}
            weekStart={getWeekStartMondayKeyLocal(currentTrackerDate || getTodayString())}
            authReady={authReady}
            onSaveSuccess={() => setActiveBottomTab('oggi')}
          />
          </Suspense>
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
          onOpenProgressi={() => setActiveBottomTab('longevita')}
          onOpenTacticalCoach={() => setIsCoachOpen(true)}
        />

        <Suspense fallback={<KentuLazySectionFallback label="Apertura vista…" />}>
        {/* VISTA CHAT AI */}
        {activeAction === 'ai_chat' && (
          <KentuChatUI
            chatHistory={chatHistory}
            chatInput={commandChatInput}
            setChatInput={setCommandChatInput}
            chatImages={commandChatImages}
            setChatImages={setCommandChatImages}
            handleChatSubmit={sendMessage}
            activeQuickReplies={activeQuickReplies}
            handleQuickReplyClick={handleQuickReplyClick}
            handleAcceptAdvice={handleAcceptAdvice}
            onAcceptMealProposal={handleAcceptMealProposal}
            foodDatabase={foodDb}
            fullHistory={fullHistory}
            onDraftConfirm={handleDraftConfirm}
            onDraftCancel={handleDraftCancel}
            onDraftRemoveItem={handleDraftRemoveItem}
            onDraftUpdateItemGrams={handleDraftUpdateItemGrams}
            onDraftUpdateMealMeta={handleDraftUpdateMealMeta}
            onDraftUpdateFoodItemName={handleDraftUpdateFoodItemName}
            onWorkoutDraftUpdateMeta={handleWorkoutDraftUpdateMeta}
            onWorkoutDraftUpdateExercise={handleWorkoutDraftUpdateExercise}
            onWorkoutDraftRemoveExercise={handleWorkoutDraftRemoveExercise}
            onSaveNewFoodEntry={handleSaveNewFoodEntry}
            onBack={() => setActiveAction(null)}
            introPhrase={introPhrase}
            isProcessing={isChatProcessing}
          />
        )}

        {import.meta.env.DEV && activeAction === 'api_diary' && (
          <ApiDiary onBack={() => setActiveAction('menu_secondary')} />
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
            onBack={() => {
              clearWorkoutPlanDraft();
              setActiveAction(null);
            }}
            draftFromPlan={workoutPlanDraft != null}
            planDraft={workoutPlanDraft}
            onStartWorkoutSession={handleStartWorkoutSession}
            onDraftConsumed={clearWorkoutPlanDraft}
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
        </Suspense>

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
                  if (source === 'diary') {
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

      <DayPlanActionSheet
        open={isPlanActionSheetOpen}
        onClose={() => setIsPlanActionSheetOpen(false)}
        onStartWorkout={openWorkoutFromTodayPlan}
        onPostpone={handlePostponeWorkout}
        onSkip={skipTodayPlanSession}
      />

      {showBiochemicalDiagnostics ? (
        <Suspense fallback={<KentuLazySectionFallback label="Diagnostica…" />}>
        <BiochemicalDiagnostics
          todayMicros={todayMicrosForDiagnostics}
          aminoAcidProfile={aminoAcidProfileForDiagnostics}
          weeklyLiposolubleHistory={weeklyVitaminHistoryForDiagnostics}
          dailyLog={activeLog}
          detailModal={biochemicalDetailModal}
          setDetailModal={setBiochemicalDetailModal}
          onClose={() => {
            setShowBiochemicalDiagnostics(false);
            setBiochemicalDetailModal(null);
          }}
        />
        </Suspense>
      ) : null}

      {isCoachOpen ? (
        <Suspense fallback={<KentuLazySectionFallback label="Coach tattico…" />}>
        <TacticalCoach
          totals={{
            kcal: Number(totali?.kcal) || 0,
            prot: Number(totali?.prot) || 0,
            carb: Number(totali?.carb) || 0,
            fatTotal: Number(totali?.fatTotal ?? totali?.fat) || 0,
          }}
          targets={{
            kcal: Number(dynamicDailyKcal ?? targetKcal) || 0,
            prot: Number(effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot) || 0,
            carb: Number(effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb) || 0,
            fatTotal: Number(
              effectiveTargetsForCurrentDate?.fatTotal
              ?? effectiveTargetsForCurrentDate?.fat
              ?? userTargets?.fatTotal
              ?? userTargets?.fat,
            ) || 0,
          }}
          currentCoordinates={{
            x: Number(metabolicMapData?.mapPositionInertial?.x ?? metabolicMapData?.x) || 0,
            y: Number(metabolicMapData?.mapPositionInertial?.y ?? metabolicMapData?.y) || 0,
          }}
          userStats={{
            weight: Number(userProfile?.weight) || 75,
            tdee: Number(dynamicDailyKcal ?? targetKcal) || 2480,
            plannedWorkoutKcal,
          }}
          isDayEnded={isViewingPastDate}
          onClose={() => setIsCoachOpen(false)}
        />
        </Suspense>
      ) : null}

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

      {showStrategicPlanner && (
        <Suspense fallback={<KentuLazySectionFallback label="Planner strategico…" />}>
        <StrategicPlannerOverlay
        isOpen={showStrategicPlanner}
        onClose={() => setShowStrategicPlanner(false)}
        strategicPlan={strategicPlan}
        isPlannerLoading={isPlannerLoading}
        updateDayPlan={updateDayPlan}
        updateSettings={updateSettings}
        saveCalorieMemory={saveCalorieMemory}
      />
        </Suspense>
      )}
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
        onAddMealAtHour={() => {
          setTimelineInsertUI(null);
          openFastLoggerNew();
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

      <DiaryDetailsSheet
        isOpen={showDiarySheet}
        onClose={() => setShowDiarySheet(false)}
        groupedFoods={groupedFoods}
        workoutsLog={workoutsLog}
        totali={totali}
        dynamicDailyKcal={dynamicDailyKcal}
        decimalToTimeStr={decimalToTimeStr}
        onEditMeal={(slotKey) => {
          setShowDiarySheet(false);
          loadMealToConstructor(slotKey);
        }}
        onEditWorkout={openWorkoutEditorFromLogItem}
        onDeleteItem={removeLogItem}
        onInspectFood={setSelectedFoodForInfo}
      />

      <EnergyBalanceSheet
        isOpen={showEnergySheet}
        onClose={() => setShowEnergySheet(false)}
        userAge={calculateAge(birthDate) ?? userProfile?.age ?? 30}
        recoveryScore={sleepRecoveryScore}
        totalSleepHours={totalSleepHours}
        dynamicDailyKcal={dynamicDailyKcal}
        consumedKcal={totali?.kcal}
        workoutBurnKcal={workoutsLog.reduce(
          (sum, wk) => sum + (Number(wk?.kcal ?? wk?.cal) || 0),
          0,
        )}
      />

      <MetabolicTimelineSheet
        isOpen={showMetabolicSheet}
        metabolicSnapshot={metabolicSnapshot}
        onClose={() => setShowMetabolicSheet(false)}
        onNeuralReset={() => {
          setShowMetabolicSheet(false);
          setActiveAction('focus');
          setIsDrawerOpen(false);
        }}
      />

      <FatDetailsSheet
        isOpen={showFatSheet}
        onClose={() => setShowFatSheet(false)}
        data={realFatData}
        dailyLog={activeLog}
      />

      <CarbsDetailsSheet
        isOpen={showCarbsSheet}
        onClose={() => setShowCarbsSheet(false)}
        data={realCarbsData}
        dailyLog={activeLog}
      />

      <ProteinDetailsSheet
        isOpen={showProteinSheet}
        onClose={() => setShowProteinSheet(false)}
        data={realProteinData}
        dailyLog={activeLog}
      />

      <MineralsDetailsSheet
        isOpen={showMineralsSheet}
        onClose={() => setShowMineralsSheet(false)}
        data={realMineralsData}
        dailyLog={activeLog}
      />

      <VitaminsDetailsSheet
        isOpen={showVitaminsSheet}
        onClose={() => setShowVitaminsSheet(false)}
        dailyLog={activeLog}
        userTargets={userTargets}
        anchorDate={currentTrackerDate}
        fullHistory={fullHistory}
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
        <Suspense fallback={<KentuLazySectionFallback label="Healthspan…" />}>
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
        </Suspense>
      )}

      {showFastLogger ? (
        <Suspense fallback={<KentuLazySectionFallback label="Logger pasti…" />}>
        <FastMealLogger
          key={editingMealId ?? pendingGhostMealId ?? 'new-meal'}
          fullHistory={fullHistory}
          todayLog={activeLog}
          personalDb={foodDb}
          masterDb={csvFoodDb}
          getMealTargetsForSlot={getFastLoggerMealTargetsForSlot}
          getMealConsumedForSlot={getFastLoggerMealConsumedForSlot}
          initialDraft={mealToEdit}
          editingMealId={editingMealId}
          initialMealSlot={
            fastLoggerInitialSlot
            ?? (mealToEdit?.[0]?.mealType
              ? toCanonicalMealType(String(mealToEdit[0].mealType).split('_')[0])
              : undefined)
            ?? (editingMealId
              ? toCanonicalMealType(String(editingMealId).split('_')[0])
              : undefined)
          }
          initialMealTime={fastLoggerInitialMealTime}
          onClose={closeFastLogger}
          onSave={handleFastLoggerSave}
          onAcquireExternalFood={saveFoodEntryPer100ToFoodDb}
          onPatchFoodDbEntry={patchFoodDbEntry}
          onSaveRecipe={saveCustomRecipeToFoodDb}
        />
        </Suspense>
      ) : null}

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
