import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MealComposerProvider,
  useMealComposer,
} from './context/MealComposerContext';
import { usePredictiveFoodBlocks } from './hooks/usePredictiveFoodBlocks';
import UniversalSearchModal from './components/UniversalSearchModal';
import BarcodeScannerOverlay from './components/BarcodeScannerOverlay';
import MicronutrientEnrichmentModal from './components/MicronutrientEnrichmentModal';
import { withMealSavingOverlay } from '../../utils/mealSavingOverlayController';
import DraftCartSmartRow from './components/DraftCartSmartRow';
import RecipeEditor from './components/RecipeEditor';
import RecipeBuilder from './components/RecipeBuilder';
import FoodDeepEditModal from './components/FoodDeepEditModal';
import FoodDetailModal from './components/FoodDetailModal';
import QtyBadge from './components/QtyBadge';
import QuickFoodTile from './components/QuickFoodTile';
import LiveMacroHud, { CompactMealMacroStrip } from './components/LiveMacroHud';
import { formatCheckoutMealTitle, formatMiniCartMealLabel, resolveFoodVisual } from './utils/foodIconUtils';
import {
  findDraftItemForFood,
  getDefaultUnitKcal,
  getDraftQtyForFood,
  getFoodUnitWeight,
  resolveFoodIdentityKey,
} from './utils/draftFoodMatchUtils';
import { roundToOneDecimal } from './utils/numberFormatUtils';
import {
  buildPer100TargetNutrientsFromRow,
  buildScaledNutrientsForWeight,
  getPer100Macros,
} from './utils/foodMacroUtils';
import {
  buildRecipeDraftPayloadFromDb,
  buildRecipeDraftPayloadFromSearchResult,
} from './utils/recipePayloadUtils';
import {
  applyCatalogEditToDraftItem,
  buildCatalogAcquirePayload,
  buildCatalogDbPatch,
  buildCatalogDeepEditItem,
  buildCatalogOverrideFromEdit,
  mergeCatalogDisplay,
} from './utils/catalogFoodUtils';
import {
  clearCatalogServingOverride,
  ensureMasterDbVersion,
  loadCatalogServingOverrides,
  saveCatalogServingOverrides,
} from './utils/masterFoodResync';
import { resolveUnitWeight } from './utils/draftFoodUnits';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, LayoutGrid, List, Minus, Plus, Search, ScanBarcode, Settings, ShoppingBag, Sparkles } from 'lucide-react';
import KentuSolverModal from '../../components/solver/KentuSolverModal';
import { draftFoodsToSolverItems, solverProposalToDraftFood } from '../../utils/solverEngine';
import { clampFoodGrams } from '../../utils/inputSanity';
import { FaHamburger } from 'react-icons/fa';
import { MdOutlineLocalFireDepartment } from 'react-icons/md';
import useBarcodeScanner from './hooks/useBarcodeScanner';
import {
  findSemanticUsdaMatches,
  mergeOffAndUsda,
} from './utils/SemanticMatchmaker';
import useFoodDb from '../../useFoodDb';
import {
  FOOD_DB_SOURCE,
  FOOD_PROVENANCE,
  attachProvenanceFromLegacySource,
  compareProvenancePriority,
  resolveProvenanceFromSearchResult,
  resolveProvenanceFromTile,
} from '../../foodDbSource';
import { draftFoodsToRecipePayload, fetchRecipesFromDb } from './utils/recipeDraftUtils';
import { textMatchesSearchQuery } from '../../foodSearch';
import {
  useSplitFoodSearch,
  SEARCH_SOURCE_BADGE,
} from './hooks/useUniversalSearchEngine';
import { decimalToTimeStr } from '../../coreEngine';
import {
  getTimeSlotForDecimalHour,
  mergePredictiveWithPersonalDb,
  recordDraftFoodsUsageStats,
  recordFoodUsageStats,
} from './utils/timeSlotUtils';
import {
  getLearnedMealSlot,
  getLearnedMealSlotLabel,
} from './utils/slotPredictor';

const QUICK_FOODS_LIMIT = 30;
const SUGGESTED_FOODS_LIMIT = 6;
const SEARCH_DEFAULT_UNIT_WEIGHT = 100;
const VETRINA_SEARCH_RESULT_LIMIT = 50;

const MEAL_SLOTS = [
  { id: 'colazione', label: 'Colazione' },
  { id: 'snack', label: 'Snack' },
  { id: 'pranzo', label: 'Pranzo' },
  { id: 'cena', label: 'Cena' },
];

const MEAL_TIME_BY_SLOT = {
  colazione: 8.0,
  pranzo: 13.0,
  cena: 20.0,
  snack: 10.5,
};

function getCurrentDecimalHours() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

function getCurrentTimeRoundedTo15Min() {
  const decimal = getCurrentDecimalHours();
  return Math.min(24, Math.max(0, Math.round(decimal * 4) / 4));
}

function getCurrentTimeHHmm() {
  return new Date().toTimeString().slice(0, 5);
}

function inferMealSlotFromCurrentHour() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'colazione';
  if (hour >= 12 && hour < 17) return 'pranzo';
  if (hour >= 17 && hour < 22) return 'cena';
  return 'snack';
}

function parseTimeStrToDecimal(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const [hh, mm] = raw.split(':');
  const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
  return h + m / 60;
}

function resolveInitialMealTime(initialMealTime, initialDraft) {
  if (typeof initialMealTime === 'number' && !Number.isNaN(initialMealTime)) {
    return initialMealTime;
  }
  if (Array.isArray(initialDraft) && initialDraft.length > 0) {
    const t = initialDraft[0]?.mealTime;
    if (typeof t === 'number' && !Number.isNaN(t)) return t;
  }
  return getCurrentDecimalHours();
}

function buildAcquirePayload(food) {
  const row = food?.row || {};
  const desc = String(food?.desc || food?.name || row.desc || row.name || '').trim();
  if (!desc) return null;

  const per100Nutrients = buildPer100TargetNutrientsFromRow(row);

  return {
    desc,
    kcal: Number(row.kcal ?? row.cal) || 0,
    prot: Number(row.prot) || 0,
    carb: Number(row.carb) || 0,
    fatTotal: Number(row.fatTotal ?? row.fatTot ?? row.fat) || 0,
    fat: Number(row.fatTotal ?? row.fatTot ?? row.fat) || 0,
    ...per100Nutrients,
    ...(row.barcode ? { barcode: String(row.barcode).trim() } : {}),
    ...(food._source === 'master' ? { foodSource: 'KENTU' } : {}),
  };
}

function formatSearchResultForDraft(food) {
  const row = food?.row || {};
  const desc = String(food?.desc || food?.name || row.desc || row.name || 'Alimento').trim();
  const isCoffeeShop = food?._source === 'coffee_shop'
    || row.isCoffeeShopItem === true
    || Boolean(row.coffeeShopProductId);
  const unitWeight = Number(
    row.defaultUnitWeight
    || row.defaultServingWeight
    || row.defaultUnit?.grams
    || (isCoffeeShop ? row.servingGrams : 0),
  ) || 100;
  const defaultUnit = row.defaultUnit && typeof row.defaultUnit === 'object'
    ? row.defaultUnit
    : null;
  const unitId = defaultUnit && Number(defaultUnit.grams) > 0
    ? String(defaultUnit.label || 'porzione').toLowerCase().replace(/\s+/g, '_')
    : 'g';
  const qta = unitWeight;
  const scaledNutrients = buildScaledNutrientsForWeight(row, qta);
  const qtyLabel = defaultUnit?.label
    ? `1 ${defaultUnit.label}`
    : `${Math.round(qta)}g`;

  return attachProvenanceFromLegacySource({
    type: 'food',
    desc,
    name: desc,
    foodDbKey: food._source === 'personal' || isCoffeeShop
      ? (food.key || food.id || row.foodDbKey)
      : undefined,
    _searchSource: food._source,
    row,
    units: row.units || (defaultUnit ? [defaultUnit, { label: 'g', grams: 1 }] : undefined),
    defaultUnit: defaultUnit || undefined,
    defaultUnitWeight: unitWeight,
    qta,
    weight: qta,
    unit: unitId === 'g' ? 'g' : unitId,
    selectedUnit: unitId,
    multiplier: unitId === 'g' ? qta : 1,
    qtyLabel,
    coffeeShopProductId: row.coffeeShopProductId || undefined,
    caffeineMg: row.caffeineMg,
    isFastingSafe: row.isFastingSafe,
    customEmoji: row.customEmoji || row.icon || undefined,
    icon: row.icon || undefined,
    ...scaledNutrients,
    ...(row.customImage ? { customImage: row.customImage } : {}),
    ...(row.customIcon ? { customIcon: row.customIcon } : {}),
    ...(row.iconTag ? { iconTag: row.iconTag } : {}),
    ...(row.iconOverride ? { iconOverride: row.iconOverride } : {}),
  }, food._source);
}

/** Filtro vetrina: token query + tokenSharesStem (banana ↔ banane). */
function textMatchesQuery(text, query) {
  return textMatchesSearchQuery(text, query);
}

/** Testo ricercabile su tile grezzo — zero merge/resync. */
function resolveRawTileSearchText(tile) {
  return String(
    tile?.label
    || tile?.desc
    || tile?.name
    || tile?.row?.desc
    || tile?.row?.name
    || '',
  ).trim();
}

function resolveSearchKcalPer100(result) {
  const row = result?.row || {};
  const kcal = Number(row.kcal ?? row.cal ?? result.kcal ?? result.cal);
  return Number.isFinite(kcal) ? Math.round(kcal) : 0;
}

