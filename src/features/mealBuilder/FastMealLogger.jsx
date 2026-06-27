import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MealComposerProvider,
  useMealComposer,
} from './context/MealComposerContext';
import { usePredictiveFoodBlocks } from './hooks/usePredictiveFoodBlocks';
import UniversalSearchModal from './components/UniversalSearchModal';
import BarcodeScannerOverlay from './components/BarcodeScannerOverlay';
import DraftCartSmartRow from './components/DraftCartSmartRow';
import RecipeEditor from './components/RecipeEditor';
import RecipeBuilder from './components/RecipeBuilder';
import FoodDeepEditModal from './components/FoodDeepEditModal';
import FoodDetailModal from './components/FoodDetailModal';
import QtyBadge from './components/QtyBadge';
import QuickFoodTile from './components/QuickFoodTile';
import LiveMacroHud from './components/LiveMacroHud';
import TodayMealsTimeline from './components/TodayMealsTimeline';
import { formatCheckoutMealTitle, formatMiniCartMealLabel, getFoodEmoji, resolveFoodVisual } from './utils/foodIconUtils';
import {
  findDraftItemForFood,
  getDefaultUnitKcal,
  getDraftQtyForFood,
  getFoodUnitWeight,
  resolveFoodIdentityKey,
} from './utils/draftFoodMatchUtils';
import { roundToOneDecimal } from './utils/numberFormatUtils';
import { getPer100Macros, buildScaledNutrientsForWeight } from './utils/foodMacroUtils';
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
import { resolveUnitWeight } from './utils/draftFoodUnits';
import { ChevronDown, Clock, LayoutGrid, List, Minus, Plus, Search, ScanBarcode, Settings, ShoppingBag } from 'lucide-react';
import { FaHamburger } from 'react-icons/fa';
import { MdOutlineLocalFireDepartment } from 'react-icons/md';
import useBarcodeScanner from './hooks/useBarcodeScanner';
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
import {
  searchPersonalDb,
  searchKentuItDb,
  useDebouncedExternalFoodSearch,
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

  return {
    desc,
    kcal: Number(row.kcal ?? row.cal) || 0,
    prot: Number(row.prot) || 0,
    carb: Number(row.carb) || 0,
    fatTotal: Number(row.fatTotal ?? row.fat) || 0,
    ...(row.barcode ? { barcode: String(row.barcode).trim() } : {}),
    ...(food._source === 'master' ? { foodSource: 'KENTU' } : {}),
  };
}

function formatSearchResultForDraft(food) {
  const row = food?.row || {};
  const desc = String(food?.desc || food?.name || row.desc || row.name || 'Alimento').trim();
  const qta = 100;
  const scaledNutrients = buildScaledNutrientsForWeight(row, qta);

  return attachProvenanceFromLegacySource({
    type: 'food',
    desc,
    name: desc,
    foodDbKey: food._source === 'personal' ? (food.key || food.id) : undefined,
    _searchSource: food._source,
    row,
    units: row.units,
    defaultUnit: row.defaultUnit,
    qta,
    weight: qta,
    unit: 'g',
    selectedUnit: 'g',
    multiplier: qta,
    qtyLabel: '100g',
    ...scaledNutrients,
    ...(row.customImage ? { customImage: row.customImage } : {}),
    ...(row.customIcon ? { customIcon: row.customIcon } : {}),
    ...(row.iconTag ? { iconTag: row.iconTag } : {}),
    ...(row.iconOverride ? { iconOverride: row.iconOverride } : {}),
  }, food._source);
}

