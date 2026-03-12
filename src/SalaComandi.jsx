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
import { ComposedChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid, Area, BarChart, Bar, Tooltip, ReferenceArea, PieChart, Pie, Cell, Sector } from 'recharts';

import { ref, get, set, onValue, update } from 'firebase/database';

import { useFirebase } from './useFirebase';
import ChartModal from './ChartModal';
import AiCluster from './AiCluster';
import MealBuilder from './MealBuilder';
import { TARGETS, DEFAULT_TARGETS, useBiochimico, getDefaultNutrientValue, getTargetForNutrient } from './useBiochimico';
import {
  RADIAN,
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
  computeBaselineEnergy,
  computeDigestiveLoad,
  responseCurve,
  PHYSIOLOGY_CONFIG,
  generateRealEnergyData,
  computeEnergyDrivers,
  computeMetabolicStress,
  computeMetabolicDayScore,
  explainEnergyState,
  computeEnergyForecast,
  explainEnergyCrash,
  simulateSnackIntervention,
  simulateCoffeeIntervention,
  simulateWaterIntervention,
  simulateInterventions,
  formatTimeForInsight,
  generateDailyInsights,
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
  predictEnergyIntervention
} from './coreEngine';

export default function SalaComandi() {
  const { db, auth, user, handleLogin: firebaseLogin } = useFirebase();
  const isAuthenticated = !!user;
  const userUid = user?.uid ?? null;

  // Form di login (stato locale)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isBooting, setIsBooting] = useState(false);

  // STATI INTERFACCIA
  const [currentTime, setCurrentTime] = useState(8);
  const [showDetails, setShowDetails] = useState(false);
  const [chartUnit, setChartUnit] = useState('percent'); // 'percent' | 'kcal'
  const [expandedChart, setExpandedChart] = useState(null); // 'percent' | 'kcal' | 'glicemia' | ... per modale fullscreen
  const [activeHighlight, setActiveHighlight] = useState(null); // glossario: 'energia' | 'anabolica' | 'cortisolo' | 'sveglia' | 'digestione' | 'ora'
  const [bottomTab, setBottomTab] = useState('desc'); // 'desc' | 'ai' (metà inferiore modale)
  const [aiInsightsList, setAiInsightsList] = useState([]); // Array di { time: string, text: string }
  const [currentAiIndex, setCurrentAiIndex] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const highlightResetTimeoutRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1.8); // Partiamo con uno zoom maggiore per separare i nodi
  const [isChartTooltipActive, setIsChartTooltipActive] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeAction, setActiveAction] = useState('home');
  const [pendingAiBatch, setPendingAiBatch] = useState(null);
  const [selectedMealCenter, setSelectedMealCenter] = useState(null);
  const [isMealBuilderOpen, setIsMealBuilderOpen] = useState(false);
  const [userModel, setUserModel] = useState(DEFAULT_USER_MODEL);
  const [lastCalibrationWeek, setLastCalibrationWeek] = useState(null);
  const [nervousSystemLoad, setNervousSystemLoad] = useState(30);
  const [simulationMode, setSimulationMode] = useState(false);
  const [simulationNodes, setSimulationNodes] = useState([]);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulatedLog, setSimulatedLog] = useState(null);
  const pressTimer = useRef(null);
  const coreOsClickCount = useRef(0);
  const coreOsClickTimer = useRef(null);
  const [dailyInsights, setDailyInsights] = useState([]);
  const [energyForecast, setEnergyForecast] = useState(null);
  const [crashExplanation, setCrashExplanation] = useState(null);

  const isDrawerOpenRef = useRef(isDrawerOpen);
  const activeActionRef = useRef(activeAction);
  useEffect(() => { isDrawerOpenRef.current = isDrawerOpen; }, [isDrawerOpen]);
  useEffect(() => { activeActionRef.current = activeAction; }, [activeAction]);

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
        setIsDrawerOpen(false);
        window.history.pushState({ noExit: true }, '');
      } else if (activeActionRef.current && activeActionRef.current !== 'home') {
        setActiveAction('home');
        window.history.pushState({ noExit: true }, '');
      } else {
        const confirmExit = window.confirm('Vuoi uscire da ReadyCore?');
        if (!confirmExit) {
          window.history.pushState({ noExit: true }, '');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');

  // SOTTO-NAVIGAZIONE DIARIO
  const [diarioTab, setDiarioTab] = useState('storico');
  const [telemetrySubTab, setTelemetrySubTab] = useState('macro');
  const TELEMETRY_TABS = ['macro', 'bilanci', 'amino', 'vit', 'min', 'fat'];
  const telemetryScrollRef = useRef(null);
  const popupTelemetryScrollRef = useRef(null);
  const handlePopupTelemetryScroll = (e) => {
    const { scrollLeft, clientWidth } = e.target;
    const pageIndex = Math.round(scrollLeft / clientWidth);
    const activeTab = TELEMETRY_TABS[pageIndex];
    if (activeTab && activeTab !== telemetrySubTab) {
      setTelemetrySubTab(activeTab);
    }
  };

  const scrollToPopupTelemetryTab = (tabName) => {
    setTelemetrySubTab(tabName);
    const index = TELEMETRY_TABS.indexOf(tabName);
    if (popupTelemetryScrollRef.current && index !== -1) {
      const container = popupTelemetryScrollRef.current;
      container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
    }
  };
  const [expandedStoricoDate, setExpandedStoricoDate] = useState(null);

  // STRATEGIA E DATABASE
  const [dayProfile, setDayProfile] = useState('upper');
  const [calorieTuning, setCalorieTuning] = useState(0);
  const [foodDb, setFoodDb] = useState({});
  const [dailyLog, setDailyLog] = useState([]);
  const activeLog = isSimulationMode && simulatedLog != null ? simulatedLog : dailyLog;

  // STATI MODULI (Pasti, Acqua, Allenamento, Zen)
  const [mealType, setMealType] = useState('cena');
  const [drawerMealTime, setDrawerMealTime] = useState(12);
  const [drawerMealTimeStr, setDrawerMealTimeStr] = useState('12:00');
  const [foodNameInput, setFoodNameInput] = useState('');
  const [foodWeightInput, setFoodWeightInput] = useState('');
  const [addedFoods, setAddedFoods] = useState([]);
  const [selectedFoodForCard, setSelectedFoodForCard] = useState(null);
  const [inspectedFood, setInspectedFood] = useState(null);
  const [editFoodData, setEditFoodData] = useState(null);
  const [isAIVerifying, setIsAIVerifying] = useState(false);
  
  const [foodDropdownSuggestions, setFoodDropdownSuggestions] = useState([]);
  const [showFoodDropdown, setShowFoodDropdown] = useState(false);
  const [isGeneratingFood, setIsGeneratingFood] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const barcodeVideoRef = useRef(null);
  const barcodeStreamRef = useRef(null);
  const barcodeScanIntervalRef = useRef(null);
  
  const [selectedFoodForInfo, setSelectedFoodForInfo] = useState(null);
  const [selectedFoodForEdit, setSelectedFoodForEdit] = useState(null);
  const [nutrientModal, setNutrientModal] = useState(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [addChoiceView, setAddChoiceView] = useState('main'); // 'main' | 'stimulant'
  const [stimulantSubtype, setStimulantSubtype] = useState('caffè'); // 'caffè' | 'tè' | 'energy drink'
  const [stimulantTime, setStimulantTime] = useState(8);
  const [showSpieInfo, setShowSpieInfo] = useState(false); // Modale spiegazione spie
  const [isFullScreenGraph, setIsFullScreenGraph] = useState(false);
  const availableFullscreenCharts = ['percent', 'cortisolo', 'calorieTimeline'];
  const [fullscreenChartIndex, setFullscreenChartIndex] = useState(0);
  const [showTrainingPopup, setShowTrainingPopup] = useState(false);
  const [showSleepPrompt, setShowSleepPrompt] = useState(false);
  const [selectedNodeReport, setSelectedNodeReport] = useState(null);
  const [editingQuickNode, setEditingQuickNode] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState({
    gender: 'M',
    age: 30,
    weight: 75,
    height: 175,
    activityLevel: '1.55',
    goal: 'maintain',
    level: 'base'
  });
  const [userTargets, setUserTargets] = useState({ ...DEFAULT_TARGETS });

  const [workoutType, setWorkoutType] = useState('pesi');
  const [workoutKcal, setWorkoutKcal] = useState(300);
  const [workoutStartTime, setWorkoutStartTime] = useState(18);
  const [workoutEndTime, setWorkoutEndTime] = useState(19);
  const [workoutMuscles, setWorkoutMuscles] = useState([]);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);

  const dailyWaterGoal = userTargets.water ?? 2500; 
  const [isZenActive, setIsZenActive] = useState(false);

  // AI ASSISTANT E CLUSTER
  const [apiKeys, setApiKeys] = useState(() => JSON.parse(localStorage.getItem('ghost_api_cluster')) || ['']);
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const [chatHistory, setChatHistory] = useState([
    { sender: 'ai', text: 'ReadyCore ONLINE. Interfaccia Premium e Motore Biochimico allineati.' }
  ]);
  const CHAT_HISTORY_WINDOW = 10;
  const lastLogFromFirebaseRef = useRef(null);
  const pendingLogRef = useRef(null);
  const pendingNodesRef = useRef(null);
  const foodInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  const [fullStorico, setFullStorico] = useState(null);
  const [fullHistory, setFullHistory] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [showTelemetryPopup, setShowTelemetryPopup] = useState(false);
  const [showMetabolicPopup, setShowMetabolicPopup] = useState(false);
  const [showEnergyPopup, setShowEnergyPopup] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportViewedDates, setReportViewedDates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reportViewedDates')) || {}; } catch { return {}; }
  });
  const [reportPeriod, setReportPeriod] = useState('7');
  const [currentDateObj, setCurrentDateObj] = useState(() => new Date());

  const currentTrackerDate = useMemo(() => {
    const offset = currentDateObj.getTimezoneOffset() * 60000;
    return new Date(currentDateObj.getTime() - offset).toISOString().slice(0, 10);
  }, [currentDateObj]);

  const [idealStrategy, setIdealStrategy] = useState(() => {
    const saved = localStorage.getItem('vyta_idealStrategy');
    return saved ? JSON.parse(saved) : { colazione: 400, pranzo: 700, spuntino: 250, cena: 500, allenamento: 300 };
  });

  const [manualNodes, setManualNodes] = useState(() => {
    const saved = localStorage.getItem('vyta_timeline');
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  });
  const waterIntake = useMemo(() => manualNodes.filter(n => n.type === 'water').reduce((acc, n) => acc + (n.ml ?? n.amount ?? 0), 0), [manualNodes]);
  const [draggingNode, setDraggingNode] = useState(null);
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

  const centerCurrentTime = useCallback(() => {
    if (!chartScrollRef.current) return;
    const container = chartScrollRef.current;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;

    if (currentTrackerDate === getTodayString()) {
      const chartWidth = scrollWidth - 80;
      const timePos = (currentTime / 24) * chartWidth;
      const targetScroll = timePos - (clientWidth / 2);
      container.scrollLeft = Math.max(0, Math.min(targetScroll, scrollWidth - clientWidth));
    } else {
      container.scrollLeft = scrollWidth;
    }
  }, [currentTime, currentTrackerDate, zoomLevel]);

  useEffect(() => {
    const timer = setTimeout(centerCurrentTime, 50);
    return () => clearTimeout(timer);
  }, [currentTime, zoomLevel, centerCurrentTime]);

  // Forza la centratura del grafico quando si apre la vista Analisi (Pro)
  useEffect(() => {
    if (userProfile?.level === 'pro') {
      const timer = setTimeout(() => centerCurrentTime(), 100);
      return () => clearTimeout(timer);
    }
  }, [userProfile?.level, currentTrackerDate, zoomLevel, centerCurrentTime]);

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
      'merenda1': 'colazione',
      'colazione': 'colazione',
      'merenda2': 'spuntino',
      'spuntino': 'spuntino',
      'snack': 'spuntino',
      'pranzo': 'pranzo',
      'cena': 'cena'
    };
    return map[mealType] || mealType;
  };

  const computedMealNodes = useMemo(() => {
    const bySlot = {};
    (activeLog || []).forEach(f => {
      const slotKey = getSlotKey(f);
      if (slotKey) {
        const foodKcal = Number(f.kcal ?? f.cal ?? 0) || 0;
        if (!bySlot[slotKey]) {
          bySlot[slotKey] = {
            mealType: f.mealType,
            originalTypes: new Set(),
            time: typeof f.mealTime === 'number' && !Number.isNaN(f.mealTime) ? f.mealTime : 12,
            strategyKey: getStrategyKey(toCanonicalMealType(f.mealType)),
            kcal: foodKcal
          };
        } else {
          bySlot[slotKey].kcal += foodKcal;
        }
        bySlot[slotKey].originalTypes.add(f.mealType);
      }
    });

    return Object.values(bySlot).map(m => ({
      id: m.mealType,
      type: 'meal',
      time: m.time,
      strategyKey: m.strategyKey,
      kcal: m.kcal ?? 0,
      originalTypes: Array.from(m.originalTypes),
      icon: getMealIcon(m.mealType.split('_')[0])
    }));
  }, [activeLog]);

  const allNodes = useMemo(() => {
    return [...computedMealNodes, ...manualNodes].sort((a, b) => a.time - b.time);
  }, [computedMealNodes, manualNodes]);

  const activeNodes = simulationMode ? simulationNodes : allNodes;

  const effectiveWakeTimeForSleep = useMemo(() => {
    const sleepEntry = (activeLog || []).find(e => e.type === 'sleep');
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
    const sleepEntry = (activeLog || []).find(e => e.type === 'sleep');
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

  const allNodesWithStack = useMemo(() => {
    const endTime = (n) => {
      if (n.type === 'work') return n.time + (n.duration || 1);
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
      if (n.type === 'work') return n.time + (n.duration || 1);
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

  const handleSwitchTouchStart = () => {
    pressTimer.current = setTimeout(() => {
      setIsSimulationMode(true);
      setSimulatedLog(JSON.parse(JSON.stringify(dailyLog || [])));
    }, 1200);
  };

  const handleSwitchTouchEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
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

  // Caricamento dati al login (user da useFirebase); onValue/set restano qui
  useEffect(() => {
    if (!user) {
      setIsInitialLoadComplete(false);
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
        if (data.profile) setUserProfile(prev => ({ ...prev, ...data.profile }));
        if (data.targets) setUserTargets(prev => ({ ...prev, ...data.targets }));
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

    get(ref(db, `${basePath}/trackerFoodDatabase`)).then(s => { if (s.exists()) setFoodDb(s.val()); });

    return () => { unsubToday?.(); };
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
    if(!isAuthenticated) return;
    const updateTime = () => {
      const now = new Date();
      let decimalTime = now.getHours() + now.getMinutes() / 60;
      setCurrentTime(decimalTime);
    };
    updateTime(); 
    const interval = setInterval(updateTime, 60000); 
    return () => clearInterval(interval);
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
      const mealTimes = (nuovoLog || []).filter(i => i.type === 'food').reduce((acc, f) => ({
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

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result;
      if (!text || typeof text !== 'string') return;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);

      if (lines.length < 2) {
        alert('File CSV vuoto o non valido.');
        return;
      }

      const updates = {};
      let count = 0;
      const uid = userUid;

      for (let i = 1; i < lines.length; i++) {
        let line = lines[i];
        if (line.startsWith('"') && line.endsWith('"')) {
          line = line.substring(1, line.length - 1);
        }
        const cols = line.split('","');
        if (cols.length < 10) continue;

        const dateString = cols[0];
        const datePart = dateString.split(' ')[0];
        const parts = datePart.split('-');
        if (parts.length < 3) continue;
        const [month, day, year] = parts;
        if (!year || !month || !day) continue;
        const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        const cleanNum = (str) => parseFloat((str || '').replace(/[^0-9.]/g, '')) || 0;

        const bodyMetrics = {
          weight: cleanNum(cols[1]),
          bodyFat: cleanNum(cols[2]),
          muscleMass: cleanNum(cols[3]),
          water: cleanNum(cols[8]),
          timestamp: Date.now()
        };

        if (uid) {
          const path = `users/${uid}/tracker_data/trackerStorico_${formattedDate}/bodyMetrics`;
          updates[path] = bodyMetrics;
          count++;
        }
      }

      if (count > 0 && uid) {
        try {
          await update(ref(db), updates);
          alert(`✅ Importazione completata! ${count} misurazioni salvate nel database.`);
        } catch (error) {
          console.error('Errore importazione batch:', error);
          alert('❌ Errore durante il salvataggio dei dati.');
        }
      } else if (count === 0) {
        alert('Nessuna riga valida trovata nel CSV.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const calculateSmartTargets = () => {
    const { gender, age, weight, height, activityLevel, goal } = userProfile;
    const w = parseFloat(weight) || 75;
    const h = parseFloat(height) || 175;
    const a = parseFloat(age) || 30;
    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr += (gender === 'M') ? 5 : -161;
    let tdee = bmr * parseFloat(activityLevel || '1.55');
    if (goal === 'lose') tdee -= 500;
    if (goal === 'gain') tdee += 300;
    const kcal = Math.round(tdee);
    const prot = Math.round(w * 2.0);
    const fat = Math.round((kcal * 0.25) / 9);
    const carb = Math.round((kcal - (prot * 4) - (fat * 9)) / 4);
    const water = Math.round(w * 35);
    setUserTargets(prev => ({
      ...prev,
      kcal,
      prot,
      carb,
      fatTotal: fat,
      fat: fat,
      water
    }));
  };

  const changeDate = (daysOffset) => {
    const newDate = new Date(currentDateObj);
    newDate.setDate(newDate.getDate() + daysOffset);
    setCurrentDateObj(newDate);

    const offset = newDate.getTimezoneOffset() * 60000;
    const dateStr = new Date(newDate.getTime() - offset).toISOString().slice(0, 10);
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
        const foodItems = flatLog.filter(item => item.type === 'food');
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
    const q = (foodNameInput || '').trim().toLowerCase();
    if (!q) {
      setFoodDropdownSuggestions([]);
      return;
    }
    const keys = Object.keys(foodDb || {});
    const matches = keys
      .filter(k => {
        const d = foodDb[k];
        const desc = (d?.desc || d?.name || '').toLowerCase();
        return desc.includes(q);
      })
      .slice(0, 10)
      .map(k => ({ key: k, desc: foodDb[k]?.desc || foodDb[k]?.name || k }));
    setFoodDropdownSuggestions(matches);
  }, [foodNameInput, foodDb]);

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
      const dt = currentT - lastTime;
      const velocity = Math.abs(dx / (dt || 1));
      const sensitivity = velocity < 0.3 ? 0.1 : 1.0;
      const deltaHours = (dx / pixelsPerHour) * sensitivity;
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
        setDraggingNode(null);
        return;
      }
      const isOutside = Math.abs(dragOffsetYRef.current) > 50;
      const finalTimeRaw = dragEngine.current.currentLiveTime;
      const finalTimeRounded = Math.round(finalTimeRaw * 12) / 12;

      if (isOutside) {
        const confirmDelete = window.confirm('Vuoi eliminare questo elemento?');
        if (confirmDelete) {
          if (dragType === 'meal') {
            const { itemIds } = draggingNode;
            setDailyLog(prev => {
              const next = prev.filter(item => !(itemIds && itemIds.includes(item.id)));
              syncDatiFirebase(next, manualNodes);
              return next;
            });
          } else {
            setDailyLog(prev => {
              const newLog = prev.filter(item => item.id !== dragId);
              setManualNodes(prevN => {
                const newNodes = prevN.filter(n => n.id !== dragId);
                syncDatiFirebase(newLog, newNodes);
                return newNodes;
              });
              return newLog;
            });
          }
        } else {
          if (dragType === 'meal') {
            const { itemIds, originalTime: origTime } = draggingNode;
            setDailyLog(prev => {
              const next = prev.map(item =>
                itemIds && itemIds.includes(item.id) ? { ...item, mealTime: origTime } : item
              );
              syncDatiFirebase(next, manualNodes);
              return next;
            });
          } else {
            setManualNodes(prev => {
              const next = prev.map(n =>
                n.id === dragId ? { ...n, time: originalTime, duration: originalDuration ?? n.duration } : n
              );
              syncDatiFirebase(dailyLog, next);
              return next;
            });
          }
        }
      } else {
        if (dragType === 'meal') {
          const { itemIds } = draggingNode;
          const nextLog = dailyLog.map(item =>
            itemIds && itemIds.includes(item.id) ? { ...item, mealTime: finalTimeRounded } : item
          );
          setDailyLog(nextLog);
          syncDatiFirebase(nextLog, manualNodes);
        } else {
          setManualNodes(prev => {
            const next = prev.map(n => {
              if (n.id !== dragId) return n;
              if (n.type === 'work') {
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
            syncDatiFirebase(dailyLog, next);
            return next;
          });
        }
      }
      dragEngine.current.isActive = false;
      setDragLiveTime(null);
      setDragOffsetY(0);
      dragOffsetYRef.current = 0;
      setDraggingNode(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingNode, isSimulationMode]);

  useEffect(() => { if (!isDrawerOpen) setIsZenActive(false); }, [isDrawerOpen]);

  useEffect(() => {
    if (isDrawerOpen && activeAction === 'pasto') setDrawerMealTimeStr(decimalToTimeStr(drawerMealTime));
  }, [isDrawerOpen, activeAction, drawerMealTime]);

  // Motore biochimico
  const baseKcal = (userTargets.kcal ?? STRATEGY_PROFILES[dayProfile].kcal) + calorieTuning;
  const { totali, obiettiviPasti } = useBiochimico(activeLog, baseKcal);
  const targetKcal = baseKcal + (totali?.workout ?? 0);

  const dailyReport = useMemo(() => {
    if (!activeLog || currentTrackerDate === getTodayString()) return null;
    const foods = (activeLog || []).filter(e => e.type === 'food');
    const hasStrengthWorkout = (activeLog || []).some(t => {
      if (t.type !== 'workout') return false;
      const sub = (t.subType ?? t.workoutType ?? '').toLowerCase();
      return sub === 'pesi' || sub === 'hiit';
    });
    if (foods.length === 0 && !(activeLog || []).some(e => e.type === 'sleep' || e.type === 'workout')) return null;

    const proTotal = totali?.prot ?? 0;
    const proTarget = userTargets?.prot ?? 150;
    const kcalTotal = totali?.kcal ?? 0;
    const kcalTarget = userTargets?.kcal ?? 2000;
    const choTotal = totali?.carb ?? 0;
    const choTarget = userTargets?.carb ?? 200;

    const bySlot = {};
    foods.forEach(f => {
      const slot = getSlotKey(f) || f.mealType || 'other';
      if (!bySlot[slot]) bySlot[slot] = 0;
      bySlot[slot] += Number(f.prot ?? f.pro ?? 0) || 0;
    });
    const highProMeals = Object.values(bySlot).filter(sum => sum >= 20).length;

    let muscleStars = 0;
    let muscleReason = '';
    if (!hasStrengthWorkout) {
      muscleStars = proTotal >= proTarget * 0.9 ? 2 : highProMeals >= 2 ? 1 : 0;
      muscleReason = proTotal >= proTarget * 0.9
        ? 'Pasto proteico ottimo per il mantenimento, ma senza stimolo meccanico (pesi/HIIT) non c\'è crescita.'
        : 'Mancano proteine e stimolo di forza per la crescita muscolare.';
    } else {
      muscleStars = 1;
      if (proTotal >= proTarget) muscleStars += 2;
      else if (proTotal >= proTarget * 0.9) muscleStars += 1;
      if (highProMeals >= 4) muscleStars += 2;
      else if (highProMeals >= 3) muscleStars += 1;
      muscleStars = Math.min(5, Math.max(0, muscleStars));
      if (proTotal < proTarget * 0.9) muscleReason = 'Allenamento intenso, ma mancano i mattoni (proteine) per riparare e costruire le fibre.';
      else if (highProMeals < 4) muscleReason = 'Potenziale alto, ma le proteine sono troppo concentrate. Distribuiscile in 4 pasti per la sintesi costante.';
      else muscleReason = 'Sinergia perfetta tra stimolo meccanico e timing proteico. Crescita massimizzata!';
    }
    muscleStars = Math.min(5, Math.max(0, muscleStars));

    let fatStars = 1;
    if (kcalTotal <= kcalTarget) fatStars += 2;
    if ((activeLog || []).some(t => t.type === 'workout')) fatStars += 1;
    if (choTotal <= choTarget * 1.1) fatStars += 1;
    fatStars = Math.min(5, fatStars);
    let fatReason = '';
    if (kcalTotal > kcalTarget) fatReason = 'Lieve surplus calorico: la lipolisi è stata inibita per favorire l\'accumulo.';
    else if (choTotal > choTarget * 1.1) fatReason = 'Picchi insulinici eccessivi hanno bloccato l\'accesso alle riserve di grasso.';
    else fatReason = 'Calorie e carboidrati sotto controllo: condizioni ideali per la perdita di grasso.';

    const sleepEntry = (activeLog || []).find(e => e.type === 'sleep');
    const sleepHours = sleepEntry?.duration ?? sleepEntry?.hours ?? 0;
    const lateCaffeine = (activeLog || []).some(t => t.type === 'stimulant' && (parseFloat(t.time ?? t.mealTime ?? 0) >= 16));
    const cenaEquiv = getEquivalentMealTypes('cena');
    const dinnerCho = foods.filter(f => cenaEquiv.includes(f.mealType)).reduce((acc, item) => acc + (Number(item.carb ?? item.cho ?? 0) || 0), 0);

    let neuroStars = 0;
    let neuroReason = '';
    if (sleepHours < 7) neuroReason = 'Il riposo breve ha impedito la ricarica completa dei neurotrasmettitori.';
    else if (lateCaffeine) neuroReason = 'La caffeina dopo le 16:00 ha frammentato l\'architettura del tuo sonno profondo.';
    else if (dinnerCho < 40) neuroReason = 'Mancata soppressione del cortisolo serale: il sistema nervoso è rimasto in allerta.';
    if (sleepHours >= 8 && !lateCaffeine && dinnerCho >= 40) { neuroStars = 5; neuroReason = 'Sonno, timing caffeina e CHO a cena ottimali. Recupero neurologico completo.'; }
    else if (sleepHours >= 7) {
      neuroStars = !lateCaffeine ? 4 : 3;
      if (dinnerCho >= 40) neuroStars = Math.min(5, neuroStars + 1);
      neuroStars = Math.min(4, neuroStars);
    } else if (sleepHours >= 6) neuroStars = Math.min(3, (lateCaffeine ? 2 : 3));
    else if (sleepHours > 0) neuroStars = 1;
    neuroStars = Math.min(5, Math.max(0, neuroStars));
    if (!neuroReason) neuroReason = 'Sonno e abitudini serali da ottimizzare.';

    let firstMealTime = 24;
    let lastMealTime = 0;
    foods.forEach(f => {
      const t = parseFloat(f.mealTime ?? f.time ?? 12);
      if (!Number.isNaN(t)) { if (t < firstMealTime) firstMealTime = t; if (t > lastMealTime) lastMealTime = t; }
    });
    const fastingHours = foods.length === 0 ? 24 : (24 - lastMealTime) + firstMealTime;
    let fastStars = 0;
    let fastReason = '';
    if (fastingHours < 12) { fastStars = 0; fastReason = 'Finestra di alimentazione troppo ampia. L\'autofagia (pulizia cellulare) non si è attivata.'; }
    else if (fastingHours < 14) { fastStars = 1; fastReason = 'Finestra di alimentazione troppo ampia. L\'autofagia (pulizia cellulare) non si è attivata.'; }
    else if (fastingHours < 16) { fastStars = 3; fastReason = 'Buon inizio di riciclo cellulare. Il sistema ha iniziato a eliminare le proteine danneggiate.'; }
    else { fastStars = 5; fastReason = 'Protocollo Gold: 16+ ore di digiuno hanno garantito una rigenerazione cellulare profonda.'; }

    return {
      ready: true,
      muscle: { score: muscleStars, reason: muscleReason || 'Stimolo e nutrizione non allineati per la crescita.' },
      fat: { score: fatStars, reason: fatReason },
      neuro: { score: neuroStars, reason: neuroReason || 'Sonno e abitudini serali da ottimizzare.' },
      fast: { score: fastStars, reason: fastReason }
    };
  }, [activeLog, currentTrackerDate, totali, userTargets]);

  const yesterdayReportReady = useMemo(() => {
    if (currentTrackerDate !== getTodayString() || !fullHistory || typeof fullHistory !== 'object') return false;
    const yesterday = new Date(getTodayString() + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const log = getLogFromStoricoTree(fullHistory, yesterdayStr) || [];
    const hasFood = log.some(e => e.type === 'food');
    const hasSleepOrWorkout = log.some(e => e.type === 'sleep' || e.type === 'workout');
    return hasFood || hasSleepOrWorkout;
  }, [currentTrackerDate, fullHistory]);

  const openDrawer = () => { setActiveAction(null); setIsDrawerOpen(true); };
  const closeDrawer = () => { setIsDrawerOpen(false); setTimeout(() => setActiveAction(null), 400); };

  // ============================================================================
  // FUNZIONI CRITICHE CON RETROCOMPATIBILITÀ
  // ============================================================================

  const fallbackPredict = (now) => {
    if (now >= 5 && now < 10) return 'merenda1';
    if (now >= 10 && now < 14.5) return 'pranzo';
    if (now >= 14.5 && now < 18) return 'snack';
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
        if (item.type !== 'food') return;
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
    return bestMatch;
  };

  /**
   * Carica un pasto nel costruttore. Accetta mealType o id composito "mealType_time" (es. snack_16.5).
   * Con id composito carica solo i food con quel mealType e quel mealTime.
   */
  const loadMealToConstructor = (mTypeOrId) => {
    setAddedFoods([]);
    setEditingMealId(mTypeOrId);
    let items = (activeLog || []).filter(item => getSlotKey(item) === String(mTypeOrId));

    if (items.length === 0) {
      const canonical = toCanonicalMealType(String(mTypeOrId).split('_')[0]);
      const equivalents = getEquivalentMealTypes(canonical);
      items = (activeLog || []).filter(item => item.type === 'food' && equivalents.includes(item.mealType));
    }

    items = items.map(f => ({ ...f }));
    const canonical = items.length > 0 ? toCanonicalMealType(items[0].mealType) : toCanonicalMealType(String(mTypeOrId).split('_')[0]);

    setMealType(canonical);
    const t = items.length > 0 && typeof items[0].mealTime === 'number' ? items[0].mealTime : getDefaultMealTime(canonical);
    setDrawerMealTime(t);
    setDrawerMealTimeStr(decimalToTimeStr(t));
    setAddedFoods(items);
    setActiveAction('pasto');
    setIsDrawerOpen(true);
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

  const getDefaultMealTime = (mealTypeKey) => {
    const equivalents = getEquivalentMealTypes(mealTypeKey);
    
    // Cerca nel dailyLog corrente
    const first = (activeLog || []).find(item => 
      item.type === 'food' && equivalents.includes(item.mealType)
    );
    if (first != null && typeof first.mealTime === 'number') return first.mealTime;
    
    if (!fullStorico) return getCurrentTimeRoundedTo15Min();
    const keys = Object.keys(fullStorico).filter(k => k.startsWith('trackerStorico_'));
    keys.sort((a, b) => b.localeCompare(a));
    const todayKey = TRACKER_STORICO_KEY(getTodayString());
    
    for (const key of keys) {
      if (key === todayKey) continue;
      const dayData = fullStorico[key];
      // Cerca in mealTimes con qualsiasi equivalente
      for (const eq of equivalents) {
        const t = dayData?.mealTimes?.[eq];
        if (typeof t === 'number') return t;
      }
    }
    return getCurrentTimeRoundedTo15Min();
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
      const found = flat.filter(i => i.type === 'food').find(i => 
        norm(i.desc || i.name) === target || 
        norm(i.desc || i.name).includes(target) || 
        target.includes(norm(i.desc || i.name))
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
    if (data.status === 0 || !data.product) return null;
    const p = data.product;
    const nut = p.nutriments || {};
    const toNum = (v) => (v != null && v !== '' ? parseFloat(v) : undefined);
    const entryPer100 = {
      desc: p.product_name || `Barcode ${barcode}`,
      kcal: toNum(nut['energy-kcal_100g']) ?? toNum(nut['energy_100g']) ? (nut['energy_100g'] / 4.184) : undefined,
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
    try {
      const entryPer100 = await fetchOpenFoodFactsProduct(barcode);
      const name = entryPer100?.desc || `Barcode ${barcode}`;
      if (entryPer100 && userUid) {
        Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g] || {}).forEach(k => { 
          if (entryPer100[k] == null) entryPer100[k] = getDefaultNutrientValue(k); 
        }));
        if (entryPer100.kcal == null) entryPer100.kcal = getDefaultNutrientValue('kcal');
        const newKey = `food_${Date.now()}_${String(name).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 30)}`;
        const basePath = `users/${userUid}/tracker_data`;
        await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), entryPer100);
        setFoodDb(prev => ({ ...prev, [newKey]: entryPer100 }));
      }
      setFoodNameInput(name);
      setFoodWeightInput(getLastQuantityForFood(name) || '100');
      setTimeout(() => document.getElementById('weight-input')?.focus(), 100);
    } catch (e) {
      setFoodNameInput(`Barcode ${barcode}`);
      setFoodWeightInput('100');
      setTimeout(() => document.getElementById('weight-input')?.focus(), 100);
    }
  }, [foodDb, userUid]);

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
    const def = getDefaultNutrientValue(nutrientKey);
    return def > 0 ? def : (nutrientKey === 'fibre' ? 3 : nutrientKey === 'omega3' ? 0.3 : nutrientKey === 'mg' ? 25 : 10);
  }, []);

  // Estrazione dati da DB
  const estraiDatiFoodDb = useCallback((nome, qta, pastoType) => {
    const foodItem = Object.assign(
      { id: Date.now() + Math.random(), type: 'food', mealType: pastoType, desc: nome, qta, weight: qta, kcal: 0, cal: 0 },
      ...Object.keys(TARGETS).flatMap(g => Object.keys(TARGETS[g]).map(k => ({ [k]: undefined })))
    );
    const dbKey = Object.keys(foodDb).find(k => foodDb[k].desc?.toLowerCase().includes(nome.toLowerCase()));
    if (dbKey) {
      const dbF = foodDb[dbKey];
      Object.keys(dbF || {}).forEach(k => {
        if (typeof dbF[k] === 'number' && k !== 'id') foodItem[k] = (dbF[k] / 100) * qta;
      });
      foodItem.kcal = foodItem.kcal || foodItem.cal || 0;
      foodItem.cal = foodItem.cal ?? foodItem.kcal;
      const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
      Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g]).forEach(k => {
        if (foodItem[k] == null || foodItem[k] === 0) {
          foodItem[k] = macroKeys.includes(k)
            ? (getAverageEstimate(k, nome) / 100) * qta || getDefaultNutrientValue(k)
            : getDefaultNutrientValue(k);
        }
      }));
      if (!foodItem.kcal || foodItem.kcal === 0) foodItem.kcal = (getAverageEstimate('kcal', nome) / 100) * qta || getDefaultNutrientValue('kcal');
    } else {
      const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
      foodItem.kcal = (getAverageEstimate('kcal', nome) / 100) * qta || getDefaultNutrientValue('kcal');
      foodItem.cal = foodItem.kcal;
      foodItem.prot = (getAverageEstimate('prot', nome) / 100) * qta || getDefaultNutrientValue('prot');
      foodItem.carb = (getAverageEstimate('carb', nome) / 100) * qta || getDefaultNutrientValue('carb');
      foodItem.fatTotal = (getAverageEstimate('fatTotal', nome) / 100) * qta || getDefaultNutrientValue('fatTotal');
      Object.values(TARGETS).forEach(g => Object.keys(g || {}).forEach(k => {
        if (foodItem[k] == null)
          foodItem[k] = macroKeys.includes(k) ? (getAverageEstimate(k, nome) / 100) * qta || getDefaultNutrientValue(k) : getDefaultNutrientValue(k);
      }));
    }
    return foodItem;
  }, [foodDb, getAverageEstimate]);

  const handleAddFoodManual = () => {
    if (!foodNameInput || !foodWeightInput) return;
    const item = estraiDatiFoodDb(foodNameInput.trim(), parseFloat(foodWeightInput), mealType);
    setAddedFoods([item, ...addedFoods]);
    setFoodNameInput('');
    setFoodWeightInput('');
    setTimeout(() => foodInputRef.current?.focus(), 100);
  };

  const handleCalibrateFoodWeight = (foodId, deltaG) => {
    const food = addedFoods.find(f => f.id === foodId);
    if (!food) return;
    const currentQta = Number(food.qta ?? food.weight ?? 100) || 100;
    const newQta = Math.max(5, Math.min(5000, currentQta + deltaG));
    const updated = estraiDatiFoodDb(food.desc || food.name, newQta, food.mealType || mealType);
    setAddedFoods(prev => prev.map(f => f.id === foodId ? { ...updated, id: foodId } : f));
  };

  const enterFullscreen = async () => {
    const idx = availableFullscreenCharts.indexOf(chartUnit);
    setFullscreenChartIndex(idx >= 0 ? idx : 0);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      if (window.screen?.orientation?.lock) await window.screen.orientation.lock('landscape');
    } catch (err) { console.warn('Landscape lock non supportato', err); }
    setIsFullScreenGraph(true);
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
      const timeToUse = typeof drawerMealTime === 'number' ? drawerMealTime : 12;
      const safeDailyLog = dailyLog || [];
      const ourSlot = getGhostMealType(currentTargetType, safeDailyLog);
      const slotToReplace = editingMealId || ourSlot;

      const mealItems = (addedFoods || []).map((f, index) => ({
        ...f,
        type: 'food',
        mealType: ourSlot,
        mealTime: timeToUse,
        id: f.id || `f_${uniqueBatchId}_${index}`
      }));

      const rest = safeDailyLog.filter(item => {
        if (item.type !== 'food') return true;
        return getSlotKey(item) !== slotToReplace;
      });

      const nuovoLog = [...mealItems, ...rest];
      if (isSimulationMode) {
        setSimulatedLog(prev => [...(prev || []).filter(item => item.type !== 'food' || getSlotKey(item) !== slotToReplace), ...mealItems]);
        setAddedFoods([]);
        setEditingMealId(null);
        closeDrawer();
        return;
      }
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes || []);
    } catch (error) {
      console.error("Errore salvataggio pasto:", error);
    } finally {
      setAddedFoods([]);
      setEditingMealId(null);
      closeDrawer();
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
      const timeToUse = typeof payload.timing === 'number' ? payload.timing : (typeof drawerMealTime === 'number' ? drawerMealTime : 12);
      const logToUse = isSimulationMode ? (simulatedLog || []) : dailyLog;
      const ourSlot = getGhostMealType(payload.mealType || mealType, logToUse);
      const mealItems = payload.items.map((f, index) => ({
        ...f,
        type: 'food',
        mealType: ourSlot,
        mealTime: timeToUse,
        id: f.id || `f_${Date.now()}_${index}`
      }));
      if (isSimulationMode) {
        setSimulatedLog(prev => {
          const rest = (prev || []).filter(item => item.type !== 'food' || getSlotKey(item) !== ourSlot);
          return [...mealItems, ...rest];
        });
        return;
      }
      const dailyLogRest = dailyLog.filter(item => item.type !== 'food' || getSlotKey(item) !== ourSlot);
      setDailyLog([...mealItems, ...dailyLogRest]);
      syncDatiFirebase([...mealItems, ...dailyLogRest], manualNodes);
    }
  }, [dailyLog, simulatedLog, isSimulationMode, manualNodes, mealType, drawerMealTime, syncDatiFirebase]);

  const handleNodeClick = (node) => {
    setSelectedNodeReport(node);
  };

  const startNodeDrag = useCallback((node, edge) => (e) => {
    e.stopPropagation();
    const target = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD_PX = 15;

    longPressMoveCleanupRef.current?.();
    longPressMoveCleanupRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > DRAG_THRESHOLD_PX) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        target.removeEventListener('pointermove', onMove);
        longPressMoveCleanupRef.current = null;
      }
    };
    target.addEventListener('pointermove', onMove);
    longPressMoveCleanupRef.current = () => {
      target.removeEventListener('pointermove', onMove);
      longPressMoveCleanupRef.current = null;
    };

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressMoveCleanupRef.current?.();
      longPressMoveCleanupRef.current = null;
      target.setPointerCapture(e.pointerId);
      dragOffsetYRef.current = 0;
      const itemIds = node.type === 'meal'
        ? (activeLog || []).filter(item => getSlotKey(item) === String(node.id)).map(i => i.id)
        : [];
      setDraggingNode({
        id: node.id,
        type: node.type,
        itemIds,
        originalTime: node.time,
        originalDuration: node.duration,
        edge
      });
    }, 350);
  }, [activeLog]);

  const releaseNodePointer = (e) => {
    longPressMoveCleanupRef.current?.();
    longPressMoveCleanupRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      return;
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleNodeTap = useCallback((node) => () => {
    if (Math.abs(dragOffsetYRef.current) >= 10) return;
    if (isSimulationMode) return;
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
  }, [manualNodes, dailyLog, syncDatiFirebase, setManualNodes, isSimulationMode]);

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
    const isWork = workoutType === 'lavoro';
    const duration = Math.max(0.25, Number(workoutEndTime) - Number(workoutStartTime));
    const finalId = editingWorkoutId || (isWork ? 'work_' : 'workout_') + Date.now();

    const descMuscles = workoutMuscles.length > 0 ? ` (${workoutMuscles.join(' + ')})` : '';
    const desc = workoutType === 'pesi' ? `Sollevamento Pesi${descMuscles}` :
                 workoutType === 'cardio' ? 'Cardio / Corsa' :
                 workoutType === 'hiit' ? 'HIIT / Circuito' : 'Attività Lavorativa';

    const nodeData = { id: finalId, type: isWork ? 'work' : 'workout', time: Number(workoutStartTime), duration, kcal: workoutKcal, icon: isWork ? '💼' : '🏋️', subType: workoutType, muscles: workoutMuscles };
    const logData = { id: finalId, type: 'workout', workoutType, desc, name: isWork ? 'Lavoro' : desc, kcal: workoutKcal, cal: workoutKcal, duration };

    if (isSimulationMode) {
      setSimulatedLog(prev => {
        const base = prev || [];
        return base.some(n => n.id === finalId) ? base.map(n => n.id === finalId ? logData : n) : [logData, ...base];
      });
      setEditingWorkoutId(null);
      setWorkoutMuscles([]);
      closeDrawer();
      return;
    }
    const baseLog = dailyLog;
    const newLog = baseLog.some(n => n.id === finalId) ? baseLog.map(n => n.id === finalId ? logData : n) : [logData, ...baseLog];
    const newNodes = manualNodes.some(n => n.id === finalId) ? manualNodes.map(n => n.id === finalId ? nodeData : n) : [...manualNodes, nodeData];
    setDailyLog(newLog);
    setManualNodes(newNodes);
    syncDatiFirebase(newLog, newNodes);

    setEditingWorkoutId(null);
    setWorkoutMuscles([]);
    closeDrawer();
  };

  const PASTO_ALIAS_TO_ID = { colazione: 'merenda1', 'spuntino mattina': 'merenda1', pranzo: 'pranzo', 'spuntino pomeriggio': 'merenda2', cena: 'cena', snack: 'snack' };
  const processTestoAI = (testo) => {
    let trovati = 0;
    const batchId = Date.now();
    const nuoviAlimenti = [];
    const nuoviWorkout = [];
    const ghostTypesCache = {};

    const regexFood = /\[(.*?)\s*\|\s*([0-9.,]+)\s*\|\s*(colazione|spuntino\s*mattina|pranzo|spuntino\s*pomeriggio|cena|snack)\]/gi;
    let matchFood;
    while ((matchFood = regexFood.exec(testo)) !== null) {
      trovati++;
      const nome = matchFood[1].trim();
      const qta = parseFloat(String(matchFood[2]).replace(',', '.')) || 0;
      const pastoString = String(matchFood[3]).trim().toLowerCase().replace(/\s+/g, ' ');
      const pastoCanonical = PASTO_ALIAS_TO_ID[pastoString] || toCanonicalMealType(pastoString);
      if (!ghostTypesCache[pastoCanonical]) {
        ghostTypesCache[pastoCanonical] = getGhostMealType(pastoCanonical, [...(dailyLog || []), ...nuoviAlimenti]);
      }
      const finalMealType = ghostTypesCache[pastoCanonical];
      const item = estraiDatiFoodDb(nome, qta, finalMealType);
      nuoviAlimenti.push({
        ...item,
        id: `f_${batchId}_${trovati}`,
        mealTime: getDefaultMealTime(pastoCanonical)
      });
      ghostTypesCache[pastoCanonical] = getGhostMealType(pastoCanonical, [...(dailyLog || []), ...nuoviAlimenti]);
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

  const handleMiniTimelineDrag = (e, containerRef, type, currentStart, currentEnd, setterStart, setterEnd) => {
    if (!containerRef?.current) return;
    e.preventDefault();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    target.setPointerCapture(pointerId);

    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      const newTime = Math.round(percent * 24 * 4) / 4;
      if (type === 'point') {
        setterStart(newTime);
      } else if (type === 'bar-start') {
        setterStart(Math.min(newTime, currentEnd - 0.25));
      } else if (type === 'bar-end') {
        setterEnd(Math.max(newTime, currentStart + 0.25));
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
        return data.candidates[0].content.parts[0].text;
      } catch (e) {
        if (attempt === validKeys.length - 1) throw e;
        attempt++;
      }
    }
    throw new Error("Cluster API esaurito.");
  };

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

  const handleChatSubmit = async (optionalReply) => {
    const userMessage = (optionalReply != null && String(optionalReply).trim()) ? String(optionalReply).trim() : chatInput.trim();
    if (!userMessage && chatImages.length === 0) return;

    if (pendingAiBatch && userMessage) {
      const lowerMsg = userMessage.toLowerCase();
      const isConfirm = lowerMsg.includes('conferm') || lowerMsg.includes('sì') || lowerMsg.includes('si ');
      const isCancel = lowerMsg.includes('annulla') || lowerMsg.includes('no');

      if (pendingAiBatch.type === 'sleep' && isConfirm && pendingAiBatch.data) {
        const d = pendingAiBatch.data;
        const sleepEntry = {
          type: 'sleep',
          id: `sleep_${Date.now()}`,
          wakeTime: d.wakeTime,
          hours: d.hours,
          deepMin: d.deepMin,
          remMin: d.remMin,
          hr: d.hr
        };
        if (isSimulationMode) {
          setSimulatedLog(prev => [...(prev || []), sleepEntry]);
          setPendingAiBatch(null);
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Ho registrato i dati del sonno (sandbox).' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        const nuovoLog = [...(dailyLog || []), sleepEntry];
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes);
        setPendingAiBatch(null);
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
        const dominantMealType = ['merenda1', 'pranzo', 'merenda2', 'cena', 'snack'].includes(pendingAiBatch[0]?.mealType) ? pendingAiBatch[0].mealType : predictedType;
        const sharedMealTime = typeof pendingAiBatch[0]?.mealTime === 'number' ? pendingAiBatch[0].mealTime : baseMealTime;
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

    const historyMessage = userMessage || (chatImages.length > 0 ? `📷 ${chatImages.length} immagine/i allegata/e` : '');
    setChatHistory(prev => [...prev, { sender: 'user', text: historyMessage }]);
    if (optionalReply == null) setChatInput('');
    setChatHistory(prev => [...prev, { sender: 'ai', isTyping: true }]);

    try {
      const foodDbNames = Object.keys(foodDb || {}).map(k => foodDb[k]?.desc || foodDb[k]?.name || k).filter(Boolean).slice(0, 150);
      const energyResult = generateRealEnergyData(nodesForEnergySimulation, dailyLogForEnergy, idealStrategy, 0, 2500, null, null, userModel, nervousSystemLoad);
      const chartData = energyResult?.chartData || [];
      const energyAt20 = chartData[20]?.energy;
      const paginaAttuale = (!activeAction || activeAction === 'home') ? 'Menu principale' : activeAction === 'pasto' ? `Costruttore pasto (${MEAL_LABELS_SAVE[mealType] || mealType})` : activeAction === 'allenamento' ? 'Costruttore allenamento' : activeAction === 'acqua' ? 'Idratazione' : activeAction === 'ai_chat' ? 'Chat Core AI' : activeAction === 'diario_giornaliero' ? 'Diario giornaliero' : activeAction === 'storico' ? 'Archivio storico' : activeAction === 'strategia' ? 'Protocollo / Strategia' : activeAction === 'focus' ? 'Neural Reset' : activeAction;

      const currentDecimalTime = new Date().getHours() + (new Date().getMinutes() / 60);
      const roundedTime = Math.round(currentDecimalTime * 2) / 2;
      const currentCortisolScore = cortisolCurve?.find(c => c.time === roundedTime)?.cortisolScore ?? 0;

      const piccoAnabolico = Math.max(0, ...(anabolicCurve?.map(c => c.anabolicScore) ?? [0]));
      const piccoCortisolo = Math.max(0, ...(cortisolCurve?.map(c => c.cortisolScore) ?? [0]));

      const baseSystemPrompt = `Sei l'assistente di ReadyCore. Il tuo scopo è dialogare con l'utente in italiano.

Se l'utente inserisce alimenti (anche in lista, es. "ho mangiato 3 gallette e 1 mela per spuntino"), devi rispondere ESCLUSIVAMENTE con un array JSON di oggetti. Formato: [{"name": "Nome alimento", "weight": peso_totale_grammi, "mealType": "pranzo"}]. Usa "name" o "desc", "weight" o "qta" (in grammi). mealType: merenda1, pranzo, merenda2, cena, snack.

REGOLA MOLTIPLICATORE: Se l'utente indica quantità a pezzi (es. "3 gallette di riso", "2 uova"), stima il peso di UNA singola unità, moltiplicalo per la quantità, e inserisci il PESO TOTALE IN GRAMMI nel campo "weight" (es. 2 uova ≈ 120g, 3 gallette ≈ 30g totali). Un solo alimento = array con un elemento [{"name":"...", "weight": N, "mealType":"..."}].

Puoi anche proporre alternative dal database e chiedere conferma; alla conferma restituisci l'array JSON. In alternativa, per un singolo inserimento legacy, puoi usare {"action":"insert","food":{"desc":"nome","qta":grammi,"mealType":"pranzo"}}.

Database alimenti noti: ${foodDbNames.length ? foodDbNames.join(', ') : 'nessuno'}.

Contesto: Pagina ${paginaAttuale}. Rischio stress serale ${energyAt20 != null && energyAt20 < 40 ? 'ALTO' : 'Basso'}. [STRATEGIA: ...]. [ALLENAMENTO: desc | kcal]. Rispondi in modo naturale e breve.

Se fai una domanda all'utente o proponi un'azione, puoi suggerire delle risposte rapide. Includi nel testo della tua risposta un blocco JSON nascosto con questo formato esatto: {"quick_replies": ["Si, confermo", "Modifica quantità", "No, annulla"]}. Il blocco JSON deve stare su una riga separata alla fine del messaggio.`;

      const dynamicSystemPrompt = `${baseSystemPrompt}

DATI BIOCHIMICI IN TEMPO REALE DELL'UTENTE:
- Ora locale: ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
- Livello di Cortisolo stimato (0-100): ${Math.round(currentCortisolScore)}

REGOLA BIOCHIMICA FONDAMENTALE (RECUPERO NERVOSO):
Se l'utente chiede consigli per un pasto (in particolar modo la cena) o valuta opzioni alimentari, devi analizzare il livello di Cortisolo. Se il cortisolo è medio-alto in orario serale, è un segnale di allarme per il sistema nervoso. In questo caso, DEVI prioritizzare suggerimenti nutrizionali calmanti: proponi fonti di carboidrati complessi (che aiutano ad abbassare il cortisolo e favoriscono il sonno), alimenti ricchi di magnesio, omega 3 o triptofano. Evita di proporre pasti serali composti solo da proteine magre se lo stress è alto. Adatta il tuo tono di voce per essere rassicurante e focalizzato sul recupero.

LETTURA DEI GRAFICI ODIERNI:
- Picco massimo Sintesi Proteica oggi: ${Math.round(piccoAnabolico)}%
- Picco massimo Cortisolo oggi: ${Math.round(piccoCortisolo)}

REGOLA PER SPIEGAZIONE GRAFICI:
Se l'utente ti chiede spiegazioni sui suoi grafici, sulle sue curve o sui suoi livelli (es. "spiegami il grafico viola", "perché l'anabolismo è basso?"), usa i dati forniti per fargli un'analisi personalizzata. Spiega che il grafico viola (Cortisolo) indica lo stress nervoso (che sale con lavoro e allenamento), mentre la curva azzurra/verde (Sintesi proteica) indica il nutrimento muscolare. Sii un analista biochimico chiaro e diretto.

TRACCIAMENTO DEL SONNO E VISION:
Se l'utente allega uno screenshot di un'app di tracciamento del sonno (es. Mi Fitness) o scrive i dati testualmente, estrai questi valori chiave: Ora di risveglio (es. 06:18 diventa 6.3 in ore decimali), Ore totali di sonno (es. 6 ore e 34 min diventa 6.56), Tempo in fase Profonda in minuti (es. 2h 14m = 134), Tempo in fase REM in minuti, Frequenza cardiaca media (BPM). Rispondi con un breve riepilogo testuale ("Ho letto i dati: hai dormito 6h 34m, recupero profondo ottimo...") e includi un JSON strutturato su una riga: {"action": "log_sleep", "sleepData": {"wakeTime": 6.3, "hours": 6.56, "sleepStart": 23.5, "sleepEnd": 6.3, "deepMin": 134, "remMin": 94, "hr": 56}}. Usa SEMPRE i quick_replies: {"quick_replies": ["Sì, confermo", "No, annulla"]} per la conferma prima del salvataggio.
${SLEEP_AI_MI_FITNESS_INSTRUCTIONS}`;

      const previousMessages = (chatHistory || []).filter(m => !m.isTyping);
      const recentHistory = previousMessages.slice(-CHAT_HISTORY_WINDOW);
      const isLocalError = (text) => {
        const t = (text || '').trim();
        return t.startsWith('❌') || t.includes('Errore Server') || t.includes('Nessuna API Key');
      };
      const filtered = recentHistory.filter(m => !isLocalError(m.text));
      const conversationLines = filtered.map(m => (m.sender === 'user' ? 'Utente: ' : 'Assistente: ') + (m.text || '').trim());
      const apiMessage = userMessage || (chatImages.length > 0 ? `[Allegati ${chatImages.length} screenshot da analizzare]` : '');
      conversationLines.push('Utente: ' + apiMessage);
      const conversationText = conversationLines.join('\n');
      const fullPrompt = dynamicSystemPrompt + '\n\n---\nConversazione (rispondi come Assistente all\'ultimo messaggio):\n' + conversationText;

      const responseText = await callGeminiAPIWithRotation(fullPrompt, { images: chatImages.length > 0 ? chatImages : undefined });
      setChatImages([]);

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
      if (itemsArray == null && arrayStart !== -1) {
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
      if (sleepDataPayload) {
        setPendingAiBatch({ type: 'sleep', data: sleepDataPayload });
      }

      const itemsToSave = itemsArray != null ? itemsArray : (insertPayload ? [insertPayload] : []);

      if (itemsToSave.length > 0) {
        const baseMealTime = getCurrentTimeRoundedTo15Min();
        const predictedType = predictMealType(baseMealTime);
        const dominantMealType = ['merenda1', 'pranzo', 'merenda2', 'cena', 'snack'].includes(itemsToSave[0]?.mealType) ? itemsToSave[0].mealType : predictedType;
        const sharedMealTime = typeof itemsToSave[0]?.mealTime === 'number' ? itemsToSave[0].mealTime : baseMealTime;
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
          if (!isNaN(numVal) && key && newStrategy[key] !== undefined) newStrategy[key] = numVal;
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

      let cleanText = responseText;
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
      if (!cleanText) cleanText = '✨ Operazione completata.';

      setChatHistory(prev => {
        const newHist = [...prev];
        newHist.pop();
        newHist.push({ sender: 'ai', text: cleanText, quickReplies: quickReplies.length > 0 ? quickReplies : undefined });
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

  const generateFoodWithAI = async (foodName) => {
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
      ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre', 'leu', 'iso', 'val', 'lys', 'vitA', 'vitc', 'vitD', 'ca', 'fe', 'mg', 'zn', 'omega3'].forEach(k => {
        if (typeof data[k] === 'number' && data[k] > 0) entryPer100[k] = data[k];
      });
      Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g]).forEach(k => {
        if (entryPer100[k] == null || entryPer100[k] === 0) entryPer100[k] = getAverageEstimate(k, desc);
      }));
      if (entryPer100.kcal == null || entryPer100.kcal === 0) entryPer100.kcal = entryPer100.cal ?? getAverageEstimate('kcal', desc);
      entryPer100.cal = entryPer100.cal ?? entryPer100.kcal;
      const newKey = `food_${Date.now()}_${String(desc).replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 30)}`;
      const basePath = `users/${userUid}/tracker_data`;
      await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), entryPer100);
      setFoodDb(prev => ({ ...prev, [newKey]: entryPer100 }));
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
      Object.keys(entryPer100).forEach(k => {
        if (typeof entryPer100[k] === 'number' && k !== 'id') newItem[k] = entryPer100[k] * ratio;
      });
      Object.keys(TARGETS).forEach(g => Object.keys(TARGETS[g]).forEach(k => {
        if (newItem[k] == null || newItem[k] === 0) newItem[k] = (getAverageEstimate(k, desc) / 100) * weight;
      }));
      newItem.kcal = newItem.kcal ?? newItem.cal ?? (getAverageEstimate('kcal', desc) / 100) * weight;
      newItem.cal = newItem.cal ?? newItem.kcal;
      setAddedFoods(prev => [...prev, newItem]);
      setFoodNameInput('');
      setFoodWeightInput('');
      setShowFoodDropdown(false);
    } catch (e) {
      alert(`Generazione alimento fallita: ${e.message}`);
    } finally {
      setIsGeneratingFood(false);
    }
  };

  const waterProgress = Math.min((waterIntake / dailyWaterGoal) * 100, 100);
  
  const foodsLog = activeLog.filter(item => item.type === 'food');
  const groupedFoods = foodsLog.reduce((acc, food) => {
    const slotKey = getSlotKey(food);
    if (slotKey) {
      (acc[slotKey] = acc[slotKey] || []).push(food);
    }
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
    return normalized.filter(item => item.type === 'food' && equivalents.includes(item.mealType));
  }, [fullStorico, mealType]);

  const weeklyTrendData = useMemo(() => {
    return [...pastDaysStorico].slice(0, 7).reverse().map(d => {
      const prevDate = new Date(d.dataStr + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = prevDate.toISOString().slice(0, 10);
      const prevNode = fullStorico?.[TRACKER_STORICO_KEY(prevStr)];
      const prevLog = Array.isArray(prevNode?.log) ? prevNode.log : Object.values(prevNode?.log || {});
      const prevFood = prevLog.filter(i => i?.type === 'food' && i?.mealTime != null);
      const todayFood = (d.log || []).filter(i => i?.type === 'food' && i?.mealTime != null);
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
    const mealTypesToStrategy = { merenda1: 'colazione', colazione: 'colazione', pranzo: 'pranzo', merenda2: 'spuntino', spuntino: 'spuntino', snack: 'spuntino', cena: 'cena' };
    const yesterdayNodes = [];
    yesterdayLog.forEach(entry => {
      if (entry?.type === 'food') {
        const t = typeof entry.mealTime === 'number' ? entry.mealTime : 12;
        const strategyKey = mealTypesToStrategy[entry.mealType?.split('_')[0]] || 'cena';
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
    const result = generateRealEnergyData(yesterdayNodes, yesterdayLog, idealStrategy, 0, 2500, null, null, userModel, 30);
    const last = result?.chartData?.[24];
    if (!last) return null;
    return { energy: last.energy, idealEnergy: last.idealEnergy };
  }, [currentTrackerDate, fullHistory, idealStrategy, userModel]);

  const sleepStatus = getSleepStatus(activeLog);
  const activeWaterIntake = simulationMode ? activeNodes.filter(n => n.type === 'water').reduce((acc, n) => acc + (n.ml ?? n.amount ?? 0), 0) : waterIntake;
  let energySimulation;
  if (sleepStatus === "NIGHT_PENDING") {
    energySimulation = {
      chartData: [],
      realTotals: {},
      hasCrashRisk: false,
      hasCortisolRisk: false,
      hasDigestionRisk: false,
      nervousSystemLoad: 0
    };
  } else {
    energySimulation = generateRealEnergyData(nodesForEnergySimulation, dailyLogForEnergy, idealStrategy, activeWaterIntake, dailyWaterGoal, yesterdayEnergyAt24?.energy ?? undefined, yesterdayEnergyAt24?.idealEnergy ?? undefined, userModel, nervousSystemLoad);
  }
  const chartData = energySimulation?.chartData ?? [];
  const dailyReportDisplay = useMemo(() => {
    if (!dailyReport) return null;
    const neuroVal = dailyReport.neuro;
    const neuroScore = typeof neuroVal === 'object' ? neuroVal.score : neuroVal;
    const neuroReasonBase = typeof neuroVal === 'object' ? neuroVal.reason : '';
    if (!chartData || chartData.length === 0) return dailyReport;
    const minIdr = Math.min(...chartData.map(p => p.idratazione ?? 100));
    const neuroMalus = minIdr < 45 ? 1 : 0;
    const neuroReason = neuroMalus
      ? (neuroReasonBase ? `${neuroReasonBase} DISIDRATAZIONE: Il cervello ha lavorato in condizioni di stress osmotico.` : 'DISIDRATAZIONE: Il cervello ha lavorato in condizioni di stress osmotico.')
      : neuroReasonBase;
    return {
      ...dailyReport,
      neuro: { score: Math.max(0, neuroScore - neuroMalus), reason: neuroReason }
    };
  }, [dailyReport, chartData]);
  const realTotals = energySimulation?.realTotals ?? {};
  const hasCrashRisk = energySimulation?.hasCrashRisk ?? false;
  const hasCortisolRisk = energySimulation?.hasCortisolRisk ?? false;
  const hasDigestionRisk = energySimulation?.hasDigestionRisk ?? false;

  const { calorieTimeline: calorieTimelineData, totalCalories: totalCaloriesTimeline } = useMemo(() => {
    return generateCalorieTimeline(activeLog);
  }, [activeLog]);
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
    const hasSleep = activeLog.some(e =>
      e.type === "sleep" ||
      e.hours ||
      e.deepMin ||
      e.remMin
    );
    if (sleepStatus === "SLEEP_MISSING" && !hasSleep && !showSleepPrompt) {
      setShowSleepPrompt(true);
    }
  }, [sleepStatus, showSleepPrompt, activeLog]);

  useEffect(() => {
    if (!chartData || chartData.length === 0) {
      setEnergyForecast(null);
      setCrashExplanation(null);
      setDailyInsights([]);
      return;
    }
    const forecast = computeEnergyForecast(chartData);
    setEnergyForecast(forecast);
    const explanation = explainEnergyCrash(chartData, forecast);
    setCrashExplanation(explanation);
    const insights = generateDailyInsights(chartData);
    setDailyInsights(insights);
  }, [chartData]);

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
  const hasWaterRisk = dotIdratazione < 40;
  const dotCortisolo = chartData.length > 0
    ? (chartData[currentH]?.cortisolo ?? 25) + ((chartData[nextH]?.cortisolo ?? 25) - (chartData[currentH]?.cortisolo ?? 25)) * fraction
    : 25;
  const dotDigestione = chartData.length > 0
    ? (chartData[currentH]?.digestione ?? 0) + ((chartData[nextH]?.digestione ?? 0) - (chartData[currentH]?.digestione ?? 0)) * fraction
    : 0;
  const dotNeuro = chartData.length > 0 ? (chartData[currentH]?.neuro ?? 100) + ((chartData[nextH]?.neuro ?? 100) - (chartData[currentH]?.neuro ?? 100)) * fraction : 100;
  const currentMinutes = Math.round((displayTime % 1) * 60);
  const timeLabel = isViewingPastDate ? 'Fine giornata (24:00)' : `ORA (${currentH.toString().padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')})`;
  const energyExplanation = useMemo(() => {
    const pt = chartData?.find(p => p.time === Math.round(displayTime));
    return explainEnergyState(pt);
  }, [chartData, displayTime]);
  const energyIntervention = useMemo(() => {
    return predictEnergyIntervention(chartData, displayTime);
  }, [chartData, displayTime]);
  const energyDrivers = useMemo(
    () => computeEnergyDrivers(chartData?.find(p => p.time === Math.round(displayTime))),
    [chartData, displayTime]
  );
  const metabolicStressIndex = useMemo(() => {
    if (!chartData || chartData.length === 0) return 0;

    const values = chartData.map(p => computeMetabolicStress(p));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    return Math.round(avg);
  }, [chartData]);
  const metabolicDayScore = useMemo(() => {
    return computeMetabolicDayScore(chartData, metabolicStressIndex);
  }, [chartData, metabolicStressIndex]);
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
  const dynamicDailyKcal = (userTargets?.kcal ?? 2000) + burnedKcal;
  const targetKcalChart = dynamicDailyKcal;
  const scale = (v) => (v == null || Number.isNaN(Number(v))) ? v : (Number(v) / 100) * targetKcalChart;

  const wakeHourForRiserva = (() => {
    const sleepEntry = (activeLog || []).find(i => i.type === 'sleep');
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
      if (item.type !== 'food' && item.type !== 'meal') return;

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

  const strategyKeyForMeal = {
    merenda1: 'colazione',
    pranzo: 'pranzo',
    merenda2: 'spuntino',
    cena: 'cena',
    snack: 'spuntino'
  }[mealType] || mealType;

  const targetKcalPasto = idealStrategy[strategyKeyForMeal] || (userTargets.kcal ?? 2000) / 4;
  const dailyKcal = userTargets.kcal ?? 2000;
  const ratio = dailyKcal > 0 ? targetKcalPasto / dailyKcal : 0.25;
  const targetMacrosPasto = {
    kcal: targetKcalPasto,
    prot: (userTargets.prot ?? 150) * ratio,
    carb: (userTargets.carb ?? 200) * ratio,
    fat: (userTargets.fatTotal ?? userTargets.fat ?? 60) * ratio,
    fibre: (userTargets.fibre ?? 30) * ratio
  };

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
    const todayMeals = (activeLog || []).filter(i => i.type === 'food' && typeof i.mealTime === 'number' && i.mealTime <= currentTime).sort((a, b) => b.mealTime - a.mealTime);
    if (todayMeals.length > 0) { lastMealTime = todayMeals[0].mealTime; lastMealDate = 'today'; }
    if (lastMealDate === null && fullHistory) {
      const yesterdayObj = new Date(currentDateObj);
      yesterdayObj.setDate(yesterdayObj.getDate() - 1);
      const offset = yesterdayObj.getTimezoneOffset() * 60000;
      const yesterdayStr = new Date(yesterdayObj.getTime() - offset).toISOString().slice(0, 10);
      const yesterdayNode = fullHistory[TRACKER_STORICO_KEY(yesterdayStr)];
      if (yesterdayNode && yesterdayNode.log) {
        const yesterdayLog = normalizeLogData(Array.isArray(yesterdayNode.log) ? yesterdayNode.log : Object.values(yesterdayNode.log));
        const yestMeals = yesterdayLog.filter(i => i.type === 'food');
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

  const bodyBatteryData = useMemo(() => {
    const log = activeLog || [];
    const sleepNode = log.find(i => i.type === 'sleep');
    const wakeTime = sleepNode?.wakeTime ?? 7.5;
    let startingBattery;
    if (sleepNode?.hours != null) {
      const sleepHours = sleepNode.hours ?? 8.0;
      startingBattery = Math.min(100, Math.max(0, 100 - ((8 - sleepHours) * 10)));
    } else {
      const yesterday = new Date(currentTrackerDate + 'T12:00:00');
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const yesterdayNode = fullHistory?.[TRACKER_STORICO_KEY(yesterdayStr)];
      const rawYesterday = yesterdayNode?.log;
      const yesterdayLog = Array.isArray(rawYesterday) ? rawYesterday : Object.values(rawYesterday || {});
      const yesterdaySleep = yesterdayLog.find(i => i?.type === 'sleep');
      if (yesterdaySleep?.hours != null) {
        const yWake = yesterdaySleep?.wakeTime ?? 7.5;
        const ySleepHours = yesterdaySleep.hours ?? 8.0;
        const yStart = Math.min(100, Math.max(0, 100 - ((8 - ySleepHours) * 10)));
        let yHoursAwake = 24 - yWake;
        if (yHoursAwake < 0) yHoursAwake = 0;
        const yTimeDrain = yHoursAwake * 3.5;
        const yWorkoutCount = yesterdayLog.filter(i => i?.type === 'workout' && (i.mealTime ?? i.time ?? 0) <= 24).length;
        const yWorkoutDrain = yWorkoutCount * 15;
        startingBattery = Math.max(0, Math.min(100, Math.round(yStart - yTimeDrain - yWorkoutDrain)));
      } else {
        startingBattery = 40;
      }
    }
    let hoursAwake = currentTime - wakeTime;
    if (hoursAwake < 0) hoursAwake = 0;
    const timeDrain = hoursAwake * 3.5;
    const workoutCount = log.filter(i => i.type === 'workout' && i.mealTime <= currentTime).length;
    const workoutDrain = workoutCount * 15;
    let currentBattery = startingBattery - timeDrain - workoutDrain;
    currentBattery = Math.max(0, Math.min(100, currentBattery));
    let batteryColor = '#00e676'; let batteryIcon = '🔋';
    if (currentBattery <= 20) { batteryColor = '#ff4d4d'; batteryIcon = '🪫'; }
    else if (currentBattery <= 50) { batteryColor = '#ffea00'; }
    return { level: Math.round(currentBattery), color: batteryColor, icon: batteryIcon };
  }, [activeLog, currentTime, fullHistory, currentTrackerDate]);

  const renderCustomizedLabel = (props) => {
    const { cx, cy, midAngle, outerRadius, value, name, fill, payload, macros } = props;
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
    const segmentData = { name, value, payload: { color: fill || payload?.color, macros: macros || payload?.macros } };
    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={() => setSelectedMealCenter(segmentData)}
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

  const selectedMealCenterIndex = selectedMealCenter ? mealPieData.findIndex(e => e.id === selectedMealCenter.id) : -1;

  // ========================================================
  // SCHERMATA DI LOGIN
  // ========================================================
  if (!isAuthenticated) {
    return (
      <div style={{ backgroundColor: '#000', color: '#00e5ff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', overflow: 'hidden', position: 'relative' }}>
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
            <h1 style={{ margin: 0, fontSize: '2rem', color: '#00e5ff', letterSpacing: '1px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', marginBottom: '20px' }}>
              ReadyCore
              <span style={{ fontSize: '0.5em', verticalAlign: 'super', marginLeft: '4px', color: '#888', letterSpacing: '0px', fontWeight: 'normal' }}>
                OS
              </span>
            </h1>
            <p style={{textAlign: 'center', fontSize: '0.65rem', color: '#666', marginBottom: '20px'}}>SYSTEM ENCRYPTED. REQUIRE AUTHENTICATION.</p>
            <input type="email" placeholder="USER ID (EMAIL)" className="login-input" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
            <input type="password" placeholder="PASSWORD" className="login-input" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            <button type="submit" className="login-btn">INIZIALIZZA</button>
          </form>
        )}
      </div>
    );
  }

  if (!isInitialLoadComplete) {
    return (
      <div style={{ height: '100dvh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00e5ff', fontFamily: 'monospace' }}>
        <style>
          {`
            .spinner-sync { border: 2px solid transparent; border-top-color: #00e5ff; border-radius: 50%; width: 30px; height: 30px; animation: spin-sync 1s linear infinite; margin-bottom: 20px; }
            @keyframes spin-sync { to { transform: rotate(360deg); } }
          `}
        </style>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner-sync"></div>
          <div style={{ letterSpacing: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'flex-start' }}>
            ReadyCore
            <span style={{ fontSize: '0.5em', verticalAlign: 'super', marginLeft: '4px', color: '#888', letterSpacing: '0px', fontWeight: 'normal' }}>OS</span>
          </div>
          <div style={{ fontSize: '0.6rem', color: '#444', marginTop: '10px' }}>INITIALIZING...</div>
        </div>
      </div>
    );
  }

  if (isFullScreenGraph) {
    const currentChartType = availableFullscreenCharts[fullscreenChartIndex] || 'percent';
    const fullscreenChartLabel = currentChartType === 'percent' ? 'Energia SNC %' : currentChartType === 'cortisolo' ? 'Cortisolo' : 'Bilancio Calorico';

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#121212', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
        {/* 1. HEADER FISSO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', background: '#1e1e1e', borderBottom: '1px solid #333', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button type="button" onClick={() => setFullscreenChartIndex(prev => prev > 0 ? prev - 1 : availableFullscreenCharts.length - 1)} style={{ background: '#333', color: '#00e5ff', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>◀</button>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1.2rem', textTransform: 'uppercase' }}>{fullscreenChartLabel}</h2>
            <button type="button" onClick={() => setFullscreenChartIndex(prev => prev < availableFullscreenCharts.length - 1 ? prev + 1 : 0)} style={{ background: '#333', color: '#00e5ff', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>▶</button>
          </div>
          <button type="button" onClick={exitFullscreen} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✖ Chiudi</button>
        </div>

        {/* 2. CORPO SCORREVOLE (GRAFICO E NODI IN SOLIDO) */}
        <div style={{ flex: 1, width: '100%', minHeight: 0, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
          <div style={{ width: '200vw', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', paddingBottom: '30px' }}>
            <div style={{ flex: 1, minHeight: '280px' }}>
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
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [`${value}%`, 'Energia SNC']} labelFormatter={(label) => `Ore ${label}:00`} />
                  {nodesForEnergySimulation.filter(n => n.type === 'sleep').map((node, index) => (
                    <ReferenceLine key={`fs-sleep-${node.id ?? index}`} x={node.wakeTime ?? 7.5} stroke="#00e5ff" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideTopLeft', value: '🌅 Sveglia', fill: '#4ba3e3', fontSize: 11 }} />
                  ))}
                  <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" strokeWidth={1.5} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10, offset: 12 }} />
                  <ReferenceDot x={displayTime} y={dotY} isFront r={10} fill="#00e676" stroke="#fff" strokeWidth={2} />
                  <Area type="monotone" dataKey="riservaFisica" stroke="#00e676" fill="url(#colorRiservaFullscreen)" fillOpacity={0.3} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="energyPast" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#colorEnergiaFullscreen)" connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="energyFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
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
                  <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} />
                  <YAxis domain={[0, 100]} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value, 'Cortisolo']} labelFormatter={(label) => `Ore ${label}:00`} />
                  <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" strokeWidth={1.5} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10, offset: 12 }} />
                  <ReferenceDot x={displayTime} y={dotCortisolo} isFront r={10} fill="#9c27b0" stroke="#fff" strokeWidth={2} />
                  <Area type="monotone" dataKey="cortisoloPast" stroke="#9c27b0" fill="url(#colorCortisoloFullscreen)" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="cortisoloFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {currentChartType === 'calorieTimeline' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={safeCalorieTimelineData} margin={{ top: 35, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="time" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={11} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} />
                  <YAxis domain={[0, 'auto']} stroke="#666" fontSize={11} tickFormatter={(v) => Math.round(v)} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }} formatter={(value) => [Math.round(value), 'kcal']} labelFormatter={(label) => `Ore ${label}:00`} />
                  <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" strokeWidth={1.5} label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10, offset: 12 }} />
                  <Line type="monotone" dataKey="kcal" stroke="#ff9800" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            </div>
            {/* Barra Nodi solidale al grafico (stessa larghezza 200vw) */}
            <div style={{ height: '70px', marginTop: '-10px', paddingBottom: '25px', position: 'relative', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #222', flexShrink: 0, zIndex: 10 }}>
              {(activeNodesWithStack || []).map((node) => {
                const pct = ((node.time ?? 0) / 24) * 100;
                const isWork = node.type === 'work';
                const isWater = node.type === 'water';
                const isStimulant = node.type === 'stimulant';
                const isPesi = node.type === 'workout' && node.subType === 'pesi' && node.muscles?.length > 0;
                const icon = NODE_TYPE_ICON[node.type] ?? (isStimulant ? '☕' : isWater ? '💧' : (isPesi ? (node.muscles || []).map(m => m.substring(0, 2).toUpperCase()).join('+') : (node.icon || '•')));
                const borderColor = node.type === 'nap' ? '#818cf8' : node.type === 'meditation' ? '#22c55e' : node.type === 'water' ? '#00e5ff' : isStimulant ? '#f59e0b' : '#00e5ff';
                const timeStr = `${Math.floor(node.time ?? 0)}:${String(Math.round(((node.time ?? 0) % 1) * 60)).padStart(2, '0')}`;
                if (isWork) {
                  const dur = (node.duration || 1) / 24 * 100;
                  return (
                    <div key={node.id} style={{ position: 'absolute', left: `${pct}%`, width: `${Math.max(4, dur)}%`, top: '50%', marginTop: -14, height: '28px', background: 'rgba(255, 234, 0, 0.2)', border: '2px solid #ffea00', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#ffea00' }}>💼</div>
                  );
                }
                return (
                  <div key={node.id} style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: `2px solid ${borderColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: borderColor }} title={timeStr}>
                    <span style={{ lineHeight: 1, fontSize: '0.85rem' }}>{icon}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: isSimulationMode ? '#1a1625' : '#000', color: '#fff', height: '100dvh', maxHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 'max(10px, 1.5vh) 15px max(15px, 2vh) 15px', paddingBottom: '65px', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
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
          .btn-toggle { background: none; border: 1px solid #333; color: #666; padding: 10px 20px !important; font-size: 0.8rem !important; min-height: 44px; border-radius: 20px; cursor: pointer; letter-spacing: 2px; transition: all 0.3s; -webkit-tap-highlight-color: transparent; display: flex; align-items: center; }
          .btn-toggle.active { border-color: #00e5ff; color: #00e5ff; box-shadow: 0 0 10px rgba(0,229,255,0.2); }
          
          .drawer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); opacity: 0; pointer-events: none; transition: opacity 0.4s ease; z-index: 100; }
          .drawer-overlay.open { opacity: 1; pointer-events: all; }
          
          /* Ottimizzazione Drawer per Mobile */
          .drawer-content { position: fixed; bottom: -100%; left: 0; right: 0; background: rgba(15, 15, 15, 0.95); border-top: 1px solid #2a2a2a; border-radius: 25px 25px 0 0 !important; padding: 30px 20px !important; padding-bottom: max(20px, env(safe-area-inset-bottom)); transition: bottom 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.05); z-index: 101; box-shadow: 0 -10px 50px rgba(0,0,0,0.9); max-height: 92vh !important; overflow-y: auto; backdrop-filter: blur(25px); -webkit-overflow-scrolling: touch; }
          .drawer-content.open { bottom: 0; }
          
          /* Navigator Zoom Controls */
          .zoom-controls { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 12px; z-index: 10; }
          .zoom-btn { width: 44px; height: 44px; background: rgba(20, 20, 20, 0.8); border: 1px solid #333; color: #00e5ff; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; font-weight: bold; backdrop-filter: blur(5px); cursor: pointer; outline: none; }
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
          
          .chat-container { display: flex; flex-direction: column; height: 380px; }
          .chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; padding-right: 5px; padding-bottom: 20px; }
          .chat-bubble { max-width: 82%; padding: 14px 18px; border-radius: 20px; font-size: 0.9rem; line-height: 1.4; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .bubble-ai { background: #1f1f1f; border: 1px solid #333; color: #eee; border-bottom-left-radius: 4px; align-self: flex-start; }
          .bubble-user { background: linear-gradient(135deg, #00e5ff, #007aff); color: #000; font-weight: 500; border-bottom-right-radius: 4px; align-self: flex-end; }
          .typing-indicator { display: flex; gap: 4px; padding: 5px; }
          .dot { width: 6px; height: 6px; background: #888; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
          .dot:nth-child(1) { animation-delay: -0.32s; } .dot:nth-child(2) { animation-delay: -0.16s; }
          @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); background: #fff; } }
          .chat-input-wrapper { display: flex; align-items: center; gap: 10px; background: #1a1a1a; border-radius: 30px; padding: 6px 6px 6px 20px; border: 1px solid #333; margin-top: 10px; }
          .chat-input { flex: 1; background: transparent; border: none; color: #fff; font-size: 0.95rem; outline: none; }
          .chat-send-btn { background: #fff; color: #000; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: 0.2s; font-size: 1.1rem; }
          .chat-send-btn.has-text { background: #b388ff; color: #fff; }

          .zen-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 250px; position: relative; margin-bottom: 20px; }
          .zen-orb { width: 80px; height: 80px; border-radius: 50%; background: radial-gradient(circle, #fbc02d 10%, #f57f17 100%); opacity: 0.2; box-shadow: 0 0 20px rgba(251, 192, 45, 0.2); transition: all 0.5s ease; position: relative; z-index: 2; }
          .zen-orb.breathing { animation: boxBreathe 16s linear infinite; }
          @keyframes boxBreathe { 0% { transform: scale(1); opacity: 0.3; box-shadow: 0 0 20px rgba(251, 192, 45, 0.2); } 25% { transform: scale(2.2); opacity: 1; box-shadow: 0 0 80px rgba(251, 192, 45, 0.8); } 50% { transform: scale(2.2); opacity: 1; box-shadow: 0 0 80px rgba(251, 192, 45, 0.8); } 75% { transform: scale(1); opacity: 0.3; box-shadow: 0 0 20px rgba(251, 192, 45, 0.2); } 100% { transform: scale(1); opacity: 0.3; box-shadow: 0 0 20px rgba(251, 192, 45, 0.2); } }
          .zen-rings { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; border-radius: 50%; border: 1px solid rgba(251, 192, 45, 0.3); z-index: 1; transition: all 0.5s ease; }
          .breathing ~ .zen-rings { animation: ringsExpand 16s linear infinite; }
          @keyframes ringsExpand { 0% { transform: translate(-50%, -50%) scale(1); opacity: 0; } 12% { opacity: 1; } 25% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; } 100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; } }
          .zen-instruction { position: absolute; bottom: 0; font-size: 0.8rem; color: #888; letter-spacing: 2px; text-transform: uppercase; animation: fadeInOut 16s linear infinite; opacity: 0; }
          .breathing ~ .zen-instruction { opacity: 1; }
          @keyframes fadeInOut { 0%, 24% { content: "Inspira"; color: #fbc02d; } 25%, 49% { content: "Trattieni"; color: #fff; } 50%, 74% { content: "Espira"; color: #fbc02d; } 75%, 100% { content: "Pausa"; color: #888; } }

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
            transform: scale(2) translateY(-20px);
            z-index: 9999 !important;
            box-shadow: 0 15px 25px rgba(0,0,0,0.6);
            cursor: grabbing;
            transition: transform 0.1s ease, box-shadow 0.2s ease;
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
            .drawer-content.open { height: 95vh; max-height: 95vh !important; display: flex; flex-direction: column; }
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

      {/* HEADER SUPERIORE - MINIMALE (2 ZONE) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', marginBottom: '5px' }}>
          
          {/* SINISTRA: Titolo OS */}
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => { handleCoreOsClick(); setActiveAction(null); setIsDrawerOpen(false); setShowChoiceModal(false); setShowReport(false); setShowProfile(false); setSelectedNodeReport(null); setShowReportModal(false); }} style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#00e5ff', letterSpacing: '1px', fontWeight: 'bold', display: 'flex', alignItems: 'flex-start' }}>
                ReadyCore
                <span style={{ fontSize: '0.5em', verticalAlign: 'super', marginLeft: '4px', color: '#888', letterSpacing: '0px', fontWeight: 'normal' }}>
                  OS
                </span>
              </h1>
            </button>
          </div>

          {/* DESTRA: Logout, Widget Energia */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
            <button className="btn-toggle" onClick={() => auth.signOut()} style={{ padding: '8px 12px !important', minHeight: 'auto', fontSize: '0.7rem !important' }}>LOGOUT</button>
            {/* Widget Energia Biologica (Arco) */}
            <div 
              onClick={() => setShowEnergyPopup(true)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', transition: 'background 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ position: 'relative', width: '56px', height: '28px' }}>
                <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke="#222" strokeWidth="12" strokeLinecap="round" />
                  <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke={bodyBatteryData?.color || '#00e5ff'} strokeWidth="12" strokeLinecap="round" strokeDasharray="125.6" strokeDashoffset={125.6 - ((bodyBatteryData?.level || 0) / 100) * 125.6} style={{ transition: 'stroke-dashoffset 1s ease-in-out, stroke 0.5s' }} />
                </svg>
                <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translate(-50%, -100%)', paddingBottom: '2px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: bodyBatteryData?.color || '#00e5ff', textShadow: `0 0 10px ${bodyBatteryData?.color || '#00e5ff'}80` }}>
                    {bodyBatteryData?.level || 0}%
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                {(energyIntervention || (energyExplanation && energyExplanation.some(c => c.direction === 'down'))) && (
                  <span style={{ fontSize: '0.7rem', filter: 'drop-shadow(0 0 5px rgba(255,152,0,0.8))' }}>⚠️</span>
                )}
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#00e5ff' }}>
                  Score: {metabolicDayScore}
                </span>
              </div>
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

        {/* BARRA DEGLI STRUMENTI: Data + Stella Report + Toggle Home/Analisi */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'max(6px, 1vh)', background: 'linear-gradient(145deg, #111, #0a0a0a)', padding: '6px 12px', borderRadius: '12px', border: '1px solid #222' }}>
          
          {/* 1. SELETTORE DATA (Estrema Sinistra) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
              <button
                type="button"
                onClick={() => changeDate(-1)}
                style={{ background: 'none', border: 'none', color: '#00e5ff', fontSize: '1.2rem', padding: 0, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                ◀
              </button>
              <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                {currentDateObj.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
              </span>
              <button
                type="button"
                onClick={() => changeDate(1)}
                disabled={currentTrackerDate === getTodayString()}
                style={{ background: 'none', border: 'none', color: '#00e5ff', fontSize: '1.2rem', padding: 0, flexShrink: 0, cursor: currentTrackerDate === getTodayString() ? 'default' : 'pointer', opacity: currentTrackerDate === getTodayString() ? 0.3 : 1, display: 'flex', alignItems: 'center' }}
              >
                ▶
              </button>
            </div>
          </div>

          {/* 2. STELLA / REPORT (Al centro) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                const isToday = currentTrackerDate === getTodayString();
                if (isToday) {
                  alert('Il report non è pronto, perché mancano i dati di tutta la giornata.');
                  return;
                }
                if (dailyReport?.ready) {
                  setShowReportModal(true);
                  setReportViewedDates(prev => {
                    const newState = { ...prev, [currentTrackerDate]: true };
                    try { localStorage.setItem('reportViewedDates', JSON.stringify(newState)); } catch (_) {}
                    return newState;
                  });
                } else {
                  changeDate(-1);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const isToday = currentTrackerDate === getTodayString();
                  if (isToday) {
                    alert('Il report non è pronto, perché mancano i dati di tutta la giornata.');
                    return;
                  }
                  if (dailyReport?.ready) {
                    setShowReportModal(true);
                    setReportViewedDates(prev => { const newState = { ...prev, [currentTrackerDate]: true }; try { localStorage.setItem('reportViewedDates', JSON.stringify(newState)); } catch (_) {} return newState; });
                  } else changeDate(-1);
                }
              }}
              title={dailyReport?.ready ? 'Report giornaliero a 5 stelle' : currentTrackerDate === getTodayString() && yesterdayReportReady ? 'Report di ieri pronto: vai al giorno precedente' : 'Disponibile solo per giornate passate con dati'}
              style={{
                position: 'relative',
                fontSize: '1.4rem',
                cursor: 'pointer',
                color: dailyReport?.ready ? '#ffd700' : '#444',
                textShadow: dailyReport?.ready ? '0 0 10px rgba(255, 215, 0, 0.6)' : 'none',
                transition: 'all 0.3s ease',
                lineHeight: 1,
                padding: '2px 4px'
              }}
            >
              ★
              {currentTrackerDate === getTodayString() && yesterdayReportReady && (() => {
                const y = new Date(getTodayString() + 'T12:00:00');
                y.setDate(y.getDate() - 1);
                const yesterdayStr = y.toISOString().slice(0, 10);
                return !reportViewedDates[yesterdayStr];
              })() && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-4px',
                    width: '10px',
                    height: '10px',
                    background: '#ff4444',
                    borderRadius: '50%',
                    border: '2px solid #000',
                    boxShadow: '0 0 5px #ff4444'
                  }}
                  aria-hidden
                />
              )}
            </div>
          </div>

          {/* 3. SWITCH HOME/ANALISI (A destra) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <div
              onMouseDown={handleSwitchTouchStart}
              onMouseUp={handleSwitchTouchEnd}
              onMouseLeave={handleSwitchTouchEnd}
              onTouchStart={handleSwitchTouchStart}
              onTouchEnd={handleSwitchTouchEnd}
              onClick={(e) => {
                e.stopPropagation();
                const currentIsPro = userProfile?.level === 'pro';
                setUserProfile(prev => ({ ...prev, level: currentIsPro ? 'base' : 'pro' }));
                handleSwitchTouchEnd();
                setIsSimulationMode(false);
                setSimulatedLog(null);
              }}
              style={{ display: 'flex', background: '#222', borderRadius: '12px', padding: '4px', marginBottom: 0, userSelect: 'none', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, padding: '8px', background: !isSimulationMode && userProfile?.level !== 'pro' ? '#333' : 'transparent', color: !isSimulationMode && userProfile?.level !== 'pro' ? '#00e5ff' : '#888', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.75rem', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                🏠 Home
              </div>
              <div style={{ flex: 1, padding: '8px', background: !isSimulationMode && userProfile?.level === 'pro' ? '#333' : 'transparent', color: !isSimulationMode && userProfile?.level === 'pro' ? '#00e5ff' : '#888', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.75rem', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                📊 Analisi
              </div>
            </div>
          </div>

        </div>

      {/* Barra Telemetria Rapida Premium - wrap attivato e centrato */}
      <div onClick={() => setShowSpieInfo(true)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: 'max(12px, 1.5vh)', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' }}>
          <span style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${((Number(totali?.omega3) ?? 0) < 1) ? '#ff5555' : '#00e676'}`, padding: '8px 12px', borderRadius: '20px', color: ((Number(totali?.omega3) ?? 0) < 1) ? '#ff5555' : '#00e676', boxShadow: `0 0 10px ${((Number(totali?.omega3) ?? 0) < 1) ? 'rgba(255,85,85,0.2)' : 'rgba(0,230,118,0.1)'}`, whiteSpace: 'nowrap' }}>
            {((Number(totali?.omega3) ?? 0) < 1) ? '🔴 Carenza Micro' : '🟢 Micro OK'}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${energyAt20Percent < 40 ? '#ff9800' : '#00e676'}`, padding: '8px 12px', borderRadius: '20px', color: energyAt20Percent < 40 ? '#ff9800' : '#00e676', boxShadow: `0 0 10px ${energyAt20Percent < 40 ? 'rgba(255,152,0,0.2)' : 'rgba(0,230,118,0.1)'}`, whiteSpace: 'nowrap' }}>
            {energyAt20Percent < 40 ? '🟠 Rischio Serali' : '🟢 Serali OK'}
          </span>
        </div>
        <span style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${(dynamicDailyKcal - (totali?.kcal || 0)) >= 0 ? '#333' : '#ff4d4d'}`, padding: '8px 12px', borderRadius: '20px', color: (dynamicDailyKcal - (totali?.kcal || 0)) >= 0 ? '#aaa' : '#ff4d4d', boxShadow: (dynamicDailyKcal - (totali?.kcal || 0)) < 0 ? '0 0 10px rgba(255,77,77,0.3)' : 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {(dynamicDailyKcal - (totali?.kcal || 0)) >= 0 ? `🎯 Rimangono ${Math.round(dynamicDailyKcal - (totali?.kcal || 0))} kcal` : `🔥 Surplus calorico +${Math.abs(Math.round(dynamicDailyKcal - (totali?.kcal || 0)))} kcal`}
        </span>
      </div>

      {userProfile?.level === 'pro' && (
      <>
      {/* Cruscotto energetico giornaliero 0-24h */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '16px', padding: 'max(10px, 1.5vh) 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ flexShrink: 0, marginBottom: '10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', paddingBottom: '4px' }}>
            <button type="button" onClick={() => setChartUnit('percent')} className={`telemetry-btn ${chartUnit === 'percent' ? 'active' : ''}`}>⚡ %</button>
            <button type="button" onClick={() => setChartUnit('calorieTimeline')} className={`telemetry-btn ${chartUnit === 'calorieTimeline' ? 'active' : ''}`} style={chartUnit === 'calorieTimeline' ? { color: '#ff9800', borderColor: '#ff9800' } : undefined}>📈 CUMUL</button>
            <button type="button" onClick={() => setChartUnit('glicemia')} className={`telemetry-btn ${chartUnit === 'glicemia' ? 'active blood' : ''} ${hasCrashRisk && chartUnit !== 'glicemia' ? 'pulse-alert' : ''}`}>🩸 GLICEM</button>
            <button type="button" onClick={() => setChartUnit('idratazione')} className={`telemetry-btn ${chartUnit === 'idratazione' ? 'active water' : ''} ${hasWaterRisk && chartUnit !== 'idratazione' ? 'pulse-alert-water' : ''}`}>💧 IDRAT</button>
            <button type="button" onClick={() => setChartUnit('neuro')} className={`telemetry-btn ${chartUnit === 'neuro' ? 'active' : ''}`} style={chartUnit === 'neuro' ? { color: '#6366f1', borderColor: '#6366f1' } : undefined}>🧠 NEURO</button>
            <button type="button" onClick={() => setChartUnit('cortisolo')} className={`telemetry-btn ${chartUnit === 'cortisolo' ? 'active cortisol' : ''} ${hasCortisolRisk && chartUnit !== 'cortisolo' ? 'pulse-alert-cortisol' : ''}`}>🧠 CORTISOL</button>
            <button type="button" onClick={() => setChartUnit('digestione')} className={`telemetry-btn ${chartUnit === 'digestione' ? 'active' : ''} ${hasDigestionRisk && chartUnit !== 'digestione' ? 'pulse-alert' : ''}`} style={chartUnit === 'digestione' ? { color: '#9333ea', borderColor: '#9333ea' } : undefined}>⚙️ DIGEST</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', marginTop: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: `1px solid ${metabolicState.color}40` }}>
            <span style={{ fontSize: '0.7rem', color: '#888' }}>Radar metabolico:</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: metabolicState.color }}>{metabolicState.label}</span>
            <span style={{ fontSize: '0.65rem', color: '#666' }}>🩸 {Math.round(gl)} · ⚙️ {Math.round(dig)}%</span>
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
        <div className="chart-wrapper" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="chartTitle">
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '2px', textTransform: 'uppercase' }}>
                {chartUnit === 'percent' ? 'Energia SNC (%)' : chartUnit === 'calorieTimeline' ? 'Calorie cumulative' : chartUnit === 'glicemia' ? 'Simulatore Glicemico' : chartUnit === 'idratazione' ? 'Simulatore Idratazione' : chartUnit === 'cortisolo' ? 'Cortisolo / Stress' : chartUnit === 'digestione' ? 'Grafico della Digestione' : chartUnit === 'neuro' ? 'Recupero Neurologico' : 'Energia SNC (%)'}
              </span>
              {chartUnit === 'calorieTimeline' && (
                <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '4px', lineHeight: 1.3 }} title="Accumulo delle calorie ingerite durante la giornata in base ai pasti registrati.">
                  Accumulo delle calorie ingerite durante la giornata in base ai pasti registrati.
                </div>
              )}
            </div>
          </div>
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="zoom-controls">
              <button type="button" className="zoom-btn" onClick={enterFullscreen} title="Grafico a tutto schermo" style={{ borderColor: '#00e5ff', color: '#00e5ff' }}>⛶</button>
              <button type="button" className="zoom-btn" onClick={() => setShowTelemetryPopup(true)} title="Stats" style={{ background: 'rgba(0, 230, 118, 0.15)', borderColor: '#00e676', color: '#00e676' }}>📊</button>
              <button type="button" className="zoom-btn" onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 1.5))}>+</button>
              <button type="button" className="zoom-btn" onClick={() => setZoomLevel(1)} title="Centra">🎯</button>
              <button type="button" className="zoom-btn" onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.45))}>−</button>
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
              style={{ flexShrink: 0, width: `${220 * zoomLevel}%`, minWidth: `${800 * zoomLevel}px`, height: '100%', position: 'relative', transition: 'width 0.3s ease' }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => { if (!draggingNode) { setExpandedChart(chartUnit); setActiveHighlight(null); } }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !draggingNode) { e.preventDefault(); setExpandedChart(chartUnit); setActiveHighlight(null); } }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'calc(100% - 65px)', minHeight: 80, cursor: 'pointer' }}
                aria-label="Apri grafico a tutto schermo"
              >
                {chartUnit === 'percent' ? (
              <div style={{ background: '#111', padding: '15px', borderRadius: '15px', border: '1px solid #222' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                  <span>⚡ Energia SNC (%)</span>
                  <span style={{ color: '#00e676', fontSize: '0.8rem' }}>0-100%</span>
                </h3>
                <div style={{ width: '100%', height: '220px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={mainChartData} margin={{ top: 35, right: 0, left: -20, bottom: 0 }}>
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
                      <XAxis dataKey="hour" type="number" domain={[0, 24]} allowDataOverflow={true} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}h`} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} />
                      <YAxis domain={[0, 100]} stroke="#666" fontSize={10} tickFormatter={(tick) => `${tick}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#00e676', fontWeight: 'bold' }}
                        formatter={(value) => [`${value}%`, 'Energia SNC']}
                        labelFormatter={(label) => `Ore ${label}:00`}
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
                      <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.4)" strokeDasharray="5 5" strokeWidth={1.5} isFront label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 10, offset: 12 }} />
                      <ReferenceDot x={displayTime} y={finalDotY} isFront r={8} fill="#00e676" stroke="#fff" strokeWidth={2} />
                      <Area type="monotone" dataKey="riservaFisica" stroke="#00e676" fill="url(#colorRiserva)" fillOpacity={0.3} strokeWidth={2} dot={false} isAnimationActive={!draggingNode} />
                      <Area type="monotone" dataKey="energyPast" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#colorEnergia)" connectNulls={false} isAnimationActive={!draggingNode} />
                      <Area type="monotone" dataKey="energyFuture" stroke="#444" strokeWidth={2} strokeDasharray="10 10" fill="transparent" className="future" connectNulls={false} isAnimationActive={!draggingNode} />
                      <ReferenceLine y={20} stroke="#ff4d4d" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine y={50} stroke="#ffea00" strokeDasharray="3 3" strokeOpacity={0.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mainChartData} margin={{ top: 35, right: 30, left: -10, bottom: 0 }}>
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
                  <XAxis dataKey={chartUnit === 'calorieTimeline' ? 'time' : 'hour'} type="number" domain={[0, 24]} allowDataOverflow={true} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} tickFormatter={(val) => `${val}:00`} axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 13 }} />
                  <YAxis domain={chartUnit === 'glicemia' ? [40, 220] : (chartUnit === 'kcal' || chartUnit === 'calorieTimeline' ? [0, Math.max(targetKcalChart, totalCaloriesTimeline || 0)] : [0, 100])} tickFormatter={(val) => (chartUnit === 'kcal' || chartUnit === 'calorieTimeline') ? Math.round(Number(val)) : (chartUnit === 'glicemia' ? val : `${val}%`)} tick={{ fill: '#555', fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                  <YAxis yAxisId="anabolic" orientation="right" domain={[0, 150]} hide />
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
                  <ReferenceLine x={displayTime} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" isFront label={{ position: 'top', value: timeLabel, fill: '#aaa', fontSize: 11, offset: 10 }} />
                  <ReferenceDot x={displayTime} y={finalDotY} isFront shape={(props) => {
                    const cx = props?.cx;
                    const cy = props?.cy;
                    if (cx == null || cy == null || typeof cx !== 'number' || typeof cy !== 'number') return <path d="M0 0" />;
                    const fillColor = chartUnit === 'glicemia' ? '#ef4444' : (chartUnit === 'cortisolo' ? '#f59e0b' : chartUnit === 'digestione' ? '#9333ea' : chartUnit === 'neuro' ? '#6366f1' : chartUnit === 'calorieTimeline' ? '#ff9800' : '#00e5ff');
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={10} fill={fillColor} />
                        <circle cx={cx} cy={cy} r={10} fill="none" stroke={fillColor} strokeWidth={4}>
                          <animate attributeName="r" values="10;28" dur="1.5s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;0" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    );
                  }} />
                </ComposedChart>
              </ResponsiveContainer>
                )}
              </div>
              <div ref={timelineContainerRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #222', overflow: 'visible' }}>
                  {activeNodesWithStack.map((node) => {
                    const currentChartUnit = chartUnit;
                    const effectiveNodeType = node.type === 'meal' ? 'meal' : node.type;
                    const isImportant = NODE_IMPORTANCE[currentChartUnit]?.includes(effectiveNodeType);
                    const importanceStyle = isImportant ? { filter: 'none', opacity: 1, zIndex: 10 } : { filter: 'grayscale(100%)', opacity: 0.35, zIndex: 1 };
                    const isNodeFocused = (!activeAction || activeAction === 'home') || activeAction === 'diario_giornaliero' || (activeAction === 'pasto' && node.type === 'meal') || (activeAction === 'allenamento' && (node.type === 'work' || node.type === 'workout')) || (activeAction === 'acqua' && node.type === 'water');
                    const isWork = node.type === 'work';
                    const percent = (node.time / 24) * 100;
                    const startPercent = percent;
                    const durationPercent = isWork ? ((node.duration || 1) / 24) * 100 : 0;
                    const idealVal = node.type === 'meal' ? (idealStrategy[node.strategyKey] ?? 400) : (node.type === 'workout' ? (idealStrategy.allenamento ?? 300) : (node.type === 'water' ? 100 : (node.kcal ?? 400)));
                    const realVal = (node.type === 'meal' || node.type === 'workout') ? (realTotals[node.strategyKey] ?? 0) : 0;
                    const ratio = idealVal > 0 ? realVal / idealVal : 1;
                    let borderColor = '#00e5ff';
                    if (node.type === 'nap') borderColor = '#818cf8';
                    else if (node.type === 'meditation') borderColor = '#22c55e';
                    else if (node.type === 'supplements') borderColor = '#a855f7';
                    else if (node.type === 'sunlight') borderColor = '#fbbf24';
                    else if (node.type === 'water') borderColor = '#00e5ff';
                    else if (ratio < 0.5) borderColor = '#ff3d00';
                    else if (ratio > 1.2) borderColor = '#ffea00';
                    const pointBorderColor = isWork ? '#ffea00' : borderColor;
                    const isDragging = draggingNode?.id === node.id;
                    const dragY = isDragging ? dragOffsetY : 0;
                    const displayTimeVal = (isDragging && dragLiveTime != null) ? dragLiveTime : node.time;
                    const displayPercent = (displayTimeVal / 24) * 100;
                    const workEndTime = node.time + (node.duration || 1);
                    const displayDurationPercent = isWork && isDragging && dragLiveTime != null && draggingNode?.edge === 'start'
                      ? ((workEndTime - dragLiveTime) / 24) * 100
                      : isWork && isDragging && dragLiveTime != null && draggingNode?.edge === 'end'
                        ? ((dragLiveTime - node.time) / 24) * 100
                        : durationPercent;
                    const workBarLeftPercent = isWork && isDragging && dragLiveTime != null && draggingNode?.edge === 'end' ? percent : displayPercent;

                    if (isWork) {
                      const dragEdge = isDragging ? draggingNode?.edge : null;
                      return (
                        <div key={node.id} className={`timeline-node ${isDragging ? 'is-dragging' : ''}`} onPointerDown={startNodeDrag(node, 'all')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={handleNodeTap(node)} style={{ position: 'absolute', left: `${workBarLeftPercent}%`, width: `${displayDurationPercent}%`, top: '50%', marginTop: -18 - (node.stackIndex || 0) * 38, height: '36px', transform: isDragging ? `translateY(${dragY - 45}px) scale(1.5)` : (isImportant ? 'scale(1)' : 'scale(0.8)'), background: isDragging ? 'rgba(255, 234, 0, 0.3)' : 'rgba(255, 234, 0, 0.15)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', cursor: isDragging ? 'grabbing' : 'pointer', transition: isDragging ? 'none' : 'background 0.15s', touchAction: 'none', pointerEvents: isNodeFocused ? 'auto' : 'none', ...(isDragging ? {} : importanceStyle) }}>
                          <div onPointerDown={startNodeDrag(node, 'start')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={handleNodeTap(node)} style={{ position: 'absolute', left: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                            {(dragEdge === 'start' || dragEdge === 'all') && (
                              <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                                {Math.floor(node.time)}:{String(Math.round((node.time % 1) * 60)).padStart(2, '0')}
                              </div>
                            )}
                            💼
                          </div>
                          <div onPointerDown={startNodeDrag(node, 'end')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={handleNodeTap(node)} style={{ position: 'absolute', right: '-18px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '2px solid #ffea00', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
                            {(dragEdge === 'end' || dragEdge === 'all') && (
                              <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#ffea00', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                                {Math.floor(node.time + (node.duration || 1))}:{String(Math.round(((node.time + (node.duration || 1)) % 1) * 60)).padStart(2, '0')}
                              </div>
                            )}
                            🏁
                          </div>
                        </div>
                      );
                    }

                    const isPesi = node.type === 'workout' && node.subType === 'pesi' && node.muscles?.length > 0;
                    const isWater = node.type === 'water';
                    const isStimulant = node.type === 'stimulant';
                    const iconContent = NODE_TYPE_ICON[node.type] ?? (isStimulant ? '☕' : (isWater ? '💧' : (isPesi ? node.muscles.map(m => m.substring(0, 2).toUpperCase()).join('+') : (node.icon || '•'))));
                    const bioTypeBg = { nap: 'rgba(129,140,248,0.2)', meditation: 'rgba(34,197,94,0.2)', supplements: 'rgba(168,85,247,0.2)', sunlight: 'rgba(251,191,36,0.2)' }[node.type];
                    const bioTypeBorder = { nap: '#818cf8', meditation: '#22c55e', supplements: '#a855f7', sunlight: '#fbbf24' }[node.type];
                    const bgColor = isStimulant ? (isDragging ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.2)') : isWater ? (isDragging ? 'rgba(0,229,255,0.35)' : 'rgba(0, 229, 255, 0.15)') : bioTypeBg ? (isDragging ? bioTypeBg.replace('0.2)', '0.35)') : bioTypeBg) : (isDragging ? 'rgba(0,229,255,0.35)' : 'rgba(0,0,0,0.6)');
                    const nodeBorderColor = isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (bioTypeBorder || pointBorderColor));
                    const timeLabelStr = isDragging && dragLiveTime != null ? decimalToTimeStr(dragLiveTime) : `${Math.floor(node.time)}:${String(Math.round((node.time % 1) * 60)).padStart(2, '0')}`;
                    const pointTransform = isDragging ? `translate(-50%, ${dragY - 45}px) scale(2)` : (isImportant ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(0.8)');
                    return (
                      <div key={node.id} className={`timeline-node meal-node ${isDragging ? 'is-dragging' : ''}`} onPointerDown={startNodeDrag(node, 'all')} onPointerUp={releaseNodePointer} onPointerCancel={releaseNodePointer} onClick={handleNodeTap(node)} style={{ position: 'absolute', left: `${displayPercent}%`, transform: pointTransform, top: '50%', marginTop: -18 - (node.stackIndex || 0) * 38, width: '36px', height: '36px', borderRadius: '50%', background: bgColor, border: `2px solid ${nodeBorderColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: isDragging ? 'grabbing' : 'pointer', transition: isDragging ? 'none' : 'transform 0.15s, background 0.15s', touchAction: 'none', pointerEvents: isNodeFocused ? 'auto' : 'none', ...(isDragging ? {} : importanceStyle) }}>
                        <span className="node-time-label" style={{ fontSize: '0.65rem', fontWeight: 'bold', color: isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (bioTypeBorder || pointBorderColor)), marginBottom: '2px', transition: 'color 0.2s' }}>
                          {timeLabelStr}
                        </span>
                        <span style={{ lineHeight: 1, fontSize: isPesi ? '0.55rem' : '1rem', fontWeight: isPesi ? 'bold' : 'normal', color: isStimulant ? '#f59e0b' : (isWater ? '#00e5ff' : (bioTypeBorder || (isPesi ? pointBorderColor : 'inherit'))) }}>{iconContent}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
            {/* SPACER PER PULSANTIERA: Permette di scrollare oltre la fine del grafico per non coprire le 24:00 */}
            <div style={{ width: '80px', flexShrink: 0 }}></div>
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
          />
        )}
      </>
      )}

      {/* Cruscotto Essenziale (Modalità Base) - ottimizzazione spaziale */}
      {userProfile?.level !== 'pro' && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'max(10px, 1.2vh)', padding: 'max(10px, 1.2vh) 14px', marginBottom: '12px', overflow: 'hidden' }}>
          {/* Radar Container: Tachimetro centrale + riga macro sotto */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginBottom: '12px', flex: 1, minHeight: 0 }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '360px', aspectRatio: '1', margin: '0 auto', overflow: 'visible' }} onClick={() => setSelectedMealCenter(null)}>
              {/* Layer 1: Centro Interattivo (Totali o Dettaglio Pasto) */}
              <div
                className={selectedMealCenter ? 'tachimeter-center tachimeter-center-reset' : 'tachimeter-center'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedMealCenter) {
                    const mealNode = allNodes.find(n => n.type === 'meal' && (n.id === selectedMealCenter.id || n.id === (selectedMealCenter.id && String(selectedMealCenter.id).split('_')[0])));
                    if (mealNode) handleNodeTap(mealNode)();
                  }
                }}
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '66%', height: '66%', borderRadius: '50%', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '3px solid #111', zIndex: 15, boxShadow: `0 0 35px ${(dynamicDailyKcal - (totali?.kcal || 0)) >= 0 ? 'rgba(0,229,255,0.15)' : 'rgba(255,77,77,0.3)'}`, cursor: selectedMealCenter ? 'pointer' : 'default', transition: 'box-shadow 0.2s ease, filter 0.2s ease', pointerEvents: selectedMealCenter ? 'auto' : 'none' }}
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
                    <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#888', marginTop: '2px' }}>
                      {Math.round(selectedMealCenter.kcal ?? selectedMealCenter.value ?? 0)} kcal
                    </div>
                    <div className="pieMealMacros">
                      P {Math.round(selectedMealCenter.prot ?? selectedMealCenter.payload?.macros?.pro ?? 0)}g
                      C {Math.round(selectedMealCenter.carb ?? selectedMealCenter.payload?.macros?.carb ?? 0)}g
                      F {Math.round(selectedMealCenter.fat ?? selectedMealCenter.payload?.macros?.fat ?? 0)}g
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: '0.9rem', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Bilancio</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff' }}>
                      {Math.round(totali?.kcal || 0)} <span style={{ fontSize: '0.9rem', color: '#aaa', fontWeight: 'normal' }}>/ {Math.round(baseKcal || 0)}</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Layer 2: Grafico a Torta */}
              <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mealPieData}
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
                        if (selectedMealCenter && selectedMealCenter.id === data.id) {
                          const mealNode = allNodes.find(n => n.type === 'meal' && (n.id === data.id || n.id === (data.id && data.id.split('_')[0])));
                          if (mealNode) handleNodeTap(mealNode)();
                        } else {
                          setSelectedMealCenter({ id: data.id, name: data.name, value: data.value, color: data.color, fill: data.fill, timeValue: data.timeValue, payload: { color: data.color, macros: data.macros }, prot: data.prot, carb: data.carb, fat: data.fat });
                        }
                      }}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      {mealPieData.map((entry, index) => {
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

            {/* Riga widget macro: griglia 4 colonne fissa */}
            <div className="macrosRow" style={{ width: '100%', marginTop: '25px', padding: '0 10px', position: 'relative', zIndex: 10 }}>
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

          {/* Widget Orologio Metabolico (Digiuno) - compatto */}
          {(() => {
            let faseText = fastingData.phaseName || 'Assorbimento';
            let faseColor = '#00e5ff';
            if (faseText.toLowerCase().includes('catabolismo')) {
              const svegliaTime = userTargets?.sveglia || 7;
              let oreDallaSveglia = displayTime - svegliaTime;
              if (oreDallaSveglia < 0) oreDallaSveglia += 24;
              if (oreDallaSveglia < 5) {
                faseText = 'Lipolisi Basale (Digiuno Notturno)';
                faseColor = '#00e5ff';
              } else {
                faseText = '⚠️ Rischio Catabolismo Attivo';
                faseColor = '#ef4444';
              }
            } else if (faseText.toLowerCase().includes('lipolisi')) {
              faseText = 'Bruciagrassi (Lipolisi)';
              faseColor = '#00e5ff';
            } else if (faseText.toLowerCase().includes('anaboli')) {
              faseText = 'Sintesi Proteica (Anabolismo)';
              faseColor = '#00e676';
            } else {
              faseText = 'Assorbimento / Neutra';
              faseColor = '#ffea00';
            }
            return (
          <div role="button" tabIndex={0} onClick={() => setShowMetabolicPopup(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMetabolicPopup(true); } }} style={{ width: '100%', maxWidth: '400px', margin: '0 auto', background: 'linear-gradient(145deg, #111, #0a0a0a)', border: '1px solid #222', borderRadius: '10px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.1rem', filter: `drop-shadow(0 0 5px ${faseColor})` }}>⏳</span>
                <div>
                  <div style={{ fontSize: '0.55rem', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1px' }}>Fase Metabolica</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: faseColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{faseText}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: '#888' }}>🕒 Digiuno</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>
                  {fastingData.hoursFasted >= 1 ? `${Math.floor(fastingData.hoursFasted)}h ${Math.round((fastingData.hoursFasted % 1) * 60)}m` : `${Math.round(fastingData.hoursFasted * 60)} min`}
                </span>
              </div>
            </div>
            <div style={{ height: '3px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${fastingData.progress}%`, height: '100%', background: faseColor, transition: 'width 1s ease-in-out', boxShadow: `0 0 10px ${faseColor}` }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#aaa', padding: '0 2px' }}>
              {fastingData.phaseDesc.split('•').map((pt, i) => (
                <span key={i}>• {pt.trim()}</span>
              ))}
            </div>
          </div>
            );
          })()}
        </div>
      )}

      {/* Barra trigger AI persistente (fixed in fondo) - Apre la chat reale */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', gap: '10px', alignItems: 'center', padding: '12px 15px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, #0a0a0a 100%)', borderTop: '1px solid #222', zIndex: 90 }}>
        <div
          onClick={() => { setActiveAction('ai_chat'); setIsDrawerOpen(true); }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', background: '#1a1a1a', borderRadius: '30px', padding: '12px 20px', border: '1px solid #333', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '1.2rem' }}>✨</span>
          <span style={{ color: '#888', fontSize: '0.95rem' }}>Chiedi a Core AI...</span>
        </div>
        <button type="button" onClick={() => { setShowChoiceModal(false); setIsDrawerOpen(true); setActiveAction(null); }} style={{ width: 50, height: 50, minWidth: 50, background: '#222', color: '#00e5ff', border: '1px solid #333', borderRadius: '16px', fontSize: '1.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: '0.3s', flexShrink: 0 }} aria-label="Aggiungi evento">+</button>
      </div>

      {/* --- CASSETTO AZIONI --- */}
      <div className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={closeDrawer}></div>
      
      <div className={`drawer-content ${isDrawerOpen ? 'open' : ''}`}>
        <div style={{ width: '40px', height: '4px', backgroundColor: '#444', borderRadius: '2px', margin: '0 auto 20px auto' }}></div>
        
        {/* VISTA MENU PRINCIPALE */}
        {(!activeAction || activeAction === 'home') && (
          <div className="view-animate">
            <h2 style={{ fontSize: '0.7rem', textAlign: 'center', color: '#777', letterSpacing: '3px', marginBottom: '20px', fontWeight: 'normal' }}>AGGIUNGI EVENTO</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px' }} onClick={() => { const predicted = predictMealType(getCurrentTimeRoundedTo15Min()); setMealType(predicted); setAddedFoods([]); setEditingMealId(null); const t = getCurrentTimeRoundedTo15Min(); setDrawerMealTime(t); setDrawerMealTimeStr(decimalToTimeStr(t)); setActiveAction('pasto'); setIsDrawerOpen(true); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>🥗</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>PASTO</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(0,229,255,0.4)' }} onClick={() => { setDrawerWaterTime(getCurrentTimeRoundedTo15Min()); setActiveAction('acqua'); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem', filter: 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.4))' }}>💧</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#00e5ff' }}>ACQUA</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(255, 109, 0, 0.4)' }} onClick={() => { const now = getCurrentTimeRoundedTo15Min(); setWorkoutStartTime(now); setWorkoutEndTime(Math.min(24, now + 0.5)); setActiveAction('allenamento'); setIsDrawerOpen(true); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem', filter: 'drop-shadow(0 0 8px rgba(255, 109, 0, 0.4))' }}>⚡</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#ff6d00' }}>ALLENAMENTO</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(180,120,60,0.5)' }} onClick={() => { closeDrawer(); setStimulantTime(getCurrentTimeRoundedTo15Min()); setStimulantSubtype('caffè'); setAddChoiceView('stimulant'); setShowChoiceModal(true); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>☕</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#d4a574' }}>CAFFÈ</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(129,140,248,0.4)' }} onClick={() => { const t = getCurrentTimeRoundedTo15Min(); setDrawerFastChargeStart(t); setDrawerFastChargeEnd(Math.min(24, t + 0.5)); setActiveAction('fast_charge_nap'); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>😴</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#a5b4fc' }}>PISOLINO</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(34,197,94,0.4)' }} onClick={() => { const t = getCurrentTimeRoundedTo15Min(); setDrawerFastChargeStart(t); setDrawerFastChargeEnd(Math.min(24, t + 0.5)); setActiveAction('fast_charge_meditation'); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>🧘</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#4ade80' }}>MEDITAZIONE</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(251,191,36,0.4)' }} onClick={() => { setDrawerFastChargeTime(getCurrentTimeRoundedTo15Min()); setActiveAction('fast_charge_sunlight'); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>☀️</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#fcd34d' }}>LUCE SOLARE</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(168,85,247,0.4)' }} onClick={() => { setDrawerFastChargeTime(getCurrentTimeRoundedTo15Min()); setFastChargeSupplementName(''); setActiveAction('fast_charge_supplements'); }}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>💊</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#c084fc' }}>INTEGRAZIONE</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(0,230,118,0.4)' }} onClick={() => setActiveAction('diario_giornaliero')}>
                <span className="action-icon" style={{ fontSize: '1.8rem', filter: 'drop-shadow(0 0 8px rgba(0, 230, 118, 0.4))' }}>📖</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#00e676' }}>DIARIO</span>
              </button>
              <button className="action-btn" style={{ aspectRatio: '1', borderRadius: '50%', padding: '12px', flexDirection: 'column', gap: '6px', borderColor: 'rgba(176,190,197,0.3)' }} onClick={() => setActiveAction('menu_secondary')}>
                <span className="action-icon" style={{ fontSize: '1.8rem' }}>☰</span><span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: '#b0bec5' }}>MENU</span>
              </button>
            </div>
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
              <button className="action-btn" onClick={() => setActiveAction('focus')}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 192, 45, 0.4))' }}>🧘</span><span className="action-label" style={{ color: '#fbc02d' }}>Neural Reset</span></button>
              <button className="action-btn" onClick={() => setActiveAction('ai_chat')} style={{ background: 'linear-gradient(145deg, rgba(26, 26, 36, 0.9), rgba(18, 16, 28, 0.9))', borderColor: '#3a2a4a' }}>
                <span className="action-icon" style={{ filter: 'drop-shadow(0 0 10px rgba(179, 136, 255, 0.5))' }}>✨</span><span className="action-label" style={{ color: '#b388ff' }}>Core AI</span>
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
          <AiCluster
            chatHistory={chatHistory}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatImages={chatImages}
            setChatImages={setChatImages}
            onSendMessage={handleChatSubmit}
            showAiSettings={showAiSettings}
            setShowAiSettings={setShowAiSettings}
            apiKeys={apiKeys}
            onKeyChange={handleKeyChange}
            onRemoveKey={handleRemoveKey}
            onAddKey={handleAddKey}
            onSaveApiCluster={saveApiCluster}
            onBack={() => setActiveAction(null)}
          />
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
                  const startP = (n.time / 24) * 100;
                  const durP = isWork ? ((n.duration || 1) / 24) * 100 : 0;
                  if (isWork) {
                    return (
                      <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
                    );
                  }
                  return (
                    <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
                  );
                })}
                <div className="mini-timeline-hitbox" role="slider" aria-label="Ora acqua" onPointerDown={(e) => handleMiniTimelineDrag(e, miniTimelineWaterRef, 'point', drawerWaterTime, null, setDrawerWaterTime, null)} style={{ position: 'absolute', left: `${(drawerWaterTime / 24) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, touchAction: 'none' }}>
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
              <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '12px', textTransform: 'uppercase' }}>ORA INIZIO – ORA FINE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input type="time" value={decimalToTimeStr(drawerFastChargeStart)} onChange={(e) => setDrawerFastChargeStart(parseTimeStrToDecimal(e.target.value))} style={{ flex: 1, minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #818cf8', borderRadius: '10px', color: '#a5b4fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }} />
                <span style={{ color: '#666' }}>–</span>
                <input type="time" value={decimalToTimeStr(drawerFastChargeEnd)} onChange={(e) => setDrawerFastChargeEnd(parseTimeStrToDecimal(e.target.value))} style={{ flex: 1, minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #818cf8', borderRadius: '10px', color: '#a5b4fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }} />
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

        {/* VISTA FAST CHARGE - LUCE SOLARE */}
        {activeAction === 'fast_charge_sunlight' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#fbbf24', letterSpacing: '2px', margin: 0 }}>☀️ LUCE SOLARE</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '16px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '12px', textTransform: 'uppercase' }}>ORARIO ESPOSIZIONE</div>
              <input type="time" value={decimalToTimeStr(drawerFastChargeTime)} onChange={(e) => setDrawerFastChargeTime(parseTimeStrToDecimal(e.target.value))} style={{ width: '100%', padding: '12px', background: '#1a1a1a', border: '1px solid #fbbf24', borderRadius: '10px', color: '#fcd34d', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }} />
            </div>
            <button onClick={() => handleSaveFastCharge('sunlight')} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #d97706, #fbbf24)', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(251,191,36,0.4)' }}>SALVA</button>
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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '30px' }}>
              {['pesi', 'cardio', 'hiit', 'lavoro'].map(type => (
                <button key={type} className={`type-btn ${workoutType === type ? 'active orange' : ''}`} onClick={() => setWorkoutType(type)}>
                  {type === 'pesi' ? '🏋️ PESI' : type === 'cardio' ? '🏃 CARDIO' : type === 'hiit' ? '🔥 HIIT' : '💼 LAVORO'}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '0.7rem', marginBottom: '8px', gap: '8px' }}>
                <span>0:00</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="time" value={decimalToTimeStr(workoutStartTime)} onChange={(e) => setWorkoutStartTime(Math.min(workoutEndTime - 0.25, parseTimeStrToDecimal(e.target.value)))} style={{ width: '130px', minWidth: '110px', padding: '6px 8px', background: '#1a1a1a', border: '1px solid #ff6d00', borderRadius: '8px', color: '#ff6d00', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }} />
                  <span style={{ color: '#666' }}>–</span>
                  <input type="time" value={decimalToTimeStr(workoutEndTime)} onChange={(e) => setWorkoutEndTime(Math.max(workoutStartTime + 0.25, parseTimeStrToDecimal(e.target.value)))} style={{ width: '130px', minWidth: '110px', padding: '6px 8px', background: '#1a1a1a', border: '1px solid #ff6d00', borderRadius: '8px', color: '#ff6d00', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }} />
                </div>
                <span>24:00</span>
              </div>
              <div ref={miniTimelineActivityRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
                {allNodes.filter(n => n.id !== editingWorkoutId).map(n => {
                  const isWork = n.type === 'work';
                  const startP = (n.time / 24) * 100;
                  const durP = isWork ? ((n.duration || 1) / 24) * 100 : 0;
                  const isPesi = n.type === 'workout' && n.subType === 'pesi' && n.muscles?.length > 0;
                  const iconContent = isPesi ? n.muscles.map(m => m.substring(0, 2).toUpperCase()).join('+') : (n.icon || '•');
                  if (isWork) {
                    return (
                      <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }}></div>
                    );
                  }
                  return (
                    <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none', fontSize: '0.5rem' }}>
                      <span style={{ lineHeight: 1 }}>{iconContent}</span>
                    </div>
                  );
                })}
                <div className="mini-timeline-bar-wrap" onPointerDown={(e) => handleMiniTimelineDrag(e, miniTimelineActivityRef, 'bar-all', workoutStartTime, workoutEndTime, setWorkoutStartTime, setWorkoutEndTime)} style={{ position: 'absolute', left: `${(workoutStartTime/24)*100}%`, width: `${((workoutEndTime - workoutStartTime)/24)*100}%`, top: '50%', transform: 'translateY(-50%)', height: '24px', background: 'rgba(255, 109, 0, 0.4)', border: '1px solid #ff6d00', borderRadius: '4px', cursor: 'grab', zIndex: 10, touchAction: 'none' }}>
                  <div className="mini-timeline-hitbox" role="slider" aria-label="Inizio attività" onPointerDown={(e) => { e.stopPropagation(); handleMiniTimelineDrag(e, miniTimelineActivityRef, 'bar-start', workoutStartTime, workoutEndTime, setWorkoutStartTime, setWorkoutEndTime); }} style={{ position: 'absolute', left: '-22px', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11 }}>
                    <div style={{ width: '12px', height: '24px', background: '#ff6d00', borderRadius: '4px', pointerEvents: 'none' }}></div>
                  </div>
                  <div className="mini-timeline-hitbox" role="slider" aria-label="Fine attività" onPointerDown={(e) => { e.stopPropagation(); handleMiniTimelineDrag(e, miniTimelineActivityRef, 'bar-end', workoutStartTime, workoutEndTime, setWorkoutStartTime, setWorkoutEndTime); }} style={{ position: 'absolute', right: '-22px', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11 }}>
                    <div style={{ width: '12px', height: '24px', background: '#ff6d00', borderRadius: '4px', pointerEvents: 'none' }}></div>
                  </div>
                </div>
              </div>
            </div>
            {workoutType === 'pesi' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>Gruppi Muscolari (Max 2)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['Gambe', 'Petto', 'Tricipiti', 'Bicipiti', 'ABS', 'Schiena', 'Spalle'].map(m => {
                    const isActive = workoutMuscles.includes(m);
                    return (
                      <button key={m} type="button" onClick={() => {
                        setWorkoutMuscles(prev => {
                          if (prev.includes(m)) return prev.filter(x => x !== m);
                          if (prev.length >= 2) return [prev[1], m];
                          return [...prev, m];
                        });
                      }} style={{ padding: '8px 12px', fontSize: '0.75rem', borderRadius: '20px', border: '1px solid #444', background: isActive ? '#ff6d00' : '#222', color: isActive ? '#000' : '#aaa', fontWeight: isActive ? 'bold' : 'normal', cursor: 'pointer' }}>
                        {m}
                      </button>
                    );
                  })}
                </div>
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
        {activeAction === 'pasto' && (
          <MealBuilder
            onClose={() => setActiveAction(null)}
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
            totali={totali}
            userTargets={userTargets}
            dynamicDailyKcal={dynamicDailyKcal}
            renderLiveProgressBar={renderLiveProgressBar}
            renderMiniBar={renderMiniBar}
            renderProgressBar={renderProgressBar}
            renderRatioBar={renderRatioBar}
            mealTotaliFull={mealTotaliFull}
            targetMacrosPasto={targetMacrosPasto}
            ratio={ratio}
            energyAt20Percent={energyAt20Percent}
            isBarcodeScannerOpen={isBarcodeScannerOpen}
            setIsBarcodeScannerOpen={setIsBarcodeScannerOpen}
            barcodeVideoRef={barcodeVideoRef}
            onCloseBarcodeScanner={closeBarcodeScanner}
            foodInputRef={foodInputRef}
            foodNameInput={foodNameInput}
            setFoodNameInput={setFoodNameInput}
            foodWeightInput={foodWeightInput}
            setFoodWeightInput={setFoodWeightInput}
            handleAddFoodManual={handleAddFoodManual}
            foodDropdownSuggestions={foodDropdownSuggestions}
            getLastQuantityForFood={getLastQuantityForFood}
            showFoodDropdown={showFoodDropdown}
            setShowFoodDropdown={setShowFoodDropdown}
            generateFoodWithAI={generateFoodWithAI}
            isGeneratingFood={isGeneratingFood}
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
          />
        )}

        {/* VISTA DIARIO GIORNALIERO */}
        {activeAction === 'diario_giornaliero' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#00e676', letterSpacing: '2px', margin: 0 }}>📓 DIARIO GIORNALIERO</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#111', padding: '5px', borderRadius: '15px' }}>
              <button className={`type-btn ${diarioTab === 'storico' ? 'active blue' : ''}`} onClick={() => setDiarioTab('storico')} style={{ border: 'none' }}>OGGI</button>
              <button className={`type-btn ${diarioTab === 'telemetria' ? 'active blue' : ''}`} onClick={() => setDiarioTab('telemetria')} style={{ border: 'none' }}>TELEMETRIA (40)</button>
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
                      <span style={{ color: '#888', fontSize: '0.9rem' }}>
                        Sveglia ore {Math.floor(item.wakeTime)}:{String(Math.round((item.wakeTime % 1) * 60)).padStart(2, '0')}
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
                    <button
                      type="button"
                      onClick={() => removeLogItem(item.id)}
                      style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', color: '#ff4d4d', fontSize: '0.8rem', cursor: 'pointer', marginTop: '5px' }}
                    >
                      Rimuovi dati
                    </button>
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
                  Object.keys(groupedFoods).map(slotKey => {
                    const items = groupedFoods[slotKey];
                    const mType = items[0]?.mealType || slotKey.split('_')[0];
                    const baseType = mType.split('_')[0];
                    const suffixType = mType.includes('_') ? ` ${mType.split('_')[1]}` : '';
                    const mTime = items[0]?.mealTime ?? 12;
                    const label = `${MEAL_LABELS_SAVE[toCanonicalMealType(baseType)] || baseType}${suffixType} (${decimalToTimeStr(mTime)})`;

                    return (
                      <div key={slotKey} style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '0.7rem', color: '#888', letterSpacing: '1px', margin: 0, cursor: 'pointer', flex: 1 }} onClick={() => setSelectedNodeReport({ id: slotKey, type: 'meal' })}>
                            {label}
                          </h4>
                          <button type="button" className="food-pill-btn" onClick={() => setSelectedNodeReport({ id: slotKey, type: 'meal' })} title="Dettaglio pasto">✏️</button>
                        </div>
                        {items.map(food => (
                          <div key={food.id} className="food-pill" style={{ borderLeft: '3px solid #333', cursor: 'pointer' }} onClick={() => setSelectedNodeReport({ id: slotKey, type: 'meal' })}>
                            <div>
                              <span className="food-pill-name">{food.desc || food.name}</span>
                              <span className="food-pill-weight">{food.qta || food.weight}g</span>
                            </div>
                            <div className="food-pill-actions" onClick={(e) => e.stopPropagation()}>
                              <button className="food-pill-btn" onClick={(e) => { e.stopPropagation(); setSelectedFoodForInfo(food); }} title="Info macro/micro">ℹ️</button>
                              <button className="food-pill-btn" onClick={(e) => { e.stopPropagation(); setSelectedNodeReport({ id: slotKey, type: 'meal' }); }} title="Dettaglio pasto">✏️</button>
                              <div style={{ fontSize: '0.75rem', color: '#888', marginRight: '10px' }}>{Math.round(food.kcal || food.cal || 0)} kcal</div>
                              <button className="food-pill-btn btn-delete" onClick={(e) => { e.stopPropagation(); removeLogItem(food.id); }}>✕</button>
                            </div>
                          </div>
                        ))}
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
        {activeAction === 'storico' && (() => {
          // Calcolo Bilancio Settimanale (ultimi 7 giorni utili)
          const historyArray = pastDaysStorico || [];
          const last7Days = historyArray.slice(0, 7);
          let sumKcalIn = 0;
          let sumKcalTarget = 0;
          last7Days.forEach(day => {
            const assunte = day.calorie ?? day.totali?.kcal ?? day.kcalAssunte ?? 0;
            const target = (day.calorie != null && day.deficit != null) ? (day.calorie - day.deficit) : (day.userTargets?.kcal ?? day.targetKcal ?? 2500);
            sumKcalIn += assunte;
            sumKcalTarget += target;
          });
          const diffKcal = Math.round(sumKcalIn - sumKcalTarget);
          const isSurplus = diffKcal > 0;
          const avgDiffKcal = last7Days.length > 0 ? Math.round(diffKcal / last7Days.length) : 0;

          return (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>📚 ARCHIVIO STORICO</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            {last7Days.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '15px', padding: '20px', marginBottom: '25px', border: `1px solid ${isSurplus ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 230, 118, 0.4)'}` }}>
                <h3 style={{ color: '#fff', margin: '0 0 15px 0', fontSize: '1.1rem', textAlign: 'center' }}>
                  ⚖️ Bilancio Ultimi 7 Giorni
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#aaa' }}>Totale Assunto</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{Math.round(sumKcalIn)}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0 15px', borderLeft: '1px solid #333', borderRight: '1px solid #333' }}>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Esito Settimanale</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: isSurplus ? '#ef4444' : '#00e676' }}>
                      {isSurplus ? '+' : ''}{diffKcal} <span style={{ fontSize: '0.9rem' }}>kcal</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: isSurplus ? '#ef4444' : '#00e676', marginTop: '5px' }}>
                      Media: {isSurplus ? '+' : ''}{avgDiffKcal} kcal / giorno
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#aaa' }}>Totale Target</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{Math.round(sumKcalTarget)}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.8rem', color: '#888' }}>
                  {isSurplus
                    ? 'Sei in Surplus calorico. Ideale per la costruzione muscolare, attenzione all\'accumulo di grasso se eccessivo.'
                    : 'Sei in Deficit calorico. Ideale per la definizione o perdita di peso.'}
                </div>
              </div>
            )}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', letterSpacing: '1px', marginBottom: '8px' }}>Cerca per data</label>
              <input
                type="date"
                value={selectedHistoryDate}
                onChange={(e) => setSelectedHistoryDate(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
            {weeklyTrendData.length > 0 && (() => {
              const totalDeepFastingHours = weeklyTrendData.reduce((acc, d) => acc + (d.maxFastingHours != null && d.maxFastingHours > 12 ? d.maxFastingHours - 12 : 0), 0);
              return (
                <div style={{ marginBottom: '16px', padding: '12px 15px', borderRadius: '12px', border: '1px solid rgba(156, 39, 176, 0.4)', background: 'rgba(156, 39, 176, 0.08)' }}>
                  <h4 style={{ fontSize: '0.7rem', color: '#ce93d8', letterSpacing: '1px', marginBottom: '8px' }}>Digiuno Settimanale</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#e1bee7' }}>
                    Negli ultimi 7 giorni: <strong style={{ color: '#ffea00' }}>{totalDeepFastingHours.toFixed(1)} h</strong> in digiuno profondo (Chetosi/Autofagia, &gt;12 h consecutive).
                  </p>
                </div>
              );
            })()}
            <div style={{ marginBottom: '24px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
              <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '15px' }}>TREND CALORICO ULTIMI 7 GIORNI</h4>
              {weeklyTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={weeklyTrendData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                    <XAxis dataKey="shortDate" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, (min, max) => (max ?? 0) + 200]} tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', fontSize: '0.8rem' }} />
                    <ReferenceLine y={userTargets.kcal ?? STRATEGY_PROFILES[dayProfile]?.kcal ?? 2300} stroke="rgba(0, 229, 255, 0.4)" strokeDasharray="3 3" />
                    <Bar dataKey="calorie" fill="#b0bec5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>Dati insufficienti per il trend settimanale.</p>
              )}
            </div>
            {weeklyTrendData.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                  <h4 style={{ fontSize: '0.65rem', color: '#ffea00', letterSpacing: '1px', marginBottom: '15px' }}>GRASSI (7 GIORNI)</h4>
                  {renderWeeklyBar('Grassi Totali', weeklyMicrosTotals.fatTotal, userTargets.fatTotal ?? TARGETS.macro.fatTotal, 'g', 'fatTotal')}
                  {renderWeeklyBar('Omega 3', weeklyMicrosTotals.omega3, userTargets.omega3 ?? TARGETS.fat.omega3, 'g', 'omega3')}
                  {renderWeeklyBar('Omega 6', weeklyMicrosTotals.omega6, TARGETS.fat.omega6, 'g', 'omega6')}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                  <h4 style={{ fontSize: '0.65rem', color: '#00e676', letterSpacing: '1px', marginBottom: '15px' }}>ACCUMULABILI (LIPO + B12)</h4>
                  {renderWeeklyBar('Vitamina A', weeklyMicrosTotals.vitA, TARGETS.vit.vitA, 'µg', 'vitA')}
                  {renderWeeklyBar('Vitamina D', weeklyMicrosTotals.vitD, userTargets.vitD ?? TARGETS.vit.vitD, 'µg', 'vitD')}
                  {renderWeeklyBar('Vitamina E', weeklyMicrosTotals.vitE, TARGETS.vit.vitE, 'mg', 'vitE')}
                  {renderWeeklyBar('Vitamina K', weeklyMicrosTotals.vitK, TARGETS.vit.vitK, 'µg', 'vitK')}
                  {renderWeeklyBar('Vitamina B12', weeklyMicrosTotals.vitB12, TARGETS.vit.vitB12, 'µg', 'vitB12')}
                </div>
              </div>
            )}
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
          );
        })()}

        {/* VISTA ZEN */}
        {activeAction === 'focus' && (
          <div className="view-animate">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <button onClick={() => { setIsZenActive(false); setActiveAction(null); }} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
              <h2 style={{ fontSize: '0.8rem', color: '#fbc02d', letterSpacing: '2px', margin: 0 }}>🧘 NEURAL RESET</h2>
              <div style={{ width: '70px' }}></div>
            </div>
            <p style={{ textAlign: 'center', color: '#888', fontSize: '0.75rem', marginBottom: '20px' }}>Sincronizza il respiro con l'anello per abbassare il ritmo cardiaco.</p>
            <div className="zen-container">
              <div className={`zen-orb ${isZenActive ? 'breathing' : ''}`}></div>
              <div className="zen-rings"></div>
              <div className="zen-instruction" style={{ display: isZenActive ? 'block' : 'none' }}></div>
              {!isZenActive && <div style={{ position: 'absolute', bottom: '0', fontSize: '0.8rem', color: '#555', letterSpacing: '2px' }}>IN ATTESA</div>}
            </div>
            <button onClick={() => setIsZenActive(!isZenActive)} style={{ width: '100%', padding: '18px', backgroundColor: isZenActive ? '#222' : '#fbc02d', color: isZenActive ? '#fbc02d' : '#000', border: isZenActive ? '1px solid #fbc02d' : 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.3s', boxShadow: isZenActive ? 'none' : '0 0 20px rgba(251, 192, 45, 0.3)' }}>
              {isZenActive ? 'TERMINA SESSIONE' : 'AVVIA CICLO'}
            </button>
          </div>
        )}

        {/* Modale Info alimento */}
        {selectedFoodForInfo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => setSelectedFoodForInfo(null)}>
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: '16px', maxWidth: '400px', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '20px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#00e5ff' }}>{selectedFoodForInfo.desc || selectedFoodForInfo.name}</h3>
                <button style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setSelectedFoodForInfo(null)}>✕</button>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '12px' }}>{(selectedFoodForInfo.qta ?? selectedFoodForInfo.weight ?? 100)} g</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
                <span style={{ color: '#aaa' }}>Kcal</span><span style={{ color: '#fff' }}>{Math.round(selectedFoodForInfo.kcal ?? selectedFoodForInfo.cal ?? 0)}</span>
                <span style={{ color: '#aaa' }}>Proteine</span><span style={{ color: '#fff' }}>{(Number(selectedFoodForInfo.prot) ?? 0).toFixed(1)} g</span>
                <span style={{ color: '#aaa' }}>Carboidrati</span><span style={{ color: '#fff' }}>{(Number(selectedFoodForInfo.carb) ?? 0).toFixed(1)} g</span>
                <span style={{ color: '#aaa' }}>Grassi</span><span style={{ color: '#fff' }}>{(Number(selectedFoodForInfo.fatTotal) ?? 0).toFixed(1)} g</span>
                <span style={{ color: '#aaa' }}>Fibre</span><span style={{ color: '#fff' }}>{(Number(selectedFoodForInfo.fibre) ?? 0).toFixed(1)} g</span>
              </div>
              <div style={{ marginTop: '16px', fontSize: '0.7rem', color: '#666' }}>Vitamine e minerali disponibili nel motore biochimico (40+ parametri) sono inclusi nel calcolo giornaliero.</div>
            </div>
          </div>
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
                  const newItem = { ...estraiDatiFoodDb(food.desc || food.name, qta, food.mealType), id: food.id };
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

      </div>
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
        <div className="report-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#fff', color: '#000', zIndex: 9999, overflowY: 'auto', padding: '20px' }}>
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
              <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>🖨️ Stampa PDF</button>
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
      {showProfile && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 10000, overflowY: 'auto', padding: '20px' }}>
          <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '16px', maxWidth: '600px', margin: '0 auto', color: '#fff' }}>
            <h2 style={{ color: '#00e5ff', borderBottom: '1px solid #333', paddingBottom: '10px' }}>⚙️ Impostazioni Universali</h2>

            <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>1. Dati Biometrici</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <label style={{ display: 'block' }}>Sesso: <select value={userProfile.gender} onChange={e => setUserProfile({ ...userProfile, gender: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}><option value="M">Uomo</option><option value="F">Donna</option></select></label>
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
                <label style={{ display: 'block' }}>Obiettivo:
                  <select value={userProfile.goal} onChange={e => setUserProfile({ ...userProfile, goal: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                    <option value="lose">Dimagrimento</option>
                    <option value="maintain">Mantenimento</option>
                    <option value="gain">Aumento Massa</option>
                  </select>
                </label>
                <label style={{ display: 'block' }}>Livello interfaccia:
                  <select value={userProfile.level || 'pro'} onChange={e => setUserProfile({ ...userProfile, level: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                    <option value="base">Base (semplificata)</option>
                    <option value="pro">Pro (grafici e telemetria)</option>
                  </select>
                </label>
              </div>
              <button type="button" onClick={calculateSmartTargets} style={{ width: '100%', padding: '12px', marginTop: '15px', background: '#ff9800', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✨ Auto-Calcola Target</button>
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

            <div style={{ display: 'flex', gap: '15px' }}>
              <button type="button" onClick={() => setShowProfile(false)} style={{ flex: 1, padding: '12px', background: '#444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Annulla</button>
              <button type="button" onClick={() => saveProfileToFirebase(userProfile, userTargets)} style={{ flex: 2, padding: '12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Salva Profilo</button>
            </div>
          </div>
        </div>
      )}
      {/* Pop-up Scelta Azione (Ottimizzato per schermi piccoli) */}
      {showChoiceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '15px' }} onClick={() => { setShowChoiceModal(false); setAddChoiceView('main'); }}>
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
              <>
                <h3 style={{ margin: '0 0 10px 0', textAlign: 'center', color: '#fff', fontSize: '1.1rem', letterSpacing: '2px' }}>AGGIUNGI EVENTO</h3>

                <button onClick={() => { const predicted = predictMealType(getCurrentTimeRoundedTo15Min()); setMealType(predicted); setAddedFoods([]); setEditingMealId(null); const t = getCurrentTimeRoundedTo15Min(); setDrawerMealTime(t); setDrawerMealTimeStr(decimalToTimeStr(t)); setShowChoiceModal(false); setActiveAction('pasto'); setIsDrawerOpen(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: '15px', borderRadius: '15px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>🍎</span> PASTO
                </button>

                <button onClick={() => { const now = getCurrentTimeRoundedTo15Min(); setWorkoutStartTime(now); setWorkoutEndTime(Math.min(24, now + 0.5)); setShowChoiceModal(false); setActiveAction('allenamento'); setIsDrawerOpen(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: '15px', borderRadius: '15px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>💪</span> ALLENAMENTO
                </button>

                <button onClick={() => { setDrawerWaterTime(getCurrentTimeRoundedTo15Min()); setShowChoiceModal(false); setActiveAction('acqua'); setIsDrawerOpen(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: '15px', borderRadius: '15px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>💧</span> ACQUA
                </button>

                <button onClick={() => { setStimulantTime(getCurrentTimeRoundedTo15Min()); setStimulantSubtype('caffè'); setAddChoiceView('stimulant'); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '15px', borderRadius: '15px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>☕</span> ENERGIZZANTE
                </button>

                <button onClick={() => { setShowChoiceModal(false); setActiveAction(null); setIsDrawerOpen(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '15px', borderRadius: '15px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>⚙️</span> MENÙ PRINCIPALE
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pop-up Info Spie (Ottimizzato per schermi piccoli) */}
      {showSpieInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '15px' }} onClick={() => setShowSpieInfo(false)}>
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
              <button onClick={() => {
                setShowSleepPrompt(false);
              }}>
                Inserisci sonno
              </button>
              <button onClick={() => {
                const sleepEntry = { type: 'sleep', hours: 7, deepMin: 60, remMin: 60, wakeTime: 7.5 };
                if (isSimulationMode) {
                  setSimulatedLog(prev => [...(prev || []), sleepEntry]);
                } else {
                  setDailyLog(prev => [...prev, sleepEntry]);
                }
                setShowSleepPrompt(false);
              }}>
                Usa valori medi
              </button>
              <button onClick={() => setShowSleepPrompt(false)}>
                Dopo
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuickNode && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditingQuickNode(null)}>
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

      {selectedNodeReport && (
        <div className="modal-overlay" onClick={() => setSelectedNodeReport(null)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#1e1e1e', color: '#fff', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 20px 0', borderBottom: '1px solid #333', paddingBottom: '10px', color: '#00e5ff' }}>
              {selectedNodeReport.type === 'meal' ? '🍽️ Dettaglio Pasto' : '💪 Dettaglio Attività'}
            </h2>

            {selectedNodeReport.type === 'meal' ? (
              <div>
                {(() => {
                  const items = (activeLog || []).filter(item => getSlotKey(item) === String(selectedNodeReport.id));
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
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 25px 0', maxHeight: '200px', overflowY: 'auto' }}>
                        {items.map(item => (
                          <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #333' }}>
                            <span>{item.name || item.desc}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                          </li>
                        ))}
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
                if (node.type === 'meal') {
                  loadMealToConstructor(node.id);
                  setDrawerMealTime(node.time ?? 12);
                  setDrawerMealTimeStr(decimalToTimeStr(node.time ?? 12));
                  setIsDrawerOpen(true);
                } else {
                  setEditingWorkoutId(node.id);
                  setWorkoutType(node.subType || (node.type === 'work' ? 'lavoro' : 'pesi'));
                  setWorkoutStartTime(node.time ?? 12);
                  setWorkoutEndTime((node.time ?? 12) + (node.duration ?? 1));
                  setWorkoutKcal(node.kcal || node.cal || 300);
                  setWorkoutMuscles(Array.isArray(node.muscles) ? [...node.muscles] : (Array.isArray(node.workoutMuscles) ? [...node.workoutMuscles] : []));
                  setActiveAction('allenamento');
                  setIsDrawerOpen(true);
                }
              }} style={{ flex: 1, padding: '12px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                ✏️ Modifica
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE ISPEZIONE E MODIFICA ALIMENTO */}
      {inspectedFood && editFoodData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', backdropFilter: 'blur(5px)' }}>
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
                {isAIVerifying ? '⏳ Analisi in corso...' : '✨ Verifica Correttezza (AI)'}
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

      {showTelemetryPopup && (
        <div className="modal-overlay" onClick={() => setShowTelemetryPopup(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px' }}>
          
          {/* Contenitore Modale: 90vh di altezza, layout Flex a colonna */}
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#1e1e1e', color: '#fff', padding: '20px', borderRadius: '20px', width: '100%', maxWidth: '500px', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            
            {/* Header Fisso */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '12px', flexShrink: 0 }}>
              <h2 style={{ margin: 0, color: '#00e676', fontSize: '1.2rem', letterSpacing: '2px' }}>📊 TELEMETRIA</h2>
              <button type="button" onClick={() => setShowTelemetryPopup(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: '0 10px' }}>✕</button>
            </div>
            
            {/* Bottoni Navigazione Fissi - sticky per non essere coperti allo scroll */}
            <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#1e1e1e', paddingBottom: '10px', flexShrink: 0, display: 'flex', gap: '8px', marginBottom: '5px', overflowX: 'auto' }}>
              {TELEMETRY_TABS.map(t => (
                <button 
                  key={t} 
                  type="button" 
                  onClick={() => scrollToPopupTelemetryTab(t)} 
                  style={{ padding: '10px 18px', fontSize: '0.75rem', fontWeight: 'bold', background: telemetrySubTab === t ? '#00e676' : '#111', color: telemetrySubTab === t ? '#000' : '#888', border: 'none', borderRadius: '20px', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', transition: '0.3s' }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Carosello Elastico: Prende tutto lo spazio verticale rimanente, solo quest'area scrolla */}
            <div className="telemetry-carousel" ref={popupTelemetryScrollRef} onScroll={handlePopupTelemetryScroll} style={{ flex: 1, minHeight: 0, margin: 0, paddingBottom: '10px', overflowY: 'auto' }}>
              
              {/* Pagina MACRO */}
              <div className="telemetry-carousel-slide" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '15px', minHeight: '100%' }}>
                  {renderProgressBar('Calorie', totali.kcal || 0, dynamicDailyKcal, 'kcal', 'kcal')} 
                  {renderProgressBar('PROTEINE', totali.prot, userTargets.prot ?? TARGETS.macro.prot, 'g', 'prot')} 
                  {renderProgressBar('CARBOIDRATI', totali.carb, userTargets.carb ?? TARGETS.macro.carb, 'g', 'carb')} 
                  {renderProgressBar('GRASSI TOTALI', totali.fatTotal, userTargets.fatTotal ?? TARGETS.macro.fatTotal, 'g', 'fatTotal')}
                </div>
              </div>

              {/* Pagina BILANCI */}
              <div className="telemetry-carousel-slide" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '15px', minHeight: '100%' }}>
                  <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '15px', marginTop: 0 }}>RAPPORTI BIOCHIMICI</h4>
                  {renderRatioBar('Equilibrio Elettrolitico (Idratazione)', 'Sodio (Na)', totali?.na, 'Potassio (K)', totali?.k, 'Ideale: Na < K', (Number(totali?.na) || 0) < (Number(totali?.k) || 0))}
                  {renderRatioBar('Indice Infiammatorio (Grassi)', 'Omega 6', totali?.omega6, 'Omega 3', totali?.omega3, 'Ideale: W6:W3 < 4:1', (Number(totali?.omega6) || 0) <= (Number(totali?.omega3) || 1) * 4)}
                </div>
              </div>

              {/* Pagina AMINOACIDI */}
              <div className="telemetry-carousel-slide" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '15px', minHeight: '100%' }}>
                  {Object.keys(TARGETS.amino).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.amino[k], 'mg', k))}
                </div>
              </div>

              {/* Pagina VITAMINE */}
              <div className="telemetry-carousel-slide" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '15px', minHeight: '100%' }}>
                  {Object.keys(TARGETS.vit).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.vit[k], k === 'vitA' || k === 'b9' ? 'µg' : 'mg', k))}
                </div>
              </div>

              {/* Pagina MINERALI */}
              <div className="telemetry-carousel-slide" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '15px', minHeight: '100%' }}>
                  {Object.keys(TARGETS.min).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.min[k], k === 'se' ? 'µg' : 'mg', k))}
                </div>
              </div>

              {/* Pagina FAT (Grassi) */}
              <div className="telemetry-carousel-slide" style={{ overflowY: 'auto', height: '100%', paddingRight: '5px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '15px', minHeight: '100%' }}>
                  {renderProgressBar('Grassi Totali', totali.fatTotal || totali.fat || 0, userTargets.fatTotal ?? userTargets.fat ?? 70, 'g', 'fatTotal')} 
                  {Object.keys(TARGETS.fat).map(k => renderProgressBar(k.toUpperCase(), totali[k] || 0, TARGETS.fat[k], 'g', k))}
                  {(() => {
                    const omega3 = totali?.omega3 || 0;
                    const omega6 = totali?.omega6 || 0;
                    const omegaRatio = omega3 > 0 ? (omega6 / omega3).toFixed(1) : 'N/A';
                    const ratioColor = omegaRatio !== 'N/A' && Number(omegaRatio) <= 4 ? '#00e676' : '#ef4444';
                    return (
                      <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', textAlign: 'center', border: `1px solid ${ratioColor}33` }}>
                        <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Rapporto Omega-6 : Omega-3</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: ratioColor }}>
                          {omegaRatio} <span style={{ fontSize: '1rem', color: '#666' }}>: 1</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '5px' }}>Target salute ideale: inferiore a 4:1</div>
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* POP-UP DETTAGLIO ENERGIA E SCORE */}
      {showEnergyPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={() => setShowEnergyPopup(false)}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '25px', maxWidth: '400px', width: '100%', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #222', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚡ Stato Energetico</span>
              <span style={{ fontSize: '1.2rem', color: '#00e5ff' }}>{metabolicDayScore}/100</span>
            </h3>

            {energyIntervention && (
              <div style={{ marginBottom: '15px', padding: '12px', background: 'rgba(255,152,0,0.1)', border: '1px solid #ff9800', borderRadius: '10px', fontSize: '0.85rem', color: '#ff9800' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>⚠️ {energyIntervention.message}</strong>
                → {energyIntervention.suggestion}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase' }}>Metabolic Stress</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: metabolicStressIndex > 60 ? '#ff4d4d' : '#00e676' }}>{metabolicStressIndex} <span style={{ fontSize: '0.7rem', color: '#666' }}>/100</span></div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase' }}>Day Score</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#00e5ff' }}>{metabolicDayScore} <span style={{ fontSize: '0.7rem', color: '#666' }}>/100</span></div>
              </div>
            </div>

            {energyExplanation && energyExplanation.length > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '6px', fontWeight: 'bold' }}>Fattori d&apos;impatto attuali:</div>
                {energyExplanation.map((cause, i) => (
                  <div key={i} style={{ fontSize: '0.85rem', color: cause.direction === 'down' ? '#ff9800' : '#00e676', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{cause.direction === 'down' ? '📉' : '📈'}</span> {cause.text}
                  </div>
                ))}
              </div>
            )}

            {energyDrivers && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '6px', fontWeight: 'bold' }}>Variazioni (Drivers):</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
                  <div style={{ background: '#1a1a1a', padding: '8px', borderRadius: '8px', color: energyDrivers.digestion < 0 ? '#ff9800' : '#aaa' }}>⚙️ Digestione: {energyDrivers.digestion < 0 ? 'Alta (↓)' : 'Ok'}</div>
                  <div style={{ background: '#1a1a1a', padding: '8px', borderRadius: '8px', color: energyDrivers.stress < 0 ? '#ff9800' : '#aaa' }}>🧠 Stress: {energyDrivers.stress < 0 ? 'Alto (↓)' : 'Ok'}</div>
                  <div style={{ background: '#1a1a1a', padding: '8px', borderRadius: '8px', color: energyDrivers.glycemia > 0 ? '#00e676' : '#aaa' }}>🩸 Glicemia: {energyDrivers.glycemia > 0 ? 'Attiva (↑)' : 'Base'}</div>
                  <div style={{ background: '#1a1a1a', padding: '8px', borderRadius: '8px', color: energyDrivers.hydration > 0 ? '#00e676' : '#ff9800' }}>💧 Idratazione: {energyDrivers.hydration > 0 ? 'Ok (↑)' : 'Bassa (↓)'}</div>
                </div>
              </div>
            )}

            <button onClick={() => setShowEnergyPopup(false)} style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '12px', width: '100%', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* MODAL REPORT GIORNALIERO A 5 STELLE */}
      {showReportModal && dailyReport?.ready && dailyReportDisplay && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={() => setShowReportModal(false)}>
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
                  <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {emoji} {label}
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

      {/* POP-UP FASE METABOLICA */}
      {showMetabolicPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '25px', maxWidth: '400px', width: '100%', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #222', paddingBottom: '10px' }}>
              🧬 Stato Metabolico
            </h3>
            <p style={{ color: '#aaa', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Il tuo corpo attraversa diverse fasi durante la giornata:
            </p>
            <ul style={{ color: '#ccc', fontSize: '0.85rem', lineHeight: 1.6, paddingLeft: '20px', marginBottom: '20px' }}>
              <li><strong style={{ color: '#00e5ff' }}>Lipolisi Basale:</strong> Attiva al mattino o a digiuno. Il corpo usa i grassi per l'energia base. È sano e non intacca il muscolo.</li>
              <li><strong style={{ color: '#00e676' }}>Anabolismo:</strong> Attiva dopo i pasti. Il corpo costruisce e ripara i tessuti muscolari (Fondamentale post-allenamento).</li>
              <li><strong style={{ color: '#ef4444' }}>Catabolismo:</strong> Allarme rosso. L'energia è sotto la soglia critica; il corpo smonta le fibre muscolari per sopravvivere. Avviene dopo sforzi intensi senza nutrizione.</li>
            </ul>
            <button type="button" onClick={() => setShowMetabolicPopup(false)} style={{ background: '#333', color: '#fff', border: 'none', padding: '12px', width: '100%', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
              Ho capito
            </button>
          </div>
        </div>
      )}

      {/* POP-UP READY TO TRAIN (digestione) */}
      {showTrainingPopup && (() => {
        const pastoRecente = (activeLog || []).find(item => item.type === 'food' && displayTime - item.mealTime >= 0 && displayTime - item.mealTime <= 1);
        const mealTime = pastoRecente?.mealTime ?? 0;
        const waitMinutesTotal = 90;
        const elapsedMinutes = (displayTime - mealTime) * 60;
        const residualMinutes = Math.max(0, Math.ceil(waitMinutesTotal - elapsedMinutes));
        const startTime = displayTime + residualMinutes / 60;
        const startHours = Math.floor(startTime) % 24;
        const startMins = Math.round((startTime % 1) * 60);
        const startStr = `${startHours}:${String(startMins).padStart(2, '0')}`;
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={() => setShowTrainingPopup(false)}>
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
    </div>
  );
}