function buildSearchMatchFood(result, personalDb) {
  const name = String(result.desc || result.name || 'Alimento').trim();
  if (result._source === 'recipe') {
    return buildRecipeDraftPayloadFromSearchResult(result, personalDb) || { desc: name, name };
  }
  return {
    foodDbKey: result._source === 'personal' ? (result.key || result.id) : undefined,
    desc: name,
    name,
    row: result.row,
    _source: result._source,
  };
}

function resolveSearchResultTileStats(result, personalDb, catalogServingOverrides, masterContext = null) {
  const name = String(result.desc || result.name || 'Alimento').trim();

  if (result._source === 'recipe') {
    const payload = buildRecipeDraftPayloadFromSearchResult(result, personalDb);
    if (payload) {
      return {
        matchFood: payload,
        defaultUnitWeight: getFoodUnitWeight(payload),
        defaultUnitKcal: getDefaultUnitKcal(payload),
        displayTile: { desc: name, label: name, row: result.row },
      };
    }
  }

  if (result._source === 'personal') {
    const dbKey = result.key || result.id;
    const row = (dbKey && personalDb?.[dbKey]) || result.row || {};
    const catalogItem = mergeCatalogDisplay(
      { foodDbKey: dbKey, desc: name, name, row },
      personalDb,
      catalogServingOverrides,
      masterContext,
    );
    return {
      matchFood: catalogItem,
      defaultUnitWeight: getFoodUnitWeight(catalogItem),
      defaultUnitKcal: getDefaultUnitKcal(catalogItem),
      displayTile: catalogItem,
    };
  }

  const matchFood = buildSearchMatchFood(result, personalDb);
  const personalDbKey = matchFood.foodDbKey;
  const hasPersonalRow = personalDbKey && personalDb?.[personalDbKey];
  const row = result.row || matchFood.row || {};
  const isCoffeeShop = result._source === 'coffee_shop'
    || row.isCoffeeShopItem === true
    || Boolean(row.coffeeShopProductId);

  if (isCoffeeShop) {
    const unitWeight = getFoodUnitWeight({ ...matchFood, row, defaultUnitWeight: row.defaultUnitWeight });
    const unitKcal = getDefaultUnitKcal({ ...matchFood, row, defaultUnitWeight: row.defaultUnitWeight });
    return {
      matchFood: {
        ...matchFood,
        row,
        foodDbKey: row.foodDbKey || result.id,
        defaultUnitWeight: unitWeight,
        defaultUnit: row.defaultUnit,
        units: row.units,
        coffeeShopProductId: row.coffeeShopProductId,
        customEmoji: row.customEmoji || row.icon,
        icon: row.icon,
      },
      defaultUnitWeight: unitWeight,
      defaultUnitKcal: unitKcal,
      displayTile: {
        desc: name,
        label: name,
        row,
        defaultUnitWeight: unitWeight,
        customEmoji: row.customEmoji || row.icon,
      },
    };
  }

  if (!hasPersonalRow) {
    return {
      matchFood,
      defaultUnitWeight: SEARCH_DEFAULT_UNIT_WEIGHT,
      defaultUnitKcal: resolveSearchKcalPer100(result),
      displayTile: { desc: name, label: name, row: result.row || matchFood.row },
    };
  }

  const catalogItem = mergeCatalogDisplay(
    { foodDbKey: personalDbKey, desc: name, name, row: result.row || matchFood.row },
    personalDb,
    catalogServingOverrides,
    masterContext,
  );
  return {
    matchFood: catalogItem,
    defaultUnitWeight: getFoodUnitWeight(catalogItem),
    defaultUnitKcal: getDefaultUnitKcal(catalogItem),
    displayTile: catalogItem,
  };
}

function resolveInitialMealSlot(initialDraft, editingMealId) {
  if (Array.isArray(initialDraft) && initialDraft.length > 0) {
    const mt = initialDraft[0]?.mealType;
    if (mt) return String(mt).split('_')[0];
  }
  if (editingMealId) return String(editingMealId).split('_')[0];
  return inferMealSlotFromCurrentHour();
}