function textMatchesQuery(text, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return String(text || '').trim().toLowerCase().includes(q);
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

function resolveSearchResultTileStats(result, personalDb, catalogServingOverrides) {
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
    );
    return {
      matchFood: catalogItem,
      defaultUnitWeight: getFoodUnitWeight(catalogItem),
      defaultUnitKcal: getDefaultUnitKcal(catalogItem),
      displayTile: catalogItem,
    };
  }

  const matchFood = buildSearchMatchFood(result, personalDb);
  return {
    matchFood,
    defaultUnitWeight: SEARCH_DEFAULT_UNIT_WEIGHT,
    defaultUnitKcal: resolveSearchKcalPer100(result),
    displayTile: { desc: name, label: name, row: result.row },
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
}) {
  const [selectedSlot, setSelectedSlot] = useState(
    () => initialMealSlot || resolveInitialMealSlot(initialDraft, editingMealId),
  );
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSaveRecipeOpen, setIsSaveRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isRecipeBuilderOpen, setIsRecipeBuilderOpen] = useState(false);
  const [detailFood, setDetailFood] = useState(null);
  const [activeVetrinaTab, setActiveVetrinaTab] = useState('foods');
  const [viewMode, setViewMode] = useState('grid');
  const [vetrinaSearchQuery, setVetrinaSearchQuery] = useState('');
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [saveRecipeError, setSaveRecipeError] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(
    () => Array.isArray(initialDraft) && initialDraft.length > 0,
  );
  const [cartPulse, setCartPulse] = useState(false);
  const [addFeedback, setAddFeedback] = useState(null);
  const [deepEditFood, setDeepEditFood] = useState(null);
  const [editingCatalogFood, setEditingCatalogFood] = useState(null);
  const [catalogServingOverrides, setCatalogServingOverrides] = useState({});
  const prefillAppliedRef = useRef(false);
  const cartPulseTimerRef = useRef(null);
  const addFeedbackTimerRef = useRef(null);
  const mealTimeInputRef = useRef(null);
  const mealTimeManualRef = useRef(false);
  const {
    draftFoods,
    draftTotals,
    mealTime,
    setMealTime,
    addFoodToDraft,
    removeFoodFromDraft,
    updateFoodAmount,
    updateFoodInDraft,
    clearDraft,
    loadInitialDraft,
  } = useMealComposer();

  const handleMealTimeChange = useCallback((hour) => {
    mealTimeManualRef.current = true;
    setMealTime(hour);
  }, [setMealTime]);

  useEffect(() => {
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

  const handleFoodSelection = async (food) => {
    if (!food) return;

    if (food._source === 'recipe') {
      const payload = buildRecipeDraftPayloadFromSearchResult(food, personalDb);
      if (!payload) return;
      addOrIncrementDraftFood(payload, getFoodUnitWeight(payload));
      setIsSearchModalOpen(false);
      notifyItemAdded(payload.desc);
      return;
    }

    if (food._source !== 'personal' && food._source !== 'recipe' && typeof onAcquireExternalFood === 'function') {
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
    addOrIncrementDraftFood(draftPayload, SEARCH_DEFAULT_UNIT_WEIGHT);
    setIsSearchModalOpen(false);
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
      notifyItemAdded(payload.desc);
      return;
    }

    if (food._source !== 'personal' && food._source !== 'recipe' && typeof onAcquireExternalFood === 'function') {
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
    for (let i = 0; i < portionCount; i += 1) {
      addOrIncrementDraftFood(draftPayload, SEARCH_DEFAULT_UNIT_WEIGHT);
    }
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
  });

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (Array.isArray(initialDraft) && initialDraft.length > 0) {
      loadInitialDraft(initialDraft);
      prefillAppliedRef.current = true;
      setIsCartOpen(true);
    }
  }, [initialDraft, loadInitialDraft]);
  const mealTargets = useMemo(
    () => getMealTargetsForSlot?.(selectedSlot) ?? {},
    [selectedSlot, getMealTargetsForSlot],
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
      const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
      const key = resolveFoodIdentityKey(displayTile);
      if (key) keys.add(key);
    });
    return keys;
  }, [suggestedFoods, personalDb, catalogServingOverrides]);

  const remainingFoods = useMemo(
    () =>
      quickFoods
        .filter((tile) => {
          const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
          const key = resolveFoodIdentityKey(displayTile);
          return !key || !suggestedFoodIdentityKeys.has(key);
        })
        .sort((a, b) =>
          compareProvenancePriority(
            { provenance: resolveProvenanceFromTile(a, personalDb) },
            { provenance: resolveProvenanceFromTile(b, personalDb) },
          ),
        ),
    [quickFoods, personalDb, catalogServingOverrides, suggestedFoodIdentityKeys],
  );

  const gridFoods = useMemo(
    () => [...suggestedFoods, ...remainingFoods],
    [suggestedFoods, remainingFoods],
  );

  const savedRecipes = useMemo(() => fetchRecipesFromDb(personalDb), [personalDb]);
  const vetrinaQuery = vetrinaSearchQuery.trim();
  const isVetrinaSearching = vetrinaQuery.length > 0;

  const filteredQuickFoods = useMemo(
    () =>
      quickFoods.filter((tile) => {
        const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
        const name = displayTile.label || displayTile.desc || '';
        return textMatchesQuery(name, vetrinaQuery);
      }),
    [quickFoods, personalDb, catalogServingOverrides, vetrinaQuery],
  );

  const selectedMealLabel = useMemo(
    () => getLearnedMealSlotLabel(mealTime, fullHistory),
    [mealTime, fullHistory],
  );

  const vetrinaTilesContainerClass =
    viewMode === 'grid'
      ? 'grid w-full grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-3'
      : 'flex w-full flex-col gap-2.5';

  const filteredSavedRecipes = useMemo(
    () => savedRecipes.filter((recipe) => textMatchesQuery(recipe.name, vetrinaQuery)),
    [savedRecipes, vetrinaQuery],
  );

  const vetrinaDbSearchResults = useMemo(() => {
    if (!isVetrinaSearching) return [];
    const personalResults = searchPersonalDb(personalDb, vetrinaQuery);
    const creaResults = searchKentuItDb(vetrinaQuery, kentuItDb, personalResults);
    return [...personalResults, ...creaResults].sort(compareProvenancePriority);
  }, [personalDb, kentuItDb, vetrinaQuery, isVetrinaSearching]);

  const { externalResults: vetrinaExternalResults, isSearchingExternal } =
    useDebouncedExternalFoodSearch(
      isVetrinaSearching ? vetrinaQuery : '',
      personalDb,
      globalDb ?? masterDb,
      { kentuItDb, searchGlobal: true },
    );

  const quickFoodIdentityKeys = useMemo(() => {
    const keys = new Set();
    filteredQuickFoods.forEach((tile) => {
      const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
      const key = resolveFoodIdentityKey(displayTile);
      if (key) keys.add(key);
    });
    return keys;
  }, [filteredQuickFoods, personalDb, catalogServingOverrides]);

  const extraDbSearchResults = useMemo(
    () =>
      vetrinaDbSearchResults.filter((result) => {
        const matchKey = result._source === 'personal' || result._source === 'recipe'
          ? `db:${String(result.key || result.id).trim()}`
          : null;
        if (matchKey && quickFoodIdentityKeys.has(matchKey)) return false;
        return true;
      }),
    [vetrinaDbSearchResults, quickFoodIdentityKeys],
  );

  const unifiedSearchGridItems = useMemo(() => {
    if (!isVetrinaSearching) return [];

    const items = [];

    filteredQuickFoods.forEach((tile) => {
      items.push({ kind: 'predictive', key: `predictive-${tile.key}`, data: tile });
    });

    extraDbSearchResults.forEach((result) => {
      items.push({
        kind: 'search',
        key: `search-${result._source}-${result.id}`,
        data: result,
      });
    });

    vetrinaExternalResults.forEach((result) => {
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

    return items.sort((a, b) => {
      const provenanceA = a.kind === 'predictive'
        ? resolveProvenanceFromTile(a.data, personalDb)
        : resolveProvenanceFromSearchResult(a.data);
      const provenanceB = b.kind === 'predictive'
        ? resolveProvenanceFromTile(b.data, personalDb)
        : resolveProvenanceFromSearchResult(b.data);
      return compareProvenancePriority({ provenance: provenanceA }, { provenance: provenanceB });
    });
  }, [
    isVetrinaSearching,
    filteredQuickFoods,
    extraDbSearchResults,
    vetrinaExternalResults,
    filteredSavedRecipes,
    personalDb,
  ]);

  const handleSavedRecipeAdd = (recipe) => {
    const payload = buildRecipeDraftPayloadFromDb(recipe.key, recipe.row);
    if (!payload) return;
    addOrIncrementDraftFood(payload, getFoodUnitWeight(payload));
    notifyItemAdded(recipe.name);
  };

  const renderQuickFoodTile = (tile, isSuggested = false) => {
    const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
    const tileVisual = resolveFoodVisual(displayTile, personalDb);
    const defaultUnitWeight = getFoodUnitWeight(displayTile);
    const defaultUnitKcal = getDefaultUnitKcal(displayTile);
    const qty = getDraftQtyForFood(draftFoods, displayTile, defaultUnitWeight);

    return (
      <QuickFoodTile
        key={tile.key}
        viewMode={viewMode}
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
    const {
      matchFood,
      defaultUnitWeight,
      defaultUnitKcal,
      displayTile,
    } = resolveSearchResultTileStats(result, personalDb, catalogServingOverrides);
    const tileVisual = resolveFoodVisual(result, personalDb);
    const qty = getDraftQtyForFood(draftFoods, matchFood, defaultUnitWeight);
    const sourceBadge = SEARCH_SOURCE_BADGE[result._source] || null;
    const provenance = resolveProvenanceFromSearchResult(result);

    return (
      <QuickFoodTile
        viewMode={viewMode}
        displayTile={displayTile}
        tileVisual={tileVisual}
        defaultUnitWeight={defaultUnitWeight}
        defaultUnitKcal={defaultUnitKcal}
        qty={qty}
        sourceBadge={sourceBadge}
        provenance={provenance}
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
        viewMode={viewMode}
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

  const handleConfirm = () => {
    if (draftFoods.length === 0) return;
    const learnedSlot = getLearnedMealSlot(mealTime, fullHistory);
    const mealSlotToSave = selectedSlot || learnedSlot;
    recordDraftFoodsUsageStats(
      draftFoods,
      personalDb,
      onPatchFoodDbEntry,
      getTimeSlotForDecimalHour(mealTime),
    );
    onSave?.(draftFoods, mealSlotToSave, editingMealId ?? undefined, mealTime);
    clearDraft();
  };

  const handleOpenScanner = () => {
    setScannerError('');
    openScanner();
  };

  const buildTileDraftPayload = (tile, targetWeight) => {
    const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
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
    const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
    setDetailFood({
      tile,
      displayTile,
      tileVisual: resolveFoodVisual(displayTile, personalDb),
      defaultUnitWeight: getFoodUnitWeight(displayTile),
    });
  };

  const openFoodDetailFromSearchResult = (result) => {
    if (!result) return;
    const stats = resolveSearchResultTileStats(result, personalDb, catalogServingOverrides);
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

    const payload = buildTileDraftPayload(detailFood.tile, selectedWeight);
    const existing = findDraftItemForFood(draftFoods, payload);

    if (existing) {
      updateFoodAmount(existing.id, selectedWeight, 'g');
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

    const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
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
      : mergeCatalogDisplay(source, personalDb, catalogServingOverrides);
    const editItem = buildCatalogDeepEditItem(mergedSource, personalDb);
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

    const overrideEntry = buildCatalogOverrideFromEdit(updatedItem);
    if (overrideEntry) {
      setCatalogServingOverrides((prev) => ({
        ...prev,
        [overrideEntry.key]: overrideEntry.patch,
      }));
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

    const identity = resolveFoodIdentityKey(updatedItem);
    if (identity) {
      draftFoods.forEach((item) => {
        if (resolveFoodIdentityKey(item) === identity) {
          updateFoodInDraft(item.id, applyCatalogEditToDraftItem(item, updatedItem));
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
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden bg-[#050a12] text-slate-100">
      <header className="shrink-0 flex min-w-0 items-center justify-between px-4 pb-2 pt-3">
        <img
          src="/nuovo%20logo%20trasparente2.png"
          alt="KentuOS"
          decoding="async"
          draggable={false}
          className="h-9 w-auto max-w-[140px] object-contain object-left"
        />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          Chiudi
        </button>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-2 transition-[padding] duration-300 ${
          draftFoods.length > 0 && !isCartOpen ? 'pb-24' : 'pb-4'
        }`}
      >
        <div className="space-y-3 px-0.5">
          {!isVetrinaSearching ? (
            <TodayMealsTimeline
              fullHistory={fullHistory}
              todayLog={todayLog}
              currentMealTime={mealTime}
              onMealTimeChange={handleMealTimeChange}
              manualOverrideRef={mealTimeManualRef}
              className="block w-full"
            />
          ) : null}

          <div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                type="search"
                value={vetrinaSearchQuery}
                onChange={(event) => setVetrinaSearchQuery(event.target.value)}
                placeholder="Cerca alimento o ricetta..."
                className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/80 py-3.5 pl-11 pr-12 text-sm text-slate-100 shadow-lg shadow-black/20 placeholder:text-slate-500 transition-all focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              />
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(true)}
                aria-label="Ricerca avanzata Kentu DB"
                title="Ricerca avanzata"
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/90 text-slate-400 transition-all hover:border-cyan-500/40 hover:text-cyan-300 active:scale-95"
              >
                <ScanBarcode className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-slate-600">
              {isVetrinaSearching
                ? vetrinaExternalResults.length > 0
                  ? 'Ricerca globale · C > 🇮🇹 > 🌐'
                  : 'Ricerca · personale, CREA, Italia e USDA'
                : 'Suggerimenti basati sulle tue abitudini reali'}
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
                  onClick={() => setViewMode('grid')}
                  aria-label="Visualizzazione griglia"
                  aria-pressed={viewMode === 'grid'}
                  className={`rounded-lg p-2 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="Visualizzazione elenco"
                  aria-pressed={viewMode === 'list'}
                  className={`rounded-lg p-2 transition-colors ${
                    viewMode === 'list'
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
                  onClick={() => setViewMode('grid')}
                  aria-label="Visualizzazione griglia"
                  aria-pressed={viewMode === 'grid'}
                  className={`rounded-lg p-2 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="Visualizzazione elenco"
                  aria-pressed={viewMode === 'list'}
                  className={`rounded-lg p-2 transition-colors ${
                    viewMode === 'list'
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

              {isSearchingExternal ? (
                <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/80 px-4 py-4 text-center text-xs text-slate-500">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                  Ricerca su Kentu DB...
                </p>
              ) : null}

              {unifiedSearchGridItems.length === 0
                && !isSearchingExternal ? (
                  <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                    Nessun risultato per &quot;{vetrinaQuery}&quot;
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
                        viewMode === 'grid'
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
                    const displayTile = mergeCatalogDisplay(
                      tile,
                      personalDb,
                      catalogServingOverrides,
                    );
                    const identityKey = resolveFoodIdentityKey(displayTile);
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

      {addFeedback && !isCartOpen ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-20 left-1/2 z-[60] max-w-[90%] -translate-x-1/2 rounded-full border border-cyan-500/40 bg-slate-900/95 px-4 py-2 text-xs font-medium text-cyan-200 shadow-lg backdrop-blur-sm transition-all duration-300"
        >
          ✓ {addFeedback}
        </div>
      ) : null}

      {isCartOpen ? (
        <button
          type="button"
          aria-label="Chiudi riepilogo piatto"
          onClick={() => setIsCartOpen(false)}
          className="absolute inset-0 z-40 bg-black/45 transition-opacity duration-300"
        />
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden border-t border-slate-700 bg-slate-900 shadow-2xl transition-all duration-300 ease-out ${
          isCartOpen
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-full opacity-0'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-300/80">
              Riepilogo
            </p>
            <h2 className="text-base font-semibold text-slate-100">{checkoutMealTitle}</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsCartOpen(false)}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            aria-label="Chiudi riepilogo piatto"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        <LiveMacroHud
          mealTargets={mealTargets}
          mealConsumed={mealConsumed}
          draftTotals={draftTotals}
          className="mx-4 shrink-0 border-slate-700/80 bg-slate-900 shadow-none"
        />

        <div className="shrink-0 space-y-3 border-b border-slate-800 px-4 pb-3 pt-2">
          <div className="flex min-w-0 rounded-xl border border-slate-700/80 bg-slate-900/60 p-1">
            {MEAL_SLOTS.map((slot) => {
              const isActive = selectedSlot === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlot(slot.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-3 ${
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

          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="shrink-0 text-xs text-slate-400">Orario pasto</span>
            <label
              htmlFor="fast-logger-cart-meal-time"
              onClick={openNativeTimePicker}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors hover:border-cyan-500/40 hover:bg-slate-800/90 active:scale-[0.98]"
            >
              <Clock className="h-4 w-4 shrink-0 text-cyan-400" strokeWidth={2} aria-hidden />
              <input
                ref={mealTimeInputRef}
                id="fast-logger-cart-meal-time"
                type="time"
                value={decimalToTimeStr(mealTime)}
                onChange={(event) => {
                  const parsed = parseTimeStrToDecimal(event.target.value);
                  if (typeof parsed === 'number' && !Number.isNaN(parsed)) {
                    mealTimeManualRef.current = true;
                    setMealTime(parsed);
                  }
                }}
                onClick={(event) => {
                  if (typeof event.currentTarget.showPicker === 'function') {
                    try {
                      event.currentTarget.showPicker();
                    } catch {
                      /* picker già aperto o rifiutato dal browser */
                    }
                  }
                }}
                className="min-w-0 cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-white outline-none [color-scheme:dark]"
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {draftFoods.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
              Nessun alimento nel piatto — aggiungi dalla vetrina
            </p>
          ) : (
            <ul className="min-w-0 space-y-2">
              {draftFoods.map((food) => (
                <DraftCartSmartRow
                  key={food.id}
                  item={food}
                  personalDb={personalDb}
                  onUpdateAmount={updateFoodAmount}
                  onRemove={removeFoodFromDraft}
                  onDeepEdit={handleOpenDraftDeepEdit}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-800 px-4 py-4">
          {draftFoods.length > 0 ? (
            <button
              type="button"
              onClick={handleOpenSaveRecipe}
              className="w-full rounded-xl border border-violet-500/30 px-4 py-2.5 text-sm font-medium text-violet-300 transition-colors hover:border-violet-400/50 hover:bg-violet-950/30"
            >
              Salva come ricetta
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={draftFoods.length === 0}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            CONFERMA PASTO · {draftMealKcal} kcal
          </button>
        </div>
      </div>

      {!isCartOpen && draftFoods.length > 0 ? (
        <div
          key={`mini-cart-${draftFoods.length}`}
          className={`absolute inset-x-0 bottom-0 z-30 shrink-0 px-4 pb-4 pt-2 ${
            cartPulse ? 'vetrina-cart-row-enter' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
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
        onClose={() => setIsSearchModalOpen(false)}
        personalDb={personalDb}
        kentuItDb={kentuItDb}
        globalDb={globalDb ?? masterDb}
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
      />

      <BarcodeScannerOverlay
        isOpen={isScannerOpen}
        onClose={closeScanner}
        videoRef={videoRef}
        error={scannerError}
        isResolving={isScannerResolving}
      />

      <FoodDeepEditModal
        isOpen={Boolean(activeDeepEditItem)}
        foodItem={activeDeepEditItem}
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
}) {
  const { kentuItDb: loadedKentuItDb, globalDb: loadedGlobalDb } = useFoodDb();
  const resolvedKentuItDb = loadedKentuItDb;
  const resolvedGlobalDb = masterDbProp ?? loadedGlobalDb;
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

  return (
    <div
      className="fixed inset-0 z-[100040] flex h-[100dvh] max-w-full flex-col overflow-hidden bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Log rapido pasti"
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
        />
        </div>
      </MealComposerProvider>
    </div>
  );
}
