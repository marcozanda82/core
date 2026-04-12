/**
 * MealBuilder.jsx — Costruttore pasti (drawer): ricerca alimenti, coda, telemetria, SALVA NEL DIARIO.
 * Estratto da SalaComandi.jsx. La logica saveMealToDiary resta nel genitore; qui solo rendering e onClick.
 */
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { TARGETS } from './useBiochimico';
import {
  MEAL_TYPES,
  calculateMagicFill,
  getSmartSubstitutes,
  calculateSwapQuantity,
  categorizeFood,
} from './coreEngine';
import { getTimePositionPercent } from './timeLayout';
import { useFoodDb } from './useFoodDb';

const DRAFT_NUTRIENT_EXTRA_KEYS = new Set([
  'fibre',
  ...Object.values(TARGETS).flatMap(g => Object.keys(g || {}))
]);

const RECENT_FOODS_STORAGE_KEY = 'recent_foods';
const MAX_RECENT_FOODS = 30;
const PERSONAL_RESULTS_THRESHOLD = 3;
const SMART_SUGGESTIONS_LIMIT = 4;
const RECENT_FOOD_HIGH_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_FOOD_MEDIUM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const FOOD_PAIR_SUGGESTIONS = {
  pasta: ['parmigiano', 'olio'],
  riso: ['olio', 'tonno'],
  pollo: ['olio', 'limone'],
};
const CONTEXT_SUGGESTION_KEYWORDS = {
  morning: ['yogurt', 'latte', 'caffe', 'pane', 'fette biscottate', 'marmellata', 'uova', 'banana'],
  lunch: ['riso', 'pasta', 'pollo', 'tacchino', 'tonno', 'pane'],
  dinner: ['zucchine', 'verdure', 'insalata', 'pesce', 'salmone', 'uova', 'ricotta'],
};

function normalizeRecentFoodEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const name = String(entry.name || '').trim();
  const id = String(entry.id ?? name).trim();
  const lastUsed = Number(entry.lastUsedAt ?? entry.lastUsed ?? entry.timestamp);
  const count = Number(entry.usageCount ?? entry.count);

  if (!id || !name || !Number.isFinite(lastUsed)) return null;
  return {
    id,
    name,
    lastUsed,
    lastUsedAt: lastUsed,
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
    usageCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
  };
}

function dedupeRecentFoodEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = String(entry?.id ?? '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRecentFoodRecencyScore(lastUsed, now = Date.now()) {
  const ageMs = now - Number(lastUsed);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs < RECENT_FOOD_HIGH_WINDOW_MS) return 5;
  if (ageMs < RECENT_FOOD_MEDIUM_WINDOW_MS) return 3;
  return 1;
}

function getRecentFoodFrequencyScore(count) {
  const normalizedCount = Math.max(1, Number(count) || 1);
  return Math.min(4, Math.floor(Math.log2(normalizedCount)) + 1);
}

function getRecentFoodSmartScore(entry, now = Date.now()) {
  const recencyScore = getRecentFoodRecencyScore(entry?.lastUsed, now);
  const frequencyScore = getRecentFoodFrequencyScore(entry?.count);
  return recencyScore + frequencyScore;
}

function sortRecentFoodEntries(entries) {
  const now = Date.now();
  return [...entries].sort((a, b) => {
    const smartScoreA = getRecentFoodSmartScore(a, now);
    const smartScoreB = getRecentFoodSmartScore(b, now);

    if (smartScoreB !== smartScoreA) return smartScoreB - smartScoreA;
    if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed;
    return (Number(b.count) || 0) - (Number(a.count) || 0);
  });
}

function getMealContextKey(mealType, drawerMealTime) {
  const normalizedMealType = String(mealType || '').toLowerCase();
  if (normalizedMealType.includes('colazione')) return 'morning';
  if (normalizedMealType.includes('pranzo')) return 'lunch';
  if (normalizedMealType.includes('cena')) return 'dinner';

  const hour = Number(drawerMealTime);
  if (Number.isFinite(hour)) {
    if (hour < 11) return 'morning';
    if (hour < 17) return 'lunch';
  }
  return 'dinner';
}

function loadRecentFoodEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FOODS_STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) {
      const normalized = dedupeRecentFoodEntries(sortRecentFoodEntries(
        parsed.map(normalizeRecentFoodEntry).filter(Boolean)
      )).slice(0, MAX_RECENT_FOODS);

      // Lazy-migrate older shapes (e.g. timestamp-only entries) to the new format.
      try {
        localStorage.setItem(RECENT_FOODS_STORAGE_KEY, JSON.stringify(normalized));
      } catch (_) {}

      return normalized;
    }
  } catch (_) {}

  try {
    const legacy = JSON.parse(localStorage.getItem('recentFoods') || '[]');
    if (Array.isArray(legacy)) {
      const migrated = dedupeRecentFoodEntries(sortRecentFoodEntries(
        legacy.map((item, index) => {
          const name = String(item || '').trim();
          if (!name) return null;
          return {
            id: name,
            name,
            lastUsed: Date.now() - index,
            lastUsedAt: Date.now() - index,
            count: 1,
            usageCount: 1,
          };
        })
        .filter(Boolean)
      )).slice(0, MAX_RECENT_FOODS);

      try {
        localStorage.setItem(RECENT_FOODS_STORAGE_KEY, JSON.stringify(migrated));
      } catch (_) {}

      return migrated;
    }
  } catch (_) {}

  return [];
}

function mergeDraftNutrientExtras(base, row) {
  const out = { ...base };
  DRAFT_NUTRIENT_EXTRA_KEYS.forEach((k) => {
    if (row[k] == null) return;
    const n = Number(row[k]);
    if (!Number.isFinite(n)) return;
    out[k] = k === 'kcal' ? Math.max(0, Math.round(n)) : Math.max(0, Math.round(n * 10) / 10);
  });
  return out;
}

const ALL_TARGET_NUTRIENT_KEYS = [...new Set([
  'kcal',
  ...Object.values(TARGETS).flatMap(g => Object.keys(g || {}))
])];

const ALIAS_TO_CANON_RAW = {
  kcal: 'kcal', cal: 'kcal', calories: 'kcal', energia: 'kcal',
  prot: 'prot', protein: 'prot', proteins: 'prot', proteine: 'prot',
  carb: 'carb', carbs: 'carb', carboidrati: 'carb', carbohydrates: 'carb',
  fat: 'fat', grassi: 'fat', lipidi: 'fat',
  fattotal: 'fatTotal', fat_total: 'fatTotal', lipiditotali: 'fatTotal',
  fibre: 'fibre', fiber: 'fibre', fibra: 'fibre',
  vitc: 'vitc', vitaminc: 'vitc', vitaminec: 'vitc', vit_c: 'vitc',
  vitd: 'vitD', vitaminad: 'vitD',
  vita: 'vitA', vitaminaa: 'vitA', retinol: 'vitA',
  vitb1: 'vitB1', vitb2: 'vitB2', vitb3: 'vitB3', vitb5: 'vitB5', vitb6: 'vitB6',
  b9: 'b9', folate: 'b9', folic: 'b9', acidofolico: 'b9',
  vitb12: 'vitB12', cobalamin: 'vitB12',
  vite: 'vitE', vitaminae: 'vitE',
  vitk: 'vitK', vitamink: 'vitK',
  ca: 'ca', calcio: 'ca', calcium: 'ca',
  fe: 'fe', ferro: 'fe', iron: 'fe',
  mg: 'mg', magnesio: 'mg', magnesium: 'mg',
  k: 'k', potassio: 'k', potassium: 'k',
  na: 'na', sodio: 'na', sodium: 'na', sale: 'na',
  zn: 'zn', zinc: 'zn', zink: 'zn',
  cu: 'cu', rame: 'cu', copper: 'cu',
  se: 'se', selenium: 'se', selenio: 'se',
  p: 'p', fosforo: 'p', phosphorus: 'p',
  leu: 'leu', leucina: 'leu', iso: 'iso', isoleucina: 'iso',
  val: 'val', valina: 'val', lys: 'lys', lisina: 'lys',
  met: 'met', metionina: 'met', phe: 'phe', fenilalanina: 'phe',
  thr: 'thr', treonina: 'thr', trp: 'trp', triptofano: 'trp',
  his: 'his', istidina: 'his',
  fatsat: 'fatSat', saturatedfat: 'fatSat', grassisaturi: 'fatSat',
  fattrans: 'fatTrans', fattmono: 'fatMono', fatpoly: 'fatPoly',
  omega3: 'omega3', omega6: 'omega6', omega_3: 'omega3', omega_6: 'omega6',
  colest: 'colest', cholesterol: 'colest', colesterolo: 'colest'
};
ALL_TARGET_NUTRIENT_KEYS.forEach((key) => {
  ALIAS_TO_CANON_RAW[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = key;
});

function parseNutrientProfileObjectFromAI(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Nessun oggetto JSON nella risposta');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeRawNutrientsToPer100(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw).forEach(([k, v]) => {
    const num = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(num)) return;
    const simple = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    let canon = ALIAS_TO_CANON_RAW[simple];
    if (!canon) {
      const fk = ALL_TARGET_NUTRIENT_KEYS.find(ak => ak.toLowerCase().replace(/[^a-z0-9]/g, '') === simple);
      if (fk) canon = fk;
    }
    if (!canon || !ALL_TARGET_NUTRIENT_KEYS.includes(canon)) return;
    out[canon] = num;
  });
  if (out.fatTotal == null && out.fat != null) out.fatTotal = out.fat;
  return out;
}