function FastMealLoggerContent({
  fullHistory,
  todayLog = null,
  onClose,
  onSave,
  personalDb,
  kentuItDb,
  globalDb,
  offDb = null,
  masterDb,
  onAcquireExternalFood,
  onSaveRecipe,
  onPatchFoodDbEntry,
  getMealTargetsForSlot,
  getMealConsumedForSlot,
  initialDraft,
  editingMealId,
  initialMealSlot,
  initialMealTime,
  autoOpenBarcodeScanner = false,
  onAutoOpenBarcodeScannerConsumed,
}) {
  const [selectedSlot, setSelectedSlot] = useState(
    () => initialMealSlot || resolveInitialMealSlot(initialDraft, editingMealId),
  );
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [preferManualSearchEntry, setPreferManualSearchEntry] = useState(false);
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  const [isSaveRecipeOpen, setIsSaveRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isRecipeBuilderOpen, setIsRecipeBuilderOpen] = useState(false);
  const [detailFood, setDetailFood] = useState(null);
  const [activeVetrinaTab, setActiveVetrinaTab] = useState('foods');
  const [catalogViewMode, setCatalogViewMode] = useState('grid');
  const [viewMode, setViewMode] = useState('expanded');
  const [isBuilderHeaderCollapsed, setIsBuilderHeaderCollapsed] = useState(true);
  const [vetrinaSearchQuery, setVetrinaSearchQuery] = useState('');
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [saveRecipeError, setSaveRecipeError] = useState('');
  const [activeTab, setActiveTab] = useState(() =>
    Array.isArray(initialDraft) && initialDraft.length > 0 ? 'riepilogo' : 'alimenti',
  );
  const [cartPulse, setCartPulse] = useState(false);
  const [addFeedback, setAddFeedback] = useState(null);
  const [showSolverModal, setShowSolverModal] = useState(false);
  const [deepEditFood, setDeepEditFood] = useState(null);
  const [editingCatalogFood, setEditingCatalogFood] = useState(null);
  const [catalogServingOverrides, setCatalogServingOverrides] = useState(() => {
    ensureMasterDbVersion();
    return loadCatalogServingOverrides();
  });
  const masterContext = useMemo(
    () => ({ kentuItDb, globalDb, masterDb: globalDb }),
    [kentuItDb, globalDb],
  );
  const mergeCatalog = useCallback(
    (item) => mergeCatalogDisplay(item, personalDb, catalogServingOverrides, masterContext),
    [personalDb, catalogServingOverrides, masterContext],
  );

  useEffect(() => {
    saveCatalogServingOverrides(catalogServingOverrides);
  }, [catalogServingOverrides]);
  const [enrichmentSession, setEnrichmentSession] = useState(null);
  const enrichmentAbortRef = useRef(null);
  const enrichmentResolveRef = useRef(null);
  const enrichmentOffRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  const cartPulseTimerRef = useRef(null);
  const addFeedbackTimerRef = useRef(null);
  const mealTimeInputRef = useRef(null);
  const mealTimeManualRef = useRef(false);
  /** true = l'utente ha impostato l'orario dall'<input type="time"> (source of truth). */
  const mealTimeFromNativeInputRef = useRef(false);
  const checkoutListScrollRef = useRef(null);
  const checkoutScrollCollapsedRef = useRef(false);
  const {
    draftFoods,
    draftTotals,
    mealTime,
    setMealTime,
    addFoodToDraft,
    addFoodsToDraft,
    removeFoodFromDraft,
    updateFoodAmount,
    updateFoodInDraft,
    clearDraft,
    loadInitialDraft,
  } = useMealComposer();

  /** Imposta l'orario bozza senza vincoli rispetto ai pasti già loggati (solo bound 0–24). */
  const commitDraftMealTime = useCallback((hour, { fromNativeInput = false } = {}) => {
    if (typeof hour !== 'number' || Number.isNaN(hour)) return;
    const bounded = Math.max(0, Math.min(24, hour));
    mealTimeManualRef.current = true;
    if (fromNativeInput) mealTimeFromNativeInputRef.current = true;
    else mealTimeFromNativeInputRef.current = false;
    setMealTime(bounded);
  }, [setMealTime]);

  /** Orario solo da input nativo nel tab Riepilogo. */

  const handleNativeMealTimeInputChange = useCallback((event) => {
    const raw = event?.target?.value;
    const parsed = parseTimeStrToDecimal(raw);
    // Aggiornamento incondizionato del valore scelto dall'utente (nessun confronto con ultimo log).
    if (typeof parsed === 'number' && !Number.isNaN(parsed)) {
      commitDraftMealTime(parsed, { fromNativeInput: true });
    }
  }, [commitDraftMealTime]);

  useEffect(() => {
    // Non resettare l'orario se l'utente lo ha già scelto a mano.
    if (mealTimeManualRef.current || mealTimeFromNativeInputRef.current) return;
    if (typeof initialMealTime === 'number' && !Number.isNaN(initialMealTime)) return;
    if (Array.isArray(initialDraft) && initialDraft.length > 0) {
      const t = initialDraft[0]?.mealTime;
      if (typeof t === 'number' && !Number.isNaN(t)) return;
    }
    setMealTime(getCurrentDecimalHours());
  }, [initialMealTime, initialDraft, setMealTime]);

  const timeSlotForMeal = useMemo(
    () => getTimeSlotForDecimalHour(mealTime),
    [mealTime],
  );

  const mealSlotFromTime = useMemo(
    () => getLearnedMealSlot(mealTime, fullHistory),
    [mealTime, fullHistory],
  );

  useEffect(() => {
    if (!Number.isFinite(Number(mealTime))) return;
    const nextSlot = getLearnedMealSlot(mealTime, fullHistory);
    setSelectedSlot((prev) => (prev === nextSlot ? prev : nextSlot));
  }, [mealTime, fullHistory]);

  const notifyItemAdded = (label) => {
    setAddFeedback(label || 'Aggiunto al piatto');
    setCartPulse(true);

    if (cartPulseTimerRef.current) window.clearTimeout(cartPulseTimerRef.current);
    if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);

    cartPulseTimerRef.current = window.setTimeout(() => setCartPulse(false), 700);
    addFeedbackTimerRef.current = window.setTimeout(() => setAddFeedback(null), 2200);
  };

  useEffect(
    () => () => {
      if (cartPulseTimerRef.current) window.clearTimeout(cartPulseTimerRef.current);
      if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
    },
    [],
  );

  const resetVetrinaSearchBar = useCallback(() => {
    setVetrinaSearchQuery('');
  }, []);

  const handleFoodSelection = async (food) => {
    if (!food) return;

    if (food._source === 'recipe') {
      const payload = buildRecipeDraftPayloadFromSearchResult(food, personalDb);
      if (!payload) return;
      addOrIncrementDraftFood(payload, getFoodUnitWeight(payload));
      setIsSearchModalOpen(false);
      resetVetrinaSearchBar();
      notifyItemAdded(payload.desc);
      return;
    }

    if (
      food._source !== 'personal'
      && food._source !== 'recipe'
      && food._source !== 'coffee_shop'
      && typeof onAcquireExternalFood === 'function'
    ) {
      const acquirePayload = buildAcquirePayload(food);
      if (acquirePayload) {
        try {
          await onAcquireExternalFood(acquirePayload);
        } catch {
          /* acquisizione silenziosa — la bozza procede comunque */
        }
      }
    }

    const draftPayload = formatSearchResultForDraft(food);
    addOrIncrementDraftFood(draftPayload, getFoodUnitWeight(draftPayload, SEARCH_DEFAULT_UNIT_WEIGHT));
    setIsSearchModalOpen(false);
    resetVetrinaSearchBar();
    notifyItemAdded(
      String(food?.desc || food?.name || food?.row?.desc || 'Alimento').trim(),
    );
  };

  const handleAddSearchResult = async (food, portionCount = 1) => {
    if (!food || portionCount <= 0) return;

    if (food._source === 'recipe') {
      const payload = buildRecipeDraftPayloadFromSearchResult(food, personalDb);
      if (!payload) return;
      for (let i = 0; i < portionCount; i += 1) {
        addOrIncrementDraftFood(payload, getFoodUnitWeight(payload));
      }
      resetVetrinaSearchBar();
      notifyItemAdded(payload.desc);
      return;
    }

    if (
      food._source !== 'personal'
      && food._source !== 'recipe'
      && food._source !== 'coffee_shop'
      && typeof onAcquireExternalFood === 'function'
    ) {
      const acquirePayload = buildAcquirePayload(food);
      if (acquirePayload) {
        try {
          await onAcquireExternalFood(acquirePayload);
        } catch {
          /* acquisizione silenziosa — la bozza procede comunque */
        }
      }
    }

    const draftPayload = formatSearchResultForDraft(food);
    const unitWeight = getFoodUnitWeight(draftPayload, SEARCH_DEFAULT_UNIT_WEIGHT);
    for (let i = 0; i < portionCount; i += 1) {
      addOrIncrementDraftFood(draftPayload, unitWeight);
    }
    resetVetrinaSearchBar();
    notifyItemAdded(
      String(food?.desc || food?.name || food?.row?.desc || 'Alimento').trim(),
    );
  };

  const handleEditRecipe = (result) => {
    const recipeKey = String(result?.key ?? result?.id ?? '').trim();
    const entry = result?.row || personalDb?.[recipeKey];
    if (!recipeKey || !entry) return;
    setEditingRecipe({ key: recipeKey, entry });
    setIsSearchModalOpen(false);
  };

  const handleRecipeEditorSave = async (payload, recipeKey) => {
    if (typeof onSaveRecipe !== 'function') return;
    await onSaveRecipe(payload, recipeKey);

    const identity = `db:${recipeKey}`;
    const mergedEntry = { ...payload, isRecipe: true, ingredients: payload.ingredients };
    draftFoods.forEach((item) => {
      if (resolveFoodIdentityKey(item) === identity) {
        const refreshed = buildRecipeDraftPayloadFromDb(recipeKey, mergedEntry);
        if (refreshed) {
          updateFoodInDraft(item.id, refreshed);
        }
      }
    });
    setEditingRecipe(null);
  };

  const handleRecipeBuilderSave = async (payload) => {
    if (typeof onSaveRecipe !== 'function') return;
    await onSaveRecipe({ ...payload, isRecipe: true });
    setIsRecipeBuilderOpen(false);
  };

  const handleOpenSaveRecipe = () => {
    if (draftFoods.length === 0) return;
    setRecipeName('');
    setSaveRecipeError('');
    setIsSaveRecipeOpen(true);
  };

  const handleSaveRecipe = async (event) => {
    event.preventDefault();
    const name = recipeName.trim();
    if (!name) {
      setSaveRecipeError('Inserisci un nome per la ricetta.');
      return;
    }
    if (typeof onSaveRecipe !== 'function') {
      setSaveRecipeError('Salvataggio ricette non disponibile.');
      return;
    }

    setIsSavingRecipe(true);
    setSaveRecipeError('');

    try {
      const payload = draftFoodsToRecipePayload(draftFoods);
      await onSaveRecipe({ desc: name, ...payload });
      setIsSaveRecipeOpen(false);
      setRecipeName('');
    } catch {
      setSaveRecipeError('Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const finishEnrichment = useCallback((entry) => {
    const resolve = enrichmentResolveRef.current;
    enrichmentResolveRef.current = null;
    enrichmentOffRef.current = null;
    if (enrichmentAbortRef.current) {
      enrichmentAbortRef.current.abort();
      enrichmentAbortRef.current = null;
    }
    setEnrichmentSession(null);
    resolve?.(entry);
  }, []);

  const enrichOffProduct = useCallback(
    (offEntry) =>
      new Promise((resolve) => {
        if (enrichmentAbortRef.current) {
          enrichmentAbortRef.current.abort();
        }
        const controller = new AbortController();
        enrichmentAbortRef.current = controller;
        enrichmentResolveRef.current = resolve;
        enrichmentOffRef.current = offEntry;

        const productName = String(offEntry?.desc || offEntry?.name || 'Prodotto').trim();
        // Mai passare offDb (centinaia di k) all'AI: solo catalogo globale/USDA già filtrato.
        const usdaDb = globalDb ?? masterDb;

        setEnrichmentSession({
          productName,
          matches: [],
          isLoading: true,
          error: '',
        });

        void (async () => {
          try {
            const matches = await findSemanticUsdaMatches(productName, usdaDb, {
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setEnrichmentSession((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                matches: Array.isArray(matches) ? matches.slice(0, 12) : [],
                isLoading: false,
                error: '',
              };
            });
          } catch (err) {
            if (controller.signal.aborted) return;
            console.warn('[FastMealLogger] semantic enrichment failed', err);
            setEnrichmentSession((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                matches: [],
                isLoading: false,
                error: 'Match AI non disponibile. Puoi salvare solo l\'etichetta.',
              };
            });
          }
        })();
      }),
    [globalDb, masterDb],
  );

  const handleEnrichmentSelect = useCallback(
    (match) => {
      const offProduct = enrichmentOffRef.current;
      if (!offProduct) {
        finishEnrichment(null);
        return;
      }
      const merged = mergeOffAndUsda(offProduct, match.row || {}, {
        fdcId: match.fdcId,
        confidence: match.confidence,
        reason: match.reason,
      });
      finishEnrichment(merged);
    },
    [finishEnrichment],
  );

  const handleEnrichmentSkip = useCallback(() => {
    finishEnrichment(enrichmentOffRef.current || null);
  }, [finishEnrichment]);

  const handleEnrichmentCancel = useCallback(() => {
    finishEnrichment(enrichmentOffRef.current || null);
  }, [finishEnrichment]);

  const handleBarcodeNotFound = useCallback(() => {
    setPreferManualSearchEntry(true);
    setIsSearchModalOpen(true);
  }, []);

  const {
    isOpen: isScannerOpen,
    open: openScanner,
    close: closeScanner,
    videoRef,
    error: scannerError,
    setError: setScannerError,
    isResolving: isScannerResolving,
  } = useBarcodeScanner({
    personalDb,
    onAcquireExternalFood,
    onFoodResolved: handleFoodSelection,
    enrichOffProduct,
    onBarcodeNotFound: handleBarcodeNotFound,
  });

  useEffect(() => {
    if (!autoOpenBarcodeScanner) return;
    setScannerError('');
    openScanner();
    onAutoOpenBarcodeScannerConsumed?.();
  }, [autoOpenBarcodeScanner, openScanner, onAutoOpenBarcodeScannerConsumed, setScannerError]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (Array.isArray(initialDraft) && initialDraft.length > 0) {
      loadInitialDraft(initialDraft);
      prefillAppliedRef.current = true;
      setActiveTab('riepilogo');
    }
  }, [initialDraft, loadInitialDraft]);
  const mealTargets = useMemo(
    () => getMealTargetsForSlot?.(selectedSlot) ?? {},
    [selectedSlot, getMealTargetsForSlot],
  );
  const solverExistingFoods = useMemo(
    () => draftFoodsToSolverItems(draftFoods),
    [draftFoods],
  );
  const solverTargets = useMemo(
    () => ({
      kcal: mealTargets?.kcal ?? 0,
      prot: mealTargets?.prot ?? mealTargets?.proteins ?? 0,
      carb: mealTargets?.carb ?? mealTargets?.carbs ?? 0,
      fat: mealTargets?.fat ?? mealTargets?.fatTotal ?? 0,
    }),
    [mealTargets],
  );
  const handleSolverApply = useCallback(
    (proposals) => {
      const confirmed = (proposals || []).filter(Boolean);
      if (confirmed.length === 0) return;

      const draftItems = confirmed.map((proposal) =>
        solverProposalToDraftFood(proposal, { mealType: selectedSlot, mealTime }),
      );
      addFoodsToDraft(draftItems);
      setActiveTab('riepilogo');
      const label = draftItems.length === 1
        ? `Consulto: ${draftItems[0].desc}`
        : `Consulto: ${draftItems.length} alimenti aggiunti`;
      notifyItemAdded(label);
    },
    [addFoodsToDraft, mealTime, notifyItemAdded, selectedSlot],
  );
  const mealConsumed = useMemo(
    () => getMealConsumedForSlot?.(selectedSlot) ?? {},
    [selectedSlot, getMealConsumedForSlot, editingMealId],
  );

  const predictiveBlocks = usePredictiveFoodBlocks(fullHistory, mealSlotFromTime, QUICK_FOODS_LIMIT);
  const quickFoods = useMemo(
    () =>
      mergePredictiveWithPersonalDb(
        predictiveBlocks,
        personalDb,
        timeSlotForMeal,
        QUICK_FOODS_LIMIT,
      ),
    [predictiveBlocks, personalDb, timeSlotForMeal],
  );

  const suggestedFoods = useMemo(
    () =>
      quickFoods
        .filter((tile) => tile.source !== FOOD_DB_SOURCE.GLOBAL)
        .slice(0, SUGGESTED_FOODS_LIMIT),
    [quickFoods],
  );

  const suggestedFoodIdentityKeys = useMemo(() => {
    const keys = new Set();
    suggestedFoods.forEach((tile) => {
      const key = resolveFoodIdentityKey(tile);
      if (key) keys.add(key);
    });
    return keys;
  }, [suggestedFoods]);

  const remainingFoods = useMemo(
    () =>
      quickFoods
        .filter((tile) => {
          const key = resolveFoodIdentityKey(tile);
          return !key || !suggestedFoodIdentityKeys.has(key);
        })
        .sort((a, b) =>
          compareProvenancePriority(
            { provenance: resolveProvenanceFromTile(a, personalDb) },
            { provenance: resolveProvenanceFromTile(b, personalDb) },
          ),
        ),
    [quickFoods, suggestedFoodIdentityKeys, personalDb],
  );

  const gridFoods = useMemo(
    () => [...suggestedFoods, ...remainingFoods],
    [suggestedFoods, remainingFoods],
  );

  /** Display tile pre-calcolati per la griglia catalogo (indipendenti dalla query). */
  const catalogDisplayByTileKey = useMemo(() => {
    const cache = new Map();
    gridFoods.forEach((tile) => {
      if (tile?.key == null) return;
      cache.set(
        tile.key,
        mergeCatalogDisplay(tile, personalDb, catalogServingOverrides, masterContext),
      );
    });
    return cache;
  }, [gridFoods, personalDb, catalogServingOverrides, masterContext]);

  const savedRecipes = useMemo(() => fetchRecipesFromDb(personalDb), [personalDb]);
  /** Query live: filtro personale istantaneo. Mega DB solo su Invio (commitMegaSearch). */
  const liveVetrinaQuery = vetrinaSearchQuery.trim();
  const isVetrinaSearching = liveVetrinaQuery.length > 0;

  const {
    results: vetrinaUnifiedResults,
    isSearchingMega: isVetrinaDbSearching,
    commitMegaSearch,
  } = useSplitFoodSearch(liveVetrinaQuery, personalDb, {
    kentuItDb,
    globalDb: globalDb ?? masterDb,
    offDb,
    searchGlobal: true,
  });

  const submitVetrinaSearch = useCallback(() => {
    commitMegaSearch();
  }, [commitMegaSearch]);

  /** Filter → slice (solo grezzi, zero merge). Istantaneo sulla query live. */
  const filteredQuickFoodsRaw = useMemo(() => {
    if (!liveVetrinaQuery) return [];
    return quickFoods
      .filter((tile) => textMatchesQuery(resolveRawTileSearchText(tile), liveVetrinaQuery))
      .slice(0, VETRINA_SEARCH_RESULT_LIMIT);
  }, [quickFoods, liveVetrinaQuery]);

  /** Map pesante solo sui match visibili della ricerca. */
  const filteredQuickFoodDisplayByKey = useMemo(() => {
    const map = new Map();
    filteredQuickFoodsRaw.forEach((tile) => {
      if (tile?.key == null) return;
      map.set(
        tile.key,
        mergeCatalogDisplay(tile, personalDb, catalogServingOverrides, masterContext),
      );
    });
    return map;
  }, [filteredQuickFoodsRaw, personalDb, catalogServingOverrides, masterContext]);

  const selectedMealLabel = useMemo(
    () => getLearnedMealSlotLabel(mealTime, fullHistory),
    [mealTime, fullHistory],
  );

  const vetrinaTilesContainerClass =
    catalogViewMode === 'grid'
      ? 'grid w-full grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-3'
      : 'flex w-full flex-col gap-2.5';

  const showBuilderSummaryBar = true;

  const handleCheckoutListScroll = useCallback((event) => {
    const top = Number(event?.currentTarget?.scrollTop) || 0;
    const shouldCollapse = top > 20;
    if (shouldCollapse === checkoutScrollCollapsedRef.current) return;
    checkoutScrollCollapsedRef.current = shouldCollapse;
    if (shouldCollapse) {
      setIsBuilderHeaderCollapsed(true);
    }
  }, []);

  const filteredSavedRecipes = useMemo(
    () => savedRecipes.filter((recipe) => textMatchesQuery(recipe.name, liveVetrinaQuery)),
    [savedRecipes, liveVetrinaQuery],
  );

  const quickFoodIdentityKeys = useMemo(() => {
    const keys = new Set();
    filteredQuickFoodsRaw.forEach((tile) => {
      const key = resolveFoodIdentityKey(tile);
      if (key) keys.add(key);
    });
    return keys;
  }, [filteredQuickFoodsRaw]);

  const extraDbSearchResults = useMemo(
    () =>
      vetrinaUnifiedResults.filter((result) => {
        const matchKey = result._source === 'personal' || result._source === 'recipe'
          ? `db:${String(result.key || result.id).trim()}`
          : null;
        if (matchKey && quickFoodIdentityKeys.has(matchKey)) return false;
        return true;
      }),
    [vetrinaUnifiedResults, quickFoodIdentityKeys],
  );

  const searchResultStatsByKey = useMemo(() => {
    const map = new Map();
    extraDbSearchResults.forEach((result) => {
      const statsKey = `${result._source}-${result.id}`;
      map.set(
        statsKey,
        resolveSearchResultTileStats(result, personalDb, catalogServingOverrides, masterContext),
      );
    });
    return map;
  }, [extraDbSearchResults, personalDb, catalogServingOverrides, masterContext]);

  const unifiedSearchGridItems = useMemo(() => {
    if (!isVetrinaSearching) return [];

    const items = [];

    filteredQuickFoodsRaw.forEach((tile) => {
      items.push({ kind: 'predictive', key: `predictive-${tile.key}`, data: tile });
    });

    extraDbSearchResults.forEach((result) => {
      items.push({
        kind: 'search',
        key: `search-${result._source}-${result.id}`,
        data: result,
      });
    });

    const seenRecipeKeys = new Set(
      extraDbSearchResults
        .filter((result) => result._source === 'recipe')
        .map((result) => String(result.key || result.id).trim()),
    );

    filteredSavedRecipes.forEach((recipe) => {
      if (seenRecipeKeys.has(recipe.key)) return;
      items.push({
        kind: 'search',
        key: `saved-recipe-${recipe.key}`,
        data: {
          _source: 'recipe',
          source: FOOD_DB_SOURCE.KENTU_IT,
          provenance: FOOD_PROVENANCE.PERSONAL,
          id: recipe.key,
          key: recipe.key,
          desc: recipe.name,
          name: recipe.name,
          row: recipe.row,
        },
      });
    });

    // Predictive in cima; risultati DB già ordinati per relevanceScore.
    const predictive = items.filter((item) => item.kind === 'predictive');
    const searchItems = items.filter((item) => item.kind !== 'predictive');
    return [...predictive, ...searchItems];
  }, [
    isVetrinaSearching,
    filteredQuickFoodsRaw,
    extraDbSearchResults,
    filteredSavedRecipes,
  ]);

  const resolveDisplayTile = useCallback(
    (tile) => {
      if (tile?.key != null) {
        const cached = catalogDisplayByTileKey.get(tile.key)
          ?? filteredQuickFoodDisplayByKey.get(tile.key);
        if (cached) return cached;
      }
      return mergeCatalog(tile);
    },
    [catalogDisplayByTileKey, filteredQuickFoodDisplayByKey, mergeCatalog],
  );

  const handleSavedRecipeAdd = (recipe) => {
    const payload = buildRecipeDraftPayloadFromDb(recipe.key, recipe.row);
    if (!payload) return;
    addOrIncrementDraftFood(payload, getFoodUnitWeight(payload));
    notifyItemAdded(recipe.name);
  };

  const renderQuickFoodTile = (tile, isSuggested = false) => {
    const displayTile = resolveDisplayTile(tile);
    const tileVisual = resolveFoodVisual(displayTile, personalDb);
    const defaultUnitWeight = getFoodUnitWeight(displayTile);
    const defaultUnitKcal = getDefaultUnitKcal(displayTile);
    const qty = getDraftQtyForFood(draftFoods, displayTile, defaultUnitWeight);

    return (
      <QuickFoodTile
        key={tile.key}
        viewMode={catalogViewMode}
        displayTile={displayTile}
        tileVisual={tileVisual}
        defaultUnitWeight={defaultUnitWeight}
        defaultUnitKcal={defaultUnitKcal}
        qty={qty}
        isSuggested={isSuggested}
        provenance={resolveProvenanceFromTile(tile, personalDb)}
        onConfirmAdd={(portionCount) => handleAddPredictiveBlock(tile, portionCount)}
        onRemoveOne={() => removeOneUnitFromDraft(displayTile, defaultUnitWeight)}
        onOpenDetail={() => openFoodDetail(tile)}
      />
    );
  };

  const renderSearchResultTile = (result) => {
    const statsKey = `${result._source}-${result.id}`;
    const stats = searchResultStatsByKey.get(statsKey)
      ?? resolveSearchResultTileStats(result, personalDb, catalogServingOverrides, masterContext);
    const {
      matchFood,
      defaultUnitWeight,
      defaultUnitKcal,
      displayTile,
    } = stats;
    const tileVisual = resolveFoodVisual(result, personalDb);
    const qty = getDraftQtyForFood(draftFoods, matchFood, defaultUnitWeight);
    const sourceBadge = SEARCH_SOURCE_BADGE[result._source] || null;
    const provenance = resolveProvenanceFromSearchResult(result);
    const brand = result.brand || result.row?.brand || null;

    return (
      <QuickFoodTile
        viewMode={catalogViewMode}
        displayTile={displayTile}
        tileVisual={tileVisual}
        defaultUnitWeight={defaultUnitWeight}
        defaultUnitKcal={defaultUnitKcal}
        qty={qty}
        sourceBadge={sourceBadge}
        provenance={provenance}
        brand={brand}
        onConfirmAdd={(portionCount) => handleAddSearchResult(result, portionCount)}
        onRemoveOne={() => removeOneUnitFromDraft(matchFood, defaultUnitWeight)}
        onOpenDetail={() => openFoodDetailFromSearchResult(result)}
      />
    );
  };

  const renderSavedRecipeTile = (recipe) => {
    const payload = buildRecipeDraftPayloadFromDb(recipe.key, recipe.row);
    if (!payload) return null;

    const unitWeight = getFoodUnitWeight(payload);
    const defaultUnitKcal = getDefaultUnitKcal(payload);
    const qty = getDraftQtyForFood(draftFoods, payload, unitWeight);
    const tileVisual = resolveFoodVisual(
      { desc: recipe.name, foodDbKey: recipe.key, row: recipe.row },
      personalDb,
    );

    return (
      <QuickFoodTile
        key={recipe.key}
        viewMode={catalogViewMode}
        displayTile={{ desc: recipe.name, label: recipe.name }}
        tileVisual={tileVisual}
        defaultUnitWeight={unitWeight}
        defaultUnitKcal={defaultUnitKcal}
        qty={qty}
        sourceBadge={SEARCH_SOURCE_BADGE.recipe}
        provenance={FOOD_PROVENANCE.PERSONAL}
        onConfirmAdd={(portionCount) => {
          for (let i = 0; i < portionCount; i += 1) {
            handleSavedRecipeAdd(recipe);
          }
        }}
        onRemoveOne={() => removeOneUnitFromDraft(payload, unitWeight)}
        onOpenDetail={() => setEditingRecipe({ key: recipe.key, entry: recipe.row })}
      />
    );
  };

  const renderUnifiedSearchGridItem = (item) => {
    if (item.kind === 'predictive') {
      return renderQuickFoodTile(item.data);
    }
    return renderSearchResultTile(item.data);
  };

  const incrementDraftItemByUnit = (existing, unitWeight) => {
    if (!existing?.id || !unitWeight) return;
    const currentWeight = Number(existing.weight ?? existing.qta) || 0;
    const newWeight = roundToOneDecimal(currentWeight + unitWeight);
    const selectedUnit = existing.selectedUnit || 'g';

    if (selectedUnit === 'g') {
      updateFoodAmount(existing.id, newWeight, 'g');
      return;
    }

    const unitW = resolveUnitWeight(existing, selectedUnit);
    const nextMultiplier = unitW > 0 ? roundToOneDecimal(newWeight / unitW) : newWeight;
    updateFoodAmount(existing.id, nextMultiplier, selectedUnit);
  };

  const decrementDraftItemByUnit = (existing, unitWeight) => {
    if (!existing?.id || !unitWeight) return;
    const currentWeight = Number(existing.weight ?? existing.qta) || 0;
    const newWeight = roundToOneDecimal(currentWeight - unitWeight);

    if (newWeight <= 0) {
      removeFoodFromDraft(existing.id);
      return;
    }

    const selectedUnit = existing.selectedUnit || 'g';
    if (selectedUnit === 'g') {
      updateFoodAmount(existing.id, newWeight, 'g');
      return;
    }

    const unitW = resolveUnitWeight(existing, selectedUnit);
    const nextMultiplier = unitW > 0 ? roundToOneDecimal(newWeight / unitW) : newWeight;
    updateFoodAmount(existing.id, nextMultiplier, selectedUnit);
  };

  const removeOneUnitFromDraft = (food, unitWeight) => {
    const existing = findDraftItemForFood(draftFoods, food);
    if (!existing) return;
    decrementDraftItemByUnit(existing, unitWeight);
  };

  const addOrIncrementDraftFood = (payload, unitWeight) => {
    const existing = findDraftItemForFood(draftFoods, payload);
    if (!existing) {
      addFoodToDraft(payload);
    } else {
      incrementDraftItemByUnit(existing, unitWeight);
    }

    recordFoodUsageStats(
      payload?.foodDbKey,
      personalDb,
      onPatchFoodDbEntry,
      getTimeSlotForDecimalHour(mealTime),
    );

    return Boolean(existing);
  };

  const draftMealKcal = Math.round(Number(draftTotals?.kcal) || 0);
  const checkoutMealTitle = formatCheckoutMealTitle(selectedSlot);
  const miniCartMealLabel = formatMiniCartMealLabel(selectedSlot);

  const handleConfirm = async () => {
    if (draftFoods.length === 0 || isSavingMeal) return;
    const foodsSnapshot = draftFoods.map((f) => ({ ...f }));
    const learnedSlot = getLearnedMealSlot(mealTime, fullHistory);
    const mealSlotToSave = selectedSlot || learnedSlot;
    const mealTimeToSave = mealTime;
    const editId = editingMealId ?? undefined;

    try {
      // Overlay chef: prima azione (flushSync) dentro withMealSavingOverlay, prima del save.
      await withMealSavingOverlay(async () => {
        setIsSavingMeal(true);
        recordDraftFoodsUsageStats(
          foodsSnapshot,
          personalDb,
          onPatchFoodDbEntry,
          getTimeSlotForDecimalHour(mealTimeToSave),
        );
        await Promise.resolve(
          onSave?.(foodsSnapshot, mealSlotToSave, editId, mealTimeToSave),
        );
      });
      clearDraft();
      onClose?.();
    } catch (err) {
      console.error('[FastMealLogger] salvataggio pasto fallito', err);
    } finally {
      setIsSavingMeal(false);
    }
  };

  const handleOpenScanner = () => {
    setScannerError('');
    openScanner();
  };

  const buildTileDraftPayload = (tile, targetWeight) => {
    const displayTile = resolveDisplayTile(tile);
    let payload = displayTile;
    const dbKey = displayTile.foodDbKey;
    if (dbKey && personalDb && typeof personalDb === 'object' && personalDb[dbKey]) {
      const row = personalDb[dbKey];
      payload = {
        ...displayTile,
        row: displayTile.row || row,
        units: (displayTile.row || row).units ?? row.units,
        defaultUnit: (displayTile.row || row).defaultUnit ?? row.defaultUnit,
        ...(displayTile.customImage || row.customImage
          ? { customImage: displayTile.customImage || row.customImage }
          : {}),
        ...(displayTile.customIcon || row.customIcon
          ? { customIcon: displayTile.customIcon || row.customIcon }
          : {}),
      };
    }

    const weight = roundToOneDecimal(targetWeight);
    const row = payload.row || {};
    const scaledNutrients = buildScaledNutrientsForWeight(row, weight);
    const desc = String(payload.label || payload.desc || 'Alimento').trim();

    return attachProvenanceFromLegacySource({
      type: 'food',
      desc,
      name: desc,
      label: desc,
      foodDbKey: payload.foodDbKey,
      _searchSource: tile._source,
      row,
      units: payload.units ?? row.units,
      defaultUnit: payload.defaultUnit ?? row.defaultUnit,
      customImage: payload.customImage,
      customIcon: payload.customIcon,
      isRecipe: payload.isRecipe,
      qta: weight,
      weight,
      unit: 'g',
      selectedUnit: 'g',
      multiplier: weight,
      qtyLabel: `${Math.round(weight)}g`,
      ...scaledNutrients,
    }, tile._source || (payload.foodDbKey ? 'personal' : 'kentu_it'));
  };

  const openFoodDetail = (tile) => {
    if (!tile) return;
    const displayTile = resolveDisplayTile(tile);
    setDetailFood({
      tile,
      displayTile,
      tileVisual: resolveFoodVisual(displayTile, personalDb),
      defaultUnitWeight: getFoodUnitWeight(displayTile),
    });
  };

  const openFoodDetailFromSearchResult = (result) => {
    if (!result) return;
    const stats = resolveSearchResultTileStats(result, personalDb, catalogServingOverrides, masterContext);
    const dbKey = result._source === 'personal' ? (result.key || result.id) : undefined;
    const tile = {
      foodDbKey: dbKey,
      desc: stats.displayTile.desc || stats.displayTile.name || result.desc,
      name: stats.displayTile.name || stats.displayTile.desc || result.name,
      row: stats.displayTile.row || result.row,
      _source: result._source,
      key: result.key,
      id: result.id,
    };

    setDetailFood({
      tile,
      displayTile: stats.displayTile,
      tileVisual: resolveFoodVisual(result, personalDb),
      defaultUnitWeight: stats.defaultUnitWeight,
    });
  };

  const handleDetailCartConfirm = (selectedWeight) => {
    if (!detailFood?.tile || selectedWeight <= 0) return;

    const grams = clampFoodGrams(selectedWeight);
    if (grams == null || grams <= 0) return;

    const payload = buildTileDraftPayload(detailFood.tile, grams);
    const existing = findDraftItemForFood(draftFoods, payload);

    if (existing) {
      updateFoodAmount(existing.id, grams, 'g');
    } else {
      addFoodToDraft(payload);
    }

    recordFoodUsageStats(
      payload?.foodDbKey,
      personalDb,
      onPatchFoodDbEntry,
      getTimeSlotForDecimalHour(mealTime),
    );

    notifyItemAdded(String(payload.desc || payload.name));
    setDetailFood(null);
  };

  const handleAddPredictiveBlock = (tile, portionCount = 1) => {
    if (!tile || portionCount <= 0) return;

    const displayTile = resolveDisplayTile(tile);
    let payload = displayTile;
    const dbKey = displayTile.foodDbKey;
    if (dbKey && personalDb && typeof personalDb === 'object' && personalDb[dbKey]) {
      const row = personalDb[dbKey];
      payload = {
        ...displayTile,
        row: displayTile.row || row,
        units: (displayTile.row || row).units ?? row.units,
        defaultUnit: (displayTile.row || row).defaultUnit ?? row.defaultUnit,
        ...(displayTile.customImage || row.customImage
          ? { customImage: displayTile.customImage || row.customImage }
          : {}),
        ...(displayTile.customIcon || row.customIcon
          ? { customIcon: displayTile.customIcon || row.customIcon }
          : {}),
      };
    }

    const unitWeight = getFoodUnitWeight(payload);
    for (let i = 0; i < portionCount; i += 1) {
      addOrIncrementDraftFood(payload, unitWeight);
    }
    notifyItemAdded(String(displayTile?.label || displayTile?.desc || 'Alimento').trim());
  };

  const handleDetailDeepEdit = () => {
    if (!detailFood?.tile) return;
    const tile = detailFood.tile;
    setDetailFood(null);
    openEditModalForCatalog(
      tile._source && !tile.foodDbKey
        ? { ...tile, _source: tile._source }
        : tile,
    );
  };

  const openEditModalForCatalog = (source) => {
    if (source?._source === 'recipe') {
      handleEditRecipe(source);
      return;
    }
    setDeepEditFood(null);
    const mergedSource = source?._source
      ? source
      : resolveDisplayTile(source);
    const editItem = buildCatalogDeepEditItem(mergedSource, personalDb, masterContext);
    if (editItem) setEditingCatalogFood(editItem);
  };

  const handleOpenDraftDeepEdit = (item) => {
    if (item?.isRecipe && item?.foodDbKey && personalDb?.[item.foodDbKey]) {
      setEditingRecipe({ key: item.foodDbKey, entry: personalDb[item.foodDbKey] });
      return;
    }
    setEditingCatalogFood(null);
    setDeepEditFood(item);
  };

  const handleDeepEditSave = async (updatedItem) => {
    if (!updatedItem?.id) return;
    updateFoodInDraft(updatedItem.id, updatedItem);

    const dbKey = updatedItem.foodDbKey;
    if (dbKey && typeof onPatchFoodDbEntry === 'function') {
      try {
        await onPatchFoodDbEntry(dbKey, buildCatalogDbPatch(updatedItem));
      } catch {
        /* persistenza silenziosa */
      }
    }

    setDeepEditFood(null);
  };

  const handleCatalogDeepEditSave = async (updatedItem) => {
    if (!updatedItem) return;

    const identity = resolveFoodIdentityKey(updatedItem);
    const isManual = updatedItem._manualOverride === true;

    if (isManual) {
      const overrideEntry = buildCatalogOverrideFromEdit(updatedItem);
      if (overrideEntry) {
        setCatalogServingOverrides((prev) => ({
          ...prev,
          [overrideEntry.key]: overrideEntry.patch,
        }));
      }
    } else if (identity) {
      clearCatalogServingOverride(identity);
      setCatalogServingOverrides((prev) => {
        if (!prev[identity]) return prev;
        const next = { ...prev };
        delete next[identity];
        return next;
      });
    }

    const dbKey = updatedItem.foodDbKey;
    if (dbKey && typeof onPatchFoodDbEntry === 'function') {
      try {
        await onPatchFoodDbEntry(dbKey, buildCatalogDbPatch(updatedItem));
      } catch {
        /* persistenza silenziosa */
      }
    } else if (typeof onAcquireExternalFood === 'function') {
      try {
        await onAcquireExternalFood(buildCatalogAcquirePayload(updatedItem));
      } catch {
        /* acquisizione silenziosa */
      }
    }

    if (identity) {
      draftFoods.forEach((item) => {
        if (resolveFoodIdentityKey(item) === identity) {
          updateFoodInDraft(
            item.id,
            applyCatalogEditToDraftItem(item, updatedItem, { manualOverride: isManual }),
          );
        }
      });
    }

    setEditingCatalogFood(null);
  };

  const handleUnifiedDeepEditSave = async (updatedItem) => {
    if (editingCatalogFood) {
      await handleCatalogDeepEditSave(updatedItem);
      return;
    }
    await handleDeepEditSave(updatedItem);
  };

  const closeDeepEditModal = () => {
    setDeepEditFood(null);
    setEditingCatalogFood(null);
  };

  const activeDeepEditItem = deepEditFood ?? editingCatalogFood;

  const openNativeTimePicker = () => {
    const input = mealTimeInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* picker già aperto o rifiutato dal browser */
      }
    }
    input.focus();
  };

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden bg-[#050a12] text-slate-100 sm:max-w-xl">
      <header className="shrink-0 border-b border-slate-800/80">
        <div className="grid grid-cols-[minmax(4.5rem,auto)_1fr_minmax(4.5rem,auto)] items-center gap-1 px-2 pb-2 pt-3 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSavingMeal}
            aria-label="Indietro"
            className="inline-flex min-h-9 items-center gap-1 justify-self-start rounded-lg px-2 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Indietro</span>
          </button>
          <h1 className="min-w-0 truncate text-center text-sm font-semibold tracking-tight text-slate-100 sm:text-[0.95rem]">
            Registra Pasto
          </h1>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={draftFoods.length === 0 || isSavingMeal}
            aria-label="Conferma pasto"
            className="inline-flex min-h-9 items-center justify-center justify-self-end rounded-lg bg-cyan-500 px-2.5 py-1.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isSavingMeal ? '…' : 'Conferma'}
          </button>
        </div>
        <div className="px-4 pb-3">
          <div
            role="tablist"
            aria-label="Navigazione inserimento pasto"
            className="flex w-full rounded-full border border-slate-800 bg-slate-900/60 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'alimenti'}
              onClick={() => setActiveTab('alimenti')}
              className={`flex flex-1 items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                activeTab === 'alimenti'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Alimenti
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'riepilogo'}
              onClick={() => setActiveTab('riepilogo')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                activeTab === 'riepilogo'
                  ? 'bg-cyan-500/90 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Riepilogo
              {draftFoods.length > 0 ? (
                <span
                  className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                    activeTab === 'riepilogo'
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-cyan-500/20 text-cyan-300'
                  }`}
                >
                  {draftFoods.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'alimenti' ? (
          <div
            className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-2 transition-[padding] duration-300 ${
              draftFoods.length > 0 ? 'pb-24' : 'pb-4'
            }`}
          >
            <div className="space-y-3 px-0.5">
              <div>
                <form
                  className="relative"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitVetrinaSearch();
                  }}
                >
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={vetrinaSearchQuery}
                    onChange={(event) => {
                      setVetrinaSearchQuery(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        submitVetrinaSearch();
                      }
                    }}
                    enterKeyHint="search"
                    placeholder="Cerca alimento o ricetta..."
                    className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/80 py-3.5 pl-11 pr-24 text-sm text-slate-100 shadow-lg shadow-black/20 placeholder:text-slate-500 transition-all focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                      type="submit"
                      aria-label="Cerca"
                      title="Cerca"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/90 text-cyan-300 transition-all hover:border-cyan-500/40 hover:text-cyan-200 active:scale-95"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSearchModalOpen(true)}
                      aria-label="Ricerca avanzata Kentu DB"
                      title="Ricerca avanzata"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/90 text-slate-400 transition-all hover:border-cyan-500/40 hover:text-cyan-300 active:scale-95"
                    >
                      <ScanBarcode className="h-4 w-4" />
                    </button>
                  </div>
                </form>
                <p className="mt-2 text-center text-[11px] font-medium text-slate-600">
                  {isVetrinaSearching
                    ? 'Il tuo DB si aggiorna mentre digiti · Invio per cercare nei cataloghi'
                    : 'Digita per filtrare il tuo DB · Invio per cercare Kentu IT / Global / OFF'}
                </p>
              </div>

              {!isVetrinaSearching ? (
                <div className="mb-2 flex items-center gap-2">
                  <div className="mx-auto flex w-full max-w-xs flex-1 rounded-full border border-slate-800 bg-slate-900/60 p-1">
                    <button
                      type="button"
                      onClick={() => setActiveVetrinaTab('foods')}
                      className={`flex flex-1 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                        activeVetrinaTab === 'foods'
                          ? 'bg-slate-700 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FaHamburger className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                      Alimenti
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveVetrinaTab('recipes')}
                      className={`flex flex-1 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                        activeVetrinaTab === 'recipes'
                          ? 'bg-slate-700 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <MdOutlineLocalFireDepartment className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                      Le mie Ricette
                    </button>
                  </div>
                  <div className="flex shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
                    <button
                      type="button"
                      onClick={() => setCatalogViewMode('grid')}
                      aria-label="Visualizzazione griglia"
                      aria-pressed={catalogViewMode === 'grid'}
                      className={`rounded-lg p-2 transition-colors ${
                        catalogViewMode === 'grid'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogViewMode('list')}
                      aria-label="Visualizzazione elenco"
                      aria-pressed={catalogViewMode === 'list'}
                      className={`rounded-lg p-2 transition-colors ${
                        catalogViewMode === 'list'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-2 flex justify-end">
                  <div className="flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
                    <button
                      type="button"
                      onClick={() => setCatalogViewMode('grid')}
                      aria-label="Visualizzazione griglia"
                      aria-pressed={catalogViewMode === 'grid'}
                      className={`rounded-lg p-2 transition-colors ${
                        catalogViewMode === 'grid'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogViewMode('list')}
                      aria-label="Visualizzazione elenco"
                      aria-pressed={catalogViewMode === 'list'}
                      className={`rounded-lg p-2 transition-colors ${
                        catalogViewMode === 'list'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {isVetrinaSearching ? (
                <div className="min-w-0 space-y-6">
                  {unifiedSearchGridItems.length > 0 ? (
                    <div className={vetrinaTilesContainerClass}>
                      {unifiedSearchGridItems.map((item) => (
                        <React.Fragment key={item.key}>
                          {renderUnifiedSearchGridItem(item)}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : null}

                  {isVetrinaDbSearching ? (
                    <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/80 px-4 py-4 text-center text-xs text-slate-500">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                      Ricerca in corso...
                    </p>
                  ) : null}

                  {unifiedSearchGridItems.length === 0
                    && !isVetrinaDbSearching ? (
                      <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                        Nessun risultato per &quot;{liveVetrinaQuery}&quot;
                      </p>
                    ) : null}
                </div>
              ) : activeVetrinaTab === 'foods' ? (
                <div className="min-w-0">
                  {gridFoods.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                      Nessun alimento frequente per questo slot
                    </p>
                  ) : (
                    <div className={vetrinaTilesContainerClass}>
                      {suggestedFoods.length > 0 ? (
                        <div
                          className={
                            catalogViewMode === 'grid'
                              ? 'col-span-full mb-0.5'
                              : 'w-full mb-2'
                          }
                        >
                          <h2 className="text-base font-bold text-slate-100">
                            ✨ Consigliati per {selectedMealLabel}
                          </h2>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Legenda: ✨ consigliati · C tuo DB · 🇮🇹 Italia · 🌐 USDA
                          </p>
                        </div>
                      ) : null}
                      {gridFoods.map((tile) => {
                        const identityKey = resolveFoodIdentityKey(tile);
                        const isSuggested = Boolean(
                          identityKey && suggestedFoodIdentityKeys.has(identityKey),
                        );
                        return renderQuickFoodTile(tile, isSuggested);
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsRecipeBuilderOpen(true)}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 active:scale-[0.99]"
                  >
                    ➕ Crea Nuova Ricetta
                  </button>

                  <section>
                    <h2 className="mb-1 truncate text-sm font-semibold text-slate-200">Le mie Ricette</h2>
                    <p className="mb-3 text-xs text-slate-500">
                      {savedRecipes.length}{' '}
                      {savedRecipes.length === 1 ? 'ricetta salvata' : 'ricette salvate'}
                    </p>
                    {savedRecipes.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                        Nessuna ricetta salvata. Crea una nuova ricetta o componi un pasto e usa &quot;Salva come ricetta&quot;.
                      </p>
                    ) : (
                      <div className={vetrinaTilesContainerClass}>
                        {savedRecipes
                          .map((recipe) => renderSavedRecipeTile(recipe))
                          .filter(Boolean)}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-900/40">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-violet-300/80">
                  Riepilogo
                </p>
                {viewMode === 'expanded' && !isBuilderHeaderCollapsed ? (
                  <h2 className="truncate text-sm font-semibold text-slate-100">{checkoutMealTitle}</h2>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div className="flex rounded-lg border border-slate-700/80 bg-slate-900/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('expanded');
                      setIsBuilderHeaderCollapsed(false);
                      checkoutScrollCollapsedRef.current = false;
                    }}
                    aria-label="Vista espansa"
                    aria-pressed={viewMode === 'expanded'}
                    title="Vista espansa"
                    className={`rounded-md p-1.5 transition-colors ${
                      viewMode === 'expanded'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('compact');
                      setIsBuilderHeaderCollapsed(true);
                    }}
                    aria-label="Vista compatta"
                    aria-pressed={viewMode === 'compact'}
                    title="Vista compatta"
                    className={`rounded-md p-1.5 transition-colors ${
                      viewMode === 'compact'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
                {viewMode === 'expanded' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBuilderHeaderCollapsed((prev) => {
                        const next = !prev;
                        if (!next) checkoutScrollCollapsedRef.current = false;
                        return next;
                      });
                    }}
                    className="rounded-lg border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                    aria-label={isBuilderHeaderCollapsed ? 'Espandi dettagli pasto' : 'Comprimi dettagli pasto'}
                    title={isBuilderHeaderCollapsed ? 'Espandi dettagli' : 'Comprimi dettagli'}
                  >
                    {isBuilderHeaderCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Sticky micro-strip: sempre visibile, ~44px */}
            {showBuilderSummaryBar ? (
              <CompactMealMacroStrip
                title={checkoutMealTitle}
                draftTotals={draftTotals}
                mealConsumed={mealConsumed}
                className="sticky top-0 z-10"
                onExpand={
                  viewMode === 'expanded' && isBuilderHeaderCollapsed
                    ? () => {
                      setIsBuilderHeaderCollapsed(false);
                      checkoutScrollCollapsedRef.current = false;
                    }
                    : null
                }
              />
            ) : null}

            {viewMode === 'expanded' && !isBuilderHeaderCollapsed ? (
              <div className="shrink-0 border-b border-slate-800/80 px-3 pb-2 pt-1.5 transition-all duration-200">
                <LiveMacroHud
                  mealTargets={mealTargets}
                  mealConsumed={mealConsumed}
                  draftTotals={draftTotals}
                  compact
                  className="border-slate-700/80 bg-slate-900 shadow-none"
                />

                <div className="mt-2 space-y-2">
                  <div className="flex min-w-0 rounded-lg border border-slate-700/80 bg-slate-900/60 p-0.5">
                    {MEAL_SLOTS.map((slot) => {
                      const isActive = selectedSlot === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlot(slot.id)}
                          className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors sm:px-2 ${
                            isActive
                              ? 'bg-cyan-500 text-slate-950'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {slot.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="shrink-0 text-[11px] text-slate-400">Orario</span>
                    <label
                      htmlFor="fast-logger-cart-meal-time"
                      onClick={openNativeTimePicker}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-100 transition-colors hover:border-cyan-500/40 hover:bg-slate-800/90 active:scale-[0.98]"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-cyan-400" strokeWidth={2} aria-hidden />
                      <input
                        ref={mealTimeInputRef}
                        id="fast-logger-cart-meal-time"
                        type="time"
                        value={decimalToTimeStr(mealTime)}
                        onChange={handleNativeMealTimeInputChange}
                        onClick={(event) => {
                          if (typeof event.currentTarget.showPicker === 'function') {
                            try {
                              event.currentTarget.showPicker();
                            } catch {
                              /* picker già aperto o rifiutato dal browser */
                            }
                          }
                        }}
                        className="min-w-0 cursor-pointer border-none bg-transparent p-0 text-xs font-medium text-white outline-none [color-scheme:dark]"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            <div
              ref={checkoutListScrollRef}
              onScroll={handleCheckoutListScroll}
              className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-3 ${
                viewMode === 'compact' ? 'py-1.5' : 'py-2'
              }`}
            >
              {draftFoods.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
                  <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                    Nessun alimento nel piatto — aggiungi dalla vetrina
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('alimenti')}
                    className="rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-950/30"
                  >
                    Vai ad Alimenti
                  </button>
                </div>
              ) : (
                <ul className={`min-w-0 flex-1 ${viewMode === 'compact' ? 'space-y-1.5' : 'space-y-2'}`}>
                  {draftFoods.map((food) => (
                    <DraftCartSmartRow
                      key={food.id}
                      item={food}
                      personalDb={personalDb}
                      onUpdateAmount={updateFoodAmount}
                      onRemove={removeFoodFromDraft}
                      onDeepEdit={handleOpenDraftDeepEdit}
                      variant={viewMode === 'compact' ? 'compact' : 'card'}
                    />
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setPreferManualSearchEntry(false);
                        setIsSearchModalOpen(true);
                      }}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/35 bg-cyan-500/5 px-4 py-3 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10"
                    >
                      + Aggiungi un altro alimento
                    </button>
                  </li>
                </ul>
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-slate-800 px-3 py-3">
              <button
                type="button"
                onClick={() => setShowSolverModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 transition-colors hover:border-violet-300/50 hover:bg-violet-500/20 active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                Bilancia Pasto
              </button>

              {draftFoods.length > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenSaveRecipe}
                  disabled={isSavingMeal}
                  className="w-full rounded-xl border border-violet-500/30 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:border-violet-400/50 hover:bg-violet-950/30 disabled:opacity-50"
                >
                  Salva come ricetta
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleConfirm}
                disabled={draftFoods.length === 0 || isSavingMeal}
                className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSavingMeal
                  ? 'Salvataggio…'
                  : `CONFERMA PASTO · ${draftMealKcal} kcal`}
              </button>
            </div>
          </div>
        )}
      </div>

      {addFeedback ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-20 left-1/2 z-[60] max-w-[90%] -translate-x-1/2 rounded-full border border-cyan-500/40 bg-slate-900/95 px-4 py-2 text-xs font-medium text-cyan-200 shadow-lg backdrop-blur-sm transition-all duration-300"
        >
          ✓ {addFeedback}
        </div>
      ) : null}

      {activeTab === 'alimenti' && draftFoods.length > 0 ? (
        <div
          key={`mini-cart-${draftFoods.length}`}
          className={`absolute inset-x-0 bottom-0 z-30 shrink-0 space-y-2 px-4 pb-4 pt-2 ${
            cartPulse ? 'vetrina-cart-row-enter' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setShowSolverModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-violet-950/80 px-3 py-2 text-xs font-semibold text-violet-200 shadow-lg backdrop-blur-sm transition-colors hover:border-violet-300/50 hover:bg-violet-900/80 active:scale-[0.98]"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Chiedi Consulto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riepilogo')}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500 to-cyan-400 px-4 py-3.5 text-left shadow-xl shadow-cyan-950/40 transition-all duration-300 hover:from-cyan-400 hover:to-cyan-300 active:scale-[0.98] ${
              cartPulse ? 'ring-2 ring-cyan-200/50' : ''
            }`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950/20 shadow-inner">
                <ShoppingBag className="h-5 w-5 text-slate-950" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold tracking-tight text-slate-950">
                  {miniCartMealLabel}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-900/75">
                  {draftFoods.length}{' '}
                  {draftFoods.length === 1 ? 'alimento' : 'alimenti'}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-2xl font-bold leading-none tabular-nums text-slate-950">
                {draftMealKcal}
              </span>
              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-slate-900/70">
                kcal
              </span>
            </span>
          </button>
        </div>
      ) : null}

      <UniversalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => {
          setIsSearchModalOpen(false);
          setPreferManualSearchEntry(false);
        }}
        personalDb={personalDb}
        kentuItDb={kentuItDb}
        globalDb={globalDb ?? masterDb}
        offDb={offDb}
        masterDb={globalDb ?? masterDb}
        onSelectFood={handleFoodSelection}
        onEditCatalogFood={openEditModalForCatalog}
        onEditRecipe={handleEditRecipe}
        onRemoveOneFromDraft={removeOneUnitFromDraft}
        onOpenScanner={handleOpenScanner}
        onSaveManualFood={onAcquireExternalFood}
        draftFoods={draftFoods}
        scannerError={scannerError}
        isScannerResolving={isScannerResolving}
        preferManualEntry={preferManualSearchEntry}
      />

      <BarcodeScannerOverlay
        isOpen={isScannerOpen}
        onClose={closeScanner}
        videoRef={videoRef}
        error={scannerError}
        isResolving={isScannerResolving}
      />

      <MicronutrientEnrichmentModal
        isOpen={Boolean(enrichmentSession)}
        productName={enrichmentSession?.productName}
        isLoading={Boolean(enrichmentSession?.isLoading)}
        error={enrichmentSession?.error || ''}
        matches={enrichmentSession?.matches || []}
        onSelectMatch={handleEnrichmentSelect}
        onSkip={handleEnrichmentSkip}
        onClose={handleEnrichmentCancel}
      />

      <FoodDeepEditModal
        isOpen={Boolean(activeDeepEditItem)}
        foodItem={activeDeepEditItem}
        masterContext={masterContext}
        onClose={closeDeepEditModal}
        onSave={handleUnifiedDeepEditSave}
      />

      {isSaveRecipeOpen ? (
        <div
          className="fixed inset-0 z-[100060] flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Salva ricetta"
        >
          <form
            onSubmit={handleSaveRecipe}
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-100">Salva come ricetta</h3>
            <p className="mt-1 text-xs text-slate-400">
              {draftFoods.length} ingredienti verranno salvati nel database personale.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Nome ricetta</span>
              <input
                type="text"
                value={recipeName}
                onChange={(event) => setRecipeName(event.target.value)}
                autoFocus
                placeholder="Es. Pasta al pesto"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
            {saveRecipeError ? (
              <p className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {saveRecipeError}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsSaveRecipeOpen(false);
                  setSaveRecipeError('');
                }}
                disabled={isSavingRecipe}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSavingRecipe}
                className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSavingRecipe ? 'Salvataggio...' : 'Salva ricetta'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {detailFood ? (
        <FoodDetailModal
          food={detailFood}
          draftFoods={draftFoods}
          onClose={() => setDetailFood(null)}
          onConfirm={handleDetailCartConfirm}
          onDeepEdit={handleDetailDeepEdit}
        />
      ) : null}

      {editingRecipe ? (
        <RecipeEditor
          recipeKey={editingRecipe.key}
          recipeEntry={editingRecipe.entry}
          onSave={handleRecipeEditorSave}
          onClose={() => setEditingRecipe(null)}
        />
      ) : null}

      {isRecipeBuilderOpen ? (
        <RecipeBuilder
          personalDb={personalDb}
          masterDb={masterDb}
          onSave={handleRecipeBuilderSave}
          onClose={() => setIsRecipeBuilderOpen(false)}
          onAcquireExternalFood={onAcquireExternalFood}
        />
      ) : null}

      <KentuSolverModal
        open={showSolverModal}
        onClose={() => setShowSolverModal(false)}
        targets={solverTargets}
        existingFoods={solverExistingFoods}
        selectedSlot={selectedSlot}
        onApply={handleSolverApply}
        elevated
      />

    </div>
  );
}

