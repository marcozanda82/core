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
import { useNavigate, useLocation } from 'react-router-dom';
import './styles/SalaComandiInline.css';
import { createPortal } from 'react-dom';
import { ref, get, set, update, push, onValue, remove } from 'firebase/database';

import {
  calculateConsolidatedAverageScore,
  calculateProjectedAge,
  buildKentuAiVitalsContextParagraph,
  buildKentuAiMetabolicRecompositionContext,
} from './longevityStats';
import { calculateMetabolicVariance } from './metabolicEngine';

import { useFirebase } from './useFirebase';
import { useCommandTerminal } from './features/commandTerminal/hooks/useCommandTerminal';
import ChatFoodEnrichmentModal from './features/commandTerminal/components/ChatFoodEnrichmentModal.jsx';
import { detectPrematureFastBreak } from './features/health/HealthScoreEngine.js';
import {
  analyzeCoffeeForHealthScore,
  COFFEE_VARIANT,
  readLastCoffeeType,
  sumSweetCoffeeMacros,
} from './features/stimulants/coffeeLogEngine.js';
import {
  coffeeShopNodeToDiaryFoodRow,
  findCoffeeShopProductByName,
  getCoffeeShopProductById,
} from './constants/coffeeShopDatabase.js';
import {
  rememberFavoriteFromCoffeeNode,
  rememberFavoriteFromFoodItem,
  readFavoriteBreakfast,
} from './features/breakfast/favoriteBreakfastMemory.js';
import {
  readLastTeaType,
} from './features/stimulants/teaLogEngine.js';
import {
  readLastEnergyType,
} from './features/stimulants/energyDrinkLogEngine.js';
import QuickEventConfirmOverlay from './features/quickEvents/QuickEventConfirmOverlay.jsx';
import {
  buildQuickEventConfirmPayload,
  buildQuickEventConfirmChatEntry,
} from './features/quickEvents/quickEventConfirmAssets.js';
import { projectNutritionAfterMeal } from './conversation/ConsultantEngine';
import {
  buildMealReceiptPayload,
  mealReceiptFallbackText,
  sanitizeFoodIcon,
} from './features/chat/mealReceiptUtils';
import {
  buildLearnedFoodEntryPer100,
  persistLearnedFoodToDatabase,
  resolveLearnedPortionAfterSave,
} from './services/userFoodLearning.js';
import { resolveFoodItemForProposal } from './utils/foodResolver.js';
import { ensureRecipeDiaryFields } from './utils/recipeDiaryFields.js';
import {
  learnUserPortionsFromConfirmedMeal,
  sanitizeUserPortionsDict,
} from './features/commandTerminal/conversation/userPortionsMemory.js';
import {
  sanitizeUserFoodAliasesDict,
  saveUserFoodAliasesToCache,
} from './features/commandTerminal/conversation/userFoodAliases.js';
import { getWipMealSnapshotFromBridge, seedWipMealFromBridge } from './features/wipMealBuilder/wipMealBridge.js';
import { WipMealProvider } from './features/wipMealBuilder/context/WipMealContext.jsx';
import { mapChatWorkoutToNativePayload } from './features/workout/workoutAdapter';
import { callGeminiAPIWithRotation } from './services/aiService';
import { useProfileAndTargets } from './hooks/useProfileAndTargets';
import {
  enrichDbRowWithFoodUnits,
} from './foodUnits';
import { withDefaultUsageStats, recordDraftFoodsUsageStats, getCurrentTimeSlot } from './features/mealBuilder/utils/timeSlotUtils';
import TargetSettingsModal from './components/modals/TargetSettingsModal';
import MainMenuDrawer from './layout/MainMenuDrawer';
import { isHealthDiabetesChatMode } from './features/chat/healthChatMode.js';
import { useStrategicPlanner } from './hooks/useStrategicPlanner';
import { UserNutritionGoalsProvider } from './UserNutritionGoalsContext';
import { mergeProfileNutritionFromServer, buildNutritionGoalsSnapshot } from './userNutritionGoals';
import {
  getTimePositionPercent,
  getWallClockDecimalHour,
} from './timeLayout';
import DailyMacroSheet from './DailyMacroSheet';
import FoodLabelModal from './FoodLabelModal';
import FirebaseDataLoadingLayer from './components/FirebaseDataLoadingLayer';
import { buildMetabolicMapThresholdsFromSplit } from './features/planning/trainingBlockTargets';
import useTrainingBlock from './hooks/planning/useTrainingBlock';
import usePlannedDayDelta from './hooks/usePlannedDayDelta';
import {
  normalizeActiveCompensation,
  resolveActiveCompensationDailyDelta,
  resolveActiveCompensationOnDate,
} from './utils/activeCompensation';
import TimelineNodeReport from './components/TimelineNodeReport';
import MetabolicTimelineSheet from './components/MetabolicTimelineSheet';
import {
  MAIN_BOTTOM_TAB_ORDER,
  PERSISTED_BOTTOM_TAB_IDS,
  BOTTOM_NAV_ITEMS,
  ACTIVE_BOTTOM_TAB_LS_KEY,
  EVENT_USAGE_LS_KEY,
  EVENT_USAGE_DEFAULT,
  NODE_DRAG_ARM_CANCEL_MOVE_PX,
  createEmptyEnergyChartData,
  ADD_MENU_ORDER_LS_KEY,
} from './constants/salaComandiConstants';
import { persistTrendHubHemisphere } from './features/trendHub/hooks/useTrendHubHemisphere';
import { takeNextKentuIntroPhrase } from './kentuIntroPhrases';
import {
  SLEEP_HOURS_MAX,
  WATER_ML_MAX,
  clampSleepDurationHours,
} from './utils/inputSanity';
import {
  getWorkoutActivityTypeDef,
  getWorkoutActivityLogDescription,
  getCognitiveMetForActivity,
  normalizeMuscleGroupArray,
  resolveWorkoutActivityTypeId,
  resolveWorkoutMusclesForForm,
  resolveActivitySheetTab,
  stashActivitySheetTempTab,
  peekActivitySheetTempTab,
} from './activityCatalog';
import { normalizeMealSlotType } from './features/mealBuilder/utils/slotPredictor';
import {
  parseDurationMinutesInput,
  WORKOUT_DURATION_DEFAULT,
  WORKOUT_DURATION_MIN,
  WORKOUT_DURATION_MAX,
} from './utils/durationMinutesInput';
import { writeTodayTrackerLocalCache } from './utils/trackerCacheUtils';
import {
  savePersonalDbToCache,
} from './utils/offlineCacheUtils';
import { promoteForeignMealItemsForSave } from './utils/personalFoodPromotion';
import { workoutActivityRequiresStrengthDetailNote } from './utils/workoutActivityNotes';
import { calculateAge } from './utils/profileAge';
import { stripUndefined } from './utils/firebasePayloadUtils';
import {
  dayHasFoodLog,
  isDayIntentionalFast,
  resolveOvernightCarryMeal,
} from './utils/dayTrackingStatus';
import { useChatOverlay } from './contexts/ChatOverlayContext';
import { getCurrentTimeRoundedTo15Min, getDefaultWorkoutEndTimeDecimal } from './utils/decimalTimeUtils';
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
  findExistingCanonicalMealSlot,
  normalizeMealUpsertAction,
  resolveUpsertActionFromPayload,
  buildMealCommitFingerprint,
} from './features/commandTerminal/meals/mealUpsert';
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
import AppBottomNavigation from './layout/AppBottomNavigation';
import AppHeader from './layout/AppHeader';
import EnergyArcWidget from './components/EnergyArcWidget';
import DiaryDetailsSheet from './components/DiaryDetailsSheet';
import EnergyBalanceSheet from './components/EnergyBalanceSheet';
import CalorieDetailsModal from './components/CalorieDetailsModal';
import FatDetailsSheet from './components/FatDetailsSheet';
import CarbsDetailsSheet from './components/CarbsDetailsSheet';
import ProteinDetailsSheet from './components/ProteinDetailsSheet';
import MineralsDetailsSheet from './components/MineralsDetailsSheet';
import VitaminsDetailsSheet from './components/VitaminsDetailsSheet';
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
import { evaluateDailyPillars } from './features/salaComandi/engines/KentuPhysiologyEngine';
import {
  saveDiaryLogForDate,
  setDayIntentionalFastFlag,
  extractMealTimesFromLog,
  getLogForDateFromStorico,
} from './utils/storicoDayPersistence';
import useWorkoutManager from './hooks/salaComandi/useWorkoutManager';
import useKentuMealHandlers from './hooks/salaComandi/useKentuMealHandlers';
import useDiaryFirebaseSync from './hooks/salaComandi/useDiaryFirebaseSync';
import { useDeferredMemo } from './hooks/useDeferredMemo';
import useFourCylinderBootCatchUp from './hooks/salaComandi/useFourCylinderBootCatchUp';
import {
  attachFourCylinderSleepSnapshot,
  persistFourCylinderAfterSleep,
} from './features/salaComandi/utils/fourCylinderSleepBridge';
import {
  persistFourCylinderRebuild,
  rebuildFourCylinderFromTrackerHistory,
  resolveFourCylinderForWorkoutSave,
} from './features/salaComandi/utils/fourCylinderRebuild';
import { persistFourCylinderState } from './features/salaComandi/utils/fourCylinderPersist';
import useTimelineDiaryActions from './hooks/salaComandi/useTimelineDiaryActions';
import useSleepEngine from './hooks/useSleepEngine';
import ReportModalOverlay from './features/salaComandi/overlays/ReportModalOverlay';
import AlcoholPopupOverlay from './features/salaComandi/overlays/AlcoholPopupOverlay';
import SleepModalOverlay from './features/salaComandi/overlays/SleepModalOverlay';
import SleepPromptOverlay from './features/salaComandi/overlays/SleepPromptOverlay';
import { markPredictiveGreetingsSuperseded } from './features/predictive/predictiveGreeting';
import QuickNodeEditOverlay from './features/salaComandi/overlays/QuickNodeEditOverlay';
import WaterActionModal from './components/modals/WaterActionModal';
import KentuLazySectionFallback from './components/KentuLazySectionFallback';
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
import { buildPer100TargetNutrientsFromRow } from './features/mealBuilder/utils/foodMacroUtils';
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
  useSmartKentuTriggers,
} from './useSmartKentuTriggers';
import { TARGETS, DEFAULT_TARGETS, useBiochimico, computeTotali, getDefaultNutrientValue } from './useBiochimico';
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
  SLEEP_AI_MI_FITNESS_INSTRUCTIONS,
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
  CALORIE_STRATEGY_KCAL_DELTA,
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
} from './features/chat/aiPromptBuilders';
import {
  migrateIdealStrategy,
  readPersistedActiveBottomTab,
  readPersistedEventUsage,
  computeSleepDurationHours,
  computeBedtimeFromWakeAndDuration,
  formatSleepDurationParts,
  getNowDecimalHourForPlanMerge,
  tryAcquireMealConfirmGuard,
  releaseMealConfirmGuard,
  safeNum,
  parseTimeStrToDecimal,
} from './utils/salaComandiUtils';
import { getAlcoholGlassIcon, getAlcoholBaseMl } from './utils/alcoholUiUtils';
import { useNeuralResetSession } from './hooks/salaComandi/useNeuralResetSession';
import { useMealPieDialData } from './hooks/salaComandi/useMealPieDialData';
import NeuralResetZenPortal from './components/salaComandi/NeuralResetZenPortal';
import HomeOggiDialSection from './components/salaComandi/HomeOggiDialSection';
import GhostProgramDeleteModal from './components/salaComandi/GhostProgramDeleteModal';
import EditFoodQuantityModal from './components/salaComandi/EditFoodQuantityModal';
import SncStressPopup from './components/salaComandi/SncStressPopup';
import PeriodReportOverlay from './components/salaComandi/PeriodReportOverlay';
import LongevityTabShell from './components/salaComandi/LongevityTabShell';
import PlanningTabPanel from './components/salaComandi/PlanningTabPanel';
import RecalibrationProposalModal from './components/salaComandi/RecalibrationProposalModal';
import AnalisiTimelineTab from './components/salaComandi/AnalisiTimelineTab';
import MetabolicTimelineOverlay from './components/salaComandi/MetabolicTimelineOverlay';
import { useHealthScoreSnapshot } from './hooks/salaComandi/useHealthScoreSnapshot';
import { useLongevityScore } from './features/trendHub/hooks/useLongevityScore';
import { calculateProgressionScore } from './features/trendHub/utils/saluteDashboardMetrics';
import { buildLongevityPagellaInsight } from './features/trendHub/utils/longevityInsightGenerator';
import {
  buildProgressionLogsWindow,
  selectTodayLog,
  LONGEVITY_WINDOW_DAYS,
} from './features/trendHub/utils/saluteHistorySeries';
import { useLongevityDashboardData } from './hooks/salaComandi/useLongevityDashboardData';
import { useDailyWeeklyPlanningSync } from './hooks/salaComandi/useDailyWeeklyPlanningSync';
import { useGhostSimCompensation } from './hooks/salaComandi/useGhostSimCompensation';
import { useStimulantQuickLog } from './hooks/salaComandi/useStimulantQuickLog';
import { usePersonalFoodDbBootstrap } from './hooks/salaComandi/usePersonalFoodDbBootstrap';
import { useMainTabSwipe } from './hooks/salaComandi/useMainTabSwipe';
import { useTimelineChartShell } from './hooks/salaComandi/useTimelineChartShell';
import { useKentuChatShell } from './hooks/salaComandi/useKentuChatShell';
import KentuChatFab from './components/salaComandi/KentuChatFab';
import KentuChatShell from './components/salaComandi/KentuChatShell';

export { calculateAge } from './utils/profileAge';

const CentroAnalisiView = lazy(() => import('./features/centroAnalisi/CentroAnalisiView'));
const SnapshotHub = lazy(() => import('./features/trendHub/SnapshotHub'));
const WorkoutView = lazy(() => import('./drawers/vistas/WorkoutView'));
const ApiDiary = lazy(() => import('./components/ApiDiary'));
const BiochemicalDiagnostics = lazy(() => import('./features/nutrition/BiochemicalDiagnostics'));
const FastMealLogger = lazy(() => import('./features/mealBuilder/FastMealLogger'));
const ArchivioStoricoView = lazy(() => import('./components/ArchivioStoricoView'));
const DevConsoleView = lazy(() => import('./components/DevConsoleView'));
const KentuChatUI = lazy(() => import('./features/chat/KentuChatWithWipMeal'));
const HealthReportView = lazy(() => import('./features/health/HealthReportView'));
const TherapyPlanView = lazy(() => import('./features/health/TherapyPlanView'));
const TrendMetricLineChart = lazy(() => import('./components/charts/TrendMetricLineChart'));