function isIngredientNameInFoodDb(ingredientName, foodDb) {
  const n = String(ingredientName ?? '').trim().toLowerCase();
  if (!n || !foodDb || typeof foodDb !== 'object') return false;
  return Object.values(foodDb).some((e) => {
    if (!e || typeof e !== 'object') return false;
    if (e.isRecipe === true || e.type === 'recipe') return false;
    const d = String(e.desc ?? e.name ?? '').trim().toLowerCase();
    return d === n;
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSearchQuery(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function highlightSearchMatches(text, query) {
  const sourceText = String(text || '');
  const normalizedQuery = normalizeSearchQuery(query);

  if (!sourceText || !normalizedQuery) return escapeHtml(sourceText);

  const words = [...new Set(normalizedQuery.split(' ').filter(Boolean))];
  if (words.length === 0) return escapeHtml(sourceText);

  const normalizedChars = [];
  const normalizedIndexMap = [];

  for (let i = 0; i < sourceText.length; i += 1) {
    const normalizedChar = sourceText[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    for (let j = 0; j < normalizedChar.length; j += 1) {
      normalizedChars.push(normalizedChar[j]);
      normalizedIndexMap.push(i);
    }
  }

  const normalizedText = normalizedChars.join('');
  const ranges = [];

  words.forEach((word) => {
    let searchFrom = 0;
    while (searchFrom < normalizedText.length) {
      const matchIndex = normalizedText.indexOf(word, searchFrom);
      if (matchIndex === -1) break;

      const start = normalizedIndexMap[matchIndex];
      const end = normalizedIndexMap[matchIndex + word.length - 1] + 1;
      ranges.push([start, end]);
      searchFrom = matchIndex + word.length;
    }
  });

  if (ranges.length === 0) return escapeHtml(sourceText);

  ranges.sort((a, b) => a[0] - b[0]);
  const mergedRanges = [];
  ranges.forEach(([start, end]) => {
    const previousRange = mergedRanges[mergedRanges.length - 1];
    if (!previousRange || start > previousRange[1]) {
      mergedRanges.push([start, end]);
      return;
    }
    previousRange[1] = Math.max(previousRange[1], end);
  });

  let html = '';
  let lastIndex = 0;
  mergedRanges.forEach(([start, end]) => {
    html += escapeHtml(sourceText.slice(lastIndex, start));
    html += `<mark>${escapeHtml(sourceText.slice(start, end))}</mark>`;
    lastIndex = end;
  });
  html += escapeHtml(sourceText.slice(lastIndex));
  return html;
}

function scaleDraftIngredientWithPer100(ing, per100) {
  const w = Math.max(5, Number(ing.weight) || 100);
  const factor = w / 100;
  const r0 = (x) => Math.max(0, Math.round(x));
  const r1 = (x) => Math.max(0, Math.round(x * 10) / 10);
  const next = { ...ing };
  if (per100.kcal != null) next.kcal = r0(per100.kcal * factor);
  if (per100.prot != null) next.prot = r1(per100.prot * factor);
  if (per100.carb != null) next.carb = r1(per100.carb * factor);
  const fBase = per100.fatTotal != null ? per100.fatTotal : per100.fat;
  if (fBase != null) {
    next.fat = r1(fBase * factor);
    next.fatTotal = r1(fBase * factor);
  }
  ALL_TARGET_NUTRIENT_KEYS.forEach((k) => {
    if (['kcal', 'prot', 'carb', 'fat', 'fatTotal'].includes(k)) return;
    if (per100[k] == null) return;
    next[k] = r1(per100[k] * factor);
  });
  return next;
}

function buildFoodDbEntryPer100FromNormalized(desc, per100) {
  const entry = { desc: String(desc).trim(), isRecipe: false };
  if (per100.kcal != null) entry.kcal = per100.kcal;
  if (per100.prot != null) entry.prot = per100.prot;
  if (per100.carb != null) entry.carb = per100.carb;
  const f = per100.fatTotal != null ? per100.fatTotal : per100.fat;
  if (f != null) {
    entry.fat = f;
    entry.fatTotal = f;
  }
  ALL_TARGET_NUTRIENT_KEYS.forEach((k) => {
    if (['kcal', 'prot', 'carb', 'fat', 'fatTotal'].includes(k)) return;
    if (per100[k] != null) entry[k] = per100[k];
  });
  return entry;
}

function parseRecipeIngredientsFromAI(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Nessun array JSON nella risposta');
  }
  const jsonStr = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) throw new Error('La risposta non è un array');
  return parsed;
}

function normalizeDraftIngredient(row, index) {
  const w = Number(row.weight);
  const weight = Number.isFinite(w) && w > 0 ? Math.max(5, Math.round(w)) : 100;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const baseId = String(row.id != null ? row.id : 'ing').replace(/\s+/g, '_');
  const base = {
    id: `draft_${index}_${baseId}`.slice(0, 80),
    name: String(row.name != null ? row.name : 'Ingrediente').trim() || 'Ingrediente',
    weight,
    kcal: Math.max(0, Math.round(num(row.kcal))),
    prot: Math.max(0, Math.round(num(row.prot) * 10) / 10),
    carb: Math.max(0, Math.round(num(row.carb) * 10) / 10),
    fat: Math.max(0, Math.round(num(row.fat) * 10) / 10)
  };
  return mergeDraftNutrientExtras(base, row);
}

/** Macro effettivi alla porzione corrente (coda pasto / non ricetta). */
function mealFoodMacrosAtPortion(f) {
  if (!f || typeof f !== 'object') return { prot: 0, carb: 0, fat: 0 };
  return {
    prot: Number(f.prot ?? f.proteine) || 0,
    carb: Number(f.carb ?? f.carboidrati) || 0,
    fat: Number(f.fat ?? f.fatTotal ?? f.grassi) || 0,
  };
}

export default function MealBuilder({
  onClose,
  mealType,
  setMealType,
  drawerMealTime,
  setDrawerMealTime,
  setDrawerMealTimeStr,
  getDefaultMealTime,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  miniTimelinePastoRef,
  handleMiniTimelineDrag,
  allNodes,
  totali,
  userTargets,
  dynamicDailyKcal,
  renderLiveProgressBar,
  renderMiniBar,
  renderProgressBar,
  renderRatioBar,
  mealTotaliFull,
  targetMacrosPasto,
  ratio,
  energyAt20Percent,
  isBarcodeScannerOpen,
  setIsBarcodeScannerOpen,
  barcodeVideoRef,
  onCloseBarcodeScanner,
  foodNameInput,
  setFoodNameInput,
  foodWeightInput,
  setFoodWeightInput,
  foodInputRef,
  foodDropdownSuggestions = [],
  creaResults = [],
  isCreaLoading = false,
  getLastQuantityForFood = () => null,
  showFoodDropdown = false,
  setShowFoodDropdown = () => {},
  generateFoodWithAI = async () => {},
  triggerCreaSearch = () => {},
  isGeneratingFood = false,
  handleAddFoodManual,
  abitudiniIeri,
  addedFoods,
  setAddedFoods,
  handleCalibrateFoodWeight,
  setSelectedFoodForInfo,
  setSelectedFoodForEdit,
  setEditQuantityValue,
  userProfile,
  checkBilanciamentoPasto,
  TELEMETRY_TABS,
  TARGETS,
  MEAL_LABELS_SAVE,
  saveMealToDiary,
  registerAddFoodCallback,
  editingMealId,
  callGeminiAPIWithRotation,
  saveCustomRecipeToFoodDb,
  foodDb = {},
  saveFoodEntryPer100ToFoodDb,
  deleteRecipeFromFoodDb,
  estraiDatiFoodDb = null,
  plannerNoteFromAi = '',
  onSmartComplete,
  /** Incrementato da timeline: avvia una volta «Genera pasto» (smart) con lista vuota. */
  smartMealLaunchKey = 0,
}) {
  const [isAbitudiniOpen, setIsAbitudiniOpen] = useState(false);

  const [isAdvancedPastoMode, setIsAdvancedPastoMode] = useState(false);
  const [mealCarouselTab, setMealCarouselTab] = useState('macro');
  const [numpadFoodId, setNumpadFoodId] = useState(null);
  const [numpadValue, setNumpadValue] = useState('');
  const mealCarouselRef = useRef(null);

  const [isComplexMode, setIsComplexMode] = useState(false);
  const [complexFoodQuery, setComplexFoodQuery] = useState('');
  const [draftRecipe, setDraftRecipe] = useState([]);
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const [extraIngredientQuery, setExtraIngredientQuery] = useState('');
  const [isAddingExtra, setIsAddingExtra] = useState(false);
  const [complexPortionWeight, setComplexPortionWeight] = useState(100);
  const [recipeSearchResults, setRecipeSearchResults] = useState([]);
  const [showRecipeDropdown, setShowRecipeDropdown] = useState(false);
  const [extraSearchResults, setExtraSearchResults] = useState([]);
  const [showExtraDropdown, setShowExtraDropdown] = useState(false);
  const [deepCompileLoadingIndex, setDeepCompileLoadingIndex] = useState(null);
  const [expandedAddedFoods, setExpandedAddedFoods] = useState({});
  const [editingRecipeKey, setEditingRecipeKey] = useState(null);
  const [magicFillToast, setMagicFillToast] = useState(false);
  const [swapPanelFoodId, setSwapPanelFoodId] = useState(null);
  const [swapToast, setSwapToast] = useState(false);
  const [smartCompleteLoading, setSmartCompleteLoading] = useState(false);
  /** Vincoli opzionali per Genera/Completa pasto (passati al prompt AI). */
  const [aiConstraintFixed, setAiConstraintFixed] = useState('');
  const [aiConstraintExcluded, setAiConstraintExcluded] = useState('');
  const [aiConstraintPreferred, setAiConstraintPreferred] = useState('');
  const [isCreaExpanded, setIsCreaExpanded] = useState(false);
  const [selectedFoodMatch, setSelectedFoodMatch] = useState(null);

  const mealBuilderScrollAnchorRef = useRef(null);
  const foodDropdownContainerRef = useRef(null);
  const { foodDb: localFoodDb } = useFoodDb();

  const enrichAddedFoodItem = useCallback((item, selection, weightInputValue) => {
    if (!item || !selection?.id) return item;

    const sourceRow = selection?.row || foodDb?.[selection.id] || localFoodDb?.[selection.id] || null;
    const weight = Number(weightInputValue ?? item?.qta ?? item?.weight ?? 100) || 100;
    const factor = weight / 100;
    const selectedName = String(selection?.desc || item?.desc || item?.name || '').trim();
    const toFiniteNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const scaled = (value) => {
      const numeric = toFiniteNumber(value);
      return numeric == null ? null : numeric * factor;
    };
    const fallbackKcal = scaled(sourceRow?.kcal ?? sourceRow?.cal);
    const fallbackProt = scaled(sourceRow?.prot);
    const fallbackCarb = scaled(sourceRow?.carb);
    const fallbackFat = scaled(sourceRow?.fat ?? sourceRow?.fatTotal);

    return {
      ...item,
      foodDbKey: selection.id,
      desc: selectedName || item?.desc || item?.name,
      name: selectedName || item?.name || item?.desc,
      kcal: toFiniteNumber(item?.kcal) ?? toFiniteNumber(item?.cal) ?? fallbackKcal ?? 0,
      prot: toFiniteNumber(item?.prot) ?? fallbackProt ?? 0,
      carb: toFiniteNumber(item?.carb) ?? fallbackCarb ?? 0,
      fat: toFiniteNumber(item?.fat) ?? toFiniteNumber(item?.fatTotal) ?? fallbackFat ?? 0,
      ...(toFiniteNumber(item?.fatTotal) == null && fallbackFat != null ? { fatTotal: fallbackFat } : {}),
    };
  }, [foodDb, localFoodDb]);

  const buildAiMealConstraintsPayload = useCallback(() => {
    const split = (s) =>
      String(s || '')
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20);
    return {
      fixedFoods: split(aiConstraintFixed),
      excludedFoods: split(aiConstraintExcluded),
      preferredFoods: split(aiConstraintPreferred),
    };
  }, [aiConstraintFixed, aiConstraintExcluded, aiConstraintPreferred]);

  const foodSearchSources = useMemo(() => ([
    {
      key: 'crea',
      label: 'CREA',
      results: creaResults,
      isLoading: isCreaLoading,
    },
  ]), [creaResults, isCreaLoading]);

  const toggleAddedFood = (id) => {
    const k = id != null ? String(id) : '';
    if (!k) return;
    setExpandedAddedFoods((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const handleDeleteRecipeFromDb = async (e, recipeKey) => {
    e.stopPropagation();
    e.preventDefault();
    if (!recipeKey) return;
    if (!window.confirm('Vuoi eliminare definitivamente questa ricetta dal database?')) return;
    if (typeof deleteRecipeFromFoodDb !== 'function') {
      alert('Eliminazione non disponibile.');
      return;
    }
    try {
      await deleteRecipeFromFoodDb(recipeKey);
      setRecipeSearchResults((prev) => {
        const next = prev.filter((r) => r.key !== recipeKey);
        if (next.length === 0) setShowRecipeDropdown(false);
        return next;
      });
    } catch (err) {
      console.error('deleteRecipeFromFoodDb', err);
      alert('Eliminazione non riuscita.');
    }
  };

  const handleEditAddedRecipe = (foodId) => {
    const food = addedFoods.find((f) => f.id === foodId);
    if (!food) return;
    const isRec = food.type === 'recipe' || food.isRecipe === true;
    if (!isRec) return;
    const ings = Array.isArray(food.ingredients) ? food.ingredients : [];
    const name = String(food.desc || food.name || '').trim() || 'Ricetta';
    const w = Math.max(50, Math.min(5000, Math.round(Number(food.qta ?? food.weight) || 100)));
    setAddedFoods((prev) => prev.filter((f) => f.id !== foodId));
    setRecipeSearchResults([]);
    setShowRecipeDropdown(false);
    setExtraSearchResults([]);
    setShowExtraDropdown(false);
    setIsComplexMode(true);
    setComplexFoodQuery(name);
    setComplexPortionWeight(w);
    setDraftRecipe(ings.map((row, i) => normalizeDraftIngredient({ ...row }, i)));
    setIsGeneratingRecipe(false);
    setExtraIngredientQuery('');
    setIsAddingExtra(false);
    setEditingRecipeKey(food.key != null && String(food.key).trim() !== '' ? String(food.key).trim() : String(food.id));
    window.setTimeout(() => {
      mealBuilderScrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const draftTotalsPer100g = useMemo(() => (
    draftRecipe.reduce(
      (acc, ing) => ({
        kcal: acc.kcal + (Number(ing.kcal) || 0),
        prot: acc.prot + (Number(ing.prot) || 0),
        carb: acc.carb + (Number(ing.carb) || 0),
        fat: acc.fat + (Number(ing.fat) || 0)
      }),
      { kcal: 0, prot: 0, carb: 0, fat: 0 }
    )
  ), [draftRecipe]);

  const portionPreview = useMemo(() => {
    const w = Math.max(50, Math.min(5000, Number(complexPortionWeight) || 100));
    const f = w / 100;
    return {
      w,
      kcal: (draftTotalsPer100g.kcal * f),
      prot: (draftTotalsPer100g.prot * f),
      carb: (draftTotalsPer100g.carb * f),
      fat: (draftTotalsPer100g.fat * f)
    };
  }, [draftTotalsPer100g, complexPortionWeight]);

  const [recentFoodEntries, setRecentFoodEntries] = useState(() => loadRecentFoodEntries());
  const recentFoods = useMemo(
    () => recentFoodEntries.map((entry) => entry.id).filter(Boolean),
    [recentFoodEntries]
  );
  const normalizedFoodSearchQuery = useMemo(
    () => normalizeSearchQuery(foodNameInput),
    [foodNameInput]
  );
  const isShortFoodQuery = useMemo(
    () => normalizedFoodSearchQuery.length <= 2,
    [normalizedFoodSearchQuery]
  );
  const visibleRecentFoodEntries = useMemo(() => {
    const normalizedQuery = normalizeSearchQuery(foodNameInput);
    if (normalizedQuery.length <= 2) {
      return [...recentFoodEntries]
        .sort((a, b) => {
          const smartScoreA = getRecentFoodSmartScore(a);
          const smartScoreB = getRecentFoodSmartScore(b);
          if (smartScoreB !== smartScoreA) return smartScoreB - smartScoreA;
          if ((Number(b?.lastUsed) || 0) !== (Number(a?.lastUsed) || 0)) return (Number(b?.lastUsed) || 0) - (Number(a?.lastUsed) || 0);
          return (Number(b?.count) || 0) - (Number(a?.count) || 0);
        })
        .sort((a, b) => (Number(b?.lastUsedAt ?? b?.lastUsed) || 0) - (Number(a?.lastUsedAt ?? a?.lastUsed) || 0))
        .slice(0, SMART_SUGGESTIONS_LIMIT);
    }

    const queryWords = normalizedQuery.split(' ').filter(Boolean);
    return recentFoodEntries
      .filter((entry) => {
        const normalizedName = normalizeSearchQuery(entry?.name);
        if (!normalizedName) return false;
        return queryWords.every((word) => normalizedName.includes(word));
      })
      .slice(0, SMART_SUGGESTIONS_LIMIT);
  }, [foodNameInput, recentFoodEntries]);
  const visibleFrequentFoodEntries = useMemo(() => {
    const normalizedQuery = normalizeSearchQuery(foodNameInput);
    const sortedBySmartScore = [...recentFoodEntries].sort((a, b) => {
      const smartScoreA = getRecentFoodSmartScore(a);
      const smartScoreB = getRecentFoodSmartScore(b);
      if (smartScoreB !== smartScoreA) return smartScoreB - smartScoreA;
      if ((Number(b?.count) || 0) !== (Number(a?.count) || 0)) return (Number(b?.count) || 0) - (Number(a?.count) || 0);
      return (Number(b?.lastUsed) || 0) - (Number(a?.lastUsed) || 0);
    });
    const recentIds = new Set(
      (!normalizedQuery ? [] : visibleRecentFoodEntries)
        .map((entry) => String(entry?.id ?? '').trim())
        .filter(Boolean)
    );

    const filteredEntries = sortedBySmartScore.filter((entry) => {
      const entryId = String(entry?.id ?? '').trim();
      if (recentIds.has(entryId)) return false;

      if (!normalizedQuery) return true;

      const normalizedName = normalizeSearchQuery(entry?.name);
      if (!normalizedName) return false;

      const queryWords = normalizedQuery.split(' ').filter(Boolean);
      return queryWords.every((word) => normalizedName.includes(word));
    });

    return [...filteredEntries]
      .sort((a, b) => {
        const frequencyScoreA = getRecentFoodFrequencyScore(a?.count);
        const frequencyScoreB = getRecentFoodFrequencyScore(b?.count);
        if (frequencyScoreB !== frequencyScoreA) return frequencyScoreB - frequencyScoreA;
        if ((Number(b?.count) || 0) !== (Number(a?.count) || 0)) return (Number(b?.count) || 0) - (Number(a?.count) || 0);
        return (Number(b?.lastUsed) || 0) - (Number(a?.lastUsed) || 0);
      })
      .slice(0, SMART_SUGGESTIONS_LIMIT);
  }, [foodNameInput, recentFoodEntries, visibleRecentFoodEntries]);
  const smartSuggestedFoods = useMemo(() => {
    if (!isShortFoodQuery || !foodDb || typeof foodDb !== 'object') return [];

    const usedIds = new Set([
      ...visibleFrequentFoodEntries.map((entry) => String(entry?.id ?? '').trim()),
      ...visibleRecentFoodEntries.map((entry) => String(entry?.id ?? '').trim()),
    ]);
    const contextKey = getMealContextKey(mealType, drawerMealTime);
    const contextKeywords = CONTEXT_SUGGESTION_KEYWORDS[contextKey] || [];
    const pairKeywords = FOOD_PAIR_SUGGESTIONS[normalizedFoodSearchQuery] || [];
    const keywords = [...new Set([...contextKeywords, ...pairKeywords].map((item) => normalizeSearchQuery(item)).filter(Boolean))];

    if (keywords.length === 0) return [];

    return Object.entries(foodDb)
      .filter(([key, entry]) => {
        if (!entry || typeof entry !== 'object') return false;
        if (usedIds.has(String(key).trim())) return false;

        const desc = String(entry.desc ?? entry.name ?? '').trim();
        const normalizedDesc = normalizeSearchQuery(desc);
        if (!normalizedDesc) return false;

        return keywords.some((keyword) => normalizedDesc.includes(keyword));
      })
      .slice(0, 30)
      .map(([key, entry]) => ({
        id: key,
        name: String(entry?.desc ?? entry?.name ?? key).trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .slice(0, SMART_SUGGESTIONS_LIMIT);
  }, [
    drawerMealTime,
    foodDb,
    isShortFoodQuery,
    mealType,
    normalizedFoodSearchQuery,
    visibleFrequentFoodEntries,
    visibleRecentFoodEntries,
  ]);
  const personalResultsCount = useMemo(
    () => (foodDropdownSuggestions || []).length,
    [foodDropdownSuggestions]
  );
  const getFoodUsageMeta = useCallback((foodId, foodName) => {
    const id = String(foodId ?? '').trim();
    const normalizedName = normalizeSearchQuery(foodName);
    const entry = recentFoodEntries.find((item) => {
      const entryId = String(item?.id ?? '').trim();
      const entryName = normalizeSearchQuery(item?.name);
      return (id && entryId === id) || (normalizedName && entryName === normalizedName);
    });

    if (!entry) {
      return {
        isRecent: false,
        isFrequent: false,
      };
    }

    const recencyScore = getRecentFoodRecencyScore(entry.lastUsed);
    const frequencyScore = getRecentFoodFrequencyScore(entry.count);

    return {
      isRecent: recencyScore >= 3,
      isFrequent: frequencyScore >= 2,
    };
  }, [recentFoodEntries]);

  const renderFoodOptionLabel = useCallback((foodName, query, foodId) => {
    const { isRecent, isFrequent } = getFoodUsageMeta(foodId, foodName);
    let badgeLabel = '';

    if (isRecent && isFrequent) badgeLabel = 'Preferito';
    else if (isFrequent) badgeLabel = 'Frequente';
    else if (isRecent) badgeLabel = 'Recente';

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span
          dangerouslySetInnerHTML={{
            __html: highlightSearchMatches(foodName, query),
          }}
        />
        {badgeLabel ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 6px',
              borderRadius: 999,
              background: isRecent && isFrequent ? 'rgba(179, 136, 255, 0.16)' : 'rgba(103, 232, 249, 0.12)',
              color: isRecent && isFrequent ? '#b388ff' : '#67e8f9',
              fontSize: '0.68rem',
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {badgeLabel}
          </span>
        ) : null}
      </span>
    );
  }, [getFoodUsageMeta]);

  const trackRecentFood = useCallback((food) => {
    const name = String(food?.name || '').trim();
    const id = String(food?.id ?? name).trim();
    if (!id || !name) return;

    setRecentFoodEntries((prev) => {
      const lastUsed = Date.now();
      const existingEntry = prev.find((entry) => String(entry?.id ?? '').trim() === id);
      const next = sortRecentFoodEntries([
        {
          id,
          name,
          lastUsed,
          lastUsedAt: lastUsed,
          count: existingEntry ? existingEntry.count + 1 : 1,
          usageCount: existingEntry ? existingEntry.count + 1 : 1,
        },
        ...prev.filter((entry) => String(entry?.id ?? '').trim() !== id),
      ]).slice(0, MAX_RECENT_FOODS);

      try {
        localStorage.setItem(RECENT_FOODS_STORAGE_KEY, JSON.stringify(next));
      } catch (_) {}

      return next;
    });
  }, []);

  const handleAddSelectedFood = useCallback(() => {
    if (!foodNameInput || !foodWeightInput) return;
    const trackedName = String(foodNameInput || '').trim();
    const trackedId = selectedFoodMatch?.id != null && String(selectedFoodMatch.id).trim() !== ''
      ? String(selectedFoodMatch.id).trim()
      : trackedName;

    if (selectedFoodMatch?.id && typeof estraiDatiFoodDb === 'function' && typeof setAddedFoods === 'function') {
      const trimmedName = foodNameInput.trim();
      const parsedWeight = parseFloat(foodWeightInput);
      const preferredDbKey = foodDb?.[selectedFoodMatch.id] != null ? selectedFoodMatch.id : undefined;
      const baseItem = estraiDatiFoodDb(trimmedName, parsedWeight, mealType, preferredDbKey);
      const enrichedItem = enrichAddedFoodItem(baseItem, selectedFoodMatch, parsedWeight);
      setAddedFoods((prev) => [enrichedItem, ...prev]);
      trackRecentFood({ id: trackedId, name: trimmedName });
      setFoodNameInput('');
      setFoodWeightInput('');
      setSelectedFoodMatch(null);
      return;
    }

    if (typeof handleAddFoodManual === 'function') {
      trackRecentFood({ id: trackedId, name: trackedName });
      handleAddFoodManual();
    }
    setSelectedFoodMatch(null);
  }, [selectedFoodMatch, estraiDatiFoodDb, setAddedFoods, foodNameInput, foodWeightInput, foodDb, mealType, enrichAddedFoodItem, setFoodNameInput, setFoodWeightInput, handleAddFoodManual, trackRecentFood]);

  const handleSelectRecentFood = useCallback((entry) => {
    const desc = String(entry?.name || '').trim();
    if (!desc) return;

    const entryId = String(entry?.id ?? desc).trim();
    const matchedRow = foodDb?.[entryId] || localFoodDb?.[entryId] || null;

    setFoodNameInput(desc);
    setFoodWeightInput(getLastQuantityForFood(desc) || '');
    setSelectedFoodMatch({
      id: entryId || null,
      desc,
      row: matchedRow,
    });
    trackRecentFood({ id: entryId || desc, name: desc });
    setShowFoodDropdown(false);
    setTimeout(() => document.getElementById('weight-input')?.focus(), 50);
  }, [foodDb, getLastQuantityForFood, localFoodDb, setFoodNameInput, setFoodWeightInput, setShowFoodDropdown, trackRecentFood]);

  useEffect(() => {
    if (typeof registerAddFoodCallback !== 'function') return;
    registerAddFoodCallback((foodId) => {
      if (!foodId) return;
      const fallbackName = String(foodDb?.[foodId]?.desc ?? foodDb?.[foodId]?.name ?? foodId).trim();
      trackRecentFood({ id: foodId, name: fallbackName });
    });
    return () => registerAddFoodCallback(null);
  }, [foodDb, registerAddFoodCallback, trackRecentFood]);

  useEffect(() => {
    if (!showFoodDropdown) return undefined;

    const handlePointerDownOutside = (event) => {
      if (foodDropdownContainerRef.current?.contains(event.target)) return;
      setShowFoodDropdown(false);
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
    };
  }, [setShowFoodDropdown, showFoodDropdown]);

  useEffect(() => {
    const query = String(foodNameInput || '').trim();
    if (!query) {
      setIsCreaExpanded(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      triggerCreaSearch(query);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [foodNameInput, triggerCreaSearch]);

  useEffect(() => {
    if (!normalizedFoodSearchQuery || normalizedFoodSearchQuery.length <= 2) {
      setIsCreaExpanded(false);
      return;
    }

    if (personalResultsCount < PERSONAL_RESULTS_THRESHOLD) {
      setIsCreaExpanded(true);
      return;
    }

    setIsCreaExpanded(false);
  }, [normalizedFoodSearchQuery, personalResultsCount]);

  useEffect(() => {
    if (!isComplexMode) {
      setRecipeSearchResults([]);
      setShowRecipeDropdown(false);
      return;
    }
    const q = complexFoodQuery.trim();
    if (q.length < 2) {
      setRecipeSearchResults([]);
      setShowRecipeDropdown(false);
      return;
    }
    const lower = q.toLowerCase();
    const db = foodDb && typeof foodDb === 'object' ? foodDb : {};
    const out = [];
    Object.entries(db).forEach(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      const isRec = entry.isRecipe === true || entry.type === 'recipe';
      if (!isRec) return;
      const name = String(entry.desc ?? entry.name ?? '').trim();
      if (!name.toLowerCase().includes(lower)) return;
      const ingredients = entry.ingredients;
      if (!Array.isArray(ingredients) || ingredients.length === 0) return;
      out.push({ key, name, ingredients });
    });
    out.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    setRecipeSearchResults(out);
    setShowRecipeDropdown(out.length > 0);
  }, [complexFoodQuery, foodDb, isComplexMode]);

  useEffect(() => {
    if (!isComplexMode) {
      setExtraSearchResults([]);
      setShowExtraDropdown(false);
      return;
    }
    const q = extraIngredientQuery.trim();
    if (q.length < 2) {
      setExtraSearchResults([]);
      setShowExtraDropdown(false);
      return;
    }
    const lower = q.toLowerCase();
    const db = foodDb && typeof foodDb === 'object' ? foodDb : {};
    const out = [];
    Object.entries(db).forEach(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.isRecipe === true || entry.type === 'recipe') return;
      const name = String(entry.desc ?? entry.name ?? '').trim();
      if (!name.toLowerCase().includes(lower)) return;
      out.push({ key, name, entry });
    });
    out.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    setExtraSearchResults(out.slice(0, 50));
    setShowExtraDropdown(out.length > 0);
  }, [extraIngredientQuery, foodDb, isComplexMode]);

  const handleSelectSavedRecipe = (recipe) => {
    if (!recipe || !Array.isArray(recipe.ingredients)) return;
    const name = String(recipe.name ?? '').trim() || 'Ricetta';
    setComplexFoodQuery(name);
    const next = recipe.ingredients.map((row, i) => normalizeDraftIngredient(row, i));
    setDraftRecipe(next);
    setShowRecipeDropdown(false);
    setComplexPortionWeight(100);
    setEditingRecipeKey(recipe.key != null ? String(recipe.key) : null);
  };

  const handleMealCarouselScroll = (e) => {
    const { scrollLeft, clientWidth } = e.target;
    const pageIndex = Math.round(scrollLeft / clientWidth);
    const activeTab = TELEMETRY_TABS[pageIndex];
    if (activeTab && activeTab !== mealCarouselTab) setMealCarouselTab(activeTab);
  };
  const scrollToMealCarouselTab = (tabName) => {
    setMealCarouselTab(tabName);
    const index = TELEMETRY_TABS.indexOf(tabName);
    if (mealCarouselRef.current && index !== -1) {
      const container = mealCarouselRef.current;
      container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
    }
  };

  const handleGenerateRecipe = async () => {
    const dish = complexFoodQuery.trim();
    if (!dish) return;
    setEditingRecipeKey(null);
    setShowRecipeDropdown(false);
    if (typeof callGeminiAPIWithRotation !== 'function') {
      alert('AI non disponibile: configura le API Key nelle impostazioni.');
      return;
    }
    setIsGeneratingRecipe(true);
    try {
      const prompt = `Sei uno chef stellato esperto in nutrizione. Scomponi il piatto complesso ${JSON.stringify(dish)} nei suoi ingredienti crudi base. Calcola le proporzioni esatte affinché il peso totale degli ingredienti sia 100 grammi. Quando un valore nutrizionale non è disponibile per la compilazione automatica, fai una stima logica e usa il valore medio. Restituisci SOLO un array JSON (senza backtick o markdown) con oggetti strutturati così: { id: '...', name: '...', weight: [numero], kcal: [numero], prot: [numero], carb: [numero], fat: [numero] }.`;
      const rawText = await callGeminiAPIWithRotation(prompt);
      const rows = parseRecipeIngredientsFromAI(rawText);
      const next = rows.map((row, i) => normalizeDraftIngredient(row, i));
      if (next.length === 0) {
        alert('L’AI non ha restituito ingredienti. Riprova.');
        return;
      }
      setDraftRecipe(next);
      setComplexPortionWeight(100);
    } catch (err) {
      console.error('Recipe AI error:', err);
      alert(
        err?.message
          ? `Impossibile elaborare la ricetta: ${err.message}`
          : 'Impossibile elaborare la ricetta. Controlla la risposta dell’AI o riprova.'
      );
    } finally {
      setIsGeneratingRecipe(false);
    }
  };

  const adjustDraftIngredientWeight = (id, deltaGrams) => {
    setDraftRecipe((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextW = Math.max(5, item.weight + deltaGrams);
        if (nextW === item.weight) return item;
        const factor = nextW / item.weight;
        return {
          ...item,
          weight: nextW,
          kcal: Math.max(0, Math.round(item.kcal * factor)),
          prot: Math.max(0, Math.round(item.prot * factor * 10) / 10),
          carb: Math.max(0, Math.round(item.carb * factor * 10) / 10),
          fat: Math.max(0, Math.round(item.fat * factor * 10) / 10)
        };
      })
    );
  };

  const setDraftIngredientWeightFromInput = (id, rawValue) => {
    const parsed = Math.round(Number(String(rawValue).replace(',', '.')));
    if (!Number.isFinite(parsed)) return;
    const nextW = Math.max(5, Math.round(parsed / 5) * 5);
    setDraftRecipe((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (nextW === item.weight) return item;
        const factor = nextW / item.weight;
        return {
          ...item,
          weight: nextW,
          kcal: Math.max(0, Math.round(item.kcal * factor)),
          prot: Math.max(0, Math.round(item.prot * factor * 10) / 10),
          carb: Math.max(0, Math.round(item.carb * factor * 10) / 10),
          fat: Math.max(0, Math.round(item.fat * factor * 10) / 10)
        };
      })
    );
  };

  const removeDraftIngredient = (id) => {
    setDraftRecipe((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectExtraFoodFromDb = (pick) => {
    if (!pick?.entry) return;
    const entry = pick.entry;
    const name = String(entry.desc ?? entry.name ?? '').trim();
    const weight = 100;
    const row = {
      name,
      weight,
      kcal: Number(entry.kcal) || 0,
      prot: Number(entry.prot) || 0,
      carb: Number(entry.carb) || 0,
      fat: Number(entry.fat ?? entry.fatTotal) || 0
    };
    Object.keys(entry).forEach((k) => {
      if (['desc', 'name', 'ingredients', 'isRecipe', 'type', 'id'].includes(k)) return;
      if (typeof entry[k] === 'number' && Number.isFinite(entry[k])) row[k] = entry[k];
    });
    setDraftRecipe((prev) => [...prev, normalizeDraftIngredient(row, prev.length)]);
    setExtraIngredientQuery('');
    setShowExtraDropdown(false);
  };

  const handleDeepAICompile = async (index, ingredientName) => {
    const nm = String(ingredientName ?? '').trim();
    if (!nm) return;
    if (typeof callGeminiAPIWithRotation !== 'function') {
      alert('AI non disponibile: configura le API Key nelle impostazioni.');
      return;
    }
    setDeepCompileLoadingIndex(index);
    try {
      const prompt =
        'Sei un nutrizionista. Genera il profilo nutrizionale completo per 100g crudi di: ' +
        JSON.stringify(nm) +
        ". Devi restituire un JSON valido con tutte le 40 chiavi nutrizionali previste dal sistema. Quando un valore non è disponibile per la compilazione automatica, fai una stima e usa il valore medio. Restituisci SOLO un oggetto JSON piatto (senza backtick) con le chiavi: kcal, prot, carb, fat, fibre, e tutte le vitamine/minerali (es. vitA, vitB1, vitc, ca, fe, leu, omega3, fatSat, ecc.).";
      const rawText = await callGeminiAPIWithRotation(prompt);
      const rawObj = parseNutrientProfileObjectFromAI(rawText);
      const per100 = normalizeRawNutrientsToPer100(rawObj);
      if (Object.keys(per100).length === 0) {
        alert('La risposta AI non contiene nutrienti riconosciuti. Riprova.');
        return;
      }
      const entry = buildFoodDbEntryPer100FromNormalized(nm, per100);
      if (typeof saveFoodEntryPer100ToFoodDb === 'function') {
        await saveFoodEntryPer100ToFoodDb(entry);
      }
      setDraftRecipe((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const ing = prev[index];
        const scaled = scaleDraftIngredientWithPer100(ing, per100);
        scaled._foodDbSchedato = true;
        return prev.map((it, i) => (i === index ? scaled : it));
      });
    } catch (err) {
      console.error('Deep AI compile', err);
      alert(
        err?.message
          ? `Schedatura fallita: ${err.message}`
          : 'Schedatura fallita. Riprova.'
      );
    } finally {
      setDeepCompileLoadingIndex(null);
    }
  };

  const handleAddExtraIngredient = async () => {
    const q = extraIngredientQuery.trim();
    if (!q) return;
    setShowExtraDropdown(false);
    if (typeof callGeminiAPIWithRotation !== 'function') {
      alert('AI non disponibile: configura le API Key nelle impostazioni.');
      return;
    }
    setIsAddingExtra(true);
    try {
      const prompt =
        'Sei un nutrizionista. Fornisci i valori nutrizionali per 100 grammi crudi di: ' +
        JSON.stringify(q) +
        ". Se mancano dati precisi, fai una stima logica usando valori medi. Genera anche i micronutrienti principali (fibre, vitamine, minerali) se possibile, con chiavi piatte coerenti con uno schema nutrizionale (es. fibre, vitc, fe, ca, mg, k, na), in modo da popolare il database alimenti in modo completo. Restituisci SOLO un array JSON (senza backtick o markdown) contenente un singolo oggetto strutturato così: [{ id: 'extra_[timestamp_o_random]', name: '[Nome Inserito]', weight: 100, kcal: [numero], prot: [numero], carb: [numero], fat: [numero], ...micronutrienti opzionali }].";
      const rawText = await callGeminiAPIWithRotation(prompt);
      const rows = parseRecipeIngredientsFromAI(rawText);
      if (!rows.length) {
        alert('L’AI non ha restituito dati per l’ingrediente. Riprova.');
        return;
      }
      setDraftRecipe((prev) => {
        const startIdx = prev.length;
        const normalized = rows.map((row, i) => normalizeDraftIngredient(row, startIdx + i));
        return [...prev, ...normalized];
      });
      setExtraIngredientQuery('');
    } catch (err) {
      console.error('Extra ingredient AI error:', err);
      alert(
        err?.message
          ? `Impossibile aggiungere l’ingrediente: ${err.message}`
          : 'Impossibile aggiungere l’ingrediente. Controlla la risposta dell’AI o riprova.'
      );
    } finally {
      setIsAddingExtra(false);
    }
  };

  const handleConfirmRecipeToMeal = () => {
    if (!draftRecipe.length) return;
    const name = complexFoodQuery.trim() || 'Ricetta';
    const sumK = draftRecipe.reduce((a, ing) => a + (Number(ing.kcal) || 0), 0);
    const sumP = draftRecipe.reduce((a, ing) => a + (Number(ing.prot) || 0), 0);
    const sumC = draftRecipe.reduce((a, ing) => a + (Number(ing.carb) || 0), 0);
    const sumF = draftRecipe.reduce((a, ing) => a + (Number(ing.fat) || 0), 0);
    const w = Math.max(50, Math.min(5000, Math.round(Number(complexPortionWeight)) || 100));
    const recipeId = editingRecipeKey || `recipe_${Date.now()}`;
    const keyForRow = editingRecipeKey || recipeId;
    const recipe = {
      id: recipeId,
      key: keyForRow,
      isRecipe: true,
      name,
      desc: name,
      type: 'recipe',
      weight: w,
      qta: w,
      mealType,
      unitStep: 50,
      kcal: (sumK * w) / 100,
      cal: (sumK * w) / 100,
      prot: (sumP * w) / 100,
      carb: (sumC * w) / 100,
      fat: (sumF * w) / 100,
      fatTotal: (sumF * w) / 100,
      ingredients: draftRecipe.map((ing) => ({ ...ing }))
    };
    const keyForSave = editingRecipeKey;
    setAddedFoods((prev) => [recipe, ...prev]);
    void (async () => {
      try {
        const dbKey = await saveCustomRecipeToFoodDb?.({
          desc: name,
          kcal: sumK,
          prot: sumP,
          carb: sumC,
          fatTotal: sumF,
          ingredients: draftRecipe
        }, keyForSave);
        if (dbKey && dbKey !== recipeId) {
          setAddedFoods((prev) => prev.map((f) => (f.id === recipeId ? { ...f, id: dbKey, key: dbKey } : f)));
        }
      } catch (err) {
        console.error('saveCustomRecipeToFoodDb', err);
        alert('Ricetta aggiunta al pasto, ma il salvataggio nel database alimenti non è riuscito.');
      }
    })();
    setIsComplexMode(false);
    setDraftRecipe([]);
    setComplexFoodQuery('');
    setIsGeneratingRecipe(false);
    setExtraIngredientQuery('');
    setIsAddingExtra(false);
    setComplexPortionWeight(100);
    setRecipeSearchResults([]);
    setShowRecipeDropdown(false);
    setExtraSearchResults([]);
    setShowExtraDropdown(false);
    setDeepCompileLoadingIndex(null);
    setEditingRecipeKey(null);
  };

  const handleCancelComplexMode = () => {
    setIsComplexMode(false);
    setComplexFoodQuery('');
    setDraftRecipe([]);
    setIsGeneratingRecipe(false);
    setExtraIngredientQuery('');
    setIsAddingExtra(false);
    setComplexPortionWeight(100);
    setRecipeSearchResults([]);
    setShowRecipeDropdown(false);
    setExtraSearchResults([]);
    setShowExtraDropdown(false);
    setDeepCompileLoadingIndex(null);
    setEditingRecipeKey(null);
  };

  const toNum = (v) => (typeof v === 'number' && !Number.isNaN(v)) ? v : (typeof v === 'string' ? Number(v) : v) != null && !Number.isNaN(Number(v)) ? Number(v) : 0;
  const safeBarTarget = (val, fallback = 1) => Math.max(1, Number(val) || fallback);
  const safeBarCurrent = (val) => Math.max(0, Number(val) || 0);

  const currentMealMacros = useMemo(() => {
    const items = addedFoods || [];
    return {
      kcal: items.reduce((acc, item) => acc + toNum(item.kcal ?? item.cal), 0),
      prot: items.reduce((acc, item) => acc + toNum(item.prot ?? item.proteine), 0),
      carb: items.reduce((acc, item) => acc + toNum(item.carb ?? item.carboidrati), 0),
      fat: items.reduce((acc, item) => acc + toNum(item.fat ?? item.fatTotal ?? item.grassi), 0),
      zuccheri: items.reduce((acc, item) => acc + toNum(item.zuccheri ?? item.sugars), 0),
    };
  }, [addedFoods]);

  const dailyGoals = useMemo(() => ({
    kcal: (dynamicDailyKcal ?? userTargets?.kcal ?? 2000) || 2000,
    prot: (userTargets?.prot ?? 150) || 150,
    carb: (userTargets?.carb ?? 200) || 200,
    fat: (userTargets?.fatTotal ?? userTargets?.fat ?? 60) || 60
  }), [dynamicDailyKcal, userTargets]);
  const targetMacros = useMemo(() => {
    if (targetMacrosPasto && targetMacrosPasto.kcal != null) {
      return {
        kcal: targetMacrosPasto.kcal,
        prot: targetMacrosPasto.prot,
        carb: targetMacrosPasto.carb,
        fat: targetMacrosPasto.fat,
        fibre: targetMacrosPasto.fibre ?? Math.max(2, (userTargets?.fibre ?? 30) * (ratio || 0.2)),
      };
    }
    return {
      kcal: (dailyGoals.kcal || 2000) * 0.25 || 500,
      prot: (dailyGoals.prot || 150) * 0.25 || 38,
      carb: (dailyGoals.carb || 200) * 0.25 || 50,
      fat: (dailyGoals.fat || 60) * 0.25 || 15,
      fibre: (userTargets?.fibre ?? 30) * 0.25 || 8,
    };
  }, [targetMacrosPasto, dailyGoals, userTargets?.fibre, ratio]);

  const magicFillEligibleFoods = useMemo(
    () => (addedFoods || []).filter((f) => f.type !== 'recipe' && f.isRecipe !== true),
    [addedFoods]
  );

  const magicFillUnlockedFoods = useMemo(
    () => magicFillEligibleFoods.filter((f) => !f.locked),
    [magicFillEligibleFoods]
  );

  const toggleFoodQtyLock = useCallback((foodId) => {
    setAddedFoods((prev) =>
      prev.map((f) => (String(f.id) === String(foodId) ? { ...f, locked: !f.locked } : f))
    );
  }, [setAddedFoods]);

  const handleMagicFill = useCallback(() => {
    if (magicFillEligibleFoods.length < 2 || magicFillUnlockedFoods.length < 1) return;
    const tm = targetMacrosPasto && targetMacrosPasto.kcal != null ? targetMacrosPasto : targetMacros;
    const target = {
      prot: Number(tm?.prot) || 0,
      carb: Number(tm?.carb) || 0,
      fat: Number(tm?.fat ?? tm?.fatTotal) || 0,
    };
    const lockedSum = { prot: 0, carb: 0, fat: 0 };
    (addedFoods || []).forEach((f) => {
      if (f.type === 'recipe' || f.isRecipe === true || !f.locked) return;
      const m = mealFoodMacrosAtPortion(f);
      lockedSum.prot += m.prot;
      lockedSum.carb += m.carb;
      lockedSum.fat += m.fat;
    });
    const residual = {
      prot: Math.max(0, target.prot - lockedSum.prot),
      carb: Math.max(0, target.carb - lockedSum.carb),
      fat: Math.max(0, target.fat - lockedSum.fat),
    };
    const results = calculateMagicFill(magicFillUnlockedFoods, residual);
    const scaleKeys = new Set([
      'kcal', 'cal', 'prot', 'carb', 'fat', 'fatTotal',
      ...Object.values(TARGETS).flatMap((g) => Object.keys(g || {})),
    ]);
    setAddedFoods((prev) =>
      prev.map((f) => {
        if (f.type === 'recipe' || f.isRecipe === true || f.locked) return f;
        const hit = results.find((r) => String(r.id) === String(f.id));
        if (!hit) return f;
        const newQ = Math.max(5, Math.min(5000, hit.grams > 0 ? hit.grams : 5));
        const curQ = Math.max(1, Number(f.qta ?? f.weight ?? 100) || 100);
        const ratioQ = newQ / curQ;
        const next = { ...f, qta: newQ, weight: newQ };
        scaleKeys.forEach((k) => {
          if (f[k] != null && typeof f[k] === 'number' && !Number.isNaN(f[k])) {
            const v = f[k] * ratioQ;
            next[k] = k === 'kcal' || k === 'cal' ? Math.max(0, Math.round(v)) : Math.max(0, Math.round(v * 10) / 10);
          }
        });
        return next;
      })
    );
    setMagicFillToast(true);
    window.setTimeout(() => setMagicFillToast(false), 2200);
  }, [
    addedFoods,
    magicFillEligibleFoods,
    magicFillUnlockedFoods,
    targetMacrosPasto,
    targetMacros,
    TARGETS,
    setAddedFoods,
  ]);

  const handleSmartCompleteClick = useCallback(async () => {
    if (typeof onSmartComplete !== 'function' || smartCompleteLoading) return;
    setSmartCompleteLoading(true);
    try {
      const constraints = buildAiMealConstraintsPayload();
      const hasAny = constraints.fixedFoods.length + constraints.excludedFoods.length + constraints.preferredFoods.length > 0;
      await onSmartComplete(addedFoods, hasAny ? constraints : undefined);
    } finally {
      setSmartCompleteLoading(false);
    }
  }, [onSmartComplete, smartCompleteLoading, addedFoods, buildAiMealConstraintsPayload]);

  const onSmartCompleteRef = useRef(onSmartComplete);
  onSmartCompleteRef.current = onSmartComplete;
  const addedFoodsForLaunchRef = useRef(addedFoods);
  addedFoodsForLaunchRef.current = addedFoods;

  useEffect(() => {
    if (!smartMealLaunchKey) return undefined;
    const t = window.setTimeout(() => {
      if ((addedFoodsForLaunchRef.current || []).length > 0) return;
      const fn = onSmartCompleteRef.current;
      if (typeof fn !== 'function') return;
      setSmartCompleteLoading(true);
      void Promise.resolve(fn([], undefined)).finally(() => setSmartCompleteLoading(false));
    }, 480);
    return () => window.clearTimeout(t);
  }, [smartMealLaunchKey]);

  const swapSourceFood = useMemo(() => {
    if (swapPanelFoodId == null) return null;
    return (addedFoods || []).find((f) => String(f.id) === String(swapPanelFoodId)) || null;
  }, [swapPanelFoodId, addedFoods]);

  const swapSuggestions = useMemo(() => {
    if (!swapSourceFood || !foodDb || typeof foodDb !== 'object') return [];
    return getSmartSubstitutes(swapSourceFood.id, foodDb, swapSourceFood, {
      recentDbKeys: recentFoods,
    });
  }, [swapSourceFood, foodDb, recentFoods]);

  const handlePickSubstitute = useCallback(
    (queueFood, sub) => {
      if (!estraiDatiFoodDb || !sub?.dbKey || !queueFood) return;
      const wOld = Number(queueFood.qta ?? queueFood.weight ?? 100) || 100;
      const newW = calculateSwapQuantity(queueFood, wOld, sub.row);
      const nome = String(sub.desc || '').trim();
      if (!nome) return;
      const newItem = estraiDatiFoodDb(nome, newW, mealType, sub.dbKey);
      const keepId = queueFood.id;
      setAddedFoods((prev) =>
        prev.map((f) => (String(f.id) === String(keepId) ? { ...newItem, id: keepId, mealType: newItem.mealType || mealType } : f))
      );
      setSwapPanelFoodId(null);
      setSwapToast(true);
      window.setTimeout(() => setSwapToast(false), 2000);
    },
    [estraiDatiFoodDb, mealType]
  );

  const baseMealTypeKey = String(mealType || '').split('_')[0].toLowerCase();
  const isCena = baseMealTypeKey === 'cena';

  const swapCategoryLabel = (cat) =>
    cat === 'carbo' ? 'Carboidrati' : cat === 'grasso' ? 'Grassi' : 'Proteine';

  useEffect(() => {
    if (swapPanelFoodId == null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setSwapPanelFoodId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swapPanelFoodId]);

  return (
    <div className="view-animate" style={{ position: 'relative' }}>
      {swapToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
            zIndex: 10051,
            padding: '10px 18px',
            borderRadius: '12px',
            background: 'linear-gradient(145deg, rgba(0, 229, 255, 0.92), rgba(0, 140, 200, 0.9))',
            color: '#0a0a0a',
            fontSize: '0.82rem',
            fontWeight: 700,
            boxShadow: '0 8px 28px rgba(0, 229, 255, 0.35)',
            pointerEvents: 'none',
            maxWidth: 'min(90vw, 320px)',
            textAlign: 'center',
          }}
        >
          Sostituito e bilanciato!
        </div>
      )}
      {magicFillToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(110px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
            zIndex: 10050,
            padding: '12px 20px',
            borderRadius: '14px',
            background: 'linear-gradient(145deg, rgba(0, 230, 118, 0.95), rgba(0, 180, 90, 0.92))',
            color: '#0a0a0a',
            fontSize: '0.85rem',
            fontWeight: 700,
            boxShadow: '0 8px 32px rgba(0, 230, 118, 0.35)',
            pointerEvents: 'none',
            maxWidth: 'min(92vw, 360px)',
            textAlign: 'center',
          }}
        >
          Pasto bilanciato con successo!
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#fff', letterSpacing: '2px', margin: 0 }}>NUOVO PASTO</h2>
        <div style={{ width: '70px' }}></div>
      </div>
      {plannerNoteFromAi != null && String(plannerNoteFromAi).trim() !== '' && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px dashed rgba(0, 229, 255, 0.45)',
            background: 'rgba(0, 229, 255, 0.06)',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', color: '#67e8f9', marginBottom: 6 }}>
            NOTA DELL&apos;AI (PIANO)
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#e0f7ff', lineHeight: 1.45 }}>{String(plannerNoteFromAi).trim()}</p>
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        {MEAL_TYPES.map(({ label, id }) => (
          <button
            key={id}
            type="button"
            className={`type-btn ${mealType === id ? 'active' : ''}`}
            onClick={() => setMealType(id)}
            style={{ whiteSpace: 'nowrap', padding: '12px 15px' }}
          >
            {label}
          </button>
        ))}
      </div>
      {(mealType === 'cena' || mealType === 'Cena') && (
        <div style={{ background: 'rgba(156, 39, 176, 0.15)', border: '1px solid #9c27b0', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
          <div style={{ color: '#e1bee7', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>📉 STRATEGIA NOTTURNA</div>
          <div style={{ color: '#ccc', fontSize: '0.85rem', lineHeight: '1.5' }}><strong>Cortisolo Serale Rilevato:</strong> inserisci una quota strategica di carboidrati. Il picco insulinico agirà da antagonista naturale, abbattendo l'ormone dello stress e preparando il sistema nervoso centrale al sonno profondo.</div>
        </div>
      )}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '0.7rem', marginBottom: '8px' }}>
          <span>0:00</span>
          <input
          type="time"
          value={decimalToTimeStr(drawerMealTime)}
          onChange={(e) => {
            const newTimeStr = e.target.value;
            const v = parseTimeStrToDecimal(newTimeStr);
            setDrawerMealTime(v);
            setDrawerMealTimeStr(decimalToTimeStr(v));
            if (newTimeStr) {
              const hour = parseInt(newTimeStr.split(':')[0], 10);
              if (hour >= 5 && hour < 11) setMealType('colazione');
              else if (hour >= 11 && hour < 15) setMealType('pranzo');
              else if (hour >= 19 && hour <= 22) setMealType('cena');
              else setMealType('snack');
            }
          }}
          style={{ width: '130px', minWidth: '110px', padding: '8px 10px', background: '#1a1a1a', border: '1px solid #00e5ff', borderRadius: '8px', color: '#00e5ff', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center', letterSpacing: '1px' }}
        />
          <span>24:00</span>
        </div>
        <div ref={miniTimelinePastoRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
          {allNodes.filter(n => n.id !== `${mealType}_${drawerMealTime}`).map(n => {
            const isWork = n.type === 'work';
            const startP = getTimePositionPercent(n.time);
            const durP = isWork ? getTimePositionPercent(n.duration || 1) : 0;
            const isPesi = n.type === 'workout' && n.subType === 'pesi' && n.muscles?.length > 0;
            const iconContent = isPesi ? n.muscles.map(m => m.substring(0, 2).toUpperCase()).join('+') : (n.icon || '•');
            if (isWork) {
              return (
                <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
              );
            }
            return (
              <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none', fontSize: '0.5rem' }}>
                <span style={{ lineHeight: 1 }}>{iconContent}</span>
              </div>
            );
          })}
          <div className="mini-timeline-hitbox" role="slider" aria-label="Ora pasto" onPointerDown={(e) => handleMiniTimelineDrag(e, miniTimelinePastoRef, 'point', drawerMealTime, null, setDrawerMealTime, null)} style={{ position: 'absolute', left: `${getTimePositionPercent(drawerMealTime)}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, touchAction: 'none' }}>
            <div className="mini-timeline-point-bubble" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '28px', height: '28px', borderRadius: '50%', background: '#00e5ff', border: '2px solid #fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(0,229,255,0.5)', pointerEvents: 'none' }}>
              <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>{decimalToTimeStr(drawerMealTime)}</span>
              <span style={{ lineHeight: 1 }}>🍎</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pasto-container">
        <div className="pasto-builder-panel" ref={mealBuilderScrollAnchorRef}>
          <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '10px', border: '1px solid #333', background: energyAt20Percent < 40 ? 'rgba(220, 38, 38, 0.12)' : 'rgba(34, 197, 94, 0.1)', borderColor: energyAt20Percent < 40 ? 'rgba(220, 38, 38, 0.4)' : 'rgba(34, 197, 94, 0.35)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: '600', color: energyAt20Percent < 40 ? '#f87171' : '#4ade80', marginBottom: '4px' }}>Analisi Bio-Feedback</div>
            {energyAt20Percent < 40 ? (
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#fca5a5', lineHeight: 1.4 }}>⚠️ Rischio Cortisolo Alto rilevato. Si consiglia di aumentare la quota di carboidrati complessi o grassi sani in questo pasto per stabilizzare i livelli serali.</p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#86efac', lineHeight: 1.4 }}>✅ Equilibrio Serale Ottimale. La strategia attuale supporta bassi livelli di stress.            </p>
            )}
          </div>
          {typeof onSmartComplete === 'function' && (
            <div style={{ marginTop: 15, marginBottom: 15, width: '100%' }}>
              <details
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  border: '1px solid rgba(0, 229, 255, 0.2)',
                  background: 'rgba(0, 229, 255, 0.05)',
                  padding: '10px 12px',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#7dd3fc', userSelect: 'none' }}>
                  Vincoli AI pasto (opzionale)
                </summary>
                <p style={{ margin: '8px 0 6px', fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.4 }}>
                  Separare con virgola o a capo. L’AI deve includere i fissi, evitare gli esclusi e privilegiare i preferiti se coerenti con il target.
                </p>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.68rem', color: '#a5f3fc' }}>
                  Da includere
                  <input
                    type="text"
                    value={aiConstraintFixed}
                    onChange={(e) => setAiConstraintFixed(e.target.value)}
                    placeholder="es. Riso basmati, Petto di pollo"
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #333',
                      background: '#1a1a1a',
                      color: '#fff',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.68rem', color: '#fca5a5' }}>
                  Escludi
                  <input
                    type="text"
                    value={aiConstraintExcluded}
                    onChange={(e) => setAiConstraintExcluded(e.target.value)}
                    placeholder="es. Latte, Glutine"
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #333',
                      background: '#1a1a1a',
                      color: '#fff',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>
                <label style={{ display: 'block', fontSize: '0.68rem', color: '#fde68a' }}>
                  Preferiti
                  <input
                    type="text"
                    value={aiConstraintPreferred}
                    onChange={(e) => setAiConstraintPreferred(e.target.value)}
                    placeholder="es. Verdure a foglia, Legumi"
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 4,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #333',
                      background: '#1a1a1a',
                      color: '#fff',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>
              </details>
              <button
                type="button"
                className="btn-primary-glow btn-glass"
                onClick={handleSmartCompleteClick}
                disabled={smartCompleteLoading}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  border: '1px solid rgba(0, 229, 255, 0.45)',
                  background: 'linear-gradient(145deg, rgba(0, 229, 255, 0.18), rgba(255, 255, 255, 0.06))',
                  color: '#e0f7ff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  cursor: smartCompleteLoading ? 'wait' : 'pointer',
                  opacity: smartCompleteLoading ? 0.75 : 1,
                  boxShadow: '0 0 24px rgba(0, 229, 255, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                }}
              >
                {smartCompleteLoading ? '⏳ …' : addedFoods.length === 0 ? '✨ Genera Pasto' : '✨ Completa Pasto'}
              </button>
            </div>
          )}
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            {isBarcodeScannerOpen && (
              <div style={{ marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', background: '#000', border: '1px solid #333' }}>
                <video ref={barcodeVideoRef} muted playsInline style={{ width: '100%', maxHeight: '200px', display: 'block' }} />
                <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>Inquadra il codice a barre</span>
                  <button type="button" onClick={onCloseBarcodeScanner} style={{ padding: '6px 12px', background: '#333', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}>Chiudi</button>
                </div>
              </div>
            )}
            <div style={{ position: 'sticky', top: '-20px', zIndex: 50, background: '#111', paddingTop: '20px', paddingBottom: '10px', borderBottom: '1px solid #333', margin: '0 -15px 20px -15px', paddingLeft: '15px', paddingRight: '15px' }}>
              {!isComplexMode ? (
                <>
                  <div ref={foodDropdownContainerRef} style={{ position: 'relative', marginBottom: 12, maxWidth: 520 }}>
                    <div className="quick-add-bar">
                      <input
                        ref={foodInputRef}
                        type="text"
                        className="quick-input input-name"
                        placeholder="Es. Pollo"
                        value={foodNameInput}
                        onChange={(e) => {
                          setFoodNameInput(e.target.value);
                          setSelectedFoodMatch(null);
                          setShowFoodDropdown(true);
                        }}
                        onFocus={() => setShowFoodDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') document.getElementById('weight-input')?.focus();
                        }}
                      />
                      <input
                        id="weight-input"
                        type="number"
                        inputMode="decimal"
                        className="quick-input input-weight"
                        placeholder="g"
                        value={foodWeightInput}
                        onChange={(e) => setFoodWeightInput(e.target.value)}
                        onFocus={(e) => {
                          if (numpadFoodId) e.target.blur();
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSelectedFood()}
                        style={{ textAlign: 'center', boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        title="Scansiona barcode"
                        onClick={() => setIsBarcodeScannerOpen((prev) => !prev)}
                        style={{
                          padding: '10px 12px',
                          background: isBarcodeScannerOpen ? '#00e5ff' : 'rgba(255,255,255,0.08)',
                          border: '1px solid #333',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                        }}
                      >
                        📷
                      </button>
                      <button type="button" className="quick-add-btn" onClick={handleAddSelectedFood}>
                        +
                      </button>
                    </div>
                    {showFoodDropdown && (
                      foodNameInput.trim()
                      || (foodDropdownSuggestions && foodDropdownSuggestions.length > 0)
                      || visibleRecentFoodEntries.length > 0
                      || visibleFrequentFoodEntries.length > 0
                      || smartSuggestedFoods.length > 0
                    ) && (
                      <div
                        onMouseDown={(e) => e.preventDefault()}
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          borderRadius: '0 0 12px 12px',
                          maxHeight: '220px',
                          overflowY: 'auto',
                          zIndex: 50,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}
                      >
                        {isShortFoodQuery && visibleFrequentFoodEntries.length > 0 ? (
                          <>
                            <div
                              style={{
                                padding: '10px 16px 8px',
                                color: '#94a3b8',
                                fontSize: '0.68rem',
                                fontWeight: '600',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid #2a2a2a',
                              }}
                            >
                              ⭐ Frequenti
                            </div>
                            {visibleFrequentFoodEntries.map((entry) => (
                              <button
                                key={`frequent-${entry.id}-${entry.count}-${entry.lastUsed}`}
                                type="button"
                                style={{
                                  width: '100%',
                                  padding: '12px 16px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                  borderBottom: '1px solid #2a2a2a',
                                }}
                                onMouseDown={() => handleSelectRecentFood(entry)}
                              >
                                {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
                              </button>
                            ))}
                          </>
                        ) : null}
                        {isShortFoodQuery && visibleRecentFoodEntries.length > 0 ? (
                          <>
                            <div
                              style={{
                                padding: '10px 16px 8px',
                                color: '#94a3b8',
                                fontSize: '0.68rem',
                                fontWeight: '600',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid #2a2a2a',
                              }}
                            >
                              🕒 Recenti
                            </div>
                            {visibleRecentFoodEntries.map((entry) => (
                              <button
                                key={`recent-${entry.id}-${entry.lastUsed}`}
                                type="button"
                                style={{
                                  width: '100%',
                                  padding: '12px 16px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                  borderBottom: '1px solid #2a2a2a',
                                }}
                                onMouseDown={() => handleSelectRecentFood(entry)}
                              >
                                {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
                              </button>
                            ))}
                          </>
                        ) : null}
                        {isShortFoodQuery && smartSuggestedFoods.length > 0 ? (
                          <>
                            <div
                              style={{
                                padding: '10px 16px 8px',
                                color: '#94a3b8',
                                fontSize: '0.68rem',
                                fontWeight: '600',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid #2a2a2a',
                              }}
                            >
                              🍽 Suggeriti
                            </div>
                            {smartSuggestedFoods.map((entry) => (
                              <button
                                key={`suggested-${entry.id}`}
                                type="button"
                                style={{
                                  width: '100%',
                                  padding: '12px 16px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                  borderBottom: '1px solid #2a2a2a',
                                }}
                                onMouseDown={() => handleSelectRecentFood(entry)}
                              >
                                {renderFoodOptionLabel(entry.name, foodNameInput, entry.id)}
                              </button>
                            ))}
                          </>
                        ) : null}
                        {(foodDropdownSuggestions || []).map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              borderBottom: '1px solid #2a2a2a',
                            }}
                            onMouseDown={() => {
                              setFoodNameInput(s.desc);
                              setFoodWeightInput(getLastQuantityForFood(s.desc) || '');
                              setSelectedFoodMatch({
                                id: s.key,
                                desc: s.desc,
                                row: foodDb?.[s.key] || localFoodDb?.[s.key] || null,
                              });
                              trackRecentFood({ id: s.key, name: s.desc });
                              setShowFoodDropdown(false);
                              setTimeout(() => document.getElementById('weight-input')?.focus(), 50);
                            }}
                          >
                            {renderFoodOptionLabel(s.desc, foodNameInput, s.key)}
                          </button>
                        ))}
                        {foodNameInput.trim() ? (
                          <button
                            type="button"
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              textAlign: 'left',
                              background: 'rgba(179, 136, 255, 0.15)',
                              border: 'none',
                              color: '#b388ff',
                              cursor: isGeneratingFood ? 'wait' : 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                            }}
                            onMouseDown={() => generateFoodWithAI(foodNameInput.trim())}
                            disabled={isGeneratingFood}
                          >
                            {isGeneratingFood ? '⏳ Generazione in corso...' : `✨ Genera con AI: "${foodNameInput.trim()}"`}
                          </button>
                        ) : null}
                        {(foodSearchSources || []).map((source) => {
                          const results = source.results || [];
                          const isVisible = source.key === 'crea' ? isCreaExpanded : false;

                          return (
                            <React.Fragment key={source.key}>
                              {foodNameInput.trim() ? (
                                <button
                                  type="button"
                                  className="dropdown-action-button"
                                  style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    border: 'none',
                                    borderTop: '1px solid #2a2a2a',
                                    color: '#67e8f9',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                  }}
                                  onMouseDown={() => {
                                    if (source.key === 'crea') {
                                      setIsCreaExpanded((prev) => !prev);
                                    }
                                  }}
                                >
                                  {`${source.label} (${results.length} risultati)`}
                                  <span style={{ marginLeft: 8, color: '#94a3b8', fontWeight: 500 }}>
                                    {isVisible ? '▾' : '▸'}
                                  </span>
                                </button>
                              ) : null}
                              {foodNameInput.trim() && source.isLoading ? (
                                <div
                                  style={{
                                    borderTop: '1px solid #2a2a2a',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: '100%',
                                      padding: '12px 16px',
                                      color: '#94a3b8',
                                      fontSize: '0.88rem',
                                    }}
                                  >
                                    Caricamento...
                                  </div>
                                </div>
                              ) : null}
                              {foodNameInput.trim() && isVisible ? (
                                <div
                                  style={{
                                    borderTop: '1px solid #2a2a2a',
                                  }}
                                >
                                  {results.map((result, index) => {
                                    const desc = String(
                                      result?.name_it || result?.desc || result?.name || result?.product_name || ''
                                    ).trim();
                                    if (!desc) return null;

                                    return (
                                      <button
                                        key={`${source.key}-${result?.id || `${desc}-${index}`}`}
                                        type="button"
                                        style={{
                                          width: '100%',
                                          padding: '12px 16px',
                                          textAlign: 'left',
                                          background: 'rgba(103, 232, 249, 0.06)',
                                          border: 'none',
                                          borderBottom: '1px solid #2a2a2a',
                                          color: '#e2e8f0',
                                          cursor: 'pointer',
                                          fontSize: '0.9rem',
                                        }}
                                        onMouseDown={() => {
                                          setFoodNameInput(desc);
                                          setFoodWeightInput(getLastQuantityForFood(desc) || '');
                                          setSelectedFoodMatch({
                                            id: result?.id || null,
                                            desc,
                                            row: localFoodDb?.[result?.id] || foodDb?.[result?.id] || null,
                                          });
                                          trackRecentFood({ id: result?.id || desc, name: desc });
                                          setShowFoodDropdown(false);
                                          setTimeout(() => document.getElementById('weight-input')?.focus(), 50);
                                        }}
                                      >
                                        {renderFoodOptionLabel(desc, foodNameInput, result?.id || desc)}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Open Food Facts (📷) → compila grammi e +</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsComplexMode(true);
                      setEditingRecipeKey(null);
                      setRecipeSearchResults([]);
                      setShowRecipeDropdown(false);
                      setExtraSearchResults([]);
                      setShowExtraDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      padding: '12px 14px',
                      background: '#2c2c2e',
                      border: '1px solid rgba(0, 229, 255, 0.35)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  >
                    Crea da Ricetta / Piatto Complesso
                  </button>
                </>
              ) : (
                <div
                  style={{
                    position: 'relative',
                    background: '#2c2c2e',
                    border: '1px solid #3a3a3c',
                    borderRadius: '12px',
                    padding: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Piatto complesso
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={complexFoodQuery}
                      onChange={(e) => setComplexFoodQuery(e.target.value)}
                      onFocus={() => {
                        if (recipeSearchResults.length > 0) setShowRecipeDropdown(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowRecipeDropdown(false), 200);
                      }}
                      placeholder="Es. Lasagne, Chili con carne…"
                      disabled={isGeneratingRecipe}
                      autoComplete="off"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '12px 14px',
                        background: '#1a1a1a',
                        border: '1px solid #444',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '0.95rem',
                        outline: 'none'
                      }}
                    />
                    {showRecipeDropdown && recipeSearchResults.length > 0 && !isGeneratingRecipe && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          marginTop: '4px',
                          background: '#1c1c1e',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 20,
                          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                        }}
                      >
                        {recipeSearchResults.map((r) => (
                          <div
                            key={r.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 10px 8px 14px',
                              borderBottom: '1px solid #2a2a2a'
                            }}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onMouseDown={(e) => e.preventDefault()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSelectSavedRecipe(r);
                                }
                              }}
                              onClick={() => handleSelectSavedRecipe(r)}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                padding: '4px 0',
                                fontSize: '0.9rem',
                                color: '#fff',
                                cursor: 'pointer'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 229, 255, 0.08)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              {r.name}
                            </div>
                            <button
                              type="button"
                              title="Elimina dal database"
                              aria-label="Elimina ricetta dal database"
                              onClick={(e) => { void handleDeleteRecipeFromDb(e, r.key); }}
                              style={{
                                flexShrink: 0,
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: '1px solid transparent',
                                borderRadius: '8px',
                                color: 'rgba(248, 113, 113, 0.85)',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                lineHeight: 1
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.12)';
                                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.25)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'transparent';
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
                    <button
                      type="button"
                      onClick={() => { void handleGenerateRecipe(); }}
                      disabled={isGeneratingRecipe || !complexFoodQuery.trim()}
                      style={{
                        flex: '1 1 140px',
                        padding: '12px 16px',
                        background: isGeneratingRecipe ? '#333' : 'rgba(0, 229, 255, 0.18)',
                        border: '1px solid #00e5ff',
                        borderRadius: '12px',
                        color: '#00e5ff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: isGeneratingRecipe || !complexFoodQuery.trim() ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingRecipe || !complexFoodQuery.trim() ? 0.6 : 1
                      }}
                    >
                      {isGeneratingRecipe ? '⏳ Generazione…' : 'Genera Bozza con AI'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelComplexMode}
                      disabled={isGeneratingRecipe}
                      style={{
                        flex: '1 1 100px',
                        padding: '12px 16px',
                        background: '#1a1a1a',
                        border: '1px solid #555',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: isGeneratingRecipe ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingRecipe ? 0.5 : 1
                      }}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
            {isComplexMode && isGeneratingRecipe && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '12px 14px',
                  background: 'rgba(0, 229, 255, 0.08)',
                  border: '1px solid rgba(0, 229, 255, 0.35)',
                  borderRadius: '12px',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                  textAlign: 'center'
                }}
              >
                Lo chef AI sta calcolando…
              </div>
            )}
            {isComplexMode && draftRecipe.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Bozza ingredienti
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {draftRecipe.map((ing, idx) => {
                    const inFoodDb = isIngredientNameInFoodDb(ing.name, foodDb);
                    const schedato = ing._foodDbSchedato === true;
                    const deepLoading = deepCompileLoadingIndex === idx;
                    return (
                    <div
                      key={`${ing.id}_${idx}`}
                      style={{
                        background: '#2c2c2e',
                        border: '1px solid #3a3a3c',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '10px',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{ing.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          {Math.round(ing.kcal)} kcal · P {ing.prot}g · C {ing.carb}g · G {ing.fat}g
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                        {schedato ? (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '6px 10px',
                              borderRadius: '10px',
                              background: 'rgba(34, 197, 94, 0.2)',
                              color: '#4ade80',
                              border: '1px solid rgba(34, 197, 94, 0.45)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ✅ Schedato
                          </span>
                        ) : null}
                        {!schedato && !inFoodDb ? (
                          <button
                            type="button"
                            disabled={deepLoading || isGeneratingRecipe}
                            onClick={() => { void handleDeepAICompile(idx, ing.name); }}
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '6px 10px',
                              borderRadius: '10px',
                              background: 'rgba(234, 179, 8, 0.18)',
                              color: '#fbbf24',
                              border: '1px solid rgba(234, 179, 8, 0.5)',
                              cursor: deepLoading || isGeneratingRecipe ? 'not-allowed' : 'pointer',
                              opacity: deepLoading || isGeneratingRecipe ? 0.55 : 1,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {deepLoading ? '⏳ Schedatura…' : '⚠️ Scheda nel DB'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label="Meno 5 grammi"
                          onClick={() => adjustDraftIngredientWeight(ing.id, -5)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: '1px solid #555',
                            background: '#1a1a1a',
                            color: '#fff',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          −
                        </button>
                        <input
                          key={`w-${ing.id}-${ing.weight}`}
                          type="number"
                          inputMode="numeric"
                          min={5}
                          step={5}
                          defaultValue={ing.weight}
                          onBlur={(e) => setDraftIngredientWeightFromInput(ing.id, e.target.value)}
                          style={{
                            width: '64px',
                            padding: '8px',
                            textAlign: 'center',
                            background: '#1a1a1a',
                            border: '1px solid #444',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '0.9rem',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Più 5 grammi"
                          onClick={() => adjustDraftIngredientWeight(ing.id, 5)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: '1px solid #555',
                            background: '#1a1a1a',
                            color: '#fff',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          aria-label="Rimuovi ingrediente"
                          onClick={() => removeDraftIngredient(ing.id)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: '1px solid rgba(244, 67, 54, 0.5)',
                            background: 'rgba(244, 67, 54, 0.15)',
                            color: '#f87171',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: '14px',
                    padding: '14px',
                    background: '#2c2c2e',
                    border: '1px solid #3a3a3c',
                    borderRadius: '12px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
                    Ingrediente extra
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'stretch' }}>
                      <input
                        type="text"
                        value={extraIngredientQuery}
                        onChange={(e) => setExtraIngredientQuery(e.target.value)}
                        onFocus={() => {
                          if (extraSearchResults.length > 0) setShowExtraDropdown(true);
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowExtraDropdown(false), 200);
                        }}
                        placeholder="Cerca nel database o usa AI…"
                        disabled={isAddingExtra}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isAddingExtra && extraIngredientQuery.trim()) {
                            e.preventDefault();
                            void handleAddExtraIngredient();
                          }
                        }}
                        style={{
                          flex: '1 1 180px',
                          minWidth: 0,
                          padding: '12px 14px',
                          background: '#1a1a1a',
                          border: '1px solid #444',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '0.9rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                          opacity: isAddingExtra ? 0.65 : 1
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { void handleAddExtraIngredient(); }}
                        disabled={isAddingExtra || !extraIngredientQuery.trim()}
                        style={{
                          flex: '0 0 auto',
                          padding: '12px 18px',
                          background: isAddingExtra ? '#333' : 'rgba(0, 229, 255, 0.15)',
                          border: '1px solid #00e5ff',
                          borderRadius: '12px',
                          color: '#00e5ff',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: isAddingExtra || !extraIngredientQuery.trim() ? 'not-allowed' : 'pointer',
                          opacity: isAddingExtra || !extraIngredientQuery.trim() ? 0.55 : 1,
                          whiteSpace: 'nowrap',
                          alignSelf: 'center'
                        }}
                      >
                        {isAddingExtra ? 'Cerco…' : '+ Aggiungi (AI)'}
                      </button>
                    </div>
                    {showExtraDropdown && extraSearchResults.length > 0 && !isAddingExtra && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          marginTop: '4px',
                          background: '#1c1c1e',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 20,
                          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                        }}
                      >
                        {extraSearchResults.map((row) => (
                          <div
                            key={row.key}
                            role="button"
                            tabIndex={0}
                            onMouseDown={(e) => e.preventDefault()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectExtraFoodFromDb(row);
                              }
                            }}
                            onClick={() => handleSelectExtraFoodFromDb(row)}
                            style={{
                              padding: '12px 14px',
                              fontSize: '0.9rem',
                              color: '#fff',
                              cursor: 'pointer',
                              borderBottom: '1px solid #2a2a2a'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 229, 255, 0.12)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {row.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '14px',
                    padding: '14px',
                    background: '#1e1e22',
                    border: '1px solid #3a3a3c',
                    borderRadius: '12px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 700, marginBottom: '12px' }}>
                    Quantità consumata del piatto:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                    <button
                      type="button"
                      aria-label="Meno 50 grammi"
                      onClick={() => setComplexPortionWeight((prev) => Math.max(50, (Number(prev) || 100) - 50))}
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        border: '1px solid #555',
                        background: '#2c2c2e',
                        color: '#fff',
                        fontSize: '1.25rem',
                        cursor: 'pointer',
                        lineHeight: 1
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={50}
                      max={5000}
                      step={5}
                      value={complexPortionWeight}
                      onChange={(e) => {
                        const n = Math.round(Number(e.target.value));
                        if (!Number.isFinite(n)) return;
                        setComplexPortionWeight(Math.max(50, Math.min(5000, n)));
                      }}
                      style={{
                        flex: '1 1 100px',
                        minWidth: '80px',
                        padding: '12px 14px',
                        background: '#1a1a1a',
                        border: '1px solid #444',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '1rem',
                        fontWeight: 700,
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Più 50 grammi"
                      onClick={() => setComplexPortionWeight((prev) => Math.min(5000, (Number(prev) || 100) + 50))}
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        border: '1px solid #555',
                        background: '#2c2c2e',
                        color: '#fff',
                        fontSize: '1.25rem',
                        cursor: 'pointer',
                        lineHeight: 1
                      }}
                    >
                      +
                    </button>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', flex: '1 1 100%' }}>g (bozza calibrata su 100g totali)</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.6 }}>
                    <div><strong style={{ color: '#cbd5e1' }}>Anteprima porzione ({portionPreview.w}g):</strong></div>
                    <div>
                      {Math.round(portionPreview.kcal)} kcal · P {portionPreview.prot.toFixed(1)}g · C {portionPreview.carb.toFixed(1)}g · G {portionPreview.fat.toFixed(1)}g
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleConfirmRecipeToMeal}
                  style={{
                    width: '100%',
                    marginTop: '16px',
                    padding: '16px 18px',
                    background: 'linear-gradient(145deg, rgba(0, 229, 255, 0.25), rgba(0, 229, 255, 0.08))',
                    border: '2px solid #00e5ff',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  {editingRecipeKey ? 'Aggiorna Ricetta e Aggiungi' : 'Conferma Nuova Ricetta e Aggiungi'}
                </button>
              </div>
            )}
            {!isComplexMode && abitudiniIeri.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <button type="button" onClick={() => setIsAbitudiniOpen(prev => !prev)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #333', borderRadius: '10px', color: '#888', fontSize: '0.7rem', letterSpacing: '1px', cursor: 'pointer', textAlign: 'left' }}>
                  <span>Abitudini di ieri</span>
                  <span style={{ fontSize: '1rem', transition: 'transform 0.2s', transform: isAbitudiniOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                </button>
                {isAbitudiniOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                    {abitudiniIeri.map((f, idx) => (
                      <button key={f.id || `yest_${idx}`} type="button" onClick={() => setAddedFoods(prev => [...prev, { ...f, id: `habit_${Date.now()}_${idx}`, mealType }])} style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid #333', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {f.desc || f.name}{f.qta != null || f.weight != null ? ` (${f.qta ?? f.weight}g)` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ minHeight: '100px', marginBottom: '20px' }}>
            {addedFoods.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '30px' }}>Nessun alimento in coda</p>
            ) : (
              <>
              {addedFoods.map((food) => {
                const isRecipeItem = food.type === 'recipe' || food.isRecipe === true;
                const omega3G = (food.omega3 != null && food.omega3 > 0) ? (food.omega3 >= 1 ? food.omega3 : food.omega3 / 1000) : 0;
                const omega3Rich = omega3G > 0.5;
                const mgVal = Number(food.mg) || 0;
                const mgRich = mgVal >= 30;
                const qta = Number(food.qta ?? food.weight ?? 100) || 100;
                const qtyLocked = food.locked === true;
                const step = isRecipeItem ? 50 : (Number(food.unitStep) || 10);
                const rowKey = String(food.id);
                const recipeExpanded = !!expandedAddedFoods[rowKey];
                const recipeIngs = Array.isArray(food.ingredients) ? food.ingredients : [];
                const swapReady =
                  typeof estraiDatiFoodDb === 'function' && Object.keys(foodDb || {}).length > 0;
                const accBtnStyle = {
                  flexShrink: 0,
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '0.65rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                };
                return (
                  <div key={food.id} className="food-pill" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          {isRecipeItem ? (
                            <button
                              type="button"
                              aria-expanded={recipeExpanded}
                              title={recipeExpanded ? 'Comprimi ingredienti' : 'Espandi ingredienti'}
                              onClick={() => toggleAddedFood(food.id)}
                              style={accBtnStyle}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 229, 255, 0.1)'; e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.35)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = '#333'; }}
                            >
                              {recipeExpanded ? '▲' : '▼'}
                            </button>
                          ) : null}
                          <span className="food-pill-name">{food.desc || food.name}</span>
                          {!isRecipeItem && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFoodQtyLock(food.id);
                                }}
                                title={
                                  qtyLocked
                                    ? 'Quantità bloccata: il bilanciamento automatico non la modifica. Clic per sbloccare.'
                                    : 'Blocca quantità: il bilanciamento automatico non la modificherà. Clic per bloccare.'
                                }
                                aria-label={qtyLocked ? 'Sblocca quantità per bilanciamento' : 'Blocca quantità per bilanciamento'}
                                aria-pressed={qtyLocked}
                                style={{
                                  flexShrink: 0,
                                  background: qtyLocked ? 'rgba(251, 191, 36, 0.18)' : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${qtyLocked ? 'rgba(251, 191, 36, 0.45)' : '#333'}`,
                                  borderRadius: '8px',
                                  color: qtyLocked ? '#fcd34d' : '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  padding: '2px 8px',
                                  lineHeight: 1.2,
                                  fontWeight: 700,
                                }}
                              >
                                {qtyLocked ? '🔒' : '🔓'}
                              </button>
                          )}
                          {!isRecipeItem && (
                              <button
                                type="button"
                                disabled={!swapReady}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!swapReady) return;
                                  setSwapPanelFoodId((cur) => (String(cur) === String(food.id) ? null : food.id));
                                }}
                                title={
                                  swapReady
                                    ? 'Swap intelligente'
                                    : 'Aggiungi alimenti al database o collega estraiDatiFoodDb per usare lo swap'
                                }
                                aria-label="Sostituisci alimento"
                                style={{
                                  flexShrink: 0,
                                  background: swapReady ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${swapReady ? 'rgba(0, 229, 255, 0.35)' : '#333'}`,
                                  borderRadius: '8px',
                                  color: swapReady ? '#7dd3fc' : '#64748b',
                                  cursor: swapReady ? 'pointer' : 'not-allowed',
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  lineHeight: 1.2,
                                  fontWeight: 700,
                                  opacity: swapReady ? 1 : 0.65,
                                }}
                              >
                                🔄
                              </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFoodForInfo(food);
                            }}
                            title="Etichetta nutrizionale"
                            aria-label="Etichetta nutrizionale"
                            style={{
                              flexShrink: 0,
                              opacity: 0.42,
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '0.68rem',
                              padding: '0 2px',
                              lineHeight: 1,
                              fontWeight: 600,
                            }}
                          >
                            ℹ
                          </button>
                          {isRecipeItem && (
                            <span style={{ fontSize: '0.58rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(179, 136, 255, 0.25)', color: '#c4b5fd', fontWeight: 700, letterSpacing: '0.04em' }}>RICETTA</span>
                          )}
                          <span className="food-pill-weight">{qta}g</span>
                          {(omega3Rich || mgRich) && (
                            <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
                              {omega3Rich && <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '10px', background: 'rgba(0, 150, 255, 0.25)', color: '#5eb3f6', fontWeight: '600' }}>Ω3</span>}
                              {mgRich && <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '10px', background: 'rgba(139, 90, 43, 0.35)', color: '#d4a574', fontWeight: '600' }}>Mg</span>}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <>
                          <button type="button" className="calibration-btn" onClick={() => handleCalibrateFoodWeight(food.id, -step)} title={`-${step}g`} aria-label={`-${step}g`}>−</button>
                          <div
                            onClick={() => { setNumpadValue(String(qta)); setNumpadFoodId(food.id); }}
                            style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00e5ff', minWidth: '60px', textAlign: 'center', cursor: 'pointer', background: '#222', padding: '5px 10px', borderRadius: '8px', border: '1px solid #333' }}
                          >
                            {qta}g
                          </div>
                          <button type="button" className="calibration-btn" onClick={() => handleCalibrateFoodWeight(food.id, step)} title={`+${step}g`} aria-label={`+${step}g`}>+</button>
                        </>
                        <div className="food-pill-actions" style={{ marginLeft: '4px' }}>
                          {isRecipeItem ? (
                            <button type="button" className="food-pill-btn" onClick={() => handleEditAddedRecipe(food.id)} title="Modifica bozza ricetta">✏️</button>
                          ) : (
                            <button type="button" className="food-pill-btn" onClick={() => { setSelectedFoodForEdit({ food, source: 'queue' }); setEditQuantityValue(String(qta)); }} title="Modifica quantità">✏️</button>
                          )}
                          <button type="button" className="food-pill-btn btn-delete" onClick={() => setAddedFoods(prev => prev.filter(f => f.id !== food.id))}>✕</button>
                        </div>
                      </div>
                    </div>
                    {isRecipeItem && recipeExpanded ? (
                      <div
                        style={{
                          marginTop: '10px',
                          paddingLeft: '12px',
                          marginLeft: '4px',
                          borderLeft: '2px solid rgba(179, 136, 255, 0.35)',
                          fontSize: '0.68rem',
                          color: '#94a3b8',
                          lineHeight: 1.35
                        }}
                      >
                        {recipeIngs.length === 0 ? (
                          <span style={{ fontStyle: 'italic', opacity: 0.85 }}>Nessun ingrediente in elenco</span>
                        ) : (
                          recipeIngs.map((ing, idx) => {
                            const nm = String(ing.desc ?? ing.name ?? '—').trim() || '—';
                            const gw = Math.round(Number(ing.weight ?? ing.qta) || 0);
                            const ik = ing.kcal != null && Number.isFinite(Number(ing.kcal)) ? `${Math.round(Number(ing.kcal))}` : '—';
                            const ip = ing.prot != null && Number.isFinite(Number(ing.prot)) ? `${Math.round(Number(ing.prot) * 10) / 10}` : '—';
                            const ic = ing.carb != null && Number.isFinite(Number(ing.carb)) ? `${Math.round(Number(ing.carb) * 10) / 10}` : '—';
                            const ifat = ing.fat != null && Number.isFinite(Number(ing.fat)) ? `${Math.round(Number(ing.fat) * 10) / 10}` : '—';
                            return (
                              <div key={ing.id != null ? String(ing.id) : `ing-${idx}`} style={{ marginBottom: '6px' }}>
                                <span style={{ color: '#e2e8f0' }}>{nm}</span>
                                <span>{' · '}{gw}g</span>
                                <span>{' · '}{ik} kcal</span>
                                <span>{' · '}P {ip}g · C {ic}g · G {ifat}g</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                    {String(swapPanelFoodId) === String(food.id) && (
                      <div
                        className="ai-card"
                        style={{
                          marginTop: '12px',
                          padding: '12px 14px',
                          fontSize: '0.78rem',
                          lineHeight: 1.4,
                        }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Sostituti suggeriti"
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            marginBottom: '10px',
                          }}
                        >
                          <span style={{ color: '#a5f3fc', fontWeight: 700, letterSpacing: '0.04em' }}>
                            Swap · {swapCategoryLabel(categorizeFood(food))}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSwapPanelFoodId(null)}
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid #333',
                              borderRadius: '8px',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              padding: '4px 10px',
                            }}
                          >
                            Chiudi
                          </button>
                        </div>
                        {swapSuggestions.length === 0 ? (
                          <p style={{ margin: 0, color: '#64748b', fontStyle: 'italic' }}>
                            Nessun sostituto in database per questa categoria. Aggiungi alimenti al DB o prova un altro
                            item.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {swapSuggestions.map((s) => (
                              <button
                                key={s.dbKey}
                                type="button"
                                onClick={() => handlePickSubstitute(food, s)}
                                style={{
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  borderRadius: '10px',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  background: 'rgba(255,255,255,0.05)',
                                  color: '#e2e8f0',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                }}
                              >
                                {s.desc}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {magicFillEligibleFoods.length >= 2 && magicFillUnlockedFoods.length >= 1 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 14,
                    width: '100%',
                  }}
                >
                  <button
                    type="button"
                    className="btn-primary-glow btn-glass"
                    onClick={handleMagicFill}
                    style={{
                      flex: '1 1 140px',
                      minWidth: 140,
                      padding: '14px 18px',
                      borderRadius: '14px',
                      border: '1px solid rgba(0, 229, 255, 0.45)',
                      background: 'linear-gradient(145deg, rgba(0, 229, 255, 0.18), rgba(255, 255, 255, 0.06))',
                      color: '#e0f7ff',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      cursor: 'pointer',
                      boxShadow: '0 0 24px rgba(0, 229, 255, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                    }}
                  >
                    🪄 Bilancia Automaticamente
                  </button>
                </div>
              )}
              </>
            )}
          </div>
          {addedFoods.length > 0 && (
            <>
              {userProfile?.level === 'pro' && (
                <>
                  <button type="button" onClick={() => setIsAdvancedPastoMode(prev => !prev)} style={{ width: '100%', marginBottom: '16px', padding: '10px 14px', fontSize: '0.8rem', background: isAdvancedPastoMode ? 'rgba(0, 229, 255, 0.15)' : '#1a1a1a', border: '1px solid #333', borderRadius: '10px', color: '#00e5ff', cursor: 'pointer', textAlign: 'center' }}>
                    {isAdvancedPastoMode ? '⚙️ Nascondi Telemetria Avanzata' : '⚙️ Mostra Telemetria Avanzata'}
                  </button>
                  {checkBilanciamentoPasto && (() => {
                    const alert = checkBilanciamentoPasto();
                    if (!alert) return null;
                    return (
                      <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${alert.color}`, background: `${alert.color}20`, color: alert.color, fontSize: '0.8rem', lineHeight: 1.4 }}>
                        {alert.text}
                      </div>
                    );
                  })()}
                  {isAdvancedPastoMode && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '15px', marginBottom: '20px', overflow: 'hidden' }}>
                      <h4 style={{ fontSize: '0.65rem', color: '#b388ff', letterSpacing: '1px', marginBottom: '10px', textTransform: 'uppercase' }}>Telemetria Pasto ({MEAL_LABELS_SAVE[mealType] || mealType})</h4>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {TELEMETRY_TABS.map(t => (
                          <button key={t} type="button" onClick={() => scrollToMealCarouselTab(t)} style={{ padding: '8px 14px', fontSize: '0.7rem', fontWeight: 'bold', background: mealCarouselTab === t ? '#00e5ff' : '#111', color: mealCarouselTab === t ? '#000' : '#888', border: 'none', borderRadius: '20px', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer' }}>{t}</button>
                        ))}
                      </div>
                      <div className="telemetry-carousel" ref={mealCarouselRef} onScroll={handleMealCarouselScroll} style={{ height: '220px', display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {renderProgressBar('Calorie', safeBarCurrent(mealTotaliFull.kcal), safeBarTarget(targetMacrosPasto?.kcal ?? targetMacros?.kcal, 500), 'kcal', 'kcal')}
                            {renderProgressBar('PROTEINE', safeBarCurrent(mealTotaliFull?.prot), safeBarTarget(targetMacrosPasto?.prot ?? targetMacros?.prot, 38), 'g', 'prot')}
                            {renderProgressBar('CARBOIDRATI', safeBarCurrent(mealTotaliFull.carb), safeBarTarget(targetMacrosPasto?.carb ?? targetMacros?.carb, 50), 'g', 'carb')}
                            {renderProgressBar('GRASSI', safeBarCurrent(mealTotaliFull.fatTotal ?? mealTotaliFull.fat), safeBarTarget(targetMacrosPasto?.fat ?? targetMacros?.fat, 15), 'g', 'fatTotal')}
                            {renderProgressBar('FIBRE', safeBarCurrent(mealTotaliFull.fibre), safeBarTarget(targetMacrosPasto?.fibre ?? targetMacros?.fibre, 8), 'g', 'fibre')}
                            {targetMacrosPasto?.maxSimpleSugarG != null &&
                              renderProgressBar(
                                'ZUCCH. SEMPL.',
                                safeBarCurrent(currentMealMacros.zuccheri),
                                safeBarTarget(targetMacrosPasto.maxSimpleSugarG, 8),
                                'g',
                                'zuccheri'
                              )}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            <h4 style={{ fontSize: '0.65rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '10px', marginTop: 0 }}>RAPPORTI BIOCHIMICI</h4>
                            {renderRatioBar('Equilibrio Elettrolitico', 'Na', mealTotaliFull?.na, 'K', mealTotaliFull?.k, 'Na < K', (Number(mealTotaliFull?.na) || 0) < (Number(mealTotaliFull?.k) || 0))}
                            {renderRatioBar('Omega 6:3', 'Ω6', mealTotaliFull?.omega6, 'Ω3', mealTotaliFull?.omega3, 'W6:W3 ≤ 4:1', (Number(mealTotaliFull?.omega6) || 0) <= (Number(mealTotaliFull?.omega3) || 1) * 4)}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {Object.keys(TARGETS.amino || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.amino[k] || 0) * ratio, 'mg', k))}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {Object.keys(TARGETS.vit || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.vit[k] || 0) * ratio, k === 'vitA' || k === 'b9' ? 'µg' : 'mg', k))}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {Object.keys(TARGETS.min || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.min[k] || 0) * ratio, k === 'se' ? 'µg' : 'mg', k))}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {renderProgressBar('Grassi tot.', safeBarCurrent(mealTotaliFull.fatTotal ?? mealTotaliFull.fat), safeBarTarget(targetMacrosPasto?.fat ?? targetMacros?.fat, 15), 'g', 'fatTotal')}
                            {Object.keys(TARGETS.fat || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.fat[k] || 0) * ratio, 'g', k))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
          )}
        </>
          )}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.7rem', color: '#00e5ff', letterSpacing: '1px', marginBottom: '10px', textTransform: 'uppercase' }}>
              {isCena ? 'Rimanenza Giornaliera' : 'Quota Prevista Pasto'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {renderProgressBar('Kcal', safeBarCurrent(currentMealMacros.kcal), safeBarTarget(targetMacros.kcal, 500), 'kcal', 'kcal')}
              {renderProgressBar('Proteine', safeBarCurrent(currentMealMacros.prot), safeBarTarget(targetMacros.prot, 38), 'g', 'prot')}
              {renderProgressBar('Carboidrati', safeBarCurrent(currentMealMacros.carb), safeBarTarget(targetMacros.carb, 50), 'g', 'carb')}
              {renderProgressBar('Grassi', safeBarCurrent(currentMealMacros.fat), safeBarTarget(targetMacros.fat, 15), 'g', 'fatTotal')}
            </div>
          </div>
          <button type="button" onClick={saveMealToDiary} style={{ width: '100%', padding: '18px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.2s', opacity: addedFoods.length > 0 ? 1 : 0.5 }}>SALVA NEL DIARIO</button>
        </div>
      </div>
      {numpadFoodId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 999999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch' }}>
          <div style={{ marginTop: 'auto', background: '#1a1a1c', padding: '20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ color: '#888', fontSize: '1rem' }}>Quantità (g)</span>
              <span style={{ color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>{numpadValue || '0'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} type="button" onClick={() => setNumpadValue(prev => (prev === '0' ? String(num) : prev + num))} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#2c2c2e', color: '#fff', border: 'none', borderRadius: '12px' }}>
                  {num}
                </button>
              ))}
              <button type="button" onClick={() => setNumpadValue('0')} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#333', color: '#ff4444', border: 'none', borderRadius: '12px' }}>C</button>
              <button type="button" onClick={() => setNumpadValue(prev => (prev === '0' ? '0' : prev + '0'))} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#2c2c2e', color: '#fff', border: 'none', borderRadius: '12px' }}>0</button>
              <button type="button" onClick={() => setNumpadValue(prev => (prev.slice(0, -1) || '0'))} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#333', color: '#fff', border: 'none', borderRadius: '12px' }}>⌫</button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button type="button" onClick={() => setNumpadFoodId(null)} style={{ flex: 1, padding: '15px', background: '#333', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold' }}>Annulla</button>
              <button type="button" onClick={() => {
                const newWeight = Math.max(5, Math.min(5000, Number(numpadValue) || 0));
                const food = addedFoods.find(f => f.id === numpadFoodId);
                if (food && newWeight >= 5) {
                  const currentQta = Number(food.qta ?? food.weight ?? 100) || 100;
                  const delta = newWeight - currentQta;
                  handleCalibrateFoodWeight(numpadFoodId, delta);
                }
                setNumpadFoodId(null);
              }} style={{ flex: 1, padding: '15px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold' }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