export default function FastMealLogger({
  fullHistory,
  todayLog = null,
  onClose,
  onSave,
  personalDb,
  masterDb: masterDbProp,
  onAcquireExternalFood,
  onSaveRecipe,
  onPatchFoodDbEntry,
  getMealTargetsForSlot,
  getMealConsumedForSlot,
  initialDraft,
  editingMealId,
  initialMealSlot,
  initialMealTime,
  autoOpenBarcodeScanner = false,
  onAutoOpenBarcodeScannerConsumed,
}) {
  const { kentuItDb: loadedKentuItDb, globalDb: loadedGlobalDb, offDb: loadedOffDb } = useFoodDb({ defer: false });
  const resolvedKentuItDb = loadedKentuItDb;
  const resolvedGlobalDb = masterDbProp ?? loadedGlobalDb;
  const resolvedOffDb = loadedOffDb;
  const composerInitialMealTime = useMemo(() => {
    if (typeof initialMealTime === 'number' && !Number.isNaN(initialMealTime)) {
      return initialMealTime;
    }
    if (Array.isArray(initialDraft) && initialDraft.length > 0) {
      const t = initialDraft[0]?.mealTime;
      if (typeof t === 'number' && !Number.isNaN(t)) return t;
    }
    return getCurrentDecimalHours();
  }, [initialMealTime, initialDraft]);
  const composerInitialMealType =
    initialMealSlot
    || (Array.isArray(initialDraft) && initialDraft[0]?.mealType
      ? String(initialDraft[0].mealType).split('_')[0]
      : null)
    || (editingMealId ? String(editingMealId).split('_')[0] : null)
    || inferMealSlotFromCurrentHour();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100040] flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-[#050a12] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
      role="dialog"
      aria-modal="true"
      aria-label="Registra pasto"
    >
      <MealComposerProvider
        initialMealType={composerInitialMealType}
        initialMealTime={composerInitialMealTime}
      >
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
          <FastMealLoggerContent
            fullHistory={fullHistory}
            todayLog={todayLog}
            onClose={onClose}
            onSave={onSave}
            personalDb={personalDb}
            kentuItDb={resolvedKentuItDb}
            globalDb={resolvedGlobalDb}
            offDb={resolvedOffDb}
            masterDb={resolvedGlobalDb}
            onAcquireExternalFood={onAcquireExternalFood}
            onSaveRecipe={onSaveRecipe}
            onPatchFoodDbEntry={onPatchFoodDbEntry}
            getMealTargetsForSlot={getMealTargetsForSlot}
            getMealConsumedForSlot={getMealConsumedForSlot}
            initialDraft={initialDraft}
            editingMealId={editingMealId}
            initialMealSlot={initialMealSlot}
            initialMealTime={initialMealTime}
            autoOpenBarcodeScanner={autoOpenBarcodeScanner}
            onAutoOpenBarcodeScannerConsumed={onAutoOpenBarcodeScannerConsumed}
          />
        </div>
      </MealComposerProvider>
    </div>,
    document.body,
  );
}