export default function SalaComandi() {
  const navigate = useNavigate();
  const location = useLocation();
  const { db, auth, user } = useFirebase();
  const isAuthenticated = !!user;
  const userUid = user?.uid ?? null;
  const [introPhrase] = useState(() => takeNextKentuIntroPhrase());

  // STATI INTERFACCIA
  const [currentTime, setCurrentTime] = useState(8);
  const [showDetails, setShowDetails] = useState(false);
  /** Intent apertura Scheda Attività (tab + nonce): forza sync/remount ad ogni tap rapido. */
  const [activitySheetIntent, setActivitySheetIntent] = useState({ tab: 'pesi', nonce: 0 });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeAction, setActiveAction] = useState('home');
  /** Se un drawer/modale rapido è partito dalla chat, al salvataggio si torna in ai_chat (niente Home). */
  const returnToChatAfterQuickActionRef = useRef(false);
  const closeOverlayChatRef = useRef(null);
  const [activeBottomTab, setActiveBottomTab] = useState(readPersistedActiveBottomTab);
  /** Apertura TrainingBlockCreator dalla pulsantiera (tab Pianifica). */
  const [trainingBlockCreatorOpen, setTrainingBlockCreatorOpen] = useState(false);
  /** Overlay Fotografia (Progressione / Salute) — aperto dai widget Home, non dalla bottom bar. */
  const [snapshotOverlayOpen, setSnapshotOverlayOpen] = useState(false);
  /** Emisfero bloccato quando l'overlay è aperto da un widget Home. */
  const [snapshotOverlayHemisphere, setSnapshotOverlayHemisphere] = useState('progressione');
  const [snapshotOverlayFocus, setSnapshotOverlayFocus] = useState(null);
  const [eventUsage, setEventUsage] = useState(readPersistedEventUsage);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [showFastLogger, setShowFastLogger] = useState(false);
  const [fastLoggerAutoOpenScanner, setFastLoggerAutoOpenScanner] = useState(false);
  const [fastLoggerRemountKey, setFastLoggerRemountKey] = useState(0);
  const [mealToEdit, setMealToEdit] = useState(null);
  const [fastLoggerInitialSlot, setFastLoggerInitialSlot] = useState(null);
  /** Ghost meal in conferma: salvataggio = pasto reale + rimozione ghost dal log. */
  const [pendingGhostMealId, setPendingGhostMealId] = useState(null);
  const showFastLoggerRef = useRef(false);
  useEffect(() => {
    showFastLoggerRef.current = showFastLogger;
  }, [showFastLogger]);

  const {
    slideDirection,
    setSlideDirection,
    handleMainTabTouchStart,
    handleMainTabTouchMove,
    handleMainTabTouchEnd,
    handleMainTabTouchCancel,
  } = useMainTabSwipe({
    activeBottomTab,
    setActiveBottomTab,
  });

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

  /** Home / deep-link → Fotografia Progressione (diagnostica). */
  const handleOpenTrendDiag = useCallback(() => {
    persistTrendHubHemisphere('progressione');
    setSnapshotOverlayHemisphere('progressione');
    setSnapshotOverlayFocus(null);
    setSnapshotOverlayOpen(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  /** Home twin widget → Fotografia emisfero Salute. */
  const handleOpenTrendSalute = useCallback(() => {
    persistTrendHubHemisphere('salute');
    setSnapshotOverlayHemisphere('salute');
    setSnapshotOverlayFocus(null);
    setSnapshotOverlayOpen(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  /** Home twin widget → Fotografia emisfero Progressione. */
  const handleOpenTrendProgressione = useCallback(() => {
    persistTrendHubHemisphere('progressione');
    setSnapshotOverlayHemisphere('progressione');
    setSnapshotOverlayFocus(null);
    setSnapshotOverlayOpen(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  const handleCloseSnapshotOverlay = useCallback(() => {
    setSnapshotOverlayOpen(false);
    setSnapshotOverlayFocus(null);
  }, []);

  /** Progressione / Salute → vista completa telemetria muscolare. */
  const handleOpenMuscleTelemetry = useCallback(() => {
    persistTrendHubHemisphere('salute');
    setSnapshotOverlayHemisphere('salute');
    setSnapshotOverlayFocus('muscle_telemetry');
    setSnapshotOverlayOpen(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  const handleConsumeSaluteFocus = useCallback(() => {
    setSnapshotOverlayFocus(null);
  }, []);

  /** Deep-link da `/centro-analisi` → stessa Fotografia dei widget Home. */
  useEffect(() => {
    const target = String(location.state?.openFotografia || '').toLowerCase();
    if (target !== 'salute' && target !== 'progressione') return undefined;
    const panel = String(location.state?.openFotografiaPanel || '').toLowerCase();
    if (target === 'salute') {
      persistTrendHubHemisphere('salute');
      setSnapshotOverlayHemisphere('salute');
      setSnapshotOverlayFocus(panel === 'muscle_telemetry' ? 'muscle_telemetry' : null);
    } else {
      persistTrendHubHemisphere('progressione');
      setSnapshotOverlayHemisphere('progressione');
      setSnapshotOverlayFocus(null);
    }
    setSnapshotOverlayOpen(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
    navigate(location.pathname || '/', { replace: true, state: {} });
    return undefined;
  }, [location.state, location.pathname, navigate]);

  const [pendingAiBatch, setPendingAiBatch] = useState(null);
  /** add_food con qty mancante: proposta da abitudine DB + storico, in attesa di Sì/No */
  const [pendingHabit, setPendingHabit] = useState(null);
  const [selectedMealCenter, setSelectedMealCenter] = useState(null);
  const [dailyMacroSheetOpen, setDailyMacroSheetOpen] = useState(false);
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
  const prevChatOpenRef = useRef(false);
  const tryEmitPredictiveGreetingRef = useRef(null);
  const closeDrawerRef = useRef(null);
  useEffect(() => { isDrawerOpenRef.current = isDrawerOpen; }, [isDrawerOpen]);
  useEffect(() => { activeActionRef.current = activeAction; }, [activeAction]);
  useEffect(() => {
    closeDrawerRef.current = closeDrawer;
  });

  useEffect(() => {
    window.history.pushState({ noExit: true }, '');
    const handlePopState = () => {
      if (isDrawerOpenRef.current) {
        closeDrawerRef.current?.();
        window.history.pushState({ noExit: true }, '');
        return;
      }
      // Mai forzare Home se la chat è aperta (redirect fantasma post eventi rapidi / gesture back).
      if (activeActionRef.current === 'ai_chat') {
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
  const {
    foodDb,
    setFoodDb,
    userPortions,
    setUserPortions,
    userPortionsRef,
    userFoodAliases,
    setUserFoodAliases,
    userFoodAliasesRef,
    kentuCatalogItDb,
    csvFoodDb,
    offFoodDb,
    csvFoodDbLoading,
    kentuCatalogItDbRef,
    csvFoodDbRef,
    offFoodDbRef,
    runHistoricalFoodDbSanitize,
  } = usePersonalFoodDbBootstrap({
    userUid,
    db,
    auth,
    isAuthenticated,
    showFastLogger,
    activeAction,
  });
  const [dailyLog, setDailyLog] = useState([]);
  const dailyLogRef = useRef(dailyLog);
  dailyLogRef.current = dailyLog;
  /** Idempotenza commit pasti chat (ADD_FOOD + UPSERT_MEAL entro finestra breve). */
  const mealCommitGuardRef = useRef({ fingerprint: null, at: 0 });
  const MEAL_COMMIT_DEDUPE_MS = 5000;
  const activeLog = useMemo(() => {
    const raw = isSimulationMode && simulatedLog != null ? simulatedLog : dailyLog;
    return Array.isArray(raw) ? raw : [];
  }, [isSimulationMode, simulatedLog, dailyLog]);

  // STATI MODULI (Pasti, Acqua, Allenamento, Zen)
  const [mealType, setMealType] = useState('cena');
  const [mealBuilder, setMealBuilder] = useState({ active: false, mealType: '', foods: [] });
  const mealBuilderRef = useRef(mealBuilder);
  mealBuilderRef.current = mealBuilder;
  const [mealPlannerGhostNote, setMealPlannerGhostNote] = useState('');
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
  const [quickEventConfirm, setQuickEventConfirm] = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [inputWeightDate, setInputWeightDate] = useState(() => getTodayString());
  const [inputWeight, setInputWeight] = useState('');
  const [inputWaist, setInputWaist] = useState('');
  const [inputFat, setInputFat] = useState('');
  const [drawerMuscleMass, setDrawerMuscleMass] = useState('');
  const [drawerBodyWater, setDrawerBodyWater] = useState('');
  const [drawerVisceralFat, setDrawerVisceralFat] = useState('');
  const [addChoiceView, setAddChoiceView] = useState('main'); // 'main' | 'stimulant'
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
  /** Incrementato ad ogni apertura wizard: consente idratazione da Firebase senza sovrascrivere durante l’editing. */
  const [planningWizardHydrateNonce, setPlanningWizardHydrateNonce] = useState(0);

  const [showAlcoholPopup, setShowAlcoholPopup] = useState(false);
  const [alcoholForm, setAlcoholForm] = useState({ subtype: 'vino', ml: 150, abv: 12, timeStr: '20:00' });
  const [showSncPopup, setShowSncPopup] = useState(false);
  const [showSleepPrompt, setShowSleepPrompt] = useState(false);
  /** null | { editingId: string | null } — editingId null = nuovo sonno */
  const [sleepModal, setSleepModal] = useState(null);
  const [sleepFormWakeStr, setSleepFormWakeStr] = useState('07:00');
  const [sleepFormDurationHours, setSleepFormDurationHours] = useState(7);
  const [sleepFormDurationMinutes, setSleepFormDurationMinutes] = useState(30);
  const [sleepFormNotes, setSleepFormNotes] = useState('');
  const [sleepFormQuality, setSleepFormQuality] = useState(3);

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
      const wake = Number(item.wakeTime ?? item.sleepEnd);
      setSleepFormWakeStr(decimalToTimeStr(Number.isFinite(wake) ? wake : 7.5));
      const durationMinutes = Number(item.durationMinutes);
      const hoursDec = Number(item.hours ?? item.duration ?? item.sleepHours);
      if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
        const clampedTotalMin = Math.min(SLEEP_HOURS_MAX * 60, Math.max(0, Math.round(durationMinutes)));
        setSleepFormDurationHours(Math.floor(clampedTotalMin / 60));
        setSleepFormDurationMinutes(clampedTotalMin % 60);
      } else if (Number.isFinite(hoursDec) && hoursDec > 0) {
        const clamped = clampSleepDurationHours(hoursDec, 0);
        setSleepFormDurationHours(Math.floor(clamped));
        setSleepFormDurationMinutes(Math.round((clamped % 1) * 60));
    } else {
        const bed = Number(item.bedtime ?? item.sleepStart);
        if (Number.isFinite(bed) && Number.isFinite(wake)) {
          const inferred = clampSleepDurationHours(computeSleepDurationHours(bed, wake), 0);
          setSleepFormDurationHours(Math.floor(inferred));
          setSleepFormDurationMinutes(Math.round((inferred % 1) * 60));
        } else {
          setSleepFormDurationHours(7);
          setSleepFormDurationMinutes(30);
        }
      }
      setSleepFormNotes(String(item.notes ?? item.note ?? item.details ?? '').trim());
      const q = Number(item.quality ?? item.rating);
      setSleepFormQuality(Number.isFinite(q) && q >= 1 && q <= 5 ? Math.round(q) : 3);
    } else {
      setSleepFormWakeStr('07:00');
      setSleepFormDurationHours(7);
      setSleepFormDurationMinutes(30);
      setSleepFormNotes('');
      setSleepFormQuality(3);
    }
  }, [sleepModal, isSimulationMode, dailyLog, simulatedLog]);

  useEffect(() => {
    if (!showSleepPrompt) return;
    const nowHour = getWallClockDecimalHour();
    const roundedWake = Math.round(nowHour * 4) / 4;
    setSleepFormWakeStr(decimalToTimeStr(roundedWake));
    setSleepFormDurationHours(7);
    setSleepFormDurationMinutes(30);
    setSleepFormNotes('');
    setSleepFormQuality(3);
  }, [showSleepPrompt]);

  const [selectedNodeReport, setSelectedNodeReport] = useState(null);
  /** Menu inserimento rapido timeline: `{ hour, view: 'main' | 'events' }`. */
  const [timelineInsertUI, setTimelineInsertUI] = useState(null);
  const [editingQuickNode, setEditingQuickNode] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHealthReport, setShowHealthReport] = useState(false);
  const [showTherapyPlan, setShowTherapyPlan] = useState(false);
  const [userProfile, setUserProfile] = useState({
    displayName: '',
    gender: 'M',
    age: 30,
    weight: 75,
    height: 175,
    activityLevel: '1.55',
    goal: 'maintain',
    nutritionGoal: 'maintain',
    targetCalories: 2000,
    proteinTarget: null,
    level: 'base',
    /** 'diabete' | 'salute' → chat health; assente/kentu → macro standard */
    appMode: null,
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

  const isDiabetesAppMode = useMemo(
    () => isHealthDiabetesChatMode(userProfile, userUid),
    [userProfile, userUid],
  );

  const openHealthReport = useCallback(() => {
    setShowHealthReport(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  const openTherapyPlan = useCallback(() => {
    setShowTherapyPlan(true);
    setTrainingBlockCreatorOpen(false);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  const openTrainingPlan = useCallback(() => {
    setShowTherapyPlan(false);
    setSnapshotOverlayOpen(false);
    setActiveBottomTab('oggi');
    setTrainingBlockCreatorOpen(true);
    setActiveAction(null);
    setIsDrawerOpen(false);
  }, []);

  const bottomNavItems = useMemo(() => BOTTOM_NAV_ITEMS, []);

  const handleBottomNavTabSelect = useCallback(
    (tabId) => {
      if (tabId === 'menu') {
        setActiveAction('menu_secondary');
        setIsDrawerOpen(false);
        return;
      }
      if (tabId === 'pianifica') {
        // Legacy / deep-link: Diabete → Terapia; standard → Piano Allenamento.
        if (isDiabetesAppMode) {
          openTherapyPlan();
          return;
        }
        openTrainingPlan();
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
      setShowMetabolicTimeline(false);
      setSnapshotOverlayOpen(false);
      setActiveBottomTab(tabId);
    },
    [activeBottomTab, isDiabetesAppMode, openTherapyPlan, openTrainingPlan],
  );

  const handleAppModeChange = useCallback(async (appMode, profileSnapshot = null) => {
    const uid = auth.currentUser?.uid || userUid;
    if (!uid || !db) {
      throw new Error('Utente non autenticato');
    }
    const mode = String(appMode || '').trim().toLowerCase() || 'standard';
    const nextProfile = {
      ...(profileSnapshot && typeof profileSnapshot === 'object' ? profileSnapshot : userProfile),
      appMode: mode,
    };
    setUserProfile(nextProfile);
    if (mode !== 'diabete' && mode !== 'salute' && mode !== 'health' && mode !== 'diabetes') {
      setShowHealthReport(false);
      setShowTherapyPlan(false);
    }
    await update(ref(db, `users/${uid}/profile_targets/profile`), { appMode: mode });
  }, [auth, db, userProfile, userUid]);

  const { strategicPlan } = useStrategicPlanner(
    db,
    userProfile?.uid || user?.uid
  );

  /** Training Block live — fonte per ghost_workout timeline (indipendente dal widget Home). */
  const handleConfirmTrainingBlockSessionRef = useRef(
    /** @type {((session: object, context: object) => void | Promise<void>) | null} */ (null),
  );
  const invokeTrainingBlockOnConfirm = useCallback(async (session, context) => {
    const fn = handleConfirmTrainingBlockSessionRef.current;
    if (typeof fn === 'function') {
      await fn(session, context);
    }
  }, []);

  const {
    block: trainingBlockLive,
    todaySession: trainingBlockTodaySession,
    metabolicTargets: trainingBlockMetabolicTargets,
    confirmSession: confirmTrainingBlockSession,
  } = useTrainingBlock({
    db,
    userUid: user?.uid ?? null,
    todayIso: currentTrackerDate || getTodayString(),
    userProfile,
    isSimulationMode,
    onConfirmSession: invokeTrainingBlockOnConfirm,
  });

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

  const dailyWaterGoal = userTargets?.water ?? 2500;

  const neuralReset = useNeuralResetSession({
    activeAction,
    isDrawerOpen,
  });

  // AI ASSISTANT
  const [showBiochemicalDiagnostics, setShowBiochemicalDiagnostics] = useState(false);
  const [biochemicalDetailModal, setBiochemicalDetailModal] = useState(null);
  const [engineAlignToastVisible, setEngineAlignToastVisible] = useState(false);
  const engineAlignToastTimerRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const {
    chatShellMounted,
    chatHistory,
    setChatHistory,
    isChatOpen,
    openChat,
    closeChat,
  } = useKentuChatShell({
    introPhrase,
    currentTrackerDate,
    activeAction,
    setActiveAction,
    setIsDrawerOpen,
    setIsFabOpen,
    closeOverlayChatRef,
  });
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
    handleSaveHealthBiometrics,
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
    inputWaist,
    inputFat,
    drawerMuscleMass,
    drawerBodyWater,
    drawerVisceralFat,
    setShowWeightModal,
    setInputWeightDate,
    setInputWeight,
    setInputWaist,
    setInputFat,
    setDrawerMuscleMass,
    setDrawerBodyWater,
    setDrawerVisceralFat,
  });
  const [showReport, setShowReport] = useState(false);
  const [showMetabolicSheet, setShowMetabolicSheet] = useState(false);
  const [showCalorieDetailsSheet, setShowCalorieDetailsSheet] = useState(false);
  const [showDiarySheet, setShowDiarySheet] = useState(false);
  /** Timeline metabolica 24h aperta da Salute (overlay fullscreen). */
  const [showMetabolicTimeline, setShowMetabolicTimeline] = useState(false);
  const [showEnergySheet, setShowEnergySheet] = useState(false);
  useEffect(() => {
    console.log('Stato diario:', showDiarySheet);
  }, [showDiarySheet]);

  const openDiarioLista = useCallback(() => {
    setShowDiarySheet(false);
    setShowMetabolicTimeline(false);
    setSnapshotOverlayOpen(false);
    setActiveBottomTab('analisi');
    setIsDrawerOpen(false);
    setActiveAction(null);
  }, []);

  const openMetabolicTimeline = useCallback(() => {
    setShowMetabolicTimeline(true);
    setSnapshotOverlayOpen(false);
    setIsDrawerOpen(false);
  }, []);
  const [showFatSheet, setShowFatSheet] = useState(false);
  const [showCarbsSheet, setShowCarbsSheet] = useState(false);
  const [showProteinSheet, setShowProteinSheet] = useState(false);
  const [showMineralsSheet, setShowMineralsSheet] = useState(false);
  const [showVitaminsSheet, setShowVitaminsSheet] = useState(false);
  const [showDateCalendarModal, setShowDateCalendarModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [trendModalMetric, setTrendModalMetric] = useState(null);
  const [trendDays, setTrendDays] = useState(30);
  const [reportViewedDates, setReportViewedDates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reportViewedDates')) || {}; } catch { return {}; }
  });
  const [reportPeriod, setReportPeriod] = useState('7');
  const [calendarMonthIso, setCalendarMonthIso] = useState(() => getTodayString().slice(0, 7));

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
    // Calcolo 60× risk matrix: solo quando il calendario è aperto (evita jank post-storico).
    if (!showDateCalendarModal) return out;
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
  }, [fullHistory, userTargets, showDateCalendarModal]);

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
    scheduledWorkoutContextRef.current = null;
  }, [currentTrackerDate]);

  useEffect(() => {
    const d = currentTrackerDate || getTodayString();
    try {
      const global = localStorage.getItem('kentu_cal_strategy_global');
      const v = (global === 'deficit' || global === 'pari' || global === 'surplus')
        ? global
        : localStorage.getItem(`kentu_cal_strategy_${d}`);
      if (v === 'deficit' || v === 'pari' || v === 'surplus') {
        setKentuDailyCalorieStrategy(v);
      } else {
        setKentuDailyCalorieStrategy('pari');
      }
    } catch {
      setKentuDailyCalorieStrategy('pari');
    }
  }, [currentTrackerDate]);

  const {
    applyGhostSimGoal,
    committedGhostGoal,
    committedGhostDeltaKcal,
    ghostAutoPilotEnabled,
    setGhostAutoPilotEnabled,
    rollingDebt,
    autoCompensationDelta,
    effectiveGhostDeltaKcal,
  } = useGhostSimCompensation({
    currentTrackerDate,
    db,
    user,
    auth,
    userTargets,
    userProfile,
    setUserProfile,
    kentuDailyCalorieStrategy,
    setKentuDailyCalorieStrategy,
    fullHistory,
    settingsBaseKcal: Math.round(Number(userProfile?.targetCalories) || 0) || null,
  });

  /** Persistenza piano Compensazione Esplicita (profilo / Firebase). */
  const persistProfileWithCompensation = useCallback(
    (activeCompensationValue) => {
      setUserProfile((prev) => {
        const next = {
          ...prev,
          activeCompensation: activeCompensationValue || null,
        };
        const uid = auth.currentUser?.uid || user?.uid;
        if (uid && db) {
          set(ref(db, `users/${uid}/profile_targets`), {
            profile: next,
            targets: userTargets,
          }).catch((err) => console.error('[Compensazione Esplicita] salvataggio fallito', err));
        }
        return next;
      });
    },
    [db, user?.uid, userTargets],
  );

  const applyActiveCompensationPlan = useCallback(
    async (planRaw) => {
      const startDate = getTodayString();
      const plan = normalizeActiveCompensation(
        {
          ...(planRaw && typeof planRaw === 'object' ? planRaw : {}),
          startDate,
          createdAt: new Date().toISOString(),
        },
        startDate,
      );
      if (!plan) return;
      persistProfileWithCompensation(plan);
    },
    [getTodayString, persistProfileWithCompensation],
  );

  const clearActiveCompensationPlan = useCallback(async () => {
    persistProfileWithCompensation(null);
  }, [persistProfileWithCompensation]);

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
  const accumuloSNC = useDeferredMemo(() => {
    if (!fullHistory || typeof fullHistory !== 'object') return 0;
    console.time('[perf] accumuloSNC');
    const result = computeAccumuloSNC(fullHistory, 60);
    console.timeEnd('[perf] accumuloSNC');
    return result;
  }, [fullHistory], 0);

  /** Serie giornaliera reale (Firebase `fullHistory`) per la bussola metabolica. */
  const metabolicCompassDailyHistory = useDeferredMemo(
    () => {
      console.time('[perf] metabolicCompassDailyHistory');
      const result = buildMetabolicCompassDailyHistory(
        fullHistory,
        currentTrackerDate || getTodayString(),
        userTargets
      );
      console.timeEnd('[perf] metabolicCompassDailyHistory');
      return result;
    },
    [fullHistory, currentTrackerDate, userTargets],
    [],
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
    fourCylinder: userModel?.fourCylinder ?? null,
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
  const waterIntake = useMemo(
    () =>
      manualNodes
        .filter((n) => n.type === 'water')
        .reduce((acc, n) => acc + safeNum(n.ml ?? n.amount), 0),
    [manualNodes],
  );
  const timelineContainerRef = useRef(null);
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
  const fullHistoryRef = useRef(fullHistory);
  const fullStoricoRef = useRef(fullStorico);
  useEffect(() => { fullHistoryRef.current = fullHistory; }, [fullHistory]);
  useEffect(() => { fullStoricoRef.current = fullStorico; }, [fullStorico]);

  const {
    remotePlanning,
    weeklyPlan,
    setWeeklyPlan,
    weeklyPlanningRemoteSigRef,
    weeklyPlanningListenerReadyRef,
  } = useDailyWeeklyPlanningSync({
    db,
    user,
    currentTrackerDate,
    currentTrackerDateRef,
    isSimulationMode,
  });

  const { syncDatiFirebase, isInitialLoadComplete, isProfileHydrated } = useDiaryFirebaseSync({
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

  /** Target giornalieri dal Training Block (Wave Nutrition sul giorno, se presenti). */
  const applyTrainingBlockDailyTargets = useCallback(
    async (dailyTargets, source = 'training-block') => {
      const targetKcal = Math.round(
        Number(dailyTargets?.targetKcal ?? dailyTargets?.kcal) || 0,
      );
      const baseKcalSplit = Math.round(Number(dailyTargets?.baseKcal) || 0);
      const deltaKcalSplit = Math.round(
        Number.isFinite(Number(dailyTargets?.deltaKcal))
          ? Number(dailyTargets.deltaKcal)
          : (baseKcalSplit > 0 ? targetKcal - baseKcalSplit : 0),
      );
      const prot = Math.round(Number(dailyTargets?.prot ?? dailyTargets?.pro) || 0);
      const carb = Math.round(Number(dailyTargets?.carb ?? dailyTargets?.cho) || 0);
      const fat = Math.round(Number(dailyTargets?.fat ?? dailyTargets?.fatTotal) || 0);
      if (targetKcal <= 0 && prot <= 0 && carb <= 0 && fat <= 0) {
        throw new Error('Target blocco non validi.');
      }

      const metabolicMapThresholds =
        dailyTargets?.metabolicMapThresholds
        && typeof dailyTargets.metabolicMapThresholds === 'object'
          ? dailyTargets.metabolicMapThresholds
          : null;

      const effectiveDate = currentTrackerDate || getTodayString();
      const patch = {
        kcal: targetKcal,
        targetKcal,
        prot,
        carb,
        fat,
        fatTotal: fat,
      };
      if (baseKcalSplit > 0) patch.baseKcal = baseKcalSplit;
      if (Number.isFinite(deltaKcalSplit)) patch.deltaKcal = deltaKcalSplit;
      if (metabolicMapThresholds) patch.metabolicMapThresholds = metabolicMapThresholds;

      let nextTargetsSnapshot = null;
      setUserTargets((prev) => {
        const nextHistory = upsertTargetHistoryEntry({
          history: prev?.targetHistory,
          effectiveDate,
          targets: patch,
          todayDate: getTodayString(),
          source,
          seedPreviousTargets: prev,
        });
        nextTargetsSnapshot = {
          ...prev,
          ...patch,
          autoCalculated: false,
          customTargets: {
            ...(prev?.customTargets && typeof prev.customTargets === 'object' ? prev.customTargets : {}),
            [effectiveDate]: {
              ...patch,
              source,
              appliedAt: Date.now(),
            },
          },
          targetHistory: nextHistory,
        };
        return nextTargetsSnapshot;
      });

      const uid = user?.uid || auth?.currentUser?.uid;
      if (db && uid && nextTargetsSnapshot) {
        const firebasePatch = {
          'targets/kcal': patch.kcal,
          'targets/targetKcal': patch.targetKcal,
          'targets/prot': patch.prot,
          'targets/carb': patch.carb,
          'targets/fat': patch.fat,
          'targets/fatTotal': patch.fatTotal,
          'targets/autoCalculated': false,
          'targets/targetHistory': nextTargetsSnapshot.targetHistory,
          'targets/customTargets': nextTargetsSnapshot.customTargets,
        };
        if (patch.baseKcal != null) firebasePatch['targets/baseKcal'] = patch.baseKcal;
        if (patch.deltaKcal != null) firebasePatch['targets/deltaKcal'] = patch.deltaKcal;
        if (patch.metabolicMapThresholds) {
          firebasePatch['targets/metabolicMapThresholds'] = patch.metabolicMapThresholds;
        }
        await update(ref(db, `users/${uid}/profile_targets`), firebasePatch);
        try {
          await update(ref(db, `users/${uid}/tracker_data/${TRACKER_STORICO_KEY(effectiveDate)}`), {
            customTargets: {
              ...patch,
              source,
              appliedAt: Date.now(),
            },
          });
        } catch (err) {
          console.warn('[applyTrainingBlockDailyTargets] day node:', err);
        }
      }
    },
    [auth, currentTrackerDate, db, getTodayString, user?.uid],
  );

  /**
   * Conferma sessione Training Block → target metabolici + log workout + 4° Pilastro.
   */
  const handleConfirmTrainingBlockSession = useCallback(
    async (session, context) => {
      const todayIso = String(context?.todayIso || currentTrackerDate || getTodayString()).slice(0, 10);
      const targets = context?.metabolicTargets;
      if (targets) {
        await applyTrainingBlockDailyTargets(targets, 'training-block');
      }

      const dayType = String(session?.type || '').toLowerCase();
      if (dayType === 'rest' || dayType === 'riposo') {
        return;
      }

      if (context?.skipWorkoutLog === true) {
        return;
      }

      const workoutType = dayType === 'cardio' || dayType === 'hiit' ? dayType : 'pesi';
      const musclesCanon = normalizeMuscleGroupArray(session?.muscles || []);
      const durationMin = Math.max(
        15,
        Math.round(Number(session?.durationMin) || 60),
      );
      const duration = durationMin / 60;
      const workoutKcal = Math.max(
        0,
        Math.round(Number(session?.plannedKcalBurn) || (workoutType === 'cardio' ? 350 : 320)),
      );
      const completedAt = Date.now();
      const finalId = `tb_confirm_${completedAt}`;
      const desc =
        getWorkoutActivityLogDescription(workoutType, musclesCanon)
        || String(session?.title || 'Allenamento').trim()
        || 'Allenamento';
      const plannedDec = Number(session?.plannedTime);
      const startDec = Number.isFinite(plannedDec) && plannedDec >= 0 && plannedDec < 24
        ? plannedDec
        : getCurrentTimeRoundedTo15Min();

      const logData = {
        id: finalId,
        type: 'workout',
        workoutType,
        desc,
        name: desc,
        kcal: workoutKcal,
        cal: workoutKcal,
        duration,
        muscles: musclesCanon,
        time: startDec,
        mealTime: startDec,
        completedAt,
        source: 'training-block',
      };
      const nodeData = {
        id: finalId,
        type: 'workout',
        time: startDec,
        duration,
        kcal: workoutKcal,
        icon: workoutType === 'cardio' ? '🏃' : '🏋️',
        subType: workoutType,
        muscles: musclesCanon,
        completedAt,
        source: 'training-block',
      };

      const baseLog = dailyLogRef.current || [];
      const baseNodes = (manualNodesRef.current || []).filter((n) => n && n.type !== 'ghost_workout');
      const projectedLog = [logData, ...baseLog.filter((e) => String(e?.id) !== finalId)];
      const projectedNodes = [...baseNodes.filter((n) => String(n?.id) !== finalId), nodeData]
        .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

      if (userModel && setUserModel) {
        const resolved = resolveFourCylinderForWorkoutSave({
          userModel,
          fullHistory,
          todayIso,
          newLog: projectedLog,
          newNodes: projectedNodes,
          editingWorkoutId: null,
          finalId,
          isWork: false,
          isCognitive: false,
          workoutType,
          musclesCanon,
          workoutKcal,
          duration,
          logData,
          proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
          dailyLog: baseLog,
        });
        if (resolved) {
          logData.fourCylinderSnapshot = resolved.snapshot;
          logData.completedAt = resolved.snapshot.capturedAt || completedAt;
          nodeData.fourCylinderRef = {
            engineVersion: resolved.snapshot.engineVersion,
            capturedAt: resolved.snapshot.capturedAt,
          };
          nodeData.completedAt = logData.completedAt;

          if (!isSimulationMode) {
            await persistFourCylinderState({
              db,
              userUid: user?.uid ?? null,
              setUserModel,
              nextFourCylinderState: resolved.nextState,
              fullHistory,
              anchorDateIso: todayIso || undefined,
              source: 'SalaComandi:trainingBlock',
            });
          } else {
            setUserModel((prev) => ({
              ...prev,
              fourCylinder: resolved.nextState,
            }));
          }
        }
      }

      const finalLog = projectedLog.map((entry) => (
        String(entry?.id) === String(finalId)
          ? { ...entry, ...logData }
          : entry
      ));
      const finalNodes = projectedNodes.map((node) => (
        String(node?.id) === String(finalId)
          ? { ...node, ...nodeData }
          : node
      ));

      if (isSimulationMode) {
        setSimulatedLog(finalLog);
        setManualNodes(finalNodes);
        return;
      }

      setDailyLog(finalLog);
      setManualNodes(finalNodes);
      syncDatiFirebase(finalLog, finalNodes);
    },
    [
      applyTrainingBlockDailyTargets,
      currentTrackerDate,
      getTodayString,
      userModel,
      setUserModel,
      fullHistory,
      userTargets?.prot,
      userProfile?.proteinTarget,
      isSimulationMode,
      db,
      user?.uid,
      syncDatiFirebase,
      setDailyLog,
      setManualNodes,
      setSimulatedLog,
    ],
  );

  useEffect(() => {
    handleConfirmTrainingBlockSessionRef.current = handleConfirmTrainingBlockSession;
  }, [handleConfirmTrainingBlockSession]);

  /**
   * Rinvio sessione Training Block → oggi diventa Riposo (base/delta/macro) e HUD si aggiorna subito.
   */
  const handlePostponeTrainingBlockSession = useCallback(
    async (context) => {
      const targets = context?.metabolicTargets;
      if (!targets) return;
      const source = context?.reason === 'postpone'
        ? 'training-block-postpone-rest'
        : 'training-block-schedule-change';
      await applyTrainingBlockDailyTargets(targets, source);
    },
    [applyTrainingBlockDailyTargets],
  );

  /** Obiettivo blocco allenamento → delta Calibrazione Target & Bilancio (Ghost Car). */
  const handleTrainingBlockMacroGoalCalibration = useCallback(
    async (suggestedDeltaKcal) => {
      if (typeof applyGhostSimGoal !== 'function') return;
      await applyGhostSimGoal(suggestedDeltaKcal);
    },
    [applyGhostSimGoal],
  );

  // --- 4-Cylinder boot: catch-up decadimento al login (physiology_model → stato locale + Firebase) ---
  useFourCylinderBootCatchUp({
    userUid,
    db,
    isSimulationMode,
    setUserModel,
    lastCalibrationWeek,
    fullHistory,
    proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
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
        const resolvedType = resolveWorkoutActivityTypeId(e.subType || e.workoutType);
        const looksCardio =
          String(e.workoutType || e.activity || '').toLowerCase() === 'cardio'
          || /cardio|corsa|bike|hiit/i.test(String(e.name || e.desc || ''));
        const typeId = resolvedType
          || (looksCardio
            ? (/hiit/i.test(String(e.name || e.desc || e.workoutType || '')) ? 'hiit' : 'cardio')
            : 'pesi');
        const muscles = resolveWorkoutMusclesForForm(e);
        const rawDur = Number(e.duration);
        const durationHours = Number.isFinite(rawDur) && rawDur > 0
          ? Math.max(0.25, rawDur > 24 ? rawDur / 60 : rawDur)
          : 1;
        return {
          id: e.id || `wk_tl_${normalizedTime}_${idx}`,
          type: 'workout',
          subType: typeId,
          workoutType: typeId,
          time: normalizedTime,
          mealTime: normalizedTime,
          duration: durationHours,
          kcal: Number.isFinite(Number(e.kcal)) ? Number(e.kcal) : (Number.isFinite(Number(e.cal)) ? Number(e.cal) : 0),
          cal: Number.isFinite(Number(e.cal)) ? Number(e.cal) : (Number.isFinite(Number(e.kcal)) ? Number(e.kcal) : 0),
          name: e.name || e.desc || (typeId === 'cardio' ? 'Cardio' : 'Allenamento'),
          desc: e.desc || e.name || '',
          muscles,
          workoutMuscles: muscles,
          workoutDetailNote: String(e.workoutDetailNote || '').trim(),
          icon: typeId === 'cardio' || typeId === 'hiit' ? '🏃' : '🏋️',
        };
      })
      .filter(Boolean);
  }, [activeLog]);

  const hasRealWorkoutInActiveLog = useMemo(
    () => (activeLog || []).some((n) => n && n.type === 'workout' && n.isGhost !== true),
    [activeLog]
  );

  /** ID già disegnati da computedActivityTimelineNodes → evita doppio nodo con manualNodes. */
  const activityTimelineIds = useMemo(() => new Set(
    (computedActivityTimelineNodes || []).map((n) => String(n?.id || '')).filter(Boolean),
  ), [computedActivityTimelineNodes]);

  /** Esclude ghost_workout senza ora definita o quando un workout reale nel diario li sostituisce. */
  const manualNodesForTimeline = useMemo(() => {
    const ACTIVITY_NODE_TYPES = new Set(['workout', 'activity', 'work', 'cognitive']);
    return (manualNodes || []).filter((n) => {
      if (!n) return false;
      if (n.type === 'ghost_workout') {
        if (hasRealWorkoutInActiveLog) return false;
        return resolveActivityOrWorkoutTimelineHour(n) != null;
      }
      // Dedup: allenamento già nel dailyLog non va ridisegnato da manualNodes.
      if (ACTIVITY_NODE_TYPES.has(n.type) && activityTimelineIds.has(String(n.id))) {
        return false;
      }
      return true;
    });
  }, [manualNodes, hasRealWorkoutInActiveLog, activityTimelineIds]);

  const allNodes = useMemo(() => {
    const todayStr = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'][new Date().getDay()];
    const todayPlan = strategicPlan?.days?.[todayStr];

    // Verifica se esiste già un vero allenamento registrato oggi nel log
    const hasRealWorkoutToday = (activeLog || []).some(entry => entry.type === 'workout' && !entry.isGhost);

    // --- Ologramma Training Block in RAM (non scritto sul log finché non Confermi) ---
    const tbSession = trainingBlockTodaySession;
    const tbPending = Boolean(
      trainingBlockLive?.isActive
      && tbSession
      && String(tbSession.status || 'pending') !== 'confirmed'
      && String(currentTrackerDate || '').slice(0, 10) === String(trainingBlockLive?.anchorDate || '').slice(0, 10)
      && String(tbSession.type || '').toLowerCase() !== 'rest',
    );
    const resolveTbHour = () => {
      if (!tbSession) return null;
      const raw = tbSession.plannedTime ?? tbSession.startTimeDec ?? tbSession.time ?? tbSession.preferredTimeTag;
      const asNum = Number(raw);
      if (Number.isFinite(asNum) && asNum >= 0 && asNum < 24) return asNum;
      if (raw != null && String(raw).trim() !== '') {
        const parsed = parseFlexibleTimeToDecimal(String(raw));
        if (parsed != null && Number.isFinite(parsed)) return parsed;
      }
      // Fallback: ologramma comunque visibile all'orario tipico serale
      return 18;
    };
    const tbHour = tbPending ? resolveTbHour() : null;
    const durationMin = Math.max(15, Math.round(Number(tbSession?.durationMin) || 60));
    const dayIso = String(currentTrackerDate || '').slice(0, 10);
    const ghostTitle = String(tbSession?.title || 'Allenamento').trim() || 'Allenamento';
    const ghostMuscles = normalizeMuscleGroupArray(tbSession?.muscles || []);
    const ghostType = String(tbSession?.type || 'pesi').toLowerCase() === 'pesi'
      ? 'pesi'
      : String(tbSession?.type || 'pesi').toLowerCase();
    const ghostKcal = Math.max(
      0,
      Math.round(Number(tbSession?.plannedKcalBurn) || 300),
    );
    const trainingBlockGhostNode = (
      !hasRealWorkoutToday
      && tbPending
      && tbHour != null
    ) ? {
      id: 'physio_ghost_today',
      type: 'ghost_workout',
      isGhost: true,
      isSynthetic: true,
      date: dayIso,
      time: tbHour,
      mealTime: tbHour,
      timeTag: tbHour,
      hour: tbHour,
      title: ghostTitle,
      name: ghostTitle,
      desc: ghostTitle,
      subtitle: ghostMuscles.length ? ghostMuscles.join(', ') : '',
      muscles: ghostMuscles,
      workoutType: ghostType,
      subType: ghostType,
      duration: durationMin / 60,
      durationMin,
      kcal: ghostKcal,
      cal: ghostKcal,
      icon: ghostType === 'cardio' ? '🏃' : '🏋️',
      source: 'training-block',
    } : null;

    const plannedHourDec = todayPlan?.hour != null ? parseFlexibleTimeToDecimal(String(todayPlan.hour)) : null;
    // Fantasma strategico solo se non c'è già il ghost del Training Block
    const plannedFocusMuscles = normalizeMuscleGroupArray(
      Array.isArray(todayPlan?.focus) ? todayPlan.focus : [],
    );
    const plannedStrategicNode = (
      !trainingBlockGhostNode
      && plannedHourDec != null
      && !hasRealWorkoutToday
      && todayPlan?.type !== 'REST'
    ) ? {
      id: `strategic_ghost_${todayStr}`,
      type: 'ghost_workout',
      isGhost: true,
      time: plannedHourDec,
      title: `Previsto: ${todayPlan.type === 'WORKOUT' ? 'Pesi' : todayPlan.type}`,
      subtitle: plannedFocusMuscles.length
        ? plannedFocusMuscles.join(', ')
        : (todayPlan.focus ? todayPlan.focus.join(', ') : ''),
      muscles: plannedFocusMuscles,
      kcal: todayPlan.kcal || 0,
      cal: todayPlan.kcal || 0,
      subType: todayPlan.type === 'WORKOUT' ? 'pesi' : String(todayPlan.type || 'pesi').toLowerCase(),
    } : null;

    // Assemblaggio fisico: base dal diario + manuali, poi push ologrammi
    const baseNodes = [
      ...computedMealNodes,
      ...ghostMealTimelineNodes,
      ...computedActivityTimelineNodes,
      ...manualNodesForTimeline,
    ];
    if (trainingBlockGhostNode) {
      baseNodes.push(trainingBlockGhostNode);
    }
    if (plannedStrategicNode) {
      baseNodes.push(plannedStrategicNode);
    }
    // Safety net: un solo nodo per ID (preferisce l'ordine di assemblaggio — diario prima).
    const seenIds = new Set();
    return baseNodes
      .filter((node) => {
        const id = node?.id != null ? String(node.id) : '';
        if (!id) return true;
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      })
      .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
  }, [
    computedMealNodes,
    ghostMealTimelineNodes,
    computedActivityTimelineNodes,
    manualNodesForTimeline,
    strategicPlan,
    activeLog,
    trainingBlockTodaySession,
    trainingBlockLive,
    currentTrackerDate,
  ]);

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
    localStorage.setItem('vyta_timeline', JSON.stringify(manualNodes));
  }, [manualNodes]);

  useEffect(() => {
    localStorage.setItem('vyta_idealStrategy', JSON.stringify(idealStrategy));
  }, [idealStrategy]);

  // Weekly calibration: at start of new week (Monday), adjust userModel from last week's data and persist.
  useEffect(() => {
    if (!userUid || !isAuthenticated || typeof fullHistory !== 'object') return;
    const today = getTodayString();
    const mondayThisWeek = getMondayOfWeek(today);
    if (today !== mondayThisWeek) return;
    const lastWeekMonday = addDays(mondayThisWeek, -7);
    if (lastCalibrationWeek === lastWeekMonday) return;

    const weeklyData = buildWeeklyDataFromHistory(fullHistory, userModel, idealStrategy, lastWeekMonday);
    const calibrated = calibrateUserModel(weeklyData, userModel);

    setUserModel((prev) => ({ ...prev, ...calibrated }));
    setLastCalibrationWeek(lastWeekMonday);

    const updates = {};
    Object.keys(calibrated).forEach((key) => {
      if (key !== 'fourCylinder' && key !== 'four_cylinder') {
        updates[key] = calibrated[key];
      }
    });
    updates.lastCalibrationWeek = lastWeekMonday;

    update(ref(db, `users/${userUid}/physiology_model`), updates).catch((err) => {
      console.warn('Errore durante il salvataggio della calibrazione:', err);
    });
  }, [userUid, isAuthenticated, fullHistory, userModel, idealStrategy, lastCalibrationWeek]);

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
    const pwa = p?.waist ?? p?.girovita;
    setInputWaist(pwa != null && pwa !== '' ? String(pwa) : '');
    const pbf = p?.bodyFat;
    setInputFat(pbf != null && pbf !== '' ? String(pbf) : '');
    const pm = p?.muscle_pct ?? p?.muscleMass ?? p?.muscle;
    setDrawerMuscleMass(pm != null && pm !== '' ? String(pm) : '');
    const pwt = p?.water_pct ?? p?.bodyWater ?? p?.water;
    setDrawerBodyWater(pwt != null && pwt !== '' ? String(pwt) : '');
    const pvf = p?.visceral_fat ?? p?.visceralFat ?? p?.visceral;
    setDrawerVisceralFat(pvf != null && pvf !== '' ? String(pvf) : '');
  }, [showWeightModal, getTodayString]);

  useEffect(() => {
    closeDrawerRef.current = closeDrawer;
  });

  // Motore biochimico
  const baseKcal = (effectiveTargetsForCurrentDate?.kcal ?? STRATEGY_PROFILES[dayProfile].kcal) + calorieTuning;
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
    // Non azzerare ai_chat: closeDrawer su stimulant/menu può arrivare dopo un ripristino chat.
    setTimeout(() => {
      setActiveAction((prev) => (prev === 'ai_chat' ? 'ai_chat' : null));
    }, 400);
  }

  /** Chiude il drawer e ripristina la chat solo se l’azione rapida era partita da lì. */
  const finishQuickActionSurface = useCallback((opts = {}) => {
    const preferChat = opts.forceChat === true || returnToChatAfterQuickActionRef.current === true;
    returnToChatAfterQuickActionRef.current = false;
    setIsDrawerOpen(false);
    setActiveAction(preferChat ? 'ai_chat' : null);
  }, []);

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

  const appendQuickEventConfirmToChat = useCallback((kind, extra = {}) => {
    const entry = buildQuickEventConfirmChatEntry(kind, extra);
    if (!entry || typeof setChatHistory !== 'function') return false;
    setChatHistory((prev) => [...(prev || []), entry]);
    return true;
  }, [setChatHistory]);

  const {
    stimulantSubtype,
    setStimulantSubtype,
    coffeeType,
    setCoffeeType,
    teaType,
    setTeaType,
    energyType,
    setEnergyType,
    coffeeVariant,
    setCoffeeVariant,
    stimulantTime,
    setStimulantTime,
    handleSaveChoiceStimulant,
  } = useStimulantQuickLog({
    manualNodes,
    setManualNodes,
    dailyLog,
    syncDatiFirebase,
    setShowChoiceModal,
    setAddChoiceView,
    activeAction,
    setActiveAction,
    returnToChatAfterQuickActionRef,
    appendQuickEventConfirmToChat,
    setQuickEventConfirm,
    finishQuickActionSurface,
  });

  /**
   * Chiude la scheda allenamento: se partita dalla chat, resta in chat e riproduce
   * Trainer3 nel banner (niente redirect home via closeDrawer timeout).
   */
  const closeWorkoutSurface = useCallback((opts = {}) => {
    const confirmExtra = opts?.confirmExtra;
    const preferChat = returnToChatAfterQuickActionRef.current === true
      || activeAction === 'ai_chat';

    setIsDrawerOpen(false);

    if (preferChat) {
      returnToChatAfterQuickActionRef.current = false;
      setActiveAction('ai_chat');
      if (confirmExtra) {
        // Chat montata nel frame successivo → banner cinema può riprodurre il video.
        window.setTimeout(() => {
          appendQuickEventConfirmToChat('workout', confirmExtra);
        }, 50);
      }
      return;
    }

    // Percorso Home: overlay fullscreen, chiudi azione senza smontare l'overlay.
    returnToChatAfterQuickActionRef.current = false;
    setActiveAction(null);
    if (confirmExtra) {
      setQuickEventConfirm(buildQuickEventConfirmPayload('workout', confirmExtra));
    }
  }, [activeAction, appendQuickEventConfirmToChat]);

  const handleWorkoutLoggedConfirm = useCallback((extra = {}) => {
    const preferChat = returnToChatAfterQuickActionRef.current === true
      || activeAction === 'ai_chat';
    if (preferChat) {
      setActiveAction('ai_chat');
      setIsDrawerOpen(false);
      appendQuickEventConfirmToChat('workout', extra);
      returnToChatAfterQuickActionRef.current = false;
      return;
    }
    setQuickEventConfirm(buildQuickEventConfirmPayload('workout', extra));
  }, [activeAction, appendQuickEventConfirmToChat]);

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
    openWorkoutFromTrainingBlockSession,
    openWorkoutEditorFromLogItem,
    handleStartWorkoutSession,
    clearWorkoutPlanDraft,
    resetWorkoutFormForNewSession,
    skipTodayPlanSession,
    handlePostponeWorkout,
    handleSaveWorkout,
    commitAddWorkoutCommand,
    postWorkoutReviewActive,
    dismissPostWorkoutReview,
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
    userModel,
    setUserModel,
    lastCalibrationWeek,
    fullHistory,
    proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
    onWorkoutLoggedConfirm: handleWorkoutLoggedConfirm,
    closeWorkoutSurface,
  });

  const handleExecuteTrainingBlockSession = useCallback(
    (session) => {
      openWorkoutFromTrainingBlockSession(session, async () => {
        try {
          await confirmTrainingBlockSession({ skipWorkoutLog: true });
        } catch (err) {
          console.warn('[SalaComandi] training block confirm after workout save:', err);
        }
      });
    },
    [openWorkoutFromTrainingBlockSession, confirmTrainingBlockSession],
  );

  const handleFourCylinderDiaryRebuild = useCallback(
    ({ dailyLog: nextLog, manualNodes: nextNodes }) => {
      if (isSimulationMode || !setUserModel) return;
      const todayIso = currentTrackerDate || getTodayString();
      const nextState = rebuildFourCylinderFromTrackerHistory({
        fullHistory,
        anchorDateIso: todayIso,
        activeLog: nextLog,
        activeManualNodes: nextNodes,
        proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
        seedState: userModel?.fourCylinder,
      });
      persistFourCylinderRebuild({
        db,
        userUid: user?.uid ?? null,
        setUserModel,
        nextFourCylinderState: nextState,
      });
    },
    [
      isSimulationMode,
      setUserModel,
      currentTrackerDate,
      fullHistory,
      userTargets?.prot,
      userProfile?.proteinTarget,
      userModel?.fourCylinder,
      db,
      user?.uid,
    ],
  );

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
    onFourCylinderDiaryRebuild: handleFourCylinderDiaryRebuild,
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

  const openMealEditorForEdit = useCallback((mTypeOrId, preloadedItems = null, mealTimeHint = null) => {
    const log = isSimulationMode ? (simulatedLog ?? dailyLog ?? []) : (dailyLog ?? []);
    let items = Array.isArray(preloadedItems) && preloadedItems.length > 0
      ? preloadedItems
      : getFoodItemsForMealSlot(log, mTypeOrId);

    // Fallback solo per id canonici (snack), mai per ghost (snack_2) o id timeline (snack_2_16).
    if (items.length === 0 && mTypeOrId != null) {
      const idStr = String(mTypeOrId);
      const looksGhostOrTimed = idStr.includes('_');
      if (!looksGhostOrTimed) {
        const canonical = toCanonicalMealType(idStr);
        const equivalents = getEquivalentMealTypes(canonical);
        items = log.filter(
          (item) =>
            (item.type === 'food' || item.type === 'recipe') &&
            equivalents.includes(item.mealType)
        );
      }
    }

    const resolvedMealTime = typeof mealTimeHint === 'number' && !Number.isNaN(mealTimeHint)
      ? mealTimeHint
      : (typeof items[0]?.mealTime === 'number' && !Number.isNaN(items[0].mealTime)
        ? items[0].mealTime
        : null);

    const draftItems = items.map((f) => {
      const weight = Number(f.qta ?? f.weight) || 100;
      const dbKey = f.foodDbKey;
      const dbRow = dbKey && foodDb?.[dbKey] ? foodDb[dbKey] : null;

      // Macro nel log sono già della porzione: se manca il DB, reverse-engineer per-100g
      // così normalizeDraftFood → scaleNutrientsForWeight non li ridoppia.
      const portionKcal = Number(f.kcal ?? f.cal) || 0;
      const portionProt = Number(f.prot) || 0;
      const portionCarb = Number(f.carb ?? f.cho) || 0;
      const portionFat = Number(f.fatTotal ?? f.fat) || 0;
      const toPer100 = (portionValue) => (
        weight > 0 ? (portionValue / weight) * 100 : portionValue
      );

      const row = dbRow || {
        desc: f.desc || f.name,
        kcal: toPer100(portionKcal),
        cal: toPer100(portionKcal),
        prot: toPer100(portionProt),
        carb: toPer100(portionCarb),
        fat: toPer100(portionFat),
        fatTotal: toPer100(portionFat),
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
        kcal: portionKcal,
        cal: Number(f.cal ?? f.kcal) || portionKcal,
        prot: portionProt,
        carb: portionCarb,
        fat: portionFat,
        fatTotal: portionFat,
        ...(resolvedMealTime != null ? { mealTime: resolvedMealTime } : {}),
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
    setFastLoggerRemountKey((k) => k + 1);
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

  const loadMealToConstructor = useCallback(
    (mTypeOrId, preloadedItems = null, mealTimeHint = null) => {
      openMealEditorForEdit(mTypeOrId, preloadedItems, mealTimeHint);
    },
    [openMealEditorForEdit],
  );

  const closeFastLogger = useCallback(() => {
    setShowFastLogger(false);
    setFastLoggerAutoOpenScanner(false);
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
    setFastLoggerRemountKey((k) => k + 1);
    setShowFastLogger(true);
  }, []);

  function handleAddEventMenuItem(itemId, source) {
    const fromModal = source === 'modal';
    const fromChat = source === 'chat_shortcut' || source === 'predictive_chip';
    if (fromChat) {
      returnToChatAfterQuickActionRef.current = true;
    }
    if (itemId && itemId !== 'menu' && itemId !== 'diary') {
      trackEventUsage(itemId);
    }
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
        else if (!fromChat) closeDrawer();
        else setIsDrawerOpen(false);
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
        else if (!fromChat) closeDrawer();
        else setIsDrawerOpen(false);
        setShowAlcoholPopup(true);
        break;
      }
      case 'workout': {
        stashActivitySheetTempTab('pesi');
        resetWorkoutFormForNewSession('pesi');
        setWorkoutEndTime(getDefaultWorkoutEndTimeDecimal());
        setActivitySheetIntent({ tab: 'pesi', nonce: Date.now() });
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('allenamento');
        setIsDrawerOpen(true);
        break;
      }
      case 'stimulant':
      case 'tea':
      case 'energy': {
        // Evita closeDrawer() (timeout → activeAction null) che cancella il ritorno in chat.
        if (fromModal) {
          /* already in modal */
        } else if (fromChat) {
          setIsDrawerOpen(false);
        } else {
          closeDrawer();
        }
        const subtype =
          itemId === 'tea'
            ? 'tè'
            : itemId === 'energy'
              ? 'energy drink'
              : 'caffè';
        setStimulantTime(getCurrentTimeRoundedTo15Min());
        setStimulantSubtype(subtype);
        setCoffeeType(readLastCoffeeType());
        setTeaType(readLastTeaType());
        setEnergyType(readLastEnergyType());
        setCoffeeVariant(COFFEE_VARIANT.AMARO);
        setAddChoiceView('stimulant');
        setShowChoiceModal(true);
        break;
      }
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
        openDiarioLista();
        break;
      case 'menu':
        if (fromModal) setShowChoiceModal(false);
        setActiveAction('menu_secondary');
        setIsDrawerOpen(false);
        break;
      default:
        break;
    }
  }

  const CHAT_QUICK_STRIP_META = useMemo(
    () => ({
      meal: { label: 'Pasto', icon: '🍳' },
      workout: { label: 'Workout', icon: '🏋️' },
      sleep: { label: 'Sonno', icon: '😴' },
      nap: { label: 'Pisolino', icon: '😴' },
      water: { label: 'Acqua', icon: '💧' },
      weight: { label: 'Peso', icon: '⚖️' },
      stimulant: { label: 'Caffè', icon: '☕' },
      alcohol: { label: 'Alcol', icon: '🍷' },
      meditation: { label: 'Meditato', icon: '🧘' },
      supplements: { label: 'Integratori', icon: '💊' },
      plan: { label: 'Pianifica', icon: '🎯' },
    }),
    [],
  );

  const chatQuickStripItems = useMemo(() => {
    const eligible = [
      'meal',
      'water',
      'workout',
      'weight',
      'stimulant',
      'nap',
      'meditation',
      'alcohol',
      'supplements',
      'plan',
    ];
    const defaults = ['meal', 'workout', 'sleep', 'water', 'weight'];
    const totalUsage = eligible.reduce(
      (sum, id) => sum + (Number(eventUsage?.[id]) || 0),
      0,
    );
    const ids =
      totalUsage < 5
        ? defaults
        : [...eligible]
          .sort((a, b) => {
            const diff = (Number(eventUsage?.[b]) || 0) - (Number(eventUsage?.[a]) || 0);
            if (diff !== 0) return diff;
            return eligible.indexOf(a) - eligible.indexOf(b);
          })
          .slice(0, 5);

    return [
      ...ids.map((id) => ({
        id,
        label: CHAT_QUICK_STRIP_META[id]?.label || id,
        icon: CHAT_QUICK_STRIP_META[id]?.icon || '•',
      })),
      { id: 'menu', label: 'Menu', icon: '☰' },
    ];
  }, [CHAT_QUICK_STRIP_META, eventUsage]);

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
  // Cascata: personale → Kentu IT → Kentu globale (allineata alla ricerca manuale).
  const estraiDatiFoodDb = useCallback((nome, qta, pastoType, preferredDbKey) => {
    return resolveFoodDataFromEngine({
      nome,
      qta,
      pastoType,
      preferredDbKey,
      foodDb,
      kentuItDb: kentuCatalogItDbRef.current || {},
      globalDb: csvFoodDbRef.current || {},
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
          const name = String(item?.name || item?.foodName || '').trim();
          const qty = Math.max(1, Number(item?.qty ?? item?.grams));
          const preferredKey = item.foodDbKey ?? item.matchedKey ?? item.dbKey ?? null;
          const shopProduct = getCoffeeShopProductById(item.coffeeShopProductId)
            || findCoffeeShopProductByName(name);
          if (shopProduct) {
            const grams = Number.isFinite(Number(item.qty)) && Number(item.qty) > 0
              ? Number(item.qty)
              : (shopProduct.servingGrams || 50);
            const scale = grams / (shopProduct.servingGrams || grams || 1);
            const row = {
              id: `ai_coffee_${batchIdFood}_${index}`,
              type: 'food',
              mealType: batchMealType,
              desc: shopProduct.name,
              name: shopProduct.name,
              qta: grams,
              weight: grams,
              servingLabel: shopProduct.servingLabel,
              kcal: Math.round((shopProduct.kcal * scale) * 100) / 100,
              cal: Math.round((shopProduct.kcal * scale) * 100) / 100,
              prot: Math.round((shopProduct.prot * scale) * 100) / 100,
              carb: Math.round((shopProduct.carb * scale) * 100) / 100,
              fat: Math.round((shopProduct.fat * scale) * 100) / 100,
              fatTotal: Math.round((shopProduct.fat * scale) * 100) / 100,
              caffeineMg: Math.round((shopProduct.caffeineMg * scale) * 100) / 100,
              isFastingSafe: shopProduct.isFastingSafe === true,
              coffeeShopProductId: shopProduct.id,
              isCoffeeShopItem: true,
              mealTime: mealDec,
              batchId: batchIdFood,
              isEstimated: false,
              entrySource: 'chat',
              ...(sanitizeFoodIcon(item.icon) ? { icon: sanitizeFoodIcon(item.icon) } : {}),
            };
            rememberFavoriteFromFoodItem(row);
            return row;
          }
          // Sempre cascata personale → Kentu (anche senza preferredKey sul solo DB personale).
          const dati = estraiDatiFoodDb(name, qty, batchMealType, preferredKey || null);
          if (dati && String(dati.status || '') !== 'NEEDS_RESOLUTION') {
            const isRecipe = dati.type === 'recipe';
            return ensureRecipeDiaryFields({
              ...dati,
              id: dati.id || `ai_${batchIdFood}_${index}`,
              mealType: batchMealType,
              mealTime: mealDec,
              batchId: batchIdFood,
              isEstimated: false,
              type: isRecipe ? 'recipe' : 'food',
              ...(Number.isFinite(Number(item.caffeineMg))
                ? { caffeineMg: Math.max(0, Number(item.caffeineMg)) }
                : {}),
              ...(typeof item.isFastingSafe === 'boolean'
                ? { isFastingSafe: item.isFastingSafe }
                : {}),
              ...(sanitizeFoodIcon(item.icon) ? { icon: sanitizeFoodIcon(item.icon) } : {}),
              entrySource: 'chat',
            });
          }
          const qSafe = Math.max(5, qty);
          let kcal = Number(item.estKcal ?? item.kcal);
          let prot = Number(item.estPro ?? item.prot);
          let carb = Number(item.estCar ?? item.carb);
          let fat = Number(item.estFat ?? item.fat);
          const allowZeroKcal = item.isFastingSafe === true
            || (Number.isFinite(Number(item.caffeineMg)) && Number(item.caffeineMg) > 0);
          if (!Number.isFinite(kcal) || (kcal <= 0 && !allowZeroKcal)) {
            kcal = Math.max(10, Math.round((getAverageEstimate('kcal', name) / 100) * qSafe));
          }
          if (!Number.isFinite(kcal) || kcal < 0) kcal = 0;
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
            ...(Number.isFinite(Number(item.caffeineMg))
              ? { caffeineMg: Math.max(0, Number(item.caffeineMg)) }
              : {}),
            ...(typeof item.isFastingSafe === 'boolean'
              ? { isFastingSafe: item.isFastingSafe }
              : {}),
            ...(sanitizeFoodIcon(item.icon) ? { icon: sanitizeFoodIcon(item.icon) } : {}),
            entrySource: 'chat',
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
      setFastLoggerRemountKey((k) => k + 1);
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

  /**
   * Adaptive UI — lavagna aperta: items chat/voce → draft FastMealLogger.
   * Nessun write Firebase: solo form a schermo (Salva esplicito).
   */
  const populateMealLavagnaFromChatItems = useCallback(
    (payload = {}) => {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) return false;

      const exactRaw = payload?.exactTime ?? payload?.timeString ?? null;
      let mealDec = typeof exactRaw === 'number' && Number.isFinite(exactRaw)
        ? exactRaw
        : parseFlexibleTimeToDecimal(String(exactRaw || '').trim());
      if (mealDec == null || !Number.isFinite(mealDec)) {
        mealDec = getCurrentTimeRoundedTo15Min();
      }
      const mealSlot =
        toCanonicalMealType(String(payload?.mealType || '').split('_')[0])
        || predictMealType(mealDec)
        || 'pranzo';

      const addFoodItems = items.map((item) => {
        const rawQty = Number(item?.grams ?? item?.qty ?? item?.weight);
        const qty = Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : 100;
        return {
          name: String(item?.foodName || item?.name || item?.spokenFoodName || '').trim(),
          qty,
          foodDbKey: item?.foodDbKey ?? item?.matchedKey ?? item?.dbKey ?? null,
          matchedKey: item?.foodDbKey ?? item?.matchedKey ?? item?.dbKey ?? null,
          type: item?.type === 'recipe' ? 'recipe' : undefined,
          kcal: item?.kcal,
          prot: item?.prot ?? item?.pro,
          carb: item?.carb ?? item?.carbo,
          fat: item?.fat ?? item?.fatTotal,
        };
      }).filter((i) => i.name);

      if (!addFoodItems.length) return false;

      const diaryFoods = mapProposalItemsToDiaryFoods(addFoodItems, mealDec, mealSlot);
      const draftItems = buildDraftPrefillItems(
        diaryFoods.length > 0
          ? diaryFoods
          : addFoodItems.map((i) => ({
              name: i.name,
              desc: i.name,
              qta: i.qty,
              weight: i.qty,
              foodDbKey: i.foodDbKey,
              mealType: mealSlot,
              mealTime: mealDec,
            })),
        mealSlot,
      );
      if (!draftItems.length) return false;

      setMealToEdit((prev) => {
        const appending = showFastLoggerRef.current && Array.isArray(prev) && prev.length > 0;
        return appending ? [...prev, ...draftItems] : draftItems;
      });
      setEditingMealId(null);
      setPendingGhostMealId(null);
      setFastLoggerInitialSlot(mealSlot);
      setFastLoggerRemountKey((k) => k + 1);
      setShowFastLogger(true);
      // Non chiudere la chat: FastMealLogger è overlay; la risposta Adaptive resta per TTS.
      return true;
    },
    [
      mapProposalItemsToDiaryFoods,
      buildDraftPrefillItems,
      toCanonicalMealType,
      predictMealType,
    ]
  );

  /** Salvataggio pasto da payload add_food / pendingHabit; items possono includere matchedKey (abitudine). */
  const commitDiaryLogWrite = useCallback((nextLog) => {
    if (isSimulationMode) {
      setSimulatedLog(nextLog);
      return;
    }
    // Un solo aggiornamento React state; cloud sync non blocca la UI.
    setDailyLog(nextLog);
    void syncDatiFirebase(nextLog, manualNodesRef.current).catch((err) => {
      console.error('[commitDiaryLogWrite] background sync failed', err);
    });
  }, [isSimulationMode, setSimulatedLog, setDailyLog, syncDatiFirebase]);

  const commitAddFoodChatPayload = useCallback(
    (payload) => {
      const {
        timeString: oraStringFood,
        mealDec: mealDecFood,
        items: addFoodItems,
        mealType: targetMealType,
        forcedMealSlot = null,
      } = payload || {};
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return null;
      const alimentiProcessatiFood = mapProposalItemsToDiaryFoods(
        addFoodItems,
        mealDecFood,
        targetMealType,
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
      const mealTotals = { kcal: totKcal, pro: totPro, carbo: totCar, fat: totFat };
      const logBefore = isSimulationMode
        ? (Array.isArray(simulatedLog) ? simulatedLog : [])
        : (dailyLogRef.current || []);
      const projection = projectNutritionAfterMeal(
        {
          activeLog: logBefore,
          userTargets: effectiveTargetsForCurrentDate || userTargets,
        },
        mealTotals,
      );
      const mealReceipt = buildMealReceiptPayload({
        items: alimentiProcessatiFood.map((food, index) => ({
          foodName: food.desc || food.name,
          name: food.desc || food.name,
          grams: food.qta ?? food.weight,
          kcal: food.kcal ?? food.cal,
          prot: food.prot,
          carb: food.carb,
          fat: food.fatTotal ?? food.fat,
          icon: food.icon || addFoodItems[index]?.icon,
        })),
        mealType: targetMealType || alimentiProcessatiFood[0]?.mealType || '',
        timeString: oraStringFood,
        mealTotals,
        projection,
      });

      if (isSimulationMode) {
        setSimulatedLog((prev) => [...(prev || []), ...alimentiProcessatiFood]);
      } else {
        const nextLog = [...(dailyLogRef.current || []), ...alimentiProcessatiFood];
        commitDiaryLogWrite(nextLog);
      }
      return {
        mealReceipt,
        text: mealReceiptFallbackText(mealReceipt),
      };
    },
    [
      mapProposalItemsToDiaryFoods,
      isSimulationMode,
      simulatedLog,
      setSimulatedLog,
      commitDiaryLogWrite,
      effectiveTargetsForCurrentDate,
      userTargets,
    ]
  );

  /** Merge items in uno slot esistente senza creare ghost (pranzo_2). */
  const commitMergeMealChatPayload = useCallback(
    (payload) => {
      const {
        targetNodeId,
        mealType: mealTypeHint,
        timeString: oraStringFood,
        mealDec: mealDecFood,
        items: addFoodItems,
      } = payload || {};
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return null;

      const logSnap = dailyLogRef.current || [];
      let slotId = String(targetNodeId || '').trim();
      let existing = slotId ? getFoodItemsForMealSlot(logSnap, slotId) : [];

      if (!existing.length) {
        const canonical = toCanonicalMealType(String(mealTypeHint || '').split('_')[0]);
        const found = findExistingCanonicalMealSlot(logSnap, canonical);
        if (found) {
          slotId = found.slotId;
          existing = getFoodItemsForMealSlot(logSnap, slotId);
        }
      }
      if (!existing.length || !slotId) return null;

      const forcedMealSlot = {
        mealType: existing[0]?.mealType || slotId,
        mealTime: typeof existing[0]?.mealTime === 'number' && !Number.isNaN(existing[0].mealTime)
          ? existing[0].mealTime
          : mealDecFood,
      };
      const incomingFoods = mapProposalItemsToDiaryFoods(
        addFoodItems,
        forcedMealSlot.mealTime,
        toCanonicalMealType(String(forcedMealSlot.mealType || '').split('_')[0]),
        forcedMealSlot,
      );
      if (!incomingFoods.length) return null;

      const mergedEntries = [...existing, ...incomingFoods];
      const totKcal = Math.round(
        mergedEntries.reduce((s, f) => s + (Number(f.kcal) || Number(f.cal) || 0), 0),
      );
      const totPro =
        Math.round(mergedEntries.reduce((s, f) => s + (Number(f.prot) || 0), 0) * 10) / 10;
      const totCar =
        Math.round(mergedEntries.reduce((s, f) => s + (Number(f.carb) || 0), 0) * 10) / 10;
      const totFat =
        Math.round(mergedEntries.reduce((s, f) => s + (Number(f.fatTotal ?? f.fat) || 0), 0) * 10) / 10;
      const confirmTime = oraStringFood || decimalToTimeStr(forcedMealSlot.mealTime);
      const testoRispostaFood = `✅ **Aggiunto al ${String(forcedMealSlot.mealType || 'pasto').split('_')[0]}**
- **Orario:** ${confirmTime}
- **Nuovi alimenti:** ${incomingFoods.length}
- **Kcal Totali pasto:** ${totKcal}
- **Proteine:** ${totPro}g

Slot esistente aggiornato (nessun ghost).`;

      if (isSimulationMode) {
        setSimulatedLog((prev) => replaceMealSlotInLog(prev || [], slotId, mergedEntries));
      } else {
        commitDiaryLogWrite(replaceMealSlotInLog(dailyLogRef.current || [], slotId, mergedEntries));
      }
      return testoRispostaFood;
    },
    [
      mapProposalItemsToDiaryFoods,
      getFoodItemsForMealSlot,
      isSimulationMode,
      setSimulatedLog,
      commitDiaryLogWrite,
      decimalToTimeStr,
      toCanonicalMealType,
    ],
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
        commitDiaryLogWrite(replaceMealSlotInLog(dailyLogRef.current || [], slotId, alimentiProcessatiFood));
      }
      return testoRispostaFood;
    },
    [
      mapProposalItemsToDiaryFoods,
      getFoodItemsForMealSlot,
      isSimulationMode,
      setSimulatedLog,
      commitDiaryLogWrite,
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

  const saveFoodEntryPer100ToFoodDb = useCallback(async (entry, options = {}) => {
    if (!userUid || !entry?.desc) return;
    const strictLearned = options?.strictLearned === true;
    const basePath = `users/${userUid}/tracker_data`;
    const name = String(entry.desc).trim();
    const slug = name.replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 40);
    const newKey = `food_${Date.now()}_${slug}`;
    const payload = { ...entry, desc: name, isRecipe: false };
    delete payload.ingredients;
    delete payload.type;
    if (strictLearned) {
      payload.kcal = Math.round(Number(payload.kcal) || 0);
      payload.prot = Math.round((Number(payload.prot) || 0) * 10) / 10;
      payload.carb = Math.round((Number(payload.carb) || 0) * 10) / 10;
      const fatVal = Math.round((Number(payload.fatTotal ?? payload.fat) || 0) * 10) / 10;
      payload.fat = fatVal;
      payload.fatTotal = fatVal;
    }
    // Canonicalizza chiavi TARGETS presenti (alias b2→vitB2, fibreTotali→fibre, …).
    // Nessun riempimento automatico: micronutrienti assenti restano assenti (zero in widget).
    const canonicalPer100 = buildPer100TargetNutrientsFromRow(payload);
    Object.assign(payload, canonicalPer100);
    if (payload.fatTotal == null && payload.fat != null) payload.fatTotal = Number(payload.fat);
    if (payload.fat == null && payload.fatTotal != null) payload.fat = Number(payload.fatTotal);
    const payloadWithUnits = enrichDbRowWithFoodUnits(withDefaultUsageStats(payload), newKey);
    await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), payloadWithUnits);
    setFoodDb(prev => ({ ...(prev || {}), [newKey]: payloadWithUnits }));
    return { key: newKey, row: payloadWithUnits };
  }, [userUid, db, fullHistory]);

  const learnUnresolvedFoodEntry = useCallback(async ({
    foodName,
    grams,
    kcal,
    pro,
    carbo,
    fat,
    mealType = 'pranzo',
    source = 'manual_resolution',
    labelImageUri = null,
  }) => {
    const entryPer100 = buildLearnedFoodEntryPer100({
      foodName,
      grams,
      kcal,
      pro,
      carbo,
      fat,
      source,
      labelImageUri,
    });
    if (!entryPer100) throw new Error('invalid_food_entry');

    const { foodDbKey, row } = await persistLearnedFoodToDatabase(
      async (entry) => {
        const saved = await saveFoodEntryPer100ToFoodDb(entry, { strictLearned: true });
        return saved;
      },
      entryPer100,
    );

    const dbWithNewRow = row
      ? { ...(foodDb || {}), [foodDbKey]: row }
      : foodDb;

    const portion = resolveLearnedPortionAfterSave(
      resolveFoodItemForProposal,
      foodName,
      grams,
      foodDbKey,
      { foodDb: dbWithNewRow, fullHistory, mealType },
    );

    return {
      foodDbKey,
      foodName: portion?.foodName || String(foodName || '').trim(),
      kcal: Math.round(Number(portion?.kcal) || Number(kcal) || 0),
      pro: Number(portion?.pro) || Number(pro) || 0,
      carbo: Number(portion?.carbo) || Number(carbo) || 0,
      fat: Number(portion?.fat) || Number(fat) || 0,
      status: 'RESOLVED',
      resolutionSource: 'learned_db',
    };
  }, [saveFoodEntryPer100ToFoodDb, foodDb, fullHistory]);

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

    // Non inventare micronutrienti: restano assenti finché non arrivano dal master o da edit esplicito.
    if (merged.kcal == null || Number(merged.kcal) === 0) {
      merged.kcal = getDefaultNutrientValue('kcal', fullHistory);
    }
    if (merged.fatTotal == null && merged.fat != null) merged.fatTotal = Number(merged.fat);

    const payload = enrichDbRowWithFoodUnits(withDefaultUsageStats(merged), foodDbKey);
    await set(ref(db, `${basePath}/trackerFoodDatabase/${foodDbKey}`), payload);
    setFoodDb((p) => ({ ...(p || {}), [foodDbKey]: payload }));
  }, [userUid, db, foodDb, fullHistory]);

  /** Bulk patch DB personale — una sola write Firebase per N alimenti (usage stats pasto). */
  const patchFoodDbEntriesBatch = useCallback(async (patchesByKey = {}, sourceDb = null) => {
    if (!userUid || !db || !patchesByKey || typeof patchesByKey !== 'object') return;
    const dbSnap = sourceDb && typeof sourceDb === 'object' ? sourceDb : foodDb;
    const basePath = `users/${userUid}/tracker_data`;
    const localMerged = {};
    const firebasePayload = {};

    Object.entries(patchesByKey).forEach(([foodDbKey, patch]) => {
      if (!foodDbKey || !patch || typeof patch !== 'object') return;
      const prev = dbSnap?.[foodDbKey];
      if (!prev) return;

      const merged = { ...prev, ...patch };
      if (merged.kcal == null || Number(merged.kcal) === 0) {
        merged.kcal = getDefaultNutrientValue('kcal', fullHistory);
      }
      if (merged.fatTotal == null && merged.fat != null) merged.fatTotal = Number(merged.fat);

      const payload = enrichDbRowWithFoodUnits(withDefaultUsageStats(merged), foodDbKey);
      localMerged[foodDbKey] = payload;
      firebasePayload[foodDbKey] = payload;
    });

    if (Object.keys(firebasePayload).length === 0) return;

    setFoodDb((p) => ({ ...(p || {}), ...localMerged }));
    await update(ref(db, `${basePath}/trackerFoodDatabase`), firebasePayload);
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
      const ghostMuscles = resolveWorkoutMusclesForForm({
        ...node,
        muscles: Array.isArray(node.muscles) && node.muscles.length > 0
          ? node.muscles
          : Array.isArray(node.workoutMuscles) && node.workoutMuscles.length > 0
            ? node.workoutMuscles
            : String(node.subtitle || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
      });
      setSelectedNodeReport({
        type: 'ghost_workout',
        id: node.id,
        time: t,
        title,
        name: title,
        desc: title,
        microDesc: String(node.microDesc || node.subtitle || '').trim(),
        subType: node.subType || node.workoutType || 'pesi',
        workoutType: node.subType || node.workoutType || 'pesi',
        kcal: Number(node.kcal || node.cal) || 0,
        cal: Number(node.cal || node.kcal) || 0,
        duration: Math.max(0.25, Number(node.duration) || 1),
        muscles: ghostMuscles,
        workoutMuscles: ghostMuscles,
        workoutDetailNote: String(node.workoutDetailNote || '').trim(),
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
          : Array.isArray(node.foods) && node.foods.length > 0
            ? node.foods
            : mealFoodsRead(node).length > 0
              ? mealFoodsRead(node)
              : getFoodItemsForMealSlot(activeLog, slotId);
      const mealTime = typeof node.time === 'number' && !Number.isNaN(node.time)
        ? node.time
        : (typeof foodsForSlot[0]?.mealTime === 'number' ? foodsForSlot[0].mealTime : null);
      setSelectedNodeReport(null);
      openMealEditorForEdit(slotId, foodsForSlot, mealTime);
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
    openMealEditorForEdit,
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

  const handleAddWater = (amount, options = {}) => {
    if (isSimulationMode) return;
    const fromChat = returnToChatAfterQuickActionRef.current === true
      || activeAction === 'ai_chat';
    if (amount > 0) {
      const currentMl = (manualNodes || [])
        .filter((n) => n?.type === 'water')
        .reduce((sum, n) => sum + (Number(n.ml) || 0), 0);
      const roomLeft = Math.max(0, WATER_ML_MAX - currentMl);
      const clampedAdd = Math.min(Math.round(Number(amount) || 0), roomLeft);
      if (!(clampedAdd > 0)) {
        window.alert(`Limite idratazione giornaliera: max ${WATER_ML_MAX} ml.`);
        return;
      }
      const next = [...manualNodes, { id: `water_${Date.now()}`, type: 'water', time: drawerWaterTime, ml: clampedAdd }];
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
      // Se l’azione è dalla chat, conferma in cronologia (niente overlay / Home).
      if (fromChat || activeAction === 'ai_chat') {
        appendQuickEventConfirmToChat('water', { subtitle: `+${clampedAdd} ml` });
      } else {
        setQuickEventConfirm(buildQuickEventConfirmPayload('water', {
          subtitle: `+${clampedAdd} ml`,
        }));
      }
      if (options.closeAfter === true) {
        finishQuickActionSurface({ forceChat: fromChat });
      }
    } else {
      const toRemove = amount === -250 ? 1 : 2;
      const waterNodes = manualNodes.filter(n => n.type === 'water');
      const idsToRemove = waterNodes.slice(-toRemove).map(n => n.id);
      const next = manualNodes.filter(n => !idsToRemove.includes(n.id));
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    }
  };

  const handleConfirmWaterDrawer = useCallback(() => {
    if (returnToChatAfterQuickActionRef.current) {
      finishQuickActionSurface({ forceChat: true });
    } else {
      returnToChatAfterQuickActionRef.current = false;
      setIsDrawerOpen(false);
      setActiveAction(null);
    }
  }, [finishQuickActionSurface]);

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
    const fromChat = returnToChatAfterQuickActionRef.current === true
      || activeAction === 'ai_chat';
    setFastChargeSupplementName('');
    if (chargeType === 'nap') {
      const mins = Math.round((Number(node.duration) || 0) * 60);
      if (fromChat) {
        appendQuickEventConfirmToChat('nap', {
          subtitle: mins > 0 ? `${mins} min` : undefined,
        });
      } else {
        setQuickEventConfirm(buildQuickEventConfirmPayload('nap', {
          subtitle: mins > 0 ? `${mins} min` : undefined,
        }));
      }
    }
    // Non tornare a Home se arriviamo dalla chat: resta in chat + chiudi drawer.
    if (fromChat) {
      finishQuickActionSurface({ forceChat: true });
    } else {
      returnToChatAfterQuickActionRef.current = false;
      setActiveAction(null);
    }
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
      nuoviAlimenti.push(ensureRecipeDiaryFields({
        ...item,
        id: `f_${batchId}_${trovati}`,
        mealTime: getDefaultMealTime(pastoStorage),
        entrySource: 'other',
      }));
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

  const waterProgress = dailyWaterGoal > 0
    ? Math.min((safeNum(waterIntake) / dailyWaterGoal) * 100, 100)
    : 0;
  
  const foodsLog = (activeLog || []).filter(item => item.type === 'food' || item.type === 'recipe');
  const coffeeShopDiaryRows = (manualNodes || [])
    .filter((n) => {
      if (!n || n.type !== 'stimulant') return false;
      const subtype = String(n.subtype || '').toLowerCase();
      return subtype === 'caffè' || subtype === 'caffe' || n.coffeeShopProductId || Number(n.caffeineMg) > 0;
    })
    .map((n) => coffeeShopNodeToDiaryFoodRow(n));
  const groupedFoods = [...foodsLog, ...coffeeShopDiaryRows].reduce((acc, food) => {
    // Includi anche 0 kcal (caffè amaro): non filtrare per calorie.
    const typeKey = food.mealType || (food.isCoffeeShopItem ? 'colazione' : 'pasto');
    const timeKey =
      typeof food.mealTime === 'number' && !Number.isNaN(food.mealTime)
        ? String(food.mealTime)
        : (typeof food.time === 'number' && !Number.isNaN(food.time) ? String(food.time) : 'unknown');
    const slotKey = `${typeKey}_${timeKey}`;
    (acc[slotKey] = acc[slotKey] || []).push(food);
    return acc;
  }, {});
  
  const workoutsLog = (activeLog || []).filter(item => item.type === 'workout');

  /** Diario + pisolini Fast Charge (manualNodes type nap) — SSOT Arco Energetico. */
  const sleepEngineInputLog = useMemo(
    () => {
      const base = Array.isArray(activeLog) ? activeLog : [];
      const naps = (manualNodes || []).filter((n) => n && n.type === 'nap');
      if (naps.length === 0) return base;
      const seen = new Set(
        base.map((e) => (e?.id != null ? String(e.id) : null)).filter(Boolean),
      );
      const toAdd = naps.filter((n) => {
        if (n?.id == null) return true;
        const id = String(n.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      return toAdd.length === 0 ? base : [...base, ...toAdd];
    },
    [activeLog, manualNodes],
  );

  const {
    recoveryScore: sleepRecoveryScore,
    metabolicPenalty: sleepMetabolicPenalty,
    mainNightSleep,
    totalSleepHours,
    hasSleepData: hasSleepEngineData,
  } = useSleepEngine(sleepEngineInputLog);

  const sleepWakeTime = mainNightSleep?.wakeTime ?? mainNightSleep?.sleepEnd ?? 7.5;

  const todayStr = getTodayString();
  const hasSleepDataToday = useMemo(
    () => currentTrackerDate === todayStr && hasSleepEngineData,
    [currentTrackerDate, todayStr, hasSleepEngineData],
  );

  const isViewingToday = currentTrackerDate === todayStr;
  const showMissingSleepState = isViewingToday && !hasSleepDataToday;

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

  const pastDaysStorico = useDeferredMemo(() => {
    if (!fullStorico || typeof fullStorico !== 'object') return [];
    console.time('[perf] pastDaysStorico');
    const keys = Object.keys(fullStorico).filter(k => k.startsWith('trackerStorico_'));
    const dates = keys.map(k => k.replace('trackerStorico_', '')).filter(d => d !== todayStr);
    dates.sort((a, b) => new Date(b) - new Date(a));
    const result = dates.map(dataStr => {
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
      return {
        dataStr,
        log,
        calorie,
        proteine,
        workoutKcal,
        deficit,
        note: node?.note,
        isIntentionalFast: node?.isIntentionalFast === true,
      };
    });
    console.timeEnd('[perf] pastDaysStorico');
    return result;
  }, [fullStorico, todayStr], [], { delayMs: 50 });

  const weeklyTrendData = useMemo(() => {
    return [...pastDaysStorico].slice(0, 7).reverse().map((d) => {
      const todayFood = (d.log || []).filter(
        (i) => (i?.type === 'food' || i?.type === 'recipe') && i?.mealTime != null,
      );
      const firstMealToday = todayFood.length ? Math.min(...todayFood.map((i) => i.mealTime)) : null;
      let maxFastingHours = null;
      // Carry protetto: spezza sui giorni Null; attraversa solo isIntentionalFast.
      if (firstMealToday != null && fullStorico) {
        const carry = resolveOvernightCarryMeal(fullStorico, d.dataStr);
        if (carry?.lastMealTime != null) {
          maxFastingHours =
            (24 - carry.lastMealTime)
            + firstMealToday
            + (Number(carry.intentionalEmptyDays) || 0) * 24;
        }
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
          totals.fatTotal += (Number(item.fatTotal ?? item.fat) || 0);
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

  const {
    chartUnit,
    setChartUnit,
    zoomLevel,
    setZoomLevel,
    timelineStripPreview,
    isChartTooltipActive,
    setIsChartTooltipActive,
    chartScrollRef,
    chartTouchTimerRef,
    timelineStripPreviewDepsRef,
    TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1,
    handleCenterZoomAndPan,
    handleChartTouchStart,
    handleChartTouchMove,
    handleChartTouchEnd,
    clearTimelineStripEnergyPreview,
    onTimelineStripPreviewDragStart,
    scheduleTimelineStripEnergyPreview,
  } = useTimelineChartShell({
    currentTime,
    currentTrackerDate,
    activeBottomTab,
    userProfileLevel: userProfile?.level,
    simulationMode,
    isSimulationMode,
    sleepStatus,
    metabolicTimelineOpen: showMetabolicTimeline,
  });

  const activeWaterIntake = simulationMode
    ? activeNodes
        .filter((n) => n.type === 'water')
        .reduce((acc, n) => acc + safeNum(n.ml ?? n.amount), 0)
    : waterIntake;
  const energySimulation = useMemo(() => {
    console.time('[perf] energySimulation');
    // Sempre genera serie 0–24: NIGHT_PENDING non deve più azzerare i grafici fisiologici.
    const _result = generateRealEnergyData(
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
    console.timeEnd('[perf] energySimulation');
    return _result;
  }, [
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
  const chartDataCommitted =
    Array.isArray(energySimulation?.chartData) && energySimulation.chartData.length > 0
      ? energySimulation.chartData
      : createEmptyEnergyChartData();
  // Preview strip: solo se ha punti reali. Mai [] (?? non distingue array vuoto da assente).
  // Richiede ≥2 punti: un solo punto = Recharts disegna solo il pallino, non la linea.
  const chartData =
    Array.isArray(timelineStripPreview?.chartData) && timelineStripPreview.chartData.length >= 2
      ? timelineStripPreview.chartData
      : chartDataCommitted;

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

  const {
    longevityData,
    longevityPayload,
    longevityEngineScore,
    longevityExplanation,
    longevityScoreHistory,
    longevityTodayScore,
  } = useLongevityDashboardData({
    fullHistory,
    userTargets,
    longevityDays: 7,
    activeLog,
    totali,
    chartData,
    targetKcal,
    energySimulation,
    activeWaterIntake,
    dailyWaterGoal,
    sleepStatus,
    currentTrackerDate,
  });

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
    manualNodes,
  );

  const userAge = calculateAge(birthDate);

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
  const burnedKcal = (activeLog || []).filter(item => item.type === 'workout').reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);

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

  /**
   * Equazione dogmatica Home/modale (unica fonte di verità calorica giornaliera):
   * Target Totale = Target Base (Impostazioni) + Allenamento/Cardio
   *   + Delta strategico + Compensazione Esplicita.
   * Nessuno scaling opaco da Training Block / baseline mobili sulla base.
   */
  const dogmaticSettingsBaseKcal = useMemo(() => {
    const fromSettings = Math.round(Number(userProfile?.targetCalories) || 0);
    return fromSettings > 0 ? fromSettings : 0;
  }, [userProfile?.targetCalories]);

  const dogmaticBurnKcal = useMemo(
    () => Math.max(0, Math.round(Number(burnedKcal) || 0)),
    [burnedKcal],
  );

  const dogmaticDeltaKcal = useMemo(() => {
    const strategy = normalizeCalorieStrategyTarget(kentuDailyCalorieStrategy);
    const strategyDelta = strategy === 'pari'
      ? 0
      : Math.round(Number(CALORIE_STRATEGY_KCAL_DELTA[strategy]) || 0);
    // Solo delta espliciti (strategy Kentu + plannedDelta se un giorno diverso da 0).
    // Training Block multipliers NON entrano qui.
    const planDelta = Math.round(Number(plannedDelta) || 0);
    return strategyDelta + planDelta;
  }, [kentuDailyCalorieStrategy, plannedDelta]);

  const dogmaticCompensationDateIso = currentTrackerDate || getTodayString();

  const dogmaticCompensationStatus = useMemo(
    () => resolveActiveCompensationOnDate(
      userProfile?.activeCompensation,
      dogmaticCompensationDateIso,
    ),
    [userProfile?.activeCompensation, dogmaticCompensationDateIso],
  );

  const dogmaticCompensationKcal = useMemo(
    () => resolveActiveCompensationDailyDelta(
      userProfile?.activeCompensation,
      dogmaticCompensationDateIso,
    ),
    [userProfile?.activeCompensation, dogmaticCompensationDateIso],
  );

  /** Rolling Balance: solo oggi + autopilota ON (già filtrato nell'hook). */
  const dogmaticAutoCompensationKcal = useMemo(
    () => Math.round(Number(autoCompensationDelta) || 0),
    [autoCompensationDelta],
  );

  const dogmaticTargetKcal = useMemo(
    () => Math.max(
      0,
      dogmaticSettingsBaseKcal
        + dogmaticBurnKcal
        + dogmaticDeltaKcal
        + dogmaticCompensationKcal
        + dogmaticAutoCompensationKcal,
    ),
    [
      dogmaticSettingsBaseKcal,
      dogmaticBurnKcal,
      dogmaticDeltaKcal,
      dogmaticCompensationKcal,
      dogmaticAutoCompensationKcal,
    ],
  );

  const dynamicDailyKcal = dogmaticSettingsBaseKcal > 0 || dogmaticBurnKcal > 0
    ? dogmaticTargetKcal
    : (profileKcalBase != null
      ? profileKcalBase + dogmaticBurnKcal + dogmaticDeltaKcal + dogmaticCompensationKcal + dogmaticAutoCompensationKcal
      : null);

  const profileTdeeKcal = dogmaticSettingsBaseKcal > 0
    ? Math.round(dogmaticSettingsBaseKcal + dogmaticBurnKcal)
    : (profileKcalBase != null ? Math.round(profileKcalBase + burnedKcal) : null);

  /**
   * Split calorico Home = equazione dogmatica (base impostazioni / delta esplicito / totale).
   */
  const homeCalorieSplit = useMemo(() => {
    const baseKcalSplit = dogmaticSettingsBaseKcal > 0
      ? dogmaticSettingsBaseKcal
      : Math.round(Number(profileKcalBase) || Number(userTargets?.kcal) || 0);
    const deltaKcalSplit = dogmaticDeltaKcal + dogmaticCompensationKcal + dogmaticAutoCompensationKcal;
    const targetKcalSplit = Math.max(
      0,
      baseKcalSplit + dogmaticBurnKcal + dogmaticDeltaKcal + dogmaticCompensationKcal + dogmaticAutoCompensationKcal,
    );

    const thresholds = buildMetabolicMapThresholdsFromSplit({
      baseKcal: baseKcalSplit,
      deltaKcal: deltaKcalSplit,
      targetKcal: targetKcalSplit,
    });

    return {
      baseKcal: baseKcalSplit,
      deltaKcal: deltaKcalSplit,
      strategyDeltaKcal: dogmaticDeltaKcal,
      compensationKcal: dogmaticCompensationKcal,
      autoCompensationKcal: dogmaticAutoCompensationKcal,
      targetKcal: targetKcalSplit,
      burnKcal: dogmaticBurnKcal,
      metabolicMapThresholds: thresholds,
    };
  }, [
    dogmaticSettingsBaseKcal,
    dogmaticDeltaKcal,
    dogmaticCompensationKcal,
    dogmaticAutoCompensationKcal,
    dogmaticBurnKcal,
    profileKcalBase,
    userTargets?.kcal,
  ]);

  const targetKcalChart = dynamicDailyKcal;
  // --- NUOVI ALLARMI PREDITTIVI PERCENTUALI ---
  const targetKcalForAlerts = dynamicDailyKcal || baseKcal || (userTargets?.kcal ?? 2000);
  const targetMacros = { prot: userTargets?.prot ?? 150, carb: userTargets?.carb ?? 200, fat: userTargets?.fatTotal ?? userTargets?.fat ?? 65 };
  const totalMacrosTimeline = { prot: totali?.prot ?? 0, carb: totali?.carb ?? 0, fat: totali?.fatTotal ?? totali?.fat ?? 0 };

  const physiologySnapshot = useMemo(
    () => evaluateDailyPillars(activeLog, fullHistory, {
      userTargets,
      dynamicDailyKcal,
      anchorDate: currentTrackerDate,
      biometrics: metabolicBiometrics,
    }),
    [activeLog, fullHistory, userTargets, dynamicDailyKcal, currentTrackerDate, metabolicBiometrics],
  );

  useEffect(() => {
    // Proactive chat nudges (sleep / agenda / morning|evening briefing) are disabled.
    // Chat must not receive AI messages without a direct user input.
    kentuAgendaAwaitingRef.current = false;
  }, [kentuActiveTrigger]);

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
  const scale = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return (n / 100) * targetKcalChart;
  };

  const wakeHourForRiserva = (() => {
    const sleepEntry = (activeLog || []).find(i => i?.type === 'sleep');
    return safeNum(sleepEntry?.wakeTime ?? sleepEntry?.sleepEnd) || 7.5;
  })();
  const piccoMattutinoRiserva = 85;

  const renderDataWithSegments = (() => {
    const mapped = renderData.map((d, index) => {
      const hourRaw = d?.time ?? d?.hour ?? index;
      const hNum = Number(hourRaw);
      const h = (typeof hNum === 'number' && !Number.isNaN(hNum) && Number.isFinite(hNum)) ? hNum : index;
      const toNum = (val, fallback) => {
        if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) return val;
        if (val == null || val === '') return fallback;
        const n = Number(val);
        return (typeof n === 'number' && !Number.isNaN(n) && Number.isFinite(n)) ? n : fallback;
      };
      const riservaRaw = h < wakeHourForRiserva
        ? Math.min(100, 25 + (h / Math.max(0.1, wakeHourForRiserva)) * (piccoMattutinoRiserva - 25))
        : Math.max(0, piccoMattutinoRiserva - (h - wakeHourForRiserva) * 3.5);
      const energy = toNum(d.energy, 0);
      const glicemia = toNum(d.glicemia, 85);
      const idratazione = toNum(d.idratazione, 100);
      const cortisolo = toNum(d.cortisolo, 25);
      const digestione = toNum(d.digestione, 0);
      const neuro = toNum(d.neuro, 40);
      const kcalValue = toNum(scale(energy), 0);
      const riservaFisica = toNum(riservaRaw, 0);
      // Cerniera now: h === displayTime → past E future valorizzati (niente gap sotto il pallino)
      const atHinge = Math.abs(h - displayTime) < 1e-4;
      const mkPast = (val) => (h <= displayTime || atHinge ? val : null);
      const mkFuture = (val) => (h >= displayTime || atHinge ? val : null);
      return {
        time: h,
        hour: h,
        energy,
        glicemia,
        idratazione,
        cortisolo,
        digestione,
        neuro,
        idealEnergy: toNum(d.idealEnergy, 70),
        riservaFisica,
        anabolicScore: toNum(getAnabolicAtTime(anabolicCurve, h), 0),
        cortisolScore: toNum(getCortisolAtTime(cortisolCurve, h), 0),
        energyPast: mkPast(energy),
        energyFuture: mkFuture(energy),
        kcalPast: mkPast(kcalValue),
        kcalFuture: mkFuture(kcalValue),
        kcalValue,
        kcal: kcalValue,
        glicemiaPast: mkPast(glicemia),
        glicemiaFuture: mkFuture(glicemia),
        idratazionePast: mkPast(idratazione),
        idratazioneFuture: mkFuture(idratazione),
        cortisoloPast: mkPast(cortisolo),
        cortisoloFuture: mkFuture(cortisolo),
        digestionePast: mkPast(digestione),
        digestioneFuture: mkFuture(digestione),
        neuroPast: mkPast(neuro),
        neuroFuture: mkFuture(neuro),
      };
    });

    // Cerniera esplicita: il punto più vicino a displayTime ha past = future = value
    if (mapped.length > 0) {
      let hingeIdx = mapped.findIndex((p) => Math.abs(p.hour - displayTime) < 1e-4);
      if (hingeIdx < 0) {
        hingeIdx = mapped.reduce((best, p, i) => (
          Math.abs(p.hour - displayTime) < Math.abs(mapped[best].hour - displayTime) ? i : best
        ), 0);
      }
      const hinge = mapped[hingeIdx];
      const hingePairs = [
        ['energy', 'energyPast', 'energyFuture'],
        ['glicemia', 'glicemiaPast', 'glicemiaFuture'],
        ['idratazione', 'idratazionePast', 'idratazioneFuture'],
        ['cortisolo', 'cortisoloPast', 'cortisoloFuture'],
        ['digestione', 'digestionePast', 'digestioneFuture'],
        ['neuro', 'neuroPast', 'neuroFuture'],
        ['kcalValue', 'kcalPast', 'kcalFuture'],
      ];
      for (const [valueKey, pastKey, futureKey] of hingePairs) {
        const val = hinge[valueKey];
        if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
          hinge[pastKey] = val;
          hinge[futureKey] = val;
        }
      }
    }
    return mapped;
  })();

  const {
    activeDialMode,
    setActiveDialMode,
    mealPieDisplayData,
    selectedMealCenterIndex,
    dialHud,
  } = useMealPieDialData({
    activeLog,
    userTargets,
    homeCalorieSplit,
    dynamicDailyKcal,
    baseKcal,
    userProfileKcalBase,
    dogmaticTargetKcal,
    dogmaticSettingsBaseKcal,
    dogmaticDeltaKcal,
    dogmaticCompensationKcal,
    profileTdeeKcal,
    totali,
    hasPlannedBlock,
    selectedMealCenter,
  });

  const finalChartData =
    Array.isArray(renderDataWithSegments) && renderDataWithSegments.length >= 2
      ? renderDataWithSegments
      : (() => {
          const now = displayTime;
          const mapped = createEmptyEnergyChartData().map((d, index) => {
            const h = Number(d.hour ?? d.time ?? index);
            const glicemia = Number(d.glicemia) || 85;
            const idratazione = Number(d.idratazione) || 100;
            const cortisolo = Number(d.cortisolo) || 25;
            const digestione = Number(d.digestione) || 0;
            const neuro = Number(d.neuro) || 40;
            const energy = Number(d.energy) || 35;
            const atHinge = Math.abs(h - now) < 1e-4;
            const mkPast = (val) => (h <= now || atHinge ? val : null);
            const mkFuture = (val) => (h >= now || atHinge ? val : null);
            return {
              ...d,
              time: h,
              hour: h,
              energy,
              glicemia,
              idratazione,
              cortisolo,
              digestione,
              neuro,
              energyPast: mkPast(energy),
              energyFuture: mkFuture(energy),
              glicemiaPast: mkPast(glicemia),
              glicemiaFuture: mkFuture(glicemia),
              idratazionePast: mkPast(idratazione),
              idratazioneFuture: mkFuture(idratazione),
              cortisoloPast: mkPast(cortisolo),
              cortisoloFuture: mkFuture(cortisolo),
              digestionePast: mkPast(digestione),
              digestioneFuture: mkFuture(digestione),
              neuroPast: mkPast(neuro),
              neuroFuture: mkFuture(neuro),
              kcalPast: null,
              kcalFuture: null,
              kcalValue: 0,
            };
          });
          if (mapped.length > 0) {
            let hingeIdx = mapped.findIndex((p) => Math.abs(p.hour - now) < 1e-4);
            if (hingeIdx < 0) {
              hingeIdx = mapped.reduce((best, p, i) => (
                Math.abs(p.hour - now) < Math.abs(mapped[best].hour - now) ? i : best
              ), 0);
            }
            const hinge = mapped[hingeIdx];
            for (const [vk, pk, fk] of [
              ['energy', 'energyPast', 'energyFuture'],
              ['glicemia', 'glicemiaPast', 'glicemiaFuture'],
              ['idratazione', 'idratazionePast', 'idratazioneFuture'],
              ['cortisolo', 'cortisoloPast', 'cortisoloFuture'],
              ['digestione', 'digestionePast', 'digestioneFuture'],
              ['neuro', 'neuroPast', 'neuroFuture'],
            ]) {
              const val = hinge[vk];
              if (typeof val === 'number' && Number.isFinite(val)) {
                hinge[pk] = val;
                hinge[fk] = val;
              }
            }
          }
          return mapped;
        })();
  const mainChartData = chartUnit === 'calorieTimeline' ? safeCalorieTimelineData : finalChartData;
  const dotYCalorieTimeline = (() => {
    if (chartUnit !== 'calorieTimeline') return null;
    const tl = safeCalorieTimelineData;
    const idx = Math.floor(displayTime);
    const next = Math.min(24, idx + 1);
    const frac = displayTime - idx;
    const a = tl[idx]?.kcal;
    const b = tl[next]?.kcal;
    return a != null ? (b != null ? a + (b - a) * frac : a) : 0;
  })();
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
      manualNodes,
    };
  }, [fullHistory, currentTrackerDate, currentDateObj, getTodayString, manualNodes]);

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

  const sweetCoffeeMacros = useMemo(
    () => sumSweetCoffeeMacros(manualNodes),
    [manualNodes],
  );

  const coffeeHealthSignals = useMemo(
    () => analyzeCoffeeForHealthScore(
      manualNodes,
      Number(metabolicSnapshot?.hoursSinceLastMeal ?? fastingData?.hoursFasted),
    ),
    [manualNodes, metabolicSnapshot?.hoursSinceLastMeal, fastingData?.hoursFasted],
  );

  const { healthScore } = useHealthScoreSnapshot({
    effectiveTargetsForCurrentDate,
    userTargets,
    profileTdeeKcal,
    homeCalorieSplit,
    dynamicDailyKcal,
    userProfile,
    metabolicTimelineMeals,
    metabolicSnapshot,
    fastingData,
    totali,
    sweetCoffeeMacros,
    coffeeHealthSignals,
    hasPlannedBlock,
    hasRealWorkoutInActiveLog,
  });

  const {
    longevityResult,
    longevityScore: unifiedLongevityScore,
    longevityNutrition: unifiedLongevityNutrition,
    recentNutritionScores: unifiedRecentNutritionScores,
    isEngineReady,
  } = useLongevityScore({
    scoreDate: currentTrackerDate,
    fullHistory,
    bodyMetricsHistory,
    activeLog,
    sleepEngineLiveLog: sleepEngineInputLog,
    activeLogIsToday: isViewingToday,
    db,
    uid: userUid,
    foodDatabase: foodDb,
    setFoodDb,
    userTargets,
    heightCm: Number(userProfile?.height) || Number(userProfile?.altezza) || null,
    enabled: Boolean(isInitialLoadComplete && userUid && db),
    isProfileHydrated,
  });

  const showEngineAlignToast = useCallback(() => {
    setEngineAlignToastVisible(true);
    if (engineAlignToastTimerRef.current) {
      window.clearTimeout(engineAlignToastTimerRef.current);
    }
    engineAlignToastTimerRef.current = window.setTimeout(() => {
      setEngineAlignToastVisible(false);
      engineAlignToastTimerRef.current = null;
    }, 2200);
  }, []);

  const handleOpenKentuChat = useCallback(() => {
    if (!isEngineReady) {
      showEngineAlignToast();
      return;
    }
    openChat();
  }, [isEngineReady, openChat, showEngineAlignToast]);

  useEffect(() => () => {
    if (engineAlignToastTimerRef.current) {
      window.clearTimeout(engineAlignToastTimerRef.current);
    }
  }, []);

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

  const centroAnalisiLivePreview = useMemo(() => {
    const scoreDate = String(currentTrackerDate || getTodayString()).slice(0, 10);
    const todayLiveLog = isViewingToday && Array.isArray(sleepEngineInputLog)
      ? sleepEngineInputLog
      : selectTodayLog(fullHistory, scoreDate, activeLog, isViewingToday);
    const progressionLogs = buildProgressionLogsWindow({
      fullHistory,
      todayDate: scoreDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog,
    });
    const progressionResult = calculateProgressionScore(
      {
        days: progressionLogs.days,
        todayDate: progressionLogs.todayDate,
        sleepAvgHours: progressionLogs.sleepAvgHours,
        workoutSessionsTotal: progressionLogs.workoutSessionsTotal,
      },
      userTargets || {},
    );

    const breakdown = longevityResult?.breakdown || {};
    const longevityPagella = buildLongevityPagellaInsight(unifiedLongevityScore, {
      cardioMins: breakdown.cardioMins,
      uniqueGroups: breakdown.uniqueGroups,
      sleepAvg: breakdown.sleepAvg,
      whtrMultiplier: breakdown.whtrMultiplier,
      criticalThreshold: breakdown.criticalThreshold,
      userHeight: breakdown.userHeight,
      cardioScore: breakdown.cardioScore,
      weightsScore: breakdown.weightsScore,
      sleepScore: breakdown.sleepScore,
      nutritionScore: breakdown.nutritionScore,
      longevityNutrition: breakdown.longevityNutrition,
    });

    const timelineSeries = Array.isArray(chartData) && chartData.length >= 2
      ? chartData.map((p, index) => ({
        hour: Number(p.hour ?? index),
        snc: Number(p.energyPast ?? p.energy ?? 0),
        metabolic: Number(p.riservaFisica ?? p.energy ?? 0),
      }))
      : [];

    return {
      scoreDate,
      longevityScore: unifiedLongevityScore,
      longevityBreakdown: breakdown,
      longevityBars: longevityPagella?.bars ?? [],
      progressionScore: progressionResult.finalScore,
      progressionBreakdown: progressionResult.breakdown,
      macroPreview: {
        prot: Number(totali?.prot) || 0,
        carb: Number(totali?.carb) || 0,
        fat: Number(totali?.fatTotal ?? totali?.fat) || 0,
        targetProt: Number(effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot) || 0,
        targetCarb: Number(effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb) || 0,
        targetFat: Number(
          effectiveTargetsForCurrentDate?.fatTotal
          ?? effectiveTargetsForCurrentDate?.fat
          ?? userTargets?.fatTotal
          ?? userTargets?.fat,
        ) || 0,
      },
      gradientStops: metabolicGradientStops,
      timelinePoints: timelineSeries,
      mealHours: Array.isArray(metabolicTimelineMeals?.todayMealTimes)
        ? metabolicTimelineMeals.todayMealTimes.map(Number).filter(Number.isFinite)
        : [],
      calibrazionePreview: {
        activeDate: scoreDate,
        settingsBaseKcal: dogmaticSettingsBaseKcal,
        committedGhostGoal,
        committedGhostDeltaKcal,
        effectiveGhostDeltaKcal,
        ghostAutoPilotEnabled,
        autoCompensationDelta: dogmaticAutoCompensationKcal,
      },
    };
  }, [
    currentTrackerDate,
    isViewingToday,
    sleepEngineInputLog,
    fullHistory,
    activeLog,
    userTargets,
    unifiedLongevityScore,
    longevityResult,
    metabolicGradientStops,
    chartData,
    totali,
    effectiveTargetsForCurrentDate,
    metabolicTimelineMeals,
    dogmaticSettingsBaseKcal,
    committedGhostGoal,
    committedGhostDeltaKcal,
    effectiveGhostDeltaKcal,
    ghostAutoPilotEnabled,
    dogmaticAutoCompensationKcal,
  ]);

  useEffect(() => {
    const referenceHour = isViewingPastDate ? 24 : currentTime;
    const hoursAtNow = hoursFastedAtTimelineHour(
      referenceHour,
      metabolicTimelineMeals.todayMealTimes,
      metabolicTimelineMeals.yesterdayLastMealTime,
      metabolicTimelineMeals.intentionalEmptyDays,
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
    (payloadRaw = {}) => {
      const payload = payloadRaw && typeof payloadRaw === 'object' ? payloadRaw : {};
      const mealTypeCanonical = toCanonicalMealType(String(payload?.mealType || '').trim()) || 'pranzo';
      const logSnap = dailyLogRef.current || [];
      let action = resolveUpsertActionFromPayload(payload);
      const existingSlot = findExistingCanonicalMealSlot(logSnap, mealTypeCanonical);
      const forceNewSlot = payload?.forceNewMealSlot === true;
      const targetNodeIdEarly = String(payload?.targetNodeId || '').trim();
      const ops = Array.isArray(payload?.operations) ? payload.operations : [];
      const isDeltaOnlyMerge =
        action === 'merge'
        && ops.length > 0
        && ops.every((op) => String(op?.action || '').toLowerCase() === 'add');

      // Bozza con targetNodeId esplicito (Vassoio / recover) = pasto intero → replace, mai merge-append.
      if (targetNodeIdEarly && action !== 'append' && !isDeltaOnlyMerge) {
        action = 'replace';
      }

      // Slot canonico già presente → merge (evita cena_2), SALVO forceNewMealSlot
      // (McDrive / pasto libero autonomo → getGhostMealType crea snack_2, pranzo_2, …).
      if (action === 'append' && existingSlot?.slotId && !forceNewSlot) {
        action = 'merge';
      }

      const commitPayload = {
        ...payload,
        mealType: mealTypeCanonical,
        action,
        upsertAction: action,
        ...(action === 'merge' && existingSlot?.slotId && !targetNodeIdEarly
          ? { targetNodeId: existingSlot.slotId }
          : {}),
        ...(action === 'replace' && !targetNodeIdEarly && existingSlot?.slotId
          ? { targetNodeId: existingSlot.slotId }
          : {}),
      };

      const fingerprint = buildMealCommitFingerprint(commitPayload, currentTrackerDateRef.current || '');
      const now = Date.now();
      if (
        fingerprint
        && mealCommitGuardRef.current.fingerprint === fingerprint
        && now - mealCommitGuardRef.current.at < MEAL_COMMIT_DEDUPE_MS
      ) {
        return {
          text: 'Pasto già registrato.',
          deduped: true,
        };
      }
      mealCommitGuardRef.current = { fingerprint, at: now };

      const defaultMealTimeMap = {
        colazione: 8,
        snack: 16,
        pranzo: 13,
        cena: 20,
      };
      let mealDec = null;
      const exact = String(payload?.exactTime || payload?.timeString || '').trim();
      if (exact) {
        mealDec = parseFlexibleTimeToDecimal(exact);
      }
      if (mealDec == null) {
        mealDec =
          defaultMealTimeMap[mealTypeCanonical] != null
            ? defaultMealTimeMap[mealTypeCanonical]
            : getCurrentTimeRoundedTo15Min();
      }
      const timeString = String(payload?.timeString || exact || decimalToTimeStr(mealDec)).trim();

      const rawItems = Array.isArray(payload?.items) && payload.items.length > 0
        ? payload.items
        : payload?.foodName
          ? [{ foodName: payload.foodName, grams: payload.grams }]
          : [];
      if (!rawItems.length) throw new Error('Nessun alimento nel payload');

      const promotion = promoteForeignMealItemsForSave(rawItems, {
        personalDb: foodDb,
        kentuItDb: kentuCatalogItDbRef.current || {},
        globalDb: csvFoodDbRef.current || {},
        offDb: offFoodDbRef.current || {},
      });

      if (promotion.promotedCount > 0 && Object.keys(promotion.localPatch).length > 0) {
        setFoodDb((prev) => ({ ...(prev || {}), ...promotion.localPatch }));
        void savePersonalDbToCache(promotion.mergedPersonalDb, userUid);

        if (userUid && db && !isSimulationMode) {
          const basePath = `users/${userUid}/tracker_data`;
          void update(ref(db, `${basePath}/trackerFoodDatabase`), promotion.firebasePayload).catch((err) => {
            console.warn('[commitAddFoodCommand] personal food promotion RTDB write failed', err);
          });
        }
      }

      const itemsSource = promotion.items;
      const personalDbForUsage = promotion.mergedPersonalDb;

      const items = itemsSource.map((item) => {
        const name = String(item?.foodName || item?.name || '').trim();
        const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qty) || 0));
        if (!name) throw new Error('foodName mancante');
        if (!Number.isFinite(grams) || grams <= 0) throw new Error('grams non valido');
        const dbKey = item?.foodDbKey ?? item?.matchedKey;
        const icon = sanitizeFoodIcon(item?.icon);
        const kcal = Number(item?.kcal);
        const pro = Number(item?.pro ?? item?.prot);
        const carbo = Number(item?.carbo ?? item?.carb);
        const fat = Number(item?.fat ?? item?.fatTotal);
        return {
          name,
          foodName: name,
          qty: grams,
          grams,
          isEstimated: item?.isEstimated === true,
          wasEstimated: item?.wasEstimated === true || item?.isEstimated === true,
          ...(icon ? { icon } : {}),
          ...(dbKey != null && String(dbKey).trim() !== ''
            ? { matchedKey: String(dbKey).trim(), foodDbKey: String(dbKey).trim() }
            : {}),
          ...(Number.isFinite(kcal) ? { kcal: Math.round(kcal), estKcal: Math.round(kcal) } : {}),
          ...(Number.isFinite(pro) ? { prot: pro, estPro: pro } : {}),
          ...(Number.isFinite(carbo) ? { carb: carbo, estCar: carbo } : {}),
          ...(Number.isFinite(fat) ? { fat, estFat: fat } : {}),
        };
      });

      learnUserPortionsFromConfirmedMeal({
        db: userUid && db ? db : null,
        uid: userUid || '',
        items,
        onLocalMerge: (patch) => {
          setUserPortions((prev) => ({
            ...sanitizeUserPortionsDict(prev),
            ...sanitizeUserPortionsDict(patch),
          }));
        },
      });

      // Abitudini: bulk patch usage stats (una write Firebase, non N sequenziali).
      recordDraftFoodsUsageStats(
        items.map((it) => ({ foodDbKey: it.foodDbKey || it.matchedKey || null })),
        personalDbForUsage,
        patchFoodDbEntry,
        getCurrentTimeSlot(),
        { batchPatch: patchFoodDbEntriesBatch, batchSourceDb: personalDbForUsage },
      );

      const targetNodeId = String(commitPayload?.targetNodeId || '').trim();
      const existingSlotResolved = findExistingCanonicalMealSlot(logSnap, mealTypeCanonical);

      // Replace / targetNodeId: sovrascrivi lo slot (niente [...existing, ...incoming]).
      if (action === 'replace' || (targetNodeId && action !== 'merge')) {
        const slot = targetNodeId || existingSlotResolved?.slotId || '';
        if (slot) {
          const message = commitUpdateMealChatPayload({
            targetNodeId: slot,
            timeString,
            mealDec,
            items,
          });
          if (message) return message;
          throw new Error('Aggiornamento pasto fallito');
        }
      }

      if (action === 'merge') {
        const message = commitMergeMealChatPayload({
          targetNodeId: targetNodeId || existingSlotResolved?.slotId || '',
          mealType: mealTypeCanonical,
          timeString,
          mealDec: existingSlotResolved?.mealTime ?? mealDec,
          items,
        });
        if (message) return message;
        const appendMsg = commitAddFoodChatPayload({
          timeString,
          mealDec,
          items,
          mealType: mealTypeCanonical,
        });
        if (appendMsg) return appendMsg;
        throw new Error('Merge pasto fallito');
      }

      // Nuovo slot (forceNewMealSlot): materializza snack_2… prima della scrittura Firebase.
      const ghostMealType = forceNewSlot
        ? getGhostMealType(mealTypeCanonical, logSnap)
        : null;
      const message = commitAddFoodChatPayload({
        timeString,
        mealDec,
        items,
        mealType: mealTypeCanonical,
        ...(ghostMealType
          ? { forcedMealSlot: { mealType: ghostMealType, mealTime: mealDec } }
          : {}),
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
      commitMergeMealChatPayload,
      decimalToTimeStr,
      getCurrentTimeRoundedTo15Min,
      parseFlexibleTimeToDecimal,
      toCanonicalMealType,
      getGhostMealType,
      userUid,
      db,
      isSimulationMode,
      foodDb,
      patchFoodDbEntry,
      patchFoodDbEntriesBatch,
    ],
  );

  const cancelMealBuilder = useCallback(() => {
    setMealBuilder({ active: false, mealType: '', foods: [] });
  }, []);

  const handleDraftMealItems = useCallback((payload = {}) => {
    const incoming = Array.isArray(payload?.foods) ? payload.foods : [];
    const normalized = incoming
      .map((item) => {
        const foodName = String(item?.foodName || item?.name || '').trim();
        if (!foodName) return null;
        const gramsNum = Number(item?.grams ?? item?.qty);
        const protNum = Number(item?.prot ?? item?.pro);
        return {
          foodName,
          name: foodName,
          ...(Number.isFinite(gramsNum) && gramsNum > 0 ? { grams: gramsNum } : {}),
          ...(Number.isFinite(Number(item?.kcal)) ? { kcal: Number(item.kcal) } : {}),
          ...(Number.isFinite(protNum) ? { prot: protNum, pro: protNum } : {}),
          ...(Number.isFinite(Number(item?.carb)) ? { carb: Number(item.carb) } : {}),
          ...(Number.isFinite(Number(item?.fat)) ? { fat: Number(item.fat) } : {}),
        };
      })
      .filter(Boolean);

    setMealBuilder((prev) => ({
      active: true,
      mealType: String(payload?.mealType || prev.mealType || 'Pasto').trim() || 'Pasto',
      foods: [...(prev.foods || []), ...normalized],
    }));
  }, []);

  const commitMealBuilder = useCallback(
    ({ announce = true } = {}) => {
      const snapshot = mealBuilderRef.current || { active: false, mealType: '', foods: [] };
      const foods = Array.isArray(snapshot.foods) ? snapshot.foods : [];
      if (!foods.length) {
        cancelMealBuilder();
        const emptyMsg = '⚠️ Nessun alimento nella bozza pasto.';
        if (announce) {
          setChatHistory((prev) => [...(prev || []), { sender: 'ai', text: emptyMsg }]);
        }
        return emptyMsg;
      }

      const items = foods
        .map((item) => {
          const foodName = String(item?.foodName || item?.name || '').trim();
          if (!foodName) return null;
          return {
            foodName,
            grams: Math.max(1, Math.round(Number(item?.grams) || 100)),
          };
        })
        .filter(Boolean);

      if (!items.length) {
        cancelMealBuilder();
        const invalidMsg = '⚠️ Nessun alimento valido nella bozza.';
        if (announce) {
          setChatHistory((prev) => [...(prev || []), { sender: 'ai', text: invalidMsg }]);
        }
        return invalidMsg;
      }

      const totals = foods.reduce(
        (acc, item) => ({
          kcal: acc.kcal + (Number(item?.kcal) || 0),
          prot: acc.prot + (Number(item?.prot ?? item?.pro) || 0),
          carb: acc.carb + (Number(item?.carb) || 0),
          fat: acc.fat + (Number(item?.fat) || 0),
        }),
        { kcal: 0, prot: 0, carb: 0, fat: 0 },
      );

      try {
        const savedMessage = commitAddFoodCommand({
          mealType: snapshot.mealType || 'pranzo',
          items,
        });
        cancelMealBuilder();
        if (savedMessage?.mealReceipt) {
          if (announce) {
            setChatHistory((prev) => [
              ...(prev || []),
              {
                sender: 'ai',
                type: 'MEAL_RECEIPT',
                text: savedMessage.text || mealReceiptFallbackText(savedMessage.mealReceipt),
                mealReceipt: savedMessage.mealReceipt,
              },
            ]);
          }
          return savedMessage;
        }
        const macroHint =
          totals.kcal > 0
            ? ` (bozza ~${Math.round(totals.kcal)} kcal · P${Math.round(totals.prot)} C${Math.round(totals.carb)} F${Math.round(totals.fat)})`
            : '';
        const message =
          (typeof savedMessage === 'string' && savedMessage.trim()
            ? savedMessage.trim()
            : `✅ Pasto a tappe salvato (${items.length} alimenti).`)
          + macroHint;
        if (announce) {
          setChatHistory((prev) => [...(prev || []), { sender: 'ai', text: message }]);
        }
        return message;
      } catch (error) {
        const failMsg = `⚠️ Salvataggio pasto fallito: ${error?.message || 'errore'}`;
        if (announce) {
          setChatHistory((prev) => [...(prev || []), { sender: 'ai', text: failMsg }]);
        }
        return failMsg;
      }
    },
    [cancelMealBuilder, commitAddFoodCommand, setChatHistory],
  );

  const commitLogSleepCommand = useCallback(
    (payload) => {
      const hoursRaw = Number(payload?.durationHours);
      if (!Number.isFinite(hoursRaw) || hoursRaw <= 0) {
        throw new Error('durationHours non valido');
      }
      const hours = clampSleepDurationHours(hoursRaw, 0);
      if (!(hours > 0)) {
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
      const sleepQualityRaw =
        payload?.sleepQuality != null ? Number(payload.sleepQuality) : null;
      const sleepQuality =
        sleepQualityRaw != null
        && Number.isFinite(sleepQualityRaw)
        && sleepQualityRaw >= 1
        && sleepQualityRaw <= 5
          ? Math.round(sleepQualityRaw)
          : null;
      // Stelle 1–5 (NLP) → quality; punti wearable → qualityScore (non sovrascrivere le stelle).
      const qualityFromWearablePoints =
        sleepQuality == null
        && qualityScore != null
        && Number.isFinite(qualityScore)
        && qualityScore >= 1
        && qualityScore <= 5
          ? Math.round(qualityScore)
          : null;
      const wakeRaw = Number(payload?.wakeTime);
      const wake = Number.isFinite(wakeRaw) && wakeRaw >= 0 && wakeRaw < 24
        ? Math.round(wakeRaw * 100) / 100
        : 7;
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
        ...(sleepQuality != null
          ? { quality: sleepQuality, sleepQuality }
          : qualityFromWearablePoints != null
            ? { quality: qualityFromWearablePoints }
            : {}),
        ...(qualityScore != null && Number.isFinite(qualityScore) && qualityScore > 5
          ? { qualityScore: Math.round(qualityScore) }
          : {}),
      };

      let finalEntry = entry;
      let fourCylinderNextState = null;
      if (userModel && setUserModel) {
        const attached = attachFourCylinderSleepSnapshot(
          entry,
          userModel,
          currentTrackerDate || getTodayString(),
          {
            fullHistory,
            proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
            activeLog: dailyLog,
          },
        );
        finalEntry = attached.entry;
        fourCylinderNextState = attached.nextFourCylinderState;
      }

      if (isSimulationMode) {
        setSimulatedLog((prev) => {
          const base = prev || [];
          const rest = base.filter((e) => e?.type !== 'sleep');
          return [...rest, finalEntry];
        });
      } else {
        setDailyLog((prev) => {
          const base = prev || [];
          const rest = base.filter((e) => e?.type !== 'sleep');
          const next = [...rest, finalEntry];
          syncDatiFirebase(next, manualNodesRef.current || []);
          return next;
        });
        if (fourCylinderNextState) {
          persistFourCylinderAfterSleep({
            db,
            userUid,
            userModel,
            nextFourCylinderState: fourCylinderNextState,
            lastCalibrationWeek,
            setUserModel,
            fullHistory,
            anchorDateIso: getTodayString(),
          });
        }
      }
      dismissKentuSleepTrigger();
      if (typeof setChatHistory === 'function') {
        setChatHistory((prev) => markPredictiveGreetingsSuperseded(prev));
      }
    },
    [
      dismissKentuSleepTrigger,
      isSimulationMode,
      setDailyLog,
      setSimulatedLog,
      syncDatiFirebase,
      userModel,
      setUserModel,
      currentTrackerDate,
      db,
      userUid,
      lastCalibrationWeek,
      setChatHistory,
      fullHistory,
      userTargets,
      userProfile,
      dailyLog,
    ],
  );

  const commitLogStimulantCommand = useCallback(
    (payload) => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('stimulant payload non valido');
      }
      const node = { ...payload };
      if (!node.id) node.id = `stimulant_${Date.now()}`;
      const next = [...manualNodes, node];
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
      trackEventUsage('stimulant');
      rememberFavoriteFromCoffeeNode(node);
      // Conferma media già pubblicata da commitCoffeeLog via QUICK_EVENT_CONFIRM —
      // evita secondo ciclo caffe1→2 e overlay che chiude la chat.
    },
    [dailyLog, manualNodes, setManualNodes, syncDatiFirebase, trackEventUsage],
  );

  const { registerHandlers, closeChat: closeOverlayChat } = useChatOverlay();
  closeOverlayChatRef.current = closeOverlayChat;

  const {
    sendMessage,
    cancelGeneration,
    isLoading: isChatProcessing,
    chatInput: commandChatInput,
    setChatInput: setCommandChatInput,
    chatImages: commandChatImages,
    setChatImages: setCommandChatImages,
    activeQuickReplies,
    handleQuickReplyClick,
    handleAcceptAdvice,
    handleAcceptMealProposal,
    handleEnableMealDraftInteractiveEdit,
    handleRequestMealItemEdit,
    handleCancelMealDraftProposal,
    handleDraftConfirm,
    handleDraftCancel,
    handleDraftRemoveItem,
    handleDraftUpdateItemGrams,
    handleDraftUpdateMealMeta,
    handleDraftUpdateFoodItemName,
    handleMcDriveRemoveItem,
    handleMcDriveUpdateGrams,
    handleMcDriveUpdateMealTime,
    handleMcDriveApplyAlternative,
    handleMcDriveReplaceFromSearch,
    handleMcDriveAppendSolverItems,
    handleMcDriveRequestDisambiguation,
    handleWorkoutDraftUpdateMeta,
    handleWorkoutDraftUpdateExercise,
    handleWorkoutDraftRemoveExercise,
    handleSaveNewFoodEntry,
    chatUsdaEnrichmentSession,
    handleChatUsdaEnrichmentSelect,
    handleChatUsdaEnrichmentSkip,
    tryEmitPredictiveGreeting,
  } = useCommandTerminal({
    chatHistory,
    setChatHistory,
    onChatClose: closeChat,
    onManualShortcutFromChat: (actionId) => {
      const raw = String(actionId || '').trim().toLowerCase();
      const canonical =
        raw === 'acqua' || raw === 'water'
          ? 'water'
          : raw === 'pasto' || raw === 'meal'
            ? 'meal'
            : raw === 'pisolino' || raw === 'nap'
              ? 'nap'
              : raw === 'caffè' || raw === 'caffe' || raw === 'coffee' || raw === 'stimulant'
                ? 'stimulant'
                : raw === 'tè' || raw === 'te' || raw === 'tea'
                  ? 'tea'
                  : raw === 'energy' || raw === 'energy drink' || raw === 'energydrink' || raw === 'energy_drink'
                    ? 'energy'
                    : raw;
      handleAddEventMenuItem(canonical, 'predictive_chip');
    },
    getWipMealSnapshot: getWipMealSnapshotFromBridge,
    onWipMealSeed: seedWipMealFromBridge,
    onAddFoodCommand: commitAddFoodCommand,
    onAddWorkoutCommand: commitAddWorkoutCommand,
    onLogSleepCommand: commitLogSleepCommand,
    onLogStimulantCommand: commitLogStimulantCommand,
    onOpenSleepPrompt: () => {
      setShowSleepPrompt(true);
    },
    getMealBuilderState: () => mealBuilderRef.current,
    onDraftMealItems: handleDraftMealItems,
    onCommitMealBuilder: () => commitMealBuilder({ announce: false }),
    onPopulateMealLavagna: populateMealLavagnaFromChatItems,
    onSaveFoodEntryPer100ToFoodDb: (entry, options) => saveFoodEntryPer100ToFoodDb(entry, options),
    onSaveFoodDbEntry: async (entryPer100, donorMeta = null) => {
      const safe = entryPer100 && typeof entryPer100 === 'object' ? entryPer100 : null;
      if (!safe?.desc) throw new Error('missing_desc');
      const payload = { ...safe };
      if (donorMeta && typeof donorMeta === 'object') {
        payload.micronutrientDonor = donorMeta;
      }
      await saveFoodEntryPer100ToFoodDb(payload);
    },
    onUserFoodAliasesMerge: (patch) => {
      setUserFoodAliases((prev) => {
        const next = {
          ...sanitizeUserFoodAliasesDict(prev),
          ...sanitizeUserFoodAliasesDict(patch),
        };
        if (userUid) saveUserFoodAliasesToCache(next, userUid);
        return next;
      });
    },
    getCurrentState: () => {
      const todayWorkoutKcal = (activeLog || [])
        .filter((item) => item?.type === 'workout')
        .reduce((acc, item) => acc + (Number(item?.kcal ?? item?.cal) || 0), 0);
      return {
        activeDate: currentTrackerDate || getTodayString(),
        locale: 'it-IT',
        fullHistory,
        manualNodes: manualNodesForTimeline,
        foodDatabase: foodDb,
        kentuItDatabase: kentuCatalogItDbRef.current || {},
        globalFoodDatabase: csvFoodDbRef.current || {},
        offDb: offFoodDbRef.current || {},
        offDatabase: offFoodDbRef.current || {},
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
        // Cilindri muscolari per Kentu Global State / cardio spillover context.
        fourCylinder: userModel?.fourCylinder ?? null,
        // Memoria porzioni a lungo termine (Motore Ibrido Stadio 1).
        userPortions: sanitizeUserPortionsDict(userPortions),
        userFoodAliases: sanitizeUserFoodAliasesDict(userFoodAliases),
        userUid,
        firebaseDb: db,
        todayPlanBlock: todayPlanBlock ?? null,
        hasRealWorkoutToday: hasRealWorkoutInActiveLog,
        isWorkoutDoneToday: hasRealWorkoutInActiveLog,
        scheduledWorkout: scheduledWorkoutContextRef.current,
        hasSleepData: !showMissingSleepState,
        favoriteBreakfast: readFavoriteBreakfast(),
        timelineNodes: allNodes,
        manualNodes: manualNodesForTimeline,
        fastingData,
        metabolicSnapshot,
        userProfile,
        userUid,
        userDisplayName: String(userProfile?.displayName || userProfile?.name || '').trim(),
        healthScore,
        longevityScore: unifiedLongevityScore,
        longevityNutrition: unifiedLongevityNutrition,
        longevityResult,
        recentNutritionScores: unifiedRecentNutritionScores,
        isEngineReady,
        bodyMetricsHistory,
        isTrainingDay: Boolean(hasPlannedBlock || hasRealWorkoutInActiveLog),
        healthScoreMetrics: {
          proteinConsumed: Number(totali?.prot) || 0,
          proteinTarget: Number(effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot) || 0,
          kcalConsumed: (Number(totali?.kcal) || 0) + sweetCoffeeMacros.kcal,
          tdeeKcal: Number(profileTdeeKcal) || Number(homeCalorieSplit?.baseKcal) || 0,
          dailyKcalTarget: Number(homeCalorieSplit?.targetKcal) || 0,
          carbConsumed: (Number(totali?.carb) || 0) + sweetCoffeeMacros.carb,
          carbTarget: Number(effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb) || 0,
          hoursFasted: Number(metabolicSnapshot?.hoursSinceLastMeal ?? fastingData?.hoursFasted) || null,
          fastingBrokenPrematurely: detectPrematureFastBreak(
            metabolicTimelineMeals?.yesterdayLastMealTime,
            Array.isArray(metabolicTimelineMeals?.todayMealTimes)
              && metabolicTimelineMeals.todayMealTimes.length > 0
              ? metabolicTimelineMeals.todayMealTimes[0]
              : null,
          ),
          fastingBrokenBySweetCoffee: coffeeHealthSignals.fastingBrokenBySweetCoffee,
          bitterCoffeeDuringFast: coffeeHealthSignals.bitterCoffeeDuringFast,
          metabolicPhaseId: metabolicSnapshot?.phase?.id ?? null,
          metabolicProgressInPhase: metabolicSnapshot?.progressInPhase ?? null,
          currentHour: new Date().getHours(),
        },
      };
    },
  });

  tryEmitPredictiveGreetingRef.current = tryEmitPredictiveGreeting;

  const handleRequestHealthDiagnosis = useCallback(() => {
    if (typeof sendMessage !== 'function') return;
    void sendMessage(
      'REQUEST_HEALTH_DIAGNOSIS — tocca avatar Health Score',
      {
        intent: 'REQUEST_HEALTH_DIAGNOSIS',
        skipUserBubble: true,
        isHiddenUserMessage: true,
        forceStrategic: true,
        systemInstructionExtra: [
          'Intent forzato: REQUEST_HEALTH_DIAGNOSIS.',
          'Rispondi in prima persona come avatar Health Score (2 frasi max).',
        ].join(' '),
      },
    );
  }, [sendMessage]);

  useEffect(() => {
    const isChatOpenNow = activeAction === 'ai_chat';

    // Chat chiusa: reset gate così la prossima apertura può salutare di nuovo.
    if (!isChatOpenNow) {
      prevChatOpenRef.current = false;
      return undefined;
    }

    // Già aperta in questa sessione UI (evita re-emit su re-render).
    if (prevChatOpenRef.current) return undefined;

    if (!isEngineReady) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      // Segna "già aperto" solo DOPO il delay — altrimenti React Strict Mode
      // (setup→cleanup→setup) cancella il timer e blocca per sempre il primo saluto.
      prevChatOpenRef.current = true;
      if (typeof tryEmitPredictiveGreetingRef.current === 'function') {
        tryEmitPredictiveGreetingRef.current();
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeAction, isEngineReady]);

  useEffect(() => {
    registerHandlers({
      chatHistory,
      chatInput: commandChatInput,
      setChatInput: setCommandChatInput,
      chatImages: commandChatImages,
      setChatImages: setCommandChatImages,
      onSendMessage: sendMessage,
      activeQuickReplies,
      onSlotQuickReplyClick: handleQuickReplyClick,
      onAcceptAdvice: handleAcceptAdvice,
      onAcceptMealProposal: handleAcceptMealProposal,
      onEnableMealDraftInteractiveEdit: handleEnableMealDraftInteractiveEdit,
      onRequestMealItemEdit: handleRequestMealItemEdit,
      onCancelMealDraftProposal: handleCancelMealDraftProposal,
      onLearnUnresolvedFood: learnUnresolvedFoodEntry,
      foodDatabase: foodDb,
      kentuItDatabase: kentuCatalogItDb,
      globalFoodDatabase: csvFoodDb,
      offDb: offFoodDb,
      fullHistory,
      dailyLog: activeLog,
      onDraftConfirm: handleDraftConfirm,
      onDraftCancel: handleDraftCancel,
      onDraftRemoveItem: handleDraftRemoveItem,
      onDraftUpdateItemGrams: handleDraftUpdateItemGrams,
      onDraftUpdateMealMeta: handleDraftUpdateMealMeta,
      onDraftUpdateFoodItemName: handleDraftUpdateFoodItemName,
      onMcDriveRemoveItem: handleMcDriveRemoveItem,
      onMcDriveUpdateGrams: handleMcDriveUpdateGrams,
      onMcDriveUpdateMealTime: handleMcDriveUpdateMealTime,
      onMcDriveApplyAlternative: handleMcDriveApplyAlternative,
      onMcDriveReplaceFromSearch: handleMcDriveReplaceFromSearch,
      onMcDriveAppendSolverItems: handleMcDriveAppendSolverItems,
      onMcDriveRequestDisambiguation: handleMcDriveRequestDisambiguation,
      getMcDriveMealTargets: getFastLoggerMealTargetsForSlot,
      onWorkoutDraftUpdateMeta: handleWorkoutDraftUpdateMeta,
      onWorkoutDraftUpdateExercise: handleWorkoutDraftUpdateExercise,
      onWorkoutDraftRemoveExercise: handleWorkoutDraftRemoveExercise,
      onSaveNewFoodEntry: handleSaveNewFoodEntry,
      introPhrase,
      isProcessing: isChatProcessing,
      onCancelGeneration: cancelGeneration,
      tryEmitPredictiveGreeting,
      mealBuilder,
      setMealBuilder,
      cancelMealBuilder,
      commitMealBuilder,
      preferVoiceChat: isDiabetesAppMode,
      userDisplayName: String(userProfile?.displayName || userProfile?.name || '').trim(),
    });
  }, [
    registerHandlers,
    chatHistory,
    commandChatInput,
    setCommandChatInput,
    commandChatImages,
    setCommandChatImages,
    sendMessage,
    cancelGeneration,
    activeQuickReplies,
    handleQuickReplyClick,
    handleAcceptAdvice,
    handleAcceptMealProposal,
    handleEnableMealDraftInteractiveEdit,
    handleRequestMealItemEdit,
    handleCancelMealDraftProposal,
    learnUnresolvedFoodEntry,
    foodDb,
    kentuCatalogItDb,
    csvFoodDb,
    offFoodDb,
    fullHistory,
    activeLog,
    handleDraftConfirm,
    handleDraftCancel,
    handleDraftRemoveItem,
    handleDraftUpdateItemGrams,
    handleDraftUpdateMealMeta,
    handleDraftUpdateFoodItemName,
    handleMcDriveRemoveItem,
    handleMcDriveUpdateGrams,
    handleMcDriveUpdateMealTime,
    handleMcDriveApplyAlternative,
    handleMcDriveReplaceFromSearch,
    handleMcDriveAppendSolverItems,
    handleMcDriveRequestDisambiguation,
    getFastLoggerMealTargetsForSlot,
    handleWorkoutDraftUpdateMeta,
    handleWorkoutDraftUpdateExercise,
    handleWorkoutDraftRemoveExercise,
    handleSaveNewFoodEntry,
    introPhrase,
    isChatProcessing,
    tryEmitPredictiveGreeting,
    mealBuilder,
    cancelMealBuilder,
    commitMealBuilder,
    isDiabetesAppMode,
    userProfile,
  ]);

  const generateDailySnapshot = useCallback(() => {
    const date = String(currentTrackerDate || getTodayString());
    const log = activeLog || [];
    const foods = log.filter((item) => item?.type === 'food' || item?.type === 'recipe');
    const workouts = log.filter((item) => item?.type === 'workout' && item?.isGhost !== true);

    const mealSeen = new Set();
    const meals = [];
    for (const food of foods) {
      const canon =
        toCanonicalMealType(String(food?.mealType || '').split('_')[0]) || 'pasto';
      const label = MEAL_LABELS_SAVE?.[canon] || canon;
      if (!mealSeen.has(label)) {
        mealSeen.add(label);
        meals.push(label);
      }
    }

    const primaryWorkout = workouts[0] || null;
    const workout = primaryWorkout
      ? {
          name: String(
            primaryWorkout.name
            || primaryWorkout.workoutName
            || primaryWorkout.desc
            || primaryWorkout.activity
            || 'Allenamento',
          ).trim(),
          kcal: Math.round(Number(primaryWorkout.kcal ?? primaryWorkout.cal) || 0),
          ...(primaryWorkout.rpe != null && Number.isFinite(Number(primaryWorkout.rpe))
            ? { rpe: Number(primaryWorkout.rpe) }
            : {}),
          ...(primaryWorkout.volume != null && Number.isFinite(Number(primaryWorkout.volume))
            ? { volume: Number(primaryWorkout.volume) }
            : {}),
          ...(primaryWorkout.durationMinutes != null
            || primaryWorkout.duration != null
            || primaryWorkout.durationHours != null
            ? {
                durationMinutes: Math.round(
                  Number(primaryWorkout.durationMinutes)
                  || (Number(primaryWorkout.durationHours) || 0) * 60
                  || Number(primaryWorkout.duration)
                  || 0,
                ),
              }
            : {}),
        }
      : null;

    const sleepHours = Number(
      totalSleepHours
      ?? mainNightSleep?.hours
      ?? mainNightSleep?.duration
      ?? mainNightSleep?.sleepHours,
    );
    const sleepQuality = Number(
      mainNightSleep?.quality
      ?? mainNightSleep?.sleepQuality
      ?? mainNightSleep?.qualityScore,
    );
    const sleep = hasSleepEngineData
      ? {
          hours: Number.isFinite(sleepHours) ? Math.round(sleepHours * 100) / 100 : null,
          quality: Number.isFinite(sleepQuality) ? sleepQuality : null,
        }
      : null;

    return {
      date,
      nutrition: {
        totalKcal: Math.round(Number(totali?.kcal) || 0),
        totalPro: Math.round(Number(totali?.prot) || 0),
        totalCarb: Math.round(Number(totali?.carb) || 0),
        totalFat: Math.round(Number(totali?.fatTotal ?? totali?.fat) || 0),
      },
      meals,
      workout,
      sleep,
      fasting: {
        hoursFasted: Math.round((Number(fastingData?.hoursFasted) || 0) * 10) / 10,
        phaseName: fastingData?.phaseName || null,
      },
    };
  }, [
    activeLog,
    currentTrackerDate,
    fastingData,
    hasSleepEngineData,
    mainNightSleep,
    toCanonicalMealType,
    totalSleepHours,
    totali,
  ]);

  const handleRequestDailyReport = useCallback(() => {
    if (isDiabetesAppMode) {
      openHealthReport();
      return;
    }

    const payload = generateDailySnapshot();
    const systemInstructionExtra =
      'Sei un coach esperto. Modalità Report Serale. '
      + 'Analizza questi dati JSON della giornata e restituisci un referto breve, discorsivo ma analitico in markdown, '
      + 'evidenziando correlazioni (es. deficit calorico vs stanchezza da allenamento). Sii diretto e professionale. '
      + `DATI_GIORNATA: ${JSON.stringify(payload)}`;

    setActiveAction('ai_chat');
    setIsDrawerOpen(false);
    void sendMessage(
      'Genera il report analitico della mia giornata basandoti sui dati attuali.',
      {
        isHiddenUserMessage: true,
        visibleUserText: '📊 Analizzo la giornata...',
        intent: 'ASK_DAY_REVIEW',
        systemInstructionExtra,
      },
    );
  }, [generateDailySnapshot, isDiabetesAppMode, openHealthReport, sendMessage]);

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

  const sleepDurationLabel = formatSleepDurationParts(
    sleepFormDurationHours,
    sleepFormDurationMinutes,
  );

  const computedSleepBedtimeLabel = (() => {
    const wakeDec = parseTimeStrToDecimal(sleepFormWakeStr);
    const durationHours = clampSleepDurationHours(
      sleepFormDurationHours,
      sleepFormDurationMinutes,
    );
    const bedDec = computeBedtimeFromWakeAndDuration(wakeDec, durationHours);
    return Number.isFinite(bedDec) ? decimalToTimeStr(bedDec) : null;
  })();

  const handleSaveSleepEntry = (editingId = null) => {
    const wakeDec = parseTimeStrToDecimal(sleepFormWakeStr);
    const durationHours = clampSleepDurationHours(
      sleepFormDurationHours,
      sleepFormDurationMinutes,
    );
    if (!(durationHours > 0)) {
      window.alert('Inserisci una durata di sonno valida (ore o minuti).');
      return;
    }
    if (durationHours > SLEEP_HOURS_MAX) {
      window.alert(`La durata del sonno non può superare ${SLEEP_HOURS_MAX} ore.`);
      return;
    }
    const bedDec = computeBedtimeFromWakeAndDuration(wakeDec, durationHours);
    if (!Number.isFinite(bedDec) || !Number.isFinite(wakeDec)) {
      window.alert('Controlla l\'ora di risveglio.');
      return;
    }
    const durationMinutes = Math.round(durationHours * 60);
    const hoursRounded = Math.round(durationHours * 100) / 100;
    const notesTrim = String(sleepFormNotes || '').trim();
    const id = editingId || `sleep_${Date.now()}`;
    const logLook = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
    const existing = editingId
      ? logLook.find((e) => e?.id === editingId && e?.type === 'sleep')
      : null;
    if (editingId && !existing) {
      console.warn('[SalaComandi] sleep entry not found while saving edit', { editingId });
    }
    const entry = {
      type: 'sleep',
      id,
      wakeTime: wakeDec,
      bedtime: bedDec,
      sleepStart: bedDec,
      sleepEnd: wakeDec,
      hours: hoursRounded,
      duration: hoursRounded,
      sleepHours: hoursRounded,
      durationMinutes,
      notes: notesTrim,
      note: notesTrim,
      details: notesTrim,
      deepMin: existing?.deepMin ?? 60,
      remMin: existing?.remMin ?? 60,
      quality: Math.max(1, Math.min(5, Math.round(Number(sleepFormQuality) || 3))),
      ...(existing?.hr != null ? { hr: existing.hr } : {}),
    };

    let finalEntry = entry;
    let fourCylinderNextState = null;
    if (userModel && setUserModel) {
      const attached = attachFourCylinderSleepSnapshot(
        entry,
        userModel,
        currentTrackerDate || getTodayString(),
        {
          fullHistory,
          proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
          activeLog: dailyLog,
        },
      );
      finalEntry = attached.entry;
      fourCylinderNextState = attached.nextFourCylinderState;
    }

    if (isSimulationMode) {
      setSimulatedLog((prev) => {
        const base = prev || [];
        const rest = editingId ? base.filter((e) => e.id !== editingId) : base;
        return [...rest, finalEntry];
      });
    } else {
      const base = dailyLog || [];
      const rest = editingId ? base.filter((e) => e.id !== editingId) : base;
      const next = [...rest, finalEntry];
      setDailyLog(next);
      syncDatiFirebase(next, manualNodes || []);
      if (fourCylinderNextState) {
        persistFourCylinderAfterSleep({
          db,
          userUid,
          userModel,
          nextFourCylinderState: fourCylinderNextState,
          lastCalibrationWeek,
          setUserModel,
          fullHistory,
          anchorDateIso: getTodayString(),
        });
      }
    }
    dismissKentuSleepTrigger();
    if (typeof setChatHistory === 'function') {
      setChatHistory((prev) => markPredictiveGreetingsSuperseded(prev));
    }
    setShowSleepPrompt(false);
    setSleepModal(null);
  };

  const handleSaveSleepModal = () => {
    handleSaveSleepEntry(sleepModal?.editingId ?? null);
  };

  const handleSaveSleepPrompt = () => {
    handleSaveSleepEntry(null);
  };

  const handleOpenEnergyArc = () => {
    if (physiologySnapshot?.SLEEP?.status === 'alert') {
      setShowSleepPrompt(true);
      return;
    }
    setShowEnergySheet(true);
  };

  const handleCloseSleepPrompt = () => {
    setShowSleepPrompt(false);
  };

  const handleUpdateWorkoutProgressionNote = useCallback((workoutId, noteText) => {
    const id = String(workoutId || '').trim();
    if (!id) return;
    const trimmed = String(noteText || '').trim();
    const applyPatch = (prev) => (Array.isArray(prev) ? prev : []).map((entry) => {
      if (entry?.type !== 'workout' || String(entry.id) !== id) return entry;
      return {
        ...entry,
        progressionNote: trimmed,
        note: trimmed,
        details: trimmed,
      };
    });
    if (isSimulationMode) {
      setSimulatedLog((prev) => applyPatch(prev));
      return;
    }
    const next = applyPatch(dailyLog || []);
    setDailyLog(next);
    syncDatiFirebase(next, manualNodes || []);
  }, [isSimulationMode, dailyLog, manualNodes, syncDatiFirebase]);

  const handleUpdateWorkoutQuestionnaire = useCallback((workoutId, patch) => {
    const id = String(workoutId || '').trim();
    if (!id || !patch || typeof patch !== 'object') return;
    const applyPatch = (prev) => (Array.isArray(prev) ? prev : []).map((entry) => {
      if (entry?.type !== 'workout' || String(entry.id) !== id) return entry;
      return {
        ...entry,
        ...patch,
      };
    });
    if (isSimulationMode) {
      setSimulatedLog((prev) => applyPatch(prev));
      return;
    }
    const next = applyPatch(dailyLog || []);
    setDailyLog(next);
    syncDatiFirebase(next, manualNodes || []);
  }, [isSimulationMode, dailyLog, manualNodes, syncDatiFirebase]);

  const currentDayIntentionalFast = useMemo(() => {
    const key = TRACKER_STORICO_KEY(currentTrackerDate || getTodayString());
    return isDayIntentionalFast(fullHistory?.[key] || fullStorico?.[key]);
  }, [currentTrackerDate, fullHistory, fullStorico]);

  const handleSetIntentionalFast = useCallback(async (enabled) => {
    const dateStr = currentTrackerDate || getTodayString();
    const key = TRACKER_STORICO_KEY(dateStr);
    const existing = fullHistory?.[key] || fullStorico?.[key] || {
      data: dateStr,
      log: isSimulationMode ? (simulatedLog || []) : (dailyLog || []),
      mealTimes: {},
      manualNodes: manualNodes || [],
    };

    if (enabled && dayHasFoodLog(existing.log)) {
      window.alert('Rimuovi i pasti del giorno prima di segnarlo come digiuno intenzionale.');
      return;
    }

    if (isSimulationMode) {
      setFullHistory((prev) => ({
        ...(prev || {}),
        [key]: {
          ...existing,
          data: dateStr,
          isIntentionalFast: enabled ? true : undefined,
        },
      }));
      return;
    }

    if (!userUid || !db) return;

    try {
      const next = await setDayIntentionalFastFlag({
        db,
        uid: userUid,
        dateStr,
        value: enabled,
        existingDayNode: existing,
      });
      setFullHistory((prev) => ({
        ...(prev || {}),
        [key]: {
          ...(prev?.[key] || existing),
          ...next,
          isIntentionalFast: enabled ? true : undefined,
        },
      }));
      setFullStorico((prev) => ({
        ...(prev || {}),
        [key]: {
          ...(prev?.[key] || existing),
          ...next,
          isIntentionalFast: enabled ? true : undefined,
        },
      }));
    } catch (err) {
      console.error('[IntentionalFast] save failed', err);
      window.alert('Non è stato possibile salvare il flag digiuno.');
    }
  }, [
    currentTrackerDate,
    fullHistory,
    fullStorico,
    isSimulationMode,
    simulatedLog,
    dailyLog,
    manualNodes,
    userUid,
    db,
    setFullHistory,
    setFullStorico,
  ]);

  const handleSaveSleepFromDiary = useCallback((payload) => {
    const wakeDec = Number(payload?.wakeTime);
    const hours = Number(payload?.hours);
    const quality = Math.max(1, Math.min(5, Math.round(Number(payload?.quality) || 3)));
    const durationMinutes = Number.isFinite(Number(payload?.durationMinutes))
      ? Math.round(Number(payload.durationMinutes))
      : Math.round(hours * 60);
    if (!(hours > 0) || !Number.isFinite(wakeDec)) {
      window.alert('Controlla risveglio e durata del sonno.');
      return;
    }
    const bedDec = Number.isFinite(Number(payload?.bedtime))
      ? Number(payload.bedtime)
      : computeBedtimeFromWakeAndDuration(wakeDec, hours);
    const editingId = payload?.editingId ? String(payload.editingId) : null;
    const id = editingId || `sleep_${Date.now()}`;
    const logLook = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
    const existing = editingId
      ? logLook.find((e) => e?.id === editingId && e?.type === 'sleep')
      : null;
    const hoursRounded = Math.round(hours * 100) / 100;
    const notesTrim = String(existing?.notes ?? existing?.note ?? '').trim();
    const entry = {
      type: 'sleep',
      id,
      wakeTime: wakeDec,
      bedtime: bedDec,
      sleepStart: bedDec,
      sleepEnd: wakeDec,
      hours: hoursRounded,
      duration: hoursRounded,
      sleepHours: hoursRounded,
      durationMinutes,
      notes: notesTrim,
      note: notesTrim,
      details: notesTrim,
      deepMin: existing?.deepMin ?? 60,
      remMin: existing?.remMin ?? 60,
      quality,
      ...(existing?.hr != null ? { hr: existing.hr } : {}),
    };

    let finalEntry = entry;
    let fourCylinderNextState = null;
    if (userModel && setUserModel) {
      const attached = attachFourCylinderSleepSnapshot(
        entry,
        userModel,
        currentTrackerDate || getTodayString(),
        {
          fullHistory,
          proteinTarget: userTargets?.prot ?? userProfile?.proteinTarget ?? null,
          activeLog: dailyLog,
        },
      );
      finalEntry = attached.entry;
      fourCylinderNextState = attached.nextFourCylinderState;
    }

    if (isSimulationMode) {
      setSimulatedLog((prev) => {
        const base = prev || [];
        const rest = editingId ? base.filter((e) => e.id !== editingId) : base;
        return [...rest, finalEntry];
      });
      return;
    }
    const base = dailyLog || [];
    const rest = editingId ? base.filter((e) => e.id !== editingId) : base;
    const next = [...rest, finalEntry];
    setDailyLog(next);
    syncDatiFirebase(next, manualNodes || []);
    if (fourCylinderNextState) {
      persistFourCylinderAfterSleep({
        db,
        userUid,
        userModel,
        nextFourCylinderState: fourCylinderNextState,
        lastCalibrationWeek,
        setUserModel,
        fullHistory,
        anchorDateIso: getTodayString(),
      });
    }
  }, [
    isSimulationMode,
    simulatedLog,
    dailyLog,
    manualNodes,
    syncDatiFirebase,
    userModel,
    setUserModel,
    currentTrackerDate,
    db,
    userUid,
    lastCalibrationWeek,
  ]);

  const handleStoricoSaveDayEntry = useCallback(async ({ dateStr, entryId, patch, isSynthetic }) => {
    if (isSimulationMode) return;
    const uid = auth.currentUser?.uid;
    if (!db || !uid || !dateStr) return;

    const storico = fullHistoryRef.current || fullStoricoRef.current || {};
    const currentLog = getLogForDateFromStorico(storico, dateStr);
    const id = String(entryId || patch?.id || '').trim();
    let nextLog;

    if (isSynthetic) {
      const { isSynthetic: _drop, ...cleanPatch } = patch || {};
      nextLog = [...currentLog, {
        ...cleanPatch,
        id: cleanPatch.id || `log_${dateStr}_${Date.now()}`,
        entrySource: cleanPatch.entrySource || 'other',
      }];
    } else if (id) {
      const hasMatch = currentLog.some((entry) => String(entry?.id) === id);
      nextLog = hasMatch
        ? currentLog.map((entry) => (String(entry?.id) === id
          ? {
              ...entry,
              ...patch,
              // Update storico: preserva origine se presente; altrimenti 'other'
              entrySource: patch?.entrySource ?? entry.entrySource ?? 'other',
            }
          : entry))
        : [...currentLog, { ...patch, id, entrySource: patch?.entrySource ?? 'other' }];
    } else {
      nextLog = [...currentLog, {
        ...patch,
        id: patch?.id || `log_${Date.now()}`,
        entrySource: patch?.entrySource ?? 'other',
      }];
    }

    const dayKey = TRACKER_STORICO_KEY(dateStr);
    const manualNodesForDay = Array.isArray(storico[dayKey]?.manualNodes)
      ? storico[dayKey].manualNodes
      : [];
    const mealTimes = extractMealTimesFromLog(nextLog);

    const payload = await saveDiaryLogForDate({
      db,
      uid,
      dateStr,
      log: nextLog,
      manualNodes: manualNodesForDay,
      mealTimes,
    });

    setFullHistory((prev) => ({ ...(prev || {}), [dayKey]: payload }));
    setFullStorico((prev) => ({ ...(prev || {}), [dayKey]: payload }));

    if (dateStr === currentTrackerDateRef.current) {
      setDailyLog(nextLog);
    }
  }, [auth, db, isSimulationMode, setDailyLog, setFullHistory, setFullStorico]);

  const handleStoricoUpdateWorkoutQuestionnaire = useCallback(async (dateStr, workoutId, patch) => {
    const id = String(workoutId || '').trim();
    if (!dateStr || !id || !patch) return;
    if (dateStr === currentTrackerDateRef.current) {
      handleUpdateWorkoutQuestionnaire(id, patch);
      return;
    }
    await handleStoricoSaveDayEntry({
      dateStr,
      entryId: id,
      patch: { id, type: 'workout', ...patch },
      isSynthetic: false,
    });
  }, [handleStoricoSaveDayEntry, handleUpdateWorkoutQuestionnaire]);

  const handleStoricoSaveSleep = useCallback(async (dateStr, payload) => {
    if (!dateStr || !payload) return;
    const wakeDec = Number(payload.wakeTime);
    const hours = Number(payload.hours);
    const quality = Math.max(1, Math.min(5, Math.round(Number(payload.quality) || 3)));
    const durationMinutes = Number.isFinite(Number(payload.durationMinutes))
      ? Math.round(Number(payload.durationMinutes))
      : Math.round(hours * 60);
    if (!(hours > 0) || !Number.isFinite(wakeDec)) {
      window.alert('Controlla risveglio e durata del sonno.');
      return;
    }
    const bedDec = Number.isFinite(Number(payload.bedtime))
      ? Number(payload.bedtime)
      : computeBedtimeFromWakeAndDuration(wakeDec, hours);
    const editingId = payload.editingId ? String(payload.editingId) : null;
    const id = editingId || `sleep_${Date.now()}`;
    const hoursRounded = Math.round(hours * 100) / 100;

    if (dateStr === currentTrackerDateRef.current) {
      handleSaveSleepFromDiary({
        ...payload,
        editingId,
        wakeTime: wakeDec,
        bedtime: bedDec,
        hours: hoursRounded,
        durationMinutes,
        quality,
      });
      return;
    }

    const storico = fullHistoryRef.current || fullStoricoRef.current || {};
    const currentLog = getLogForDateFromStorico(storico, dateStr);
    const existing = editingId
      ? currentLog.find((e) => e?.id === editingId && e?.type === 'sleep')
      : null;
    const notesTrim = String(existing?.notes ?? existing?.note ?? '').trim();
    const entry = {
      type: 'sleep',
      id,
      wakeTime: wakeDec,
      bedtime: bedDec,
      sleepStart: bedDec,
      sleepEnd: wakeDec,
      hours: hoursRounded,
      duration: hoursRounded,
      sleepHours: hoursRounded,
      durationMinutes,
      notes: notesTrim,
      note: notesTrim,
      details: notesTrim,
      deepMin: existing?.deepMin ?? 60,
      remMin: existing?.remMin ?? 60,
      quality,
      ...(existing?.hr != null ? { hr: existing.hr } : {}),
    };
    await handleStoricoSaveDayEntry({
      dateStr,
      entryId: id,
      patch: entry,
      isSynthetic: false,
    });
  }, [handleSaveSleepFromDiary, handleStoricoSaveDayEntry]);

  const handleSleepPromptUseAverage = () => {
    setSleepFormWakeStr('07:00');
    setSleepFormDurationHours(8);
    setSleepFormDurationMinutes(0);
    setSleepFormNotes('');
    setSleepFormQuality(3);
    const wake = 7;
    const hours = 8;
    const bed = computeBedtimeFromWakeAndDuration(wake, hours);
    const sleepEntry = {
      type: 'sleep',
      id: `sleep_avg_${Date.now()}`,
      hours,
      duration: hours,
      sleepHours: hours,
      durationMinutes: 480,
      wakeTime: wake,
      bedtime: bed,
      sleepStart: bed,
      sleepEnd: wake,
      quality: 3,
      notes: '',
      note: '',
      details: '',
      deepMin: 60,
      remMin: 60,
    };
    if (isSimulationMode) {
      setSimulatedLog((prev) => [...(prev || []), sleepEntry]);
    } else {
      const next = [...(dailyLog || []), sleepEntry];
      setDailyLog(next);
      syncDatiFirebase(next, manualNodes || []);
    }
    dismissKentuSleepTrigger();
    if (typeof setChatHistory === 'function') {
      setChatHistory((prev) => markPredictiveGreetingsSuperseded(prev));
    }
    setShowSleepPrompt(false);
  };
  /** Barra Arc Reactor: sempre montata dopo login (anche durante caricamento dati). */
  const shouldHideBottomChatBar =
    biochemicalDetailModal != null
    || isChatOpen
    || showMetabolicTimeline
    || showFastLogger;

  const handleRequestBarcodeScan = useCallback(() => {
    closeChat();
    setFastLoggerAutoOpenScanner(true);
    openFastLoggerNew();
  }, [closeChat, openFastLoggerNew]);

  const handleOpenManualMealFromChat = useCallback((payload = null) => {
    const editingMealId = payload?.editingMealId != null
      ? String(payload.editingMealId).trim()
      : null;

    // Overlay FastMealLogger sopra la chat — senza smontare ai_chat.
    if (editingMealId) {
      loadMealToConstructor(editingMealId);
      return;
    }
    openFastLoggerNew();
  }, [openFastLoggerNew, loadMealToConstructor]);

  const handleOpenActivityFromChat = useCallback((payload = {}) => {
    let raw = String(payload?.defaultTab ?? payload?.tab ?? '').toLowerCase().trim();
    if (!raw) {
      raw = peekActivitySheetTempTab() || '';
    }
    const defaultTab = stashActivitySheetTempTab(raw || 'pesi');
    returnToChatAfterQuickActionRef.current = true;
    closeChat();
    resetWorkoutFormForNewSession(defaultTab);
    setWorkoutType(defaultTab);
    setWorkoutEndTime(getDefaultWorkoutEndTimeDecimal());
    const nonce = Date.now();
    setActivitySheetIntent({ tab: defaultTab, nonce });
    console.log('DEBUG: padre openActivity', { defaultTab, nonce, payload });
    setActiveAction('allenamento');
    setIsDrawerOpen(true);
  }, [
    closeChat,
    resetWorkoutFormForNewSession,
    setWorkoutType,
    setWorkoutEndTime,
  ]);

  const handleOpenPlanFromChat = useCallback(() => {
    returnToChatAfterQuickActionRef.current = true;
    closeChat();
    if (isDiabetesAppMode) {
      openTherapyPlan();
      return;
    }
    openTrainingPlan();
  }, [closeChat, isDiabetesAppMode, openTherapyPlan, openTrainingPlan]);

  const handleChatManualShortcut = useCallback(
    (actionId) => {
      if (actionId === 'menu') {
        returnToChatAfterQuickActionRef.current = true;
        closeChat();
        setAddChoiceView('main');
        setShowChoiceModal(true);
        return;
      }
      if (actionId === 'sleep') {
        returnToChatAfterQuickActionRef.current = true;
        closeChat();
        setShowSleepPrompt(true);
        return;
      }
      if (actionId === 'weight') {
        returnToChatAfterQuickActionRef.current = true;
        closeChat();
        trackEventUsage('weight');
        setShowWeightModal(true);
        return;
      }
      const raw = String(actionId || '').trim().toLowerCase();
      const canonical =
        raw === 'pasto' || raw === 'meal'
          ? 'meal'
          : raw === 'acqua' || raw === 'water'
            ? 'water'
            : raw === 'pisolino' || raw === 'nap'
              ? 'nap'
              : raw === 'caffè' || raw === 'caffe' || raw === 'coffee' || raw === 'stimulant'
                ? 'stimulant'
                : raw === 'tè' || raw === 'te' || raw === 'tea'
                  ? 'tea'
                  : raw === 'energy' || raw === 'energy drink' || raw === 'energydrink' || raw === 'energy_drink'
                    ? 'energy'
                    : raw === 'allenamento'
                      ? 'workout'
                      : raw;
      // Acqua / Caffè / Tè / Energy / Pisolino → panel o drawer. Ritorno chat dopo conferma.
      returnToChatAfterQuickActionRef.current = true;
      closeChat();
      handleAddEventMenuItem(canonical, 'chat_shortcut');
    },
    [closeChat, handleAddEventMenuItem, trackEventUsage],
  );

  const fixedAppBottomChrome = shouldHideBottomChatBar ? null : (
    <AppBottomNavigation
      BOTTOM_NAV_ITEMS={bottomNavItems}
      handleBottomNavTabSelect={handleBottomNavTabSelect}
      activeBottomTab={activeBottomTab}
    />
  );

  const kentuEmblemFab = (
    <KentuChatFab
      visible={
        isAuthenticated
        && MAIN_BOTTOM_TAB_ORDER.includes(activeBottomTab)
        && (isChatOpen || !isDrawerOpen)
        && !trainingBlockCreatorOpen
        && !showTherapyPlan
        && !isChatOpen
        && !showMetabolicTimeline
        && !showFastLogger
        // Neural Reset / Meditazione: il FAB coprirebbe «AVVIA CICLO»
        && activeAction !== 'focus'
      }
      onOpen={handleOpenKentuChat}
      onBlockedOpen={showEngineAlignToast}
      engineReady={isEngineReady}
      showNotificationBadge={!!kentuChatNotificationBadge}
    />
  );

  let salaContent;

  if (!isInitialLoadComplete) {
    salaContent = (
      <>
        <div style={{ minHeight: '100dvh', width: '100%', background: '#050a12' }} aria-hidden />
        {fixedAppBottomChrome}
      </>
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

      <GhostProgramDeleteModal
        open={!!ghostProgramDeleteModal}
        onClose={() => setGhostProgramDeleteModal(null)}
        onConfirmSingle={handleConfirmGhostDeleteSingle}
        onConfirmAll={handleConfirmGhostDeleteAll}
      />

      {programmingRemovedToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
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
          setShowHealthReport(false);
          setShowTherapyPlan(false);
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
              longevityScore={unifiedLongevityScore}
              recoveryScore={sleepRecoveryScore}
              wakeTime={sleepWakeTime}
              currentHour={currentTime}
              metabolicPhase={metabolicSnapshot?.phase}
              dynamicDailyKcal={dynamicDailyKcal}
              workoutsLog={workoutsLog}
              hasSleepData={isViewingToday ? hasSleepDataToday : hasSleepEngineData}
              missingSleep={showMissingSleepState}
              physiologySnapshot={physiologySnapshot}
              onClick={handleOpenEnergyArc}
            />
          </div>
        }
      />

      {MAIN_BOTTOM_TAB_ORDER.includes(activeBottomTab) && (
      <div
        key={snapshotOverlayOpen ? 'snapshot' : activeBottomTab}
        className={`main-tab-swipe-area ${slideDirection}`}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box', width: '100%' }}
        onTouchStart={snapshotOverlayOpen ? undefined : handleMainTabTouchStart}
        onTouchMove={snapshotOverlayOpen ? undefined : handleMainTabTouchMove}
        onTouchEnd={snapshotOverlayOpen ? undefined : handleMainTabTouchEnd}
        onTouchCancel={snapshotOverlayOpen ? undefined : handleMainTabTouchCancel}
      >
      {snapshotOverlayOpen ? (
        <div
          className="snapshot-overlay-shell"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '8px 12px 0',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div className="snapshot-overlay-chrome">
            <button
              type="button"
              className="snapshot-overlay-back"
              onClick={handleCloseSnapshotOverlay}
            >
              ← Home
            </button>
            <span className="snapshot-overlay-title">
              {snapshotOverlayHemisphere === 'salute' ? 'Salute' : 'Progressione'}
            </span>
            <span className="snapshot-overlay-chrome-spacer" aria-hidden />
          </div>
          <Suspense fallback={<KentuLazySectionFallback label="Fotografia…" />}>
            <SnapshotHub
              fourCylinder={userModel?.fourCylinder ?? null}
              fullHistory={fullHistory}
              activeLog={activeLog}
              sleepEngineLiveLog={sleepEngineInputLog}
              activeDate={currentTrackerDate}
              userTargets={userTargets}
              settingsBaseKcal={Math.round(Number(userProfile?.targetCalories) || 0) || null}
              committedGhostGoal={committedGhostGoal}
              committedGhostDeltaKcal={committedGhostDeltaKcal}
              effectiveGhostDeltaKcal={effectiveGhostDeltaKcal}
              autoCompensationDelta={autoCompensationDelta}
              rollingDebt={rollingDebt}
              ghostAutoPilotEnabled={ghostAutoPilotEnabled}
              onToggleGhostAutoPilot={setGhostAutoPilotEnabled}
              onApplyGhostSimGoal={applyGhostSimGoal}
              activeCompensation={userProfile?.activeCompensation ?? null}
              onConfirmCompensation={applyActiveCompensationPlan}
              onClearCompensation={clearActiveCompensationPlan}
              onSaveHealthBiometrics={handleSaveHealthBiometrics}
              healthTodayDate={getTodayString()}
              healthDb={db}
              healthUid={userUid}
              foodDatabase={foodDb}
              setFoodDb={setFoodDb}
              fastingData={fastingData}
              bodyMetricsHistory={bodyMetricsHistory}
              profileHeightCm={Number(userProfile?.height) || Number(userProfile?.altezza) || 174}
              enabled={snapshotOverlayOpen}
              lockedHemisphere={snapshotOverlayHemisphere}
              hideHemisphereNav
              longevityResult={longevityResult}
              saluteFocus={snapshotOverlayFocus}
              onRequestMuscleTelemetry={handleOpenMuscleTelemetry}
              onConsumeSaluteFocus={handleConsumeSaluteFocus}
              todayBurnKcal={dogmaticBurnKcal}
            />
          </Suspense>
        </div>
      ) : (
      <>
      {activeBottomTab === 'analisi' && (
        <DiaryDetailsSheet
          embedded
          isOpen
          onClose={() => {}}
          activeLog={activeLog}
          groupedFoods={groupedFoods}
          workoutsLog={workoutsLog}
          totali={totali}
          dynamicDailyKcal={dynamicDailyKcal}
          decimalToTimeStr={decimalToTimeStr}
          fastingData={fastingData}
          currentHour={isViewingPastDate ? 24 : currentTime}
          isIntentionalFast={currentDayIntentionalFast}
          onMarkIntentionalFast={() => handleSetIntentionalFast(true)}
          onClearIntentionalFast={() => handleSetIntentionalFast(false)}
          onEditMeal={(slotKey) => {
            loadMealToConstructor(slotKey);
          }}
          onEditWorkout={openWorkoutEditorFromLogItem}
          onDeleteItem={removeLogItem}
          onInspectFood={setSelectedFoodForInfo}
          onUpdateWorkoutQuestionnaire={handleUpdateWorkoutQuestionnaire}
          onSaveSleep={handleSaveSleepFromDiary}
        />
      )}

      {activeBottomTab === 'oggi' && (
        <HomeOggiDialSection
          activeDialMode={activeDialMode}
          setActiveDialMode={setActiveDialMode}
          dialHud={dialHud}
          mealPieDisplayData={mealPieDisplayData}
          selectedMealCenter={selectedMealCenter}
          selectedMealCenterIndex={selectedMealCenterIndex}
          setSelectedMealCenter={setSelectedMealCenter}
          totali={totali}
          dynamicDailyKcal={dynamicDailyKcal}
          loadMealToConstructor={loadMealToConstructor}
          onOpenDiario={openDiarioLista}
          setShowDiarySheet={setShowDiarySheet}
          setShowCalorieDetailsSheet={setShowCalorieDetailsSheet}
          setSelectedNodeReport={setSelectedNodeReport}
          effectiveTargetsForCurrentDate={effectiveTargetsForCurrentDate}
          userTargets={userTargets}
          setShowProteinSheet={setShowProteinSheet}
          setShowCarbsSheet={setShowCarbsSheet}
          setShowFatSheet={setShowFatSheet}
          setShowMineralsSheet={setShowMineralsSheet}
          setShowVitaminsSheet={setShowVitaminsSheet}
          db={db}
          user={user}
          currentTrackerDate={currentTrackerDate}
          userProfile={userProfile}
          userModel={userModel}
          fullHistory={fullHistory}
          activeLog={activeLog}
          bodyMetricsHistory={bodyMetricsHistory}
          isSimulationMode={isSimulationMode}
          handleConfirmTrainingBlockSession={handleConfirmTrainingBlockSession}
          handlePostponeTrainingBlockSession={handlePostponeTrainingBlockSession}
          handleExecuteTrainingBlockSession={handleExecuteTrainingBlockSession}
          handleTrainingBlockMacroGoalCalibration={handleTrainingBlockMacroGoalCalibration}
          calibrationDeltaKcal={committedGhostDeltaKcal}
          handleOpenTrendDiag={handleOpenTrendDiag}
          handleOpenTrendSalute={handleOpenTrendSalute}
          handleOpenTrendProgressione={handleOpenTrendProgressione}
          trainingBlockCreatorOpen={trainingBlockCreatorOpen}
          setTrainingBlockCreatorOpen={setTrainingBlockCreatorOpen}
          metabolicSnapshot={metabolicSnapshot}
          physiologySnapshot={physiologySnapshot}
          setShowSleepPrompt={setShowSleepPrompt}
          setShowMetabolicSheet={setShowMetabolicSheet}
          showMissingSleepBanner={showMissingSleepState}
          longevityResult={longevityResult}
        />
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
      <PeriodReportOverlay
        open={showReport}
        reportPeriod={reportPeriod}
        onReportPeriodChange={setReportPeriod}
        onClose={() => setShowReport(false)}
        generateReportData={generateReportData}
        userTargets={userTargets}
      />

      {showHealthReport ? (
        <Suspense fallback={<KentuLazySectionFallback label="Apertura report medico…" />}>
          <HealthReportView
            uid={userUid}
            patientName={String(userProfile?.displayName || userProfile?.name || '').trim()}
            onClose={() => setShowHealthReport(false)}
          />
        </Suspense>
      ) : null}

      {showTherapyPlan ? (
        <Suspense fallback={<KentuLazySectionFallback label="Apertura piano terapeutico…" />}>
          <TherapyPlanView
            uid={userUid}
            patientName={String(userProfile?.displayName || userProfile?.name || '').trim()}
            onClose={() => setShowTherapyPlan(false)}
          />
        </Suspense>
      ) : null}

      {activeBottomTab === 'planning' && (
        <PlanningTabPanel
          weeklyPlan={weeklyPlan}
          setWeeklyPlan={setWeeklyPlan}
          currentTrackerDate={currentTrackerDate}
          userTargets={userTargets}
          setPlanningWizardHydrateNonce={setPlanningWizardHydrateNonce}
          setPlanningWizardOverlayOpen={setPlanningWizardOverlayOpen}
        />
      )}
      {activeBottomTab === 'bussola' && (
        <div
          className="centro-analisi-tab-shell"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Suspense fallback={<KentuLazySectionFallback label="Centro Analisi…" />}>
            <CentroAnalisiView
              embedded
              onExit={() => setActiveBottomTab('oggi')}
              onOpenFotografiaSalute={handleOpenTrendSalute}
              onOpenFotografiaProgressione={handleOpenTrendProgressione}
              onOpenTimelineMetabolica={openMetabolicTimeline}
              livePreview={centroAnalisiLivePreview}
              calibrazioneHandlers={{
                activeDate: currentTrackerDate || getTodayString(),
                settingsBaseKcal: dogmaticSettingsBaseKcal,
                committedGhostGoal,
                committedGhostDeltaKcal,
                effectiveGhostDeltaKcal,
                autoCompensationDelta: dogmaticAutoCompensationKcal,
                rollingDebt,
                ghostAutoPilotEnabled,
                onToggleGhostAutoPilot: setGhostAutoPilotEnabled,
                onApplyGhostSimGoal: applyGhostSimGoal,
                activeCompensation: userProfile?.activeCompensation ?? null,
                onConfirmCompensation: applyActiveCompensationPlan,
                onClearCompensation: clearActiveCompensationPlan,
              }}
            />
          </Suspense>
        </div>
      )}
      </>
      )}
      </div>
      )}
      {activeBottomTab === 'longevita' && (
        <LongevityTabShell
          longevityData={longevityData}
          userAge={userAge}
          bodyMetricsHistory={bodyMetricsHistory}
          longevityScoreHistory={longevityScoreHistory}
          currentTrackerDate={currentTrackerDate}
          fullHistory={fullHistory}
          userTargets={userTargets}
          userProfile={userProfile}
          handleUpdateTDEE={handleUpdateTDEE}
          tdeeHistory={tdeeHistory}
          predictiveCalibration={predictiveCalibration}
          handleCSVUpload={handleCSVUpload}
          handleQuickWeighInFromHistory={handleQuickWeighInFromHistory}
          handleDeleteBodyMetrics={handleDeleteBodyMetrics}
          pastDaysStorico={pastDaysStorico}
          weeklyTrendData={weeklyTrendData}
          weeklyMicrosTotals={weeklyMicrosTotals}
          weeklyKcalChartReference={weeklyKcalChartReference}
        />
      )}
      {/* --- CASSETTO AZIONI (sempre montato: visibile da ogni tab bottom) --- */}
      <MenuDrawerShell
        isDrawerOpen={isDrawerOpen}
        onClose={() => {
          if (postWorkoutReviewActive) {
            dismissPostWorkoutReview();
            return;
          }
          closeDrawer();
        }}
      >
        <MainMenuDrawer
          activeAction={activeAction}
          setActiveAction={setActiveAction}
          addEventMenuOrder={addEventMenuOrder}
          commitAddEventMenuOrder={commitAddEventMenuOrder}
          handleAddEventMenuItem={handleAddEventMenuItem}
          setShowReport={setShowReport}
          onOpenHealthReport={isDiabetesAppMode ? openHealthReport : null}
          onOpenTherapyPlan={openTherapyPlan}
          onOpenTrainingPlan={openTrainingPlan}
          isDiabetesAppMode={isDiabetesAppMode}
          closeDrawer={closeDrawer}
          setIsDrawerOpen={setIsDrawerOpen}
          setShowProfile={setShowProfile}
          onSanitizeFoodDb={import.meta.env.DEV ? runHistoricalFoodDbSanitize : null}
        />

        <Suspense fallback={<KentuLazySectionFallback label="Apertura vista…" />}>
        {import.meta.env.DEV && activeAction === 'api_diary' && (
          <ApiDiary onBack={() => { setIsDrawerOpen(false); setActiveAction('menu_secondary'); }} />
        )}

        {/* VISTA ACQUA */}
        {activeAction === 'acqua' && (
          <WaterActionModal
            onBack={() => {
              if (returnToChatAfterQuickActionRef.current) {
                finishQuickActionSurface();
              } else {
                setActiveAction(null);
              }
            }}
            onConfirm={handleConfirmWaterDrawer}
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
            onBack={() => {
              if (returnToChatAfterQuickActionRef.current) {
                finishQuickActionSurface();
              } else {
                setActiveAction(null);
              }
            }}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkoutView
            key={`activity-sheet-${activitySheetIntent.nonce || '0'}`}
            preferredWorkoutType={activitySheetIntent.tab}
            preferredWorkoutTypeNonce={activitySheetIntent.nonce}
            onBack={() => {
              if (postWorkoutReviewActive) {
                dismissPostWorkoutReview();
                return;
              }
              clearWorkoutPlanDraft();
              if (returnToChatAfterQuickActionRef.current) {
                closeWorkoutSurface();
              } else {
                setActiveAction(null);
              }
            }}
            postWorkoutReview={postWorkoutReviewActive}
            onDismissPostWorkoutReview={dismissPostWorkoutReview}
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
          </div>
        )}

        </Suspense>

        {/* VISTA ARCHIVIO STORICO */}
        {activeAction === 'storico' && (
          <Suspense fallback={<KentuLazySectionFallback label="Archivio storico…" />}>
            <ArchivioStoricoView
              onBack={() => setActiveAction(null)}
              selectedHistoryDate={selectedHistoryDate}
              setSelectedHistoryDate={setSelectedHistoryDate}
              selectedDayData={selectedDayData}
              pastDaysStorico={pastDaysStorico}
              expandedStoricoDate={expandedStoricoDate}
              setExpandedStoricoDate={setExpandedStoricoDate}
              fullHistory={fullHistory}
          decimalToTimeStr={decimalToTimeStr}
              onUpdateWorkoutQuestionnaire={handleStoricoUpdateWorkoutQuestionnaire}
              onSaveSleep={handleStoricoSaveSleep}
            />
          </Suspense>
        )}

        {/* DEV CONSOLE — fullscreen admin overlay */}
        {activeAction === 'dev_console' && createPortal(
                                <div
                                  style={{
              position: 'fixed',
              inset: 0,
              width: '100dvw',
              height: '100dvh',
              zIndex: 100000,
              boxSizing: 'border-box',
              background: 'radial-gradient(ellipse at top, #1e293b 0%, #0a0a0a 55%, #000 100%)',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
              overflow: 'auto',
            }}
          >
            <Suspense fallback={<KentuLazySectionFallback label="Dev Console…" />}>
              <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 40px', minHeight: '100%' }}>
                <DevConsoleView
                  uid={userUid}
                  onBack={() => { setIsDrawerOpen(false); setActiveAction('menu_secondary'); }}
              />
            </div>
            </Suspense>
          </div>,
          document.body,
        )}

        <NeuralResetZenPortal
          open={activeAction === 'focus'}
          onBack={() => setActiveAction(null)}
          isZenActive={neuralReset.isZenActive}
          zenBreathPhase={neuralReset.zenBreathPhase}
          zenSunScale={neuralReset.zenSunScale}
          audioMode={neuralReset.audioMode}
          zenForestAmbientOn={neuralReset.zenForestAmbientOn}
          zenBreathPatternId={neuralReset.zenBreathPatternId}
          setZenBreathPatternId={neuralReset.setZenBreathPatternId}
          zenSessionDurationKey={neuralReset.zenSessionDurationKey}
          setZenSessionDurationKey={neuralReset.setZenSessionDurationKey}
          zenGracefulEnd={neuralReset.zenGracefulEnd}
          zenSunTransitionMs={neuralReset.zenSunTransitionMs}
          zenSunDimHold={neuralReset.zenSunDimHold}
          zenTimerLine={neuralReset.zenTimerLine}
          neuralResetAudioRef={neuralReset.neuralResetAudioRef}
          neuralResetBellRef={neuralReset.neuralResetBellRef}
          zenAmbientForestRef={neuralReset.zenAmbientForestRef}
          toggleSeaAudio={neuralReset.toggleSeaAudio}
          toggleForestAmbient={neuralReset.toggleForestAmbient}
          toggleZenSession={neuralReset.toggleZenSession}
          exitZenView={neuralReset.exitZenView}
          patterns={neuralReset.patterns}
          durationOptions={neuralReset.durationOptions}
        />


        <EditFoodQuantityModal
          selectedFoodForEdit={selectedFoodForEdit}
          initialQuantity={editQuantityValue}
          onClose={() => setSelectedFoodForEdit(null)}
          onConfirm={(qta, selected) => {
            const { food, source } = selected;
            const newItem = ensureRecipeDiaryFields({
              ...estraiDatiFoodDb(food.desc || food.name, qta, food.mealType),
              id: food.id,
              locked: true,
              entrySource: 'ui',
            });
            if (source === 'diary') {
              if (isSimulationMode) {
                setSimulatedLog((prev) => (prev || []).map((f) => {
                  if (f.id !== food.id) return f;
                  return { ...newItem, mealTime: f.mealTime };
                }));
              } else {
                const newLog = dailyLog.map((f) => {
                  if (f.id !== food.id) return f;
                  return { ...newItem, mealTime: f.mealTime };
                });
                setDailyLog(newLog);
                syncDatiFirebase(newLog, manualNodes);
              }
            }
            setSelectedFoodForEdit(null);
          }}
        />

      </MenuDrawerShell>

      {/* Chat Full-Screen — montata dalla prima apertura; slide dal basso */}
      <KentuChatShell mounted={chatShellMounted} open={isChatOpen}>
          <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-zinc-950" aria-busy />}>
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
            onEnableMealDraftInteractiveEdit={handleEnableMealDraftInteractiveEdit}
            onRequestMealItemEdit={handleRequestMealItemEdit}
            onCancelMealDraftProposal={handleCancelMealDraftProposal}
            onLearnUnresolvedFood={learnUnresolvedFoodEntry}
            foodDatabase={foodDb}
            kentuItDatabase={kentuCatalogItDb}
            globalFoodDatabase={csvFoodDb}
            offDb={offFoodDb}
            fullHistory={fullHistory}
            dailyLog={activeLog}
            userTargets={effectiveTargetsForCurrentDate || userTargets}
            diaryReady={isInitialLoadComplete}
            engineReady={isEngineReady}
            onDraftConfirm={handleDraftConfirm}
            onDraftCancel={handleDraftCancel}
            onDraftRemoveItem={handleDraftRemoveItem}
            onDraftUpdateItemGrams={handleDraftUpdateItemGrams}
            onDraftUpdateMealMeta={handleDraftUpdateMealMeta}
            onDraftUpdateFoodItemName={handleDraftUpdateFoodItemName}
            onMcDriveRemoveItem={handleMcDriveRemoveItem}
            onMcDriveUpdateGrams={handleMcDriveUpdateGrams}
            onMcDriveUpdateMealTime={handleMcDriveUpdateMealTime}
            onMcDriveApplyAlternative={handleMcDriveApplyAlternative}
            onMcDriveReplaceFromSearch={handleMcDriveReplaceFromSearch}
            onMcDriveAppendSolverItems={handleMcDriveAppendSolverItems}
            onMcDriveRequestDisambiguation={handleMcDriveRequestDisambiguation}
            getMcDriveMealTargets={getFastLoggerMealTargetsForSlot}
            onWorkoutDraftUpdateMeta={handleWorkoutDraftUpdateMeta}
            onWorkoutDraftUpdateExercise={handleWorkoutDraftUpdateExercise}
            onWorkoutDraftRemoveExercise={handleWorkoutDraftRemoveExercise}
            onSaveNewFoodEntry={handleSaveNewFoodEntry}
            onBack={closeChat}
            introPhrase={introPhrase}
            isProcessing={isChatProcessing}
            onCancelGeneration={cancelGeneration}
            mealBuilder={mealBuilder}
            cancelMealBuilder={cancelMealBuilder}
            commitMealBuilder={commitMealBuilder}
            onManualShortcut={handleChatManualShortcut}
            onOpenManualView={handleOpenManualMealFromChat}
            onOpenActivityView={handleOpenActivityFromChat}
            onOpenPlanView={handleOpenPlanFromChat}
            isDiabetesAppMode={isDiabetesAppMode}
            onRequestReport={handleRequestDailyReport}
            onRequestBarcodeScan={handleRequestBarcodeScan}
            quickStripItems={chatQuickStripItems}
            preferVoiceChat={isDiabetesAppMode}
            userDisplayName={String(userProfile?.displayName || userProfile?.name || '').trim()}
            healthScore={healthScore ?? null}
            isTrainingDay={Boolean(hasPlannedBlock || hasRealWorkoutInActiveLog)}
            onRequestHealthDiagnosis={handleRequestHealthDiagnosis}
          />
          </Suspense>
      </KentuChatShell>

      <ChatFoodEnrichmentModal
        session={chatUsdaEnrichmentSession}
        onSelectMatch={handleChatUsdaEnrichmentSelect}
        onSkip={handleChatUsdaEnrichmentSkip}
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

      <RecalibrationProposalModal
        recalibrationProposal={recalibrationProposal}
        onDismiss={dismissRecalibrationProposal}
        onApply={applyRecalibrationProposal}
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
        saveProfileToFirebase={saveProfileToFirebase}
        onAppModeChange={handleAppModeChange}
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
        coffeeType={coffeeType}
        setCoffeeType={setCoffeeType}
        teaType={teaType}
        setTeaType={setTeaType}
        energyType={energyType}
        setEnergyType={setEnergyType}
        coffeeVariant={coffeeVariant}
        setCoffeeVariant={setCoffeeVariant}
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
        inputWaist={inputWaist}
        setInputWaist={setInputWaist}
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
        onClose={handleCloseSleepPrompt}
        trackerDate={currentTrackerDate || getTodayString()}
        sleepFormWakeStr={sleepFormWakeStr}
        setSleepFormWakeStr={setSleepFormWakeStr}
        sleepFormDurationHours={sleepFormDurationHours}
        setSleepFormDurationHours={setSleepFormDurationHours}
        sleepFormDurationMinutes={sleepFormDurationMinutes}
        setSleepFormDurationMinutes={setSleepFormDurationMinutes}
        sleepFormNotes={sleepFormNotes}
        setSleepFormNotes={setSleepFormNotes}
        sleepFormQuality={sleepFormQuality}
        setSleepFormQuality={setSleepFormQuality}
        sleepDurationLabel={sleepDurationLabel}
        computedBedtimeLabel={computedSleepBedtimeLabel}
        onSave={handleSaveSleepPrompt}
        onUseAverage={handleSleepPromptUseAverage}
      />

      <SleepModalOverlay
        sleepModal={sleepModal}
        onClose={() => setSleepModal(null)}
        trackerDate={currentTrackerDate}
        sleepFormWakeStr={sleepFormWakeStr}
        setSleepFormWakeStr={setSleepFormWakeStr}
        sleepFormDurationHours={sleepFormDurationHours}
        setSleepFormDurationHours={setSleepFormDurationHours}
        sleepFormDurationMinutes={sleepFormDurationMinutes}
        setSleepFormDurationMinutes={setSleepFormDurationMinutes}
        sleepFormNotes={sleepFormNotes}
        setSleepFormNotes={setSleepFormNotes}
        sleepFormQuality={sleepFormQuality}
        setSleepFormQuality={setSleepFormQuality}
        sleepDurationLabel={sleepDurationLabel}
        computedBedtimeLabel={computedSleepBedtimeLabel}
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
              const slotId = String(node.mealId || node.id);
              const foodsForSlot =
                Array.isArray(node.items) && node.items.length > 0
                  ? node.items
                  : Array.isArray(node.foods) && node.foods.length > 0
                    ? node.foods
                    : getFoodItemsForMealSlot(activeLog, slotId);
              const mealTime = typeof node.time === 'number' && !Number.isNaN(node.time)
                ? node.time
                : (typeof foodsForSlot[0]?.mealTime === 'number' ? foodsForSlot[0].mealTime : null);
              openMealEditorForEdit(slotId, foodsForSlot, mealTime);
              return;
            }
            // ghost_workout / workout / work / cognitive: stesso idratazione form
            openWorkoutEditorFromLogItem(node);
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
            const updated = ensureRecipeDiaryFields({
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
              desc: editFoodData.desc ?? editFoodData.name ?? editFoodData.nome,
              entrySource: 'ui',
            });
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
              <Suspense fallback={<KentuLazySectionFallback label="Trend storico…" />}>
                <TrendMetricLineChart trendData={trendData} trendDays={trendDays} />
              </Suspense>
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
        activeLog={activeLog}
        groupedFoods={groupedFoods}
        workoutsLog={workoutsLog}
        totali={totali}
        dynamicDailyKcal={dynamicDailyKcal}
        decimalToTimeStr={decimalToTimeStr}
        fastingData={fastingData}
        currentHour={isViewingPastDate ? 24 : currentTime}
        isIntentionalFast={currentDayIntentionalFast}
        onMarkIntentionalFast={() => handleSetIntentionalFast(true)}
        onClearIntentionalFast={() => handleSetIntentionalFast(false)}
        onEditMeal={(slotKey) => {
          setShowDiarySheet(false);
          loadMealToConstructor(slotKey);
        }}
        onEditWorkout={openWorkoutEditorFromLogItem}
        onDeleteItem={removeLogItem}
        onInspectFood={setSelectedFoodForInfo}
        onUpdateWorkoutQuestionnaire={handleUpdateWorkoutQuestionnaire}
        onSaveSleep={handleSaveSleepFromDiary}
      />

      <MetabolicTimelineOverlay
        open={showMetabolicTimeline}
        onClose={() => setShowMetabolicTimeline(false)}
        dateLabel={
          currentTrackerDate
            ? `Giorno selezionato: ${currentTrackerDate}${isViewingPastDate ? ' (storico)' : ''}`
            : ''
        }
      >
        <AnalisiTimelineTab
          hasCrashRisk={hasCrashRisk}
          hasWaterRisk={hasWaterRisk}
          hasCortisolRisk={hasCortisolRisk}
          hasDigestionRisk={hasDigestionRisk}
          chartUnit={chartUnit}
          setChartUnit={setChartUnit}
          handleUndo={handleUndo}
          handleRedo={handleRedo}
          historyIndex={historyIndex}
          historyStack={historyStack}
          isWaterHydrationAutoPilot={isWaterHydrationAutoPilot}
          setZoomLevel={setZoomLevel}
          handleCenterZoomAndPan={handleCenterZoomAndPan}
          draggingNode={draggingNode}
          chartScrollRef={chartScrollRef}
          handleChartTouchStart={handleChartTouchStart}
          handleChartTouchMove={handleChartTouchMove}
          handleChartTouchEnd={handleChartTouchEnd}
          isChartTooltipActive={isChartTooltipActive}
          setIsChartTooltipActive={setIsChartTooltipActive}
          chartTouchTimerRef={chartTouchTimerRef}
          TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1={TIMELINE_CHART_WIDTH_PCT_AT_ZOOM_1}
          zoomLevel={zoomLevel}
          mainChartData={mainChartData}
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
          setShowMetabolicSheet={setShowMetabolicSheet}
          activeNodesWithStack={activeNodesWithStack}
          activeAction={activeAction}
          idealStrategy={idealStrategy}
          realTotals={realTotals}
          touchingNodeId={touchingNodeId}
          dragOffsetY={dragOffsetY}
          dragLiveTime={dragLiveTime}
          timelineContainerRef={timelineContainerRef}
          startNodeDrag={startNodeDrag}
          releaseNodePointer={releaseNodePointer}
          onTimelineNodeClick={onTimelineNodeClick}
          openTimelineQuickAddAtPointer={openTimelineQuickAddAtPointer}
          handleNodeTap={handleNodeTap}
          syncDatiFirebase={syncDatiFirebase}
          setManualNodes={setManualNodes}
          setDailyLog={setDailyLog}
          timelineEnergySeries={timelineEnergySeries}
          chartData={chartData}
          updateMealTime={updateMealTime}
          onTimelineStripPreviewDragStart={onTimelineStripPreviewDragStart}
          scheduleTimelineStripEnergyPreview={scheduleTimelineStripEnergyPreview}
          clearTimelineStripEnergyPreview={clearTimelineStripEnergyPreview}
          onTimelineStripDragOutsideDelete={onTimelineStripDragOutsideDelete}
        />
      </MetabolicTimelineOverlay>

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

      <CalorieDetailsModal
        isOpen={showCalorieDetailsSheet}
        onClose={() => setShowCalorieDetailsSheet(false)}
        tdeeBaseKcal={dogmaticSettingsBaseKcal}
        workoutBurnKcal={dogmaticBurnKcal}
        deltaKcal={dogmaticDeltaKcal}
        compensationKcal={dogmaticCompensationKcal}
        compensationDaysRemaining={
          dogmaticCompensationStatus.isActive
            ? dogmaticCompensationStatus.daysRemaining
            : null
        }
        targetKcal={dogmaticTargetKcal}
        consumedKcal={Math.round(Number(totali?.kcal) || 0)}
        proteinConsumed={Number(totali?.prot) || 0}
        proteinTarget={
          effectiveTargetsForCurrentDate?.prot
          ?? userTargets?.prot
          ?? 150
        }
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

      <SncStressPopup
        open={showSncPopup}
        sncStressLevel={sncStressLevel}
        onClose={() => setShowSncPopup(false)}
      />

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

      {showFastLogger ? (
        <Suspense
          fallback={
            <KentuLazySectionFallback label="Logger pasti…" variant="fullscreen" />
          }
        >
        <FastMealLogger
          key={`fast-logger-${fastLoggerRemountKey}`}
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
          autoOpenBarcodeScanner={fastLoggerAutoOpenScanner}
          onAutoOpenBarcodeScannerConsumed={() => setFastLoggerAutoOpenScanner(false)}
          onClose={closeFastLogger}
          onSave={handleFastLoggerSave}
          onAcquireExternalFood={saveFoodEntryPer100ToFoodDb}
          onPatchFoodDbEntry={patchFoodDbEntry}
          onSaveRecipe={saveCustomRecipeToFoodDb}
        />
        </Suspense>
      ) : null}

      {fixedAppBottomChrome}

      <QuickEventConfirmOverlay
        payload={quickEventConfirm}
        onDone={() => setQuickEventConfirm(null)}
        imageHoldMs={quickEventConfirm?.videoSrc ? 0 : 1600}
      />
    </div>
  );
  }

  const isDataLoaded = isInitialLoadComplete;
  const startupOverlayBlocking =
    !startupSafetyBypass && !isDataLoaded;

  return (
    <UserNutritionGoalsProvider value={nutritionGoalsValue}>
      <WipMealProvider>
        <>
          <FirebaseDataLoadingLayer blocking={startupOverlayBlocking} phrase={introPhrase} />
          {engineAlignToastVisible ? (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[100020] -translate-x-1/2 rounded-xl border border-cyan-500/30 bg-zinc-900/95 px-4 py-2 text-center text-xs font-medium text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm"
            >
              Allineamento parametri in corso…
            </div>
          ) : null}
          {salaContent}
          {kentuEmblemFab}
        </>
      </WipMealProvider>
    </UserNutritionGoalsProvider>
  );
}
