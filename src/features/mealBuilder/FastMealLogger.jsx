import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MealComposerProvider,
  useMealComposer,
} from './context/MealComposerContext';
import { usePredictiveFoodBlocks } from './hooks/usePredictiveFoodBlocks';
import { usePredictiveMealCombos } from './hooks/usePredictiveMealCombos';
import UniversalSearchModal from './components/UniversalSearchModal';
import BarcodeScannerOverlay from './components/BarcodeScannerOverlay';
import DraftCartSmartRow from './components/DraftCartSmartRow';
import RecipeGroupRow from './components/RecipeGroupRow';
import FoodDeepEditModal from './components/FoodDeepEditModal';
import QtyBadge from './components/QtyBadge';
import LiveMacroHud from './components/LiveMacroHud';
import { formatCheckoutMealTitle, formatMiniCartMealLabel, getFoodEmoji, resolveFoodVisual } from './utils/foodIconUtils';
import {
  findDraftItemForFood,
  getDefaultUnitKcal,
  getDraftQtyForFood,
  getFoodUnitWeight,
  getTileDisplayStats,
  resolveFoodIdentityKey,
} from './utils/draftFoodMatchUtils';
import { roundToOneDecimal } from './utils/numberFormatUtils';
import {
  buildRecipeGroupFromCombo,
  findRecipeGroupInDraft,
  flattenDraftFoodsForSave,
  getRecipeGroupQty,
  isRecipeGroup,
} from './utils/recipeGroupUtils';
import {
  applyCatalogEditToDraftItem,
  buildCatalogAcquirePayload,
  buildCatalogDbPatch,
  buildCatalogDeepEditItem,
  buildCatalogOverrideFromEdit,
  mergeCatalogDisplay,
} from './utils/catalogFoodUtils';
import { resolveUnitWeight } from './utils/draftFoodUnits';
import { ChevronDown, Clock, Minus, Plus, Settings, ShoppingBag } from 'lucide-react';
import useBarcodeScanner from './hooks/useBarcodeScanner';
import useFoodDb from '../../useFoodDb';
import { draftFoodsToRecipePayload } from './utils/recipeDraftUtils';
import { decimalToTimeStr } from '../../coreEngine';

const QUICK_FOODS_LIMIT = 30;
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

function getCurrentTimeRoundedTo15Min() {
  const now = new Date();
  const decimal = now.getHours() + now.getMinutes() / 60;
  return Math.min(24, Math.max(0, Math.round(decimal * 4) / 4));
}

function parseTimeStrToDecimal(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const [hh, mm] = raw.split(':');
  const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
  return h + m / 60;
}

function resolveInitialMealTime(initialMealTime, initialDraft, mealSlot) {
  if (typeof initialMealTime === 'number' && !Number.isNaN(initialMealTime)) {
    return initialMealTime;
  }
  if (Array.isArray(initialDraft) && initialDraft.length > 0) {
    const t = initialDraft[0]?.mealTime;
    if (typeof t === 'number' && !Number.isNaN(t)) return t;
  }
  return MEAL_TIME_BY_SLOT[mealSlot] ?? getCurrentTimeRoundedTo15Min();
}

function formatComboIngredientLine(item) {
  const name = String(item?.desc || item?.name || 'Alimento').trim();
  const weight = Number(item?.weight ?? item?.qta);
  if (Number.isFinite(weight) && weight > 0) {
    return `${name} (${Math.round(weight)}g)`;
  }
  if (item?.qtyLabel) return `${name} (${item.qtyLabel})`;
  return name;
}

function resolveComboCardTitle(combo, index) {
  const name = String(combo?.name || '').trim();
  if (!name) return `Combo ${index + 1}`;

  if (/^Combo:\s/i.test(name)) return `Combo ${index + 1}`;

  const items = combo?.items || [];
  if (items.length > 1) {
    const ingredientNames = items
      .map((item) => String(item.desc || item.name || '').trim())
      .filter(Boolean);
    const looksLikeIngredientList =
      name.includes(',')
      || name.includes(' e ')
      || ingredientNames.every(
        (label) => label.length > 0 && name.toLowerCase().includes(label.toLowerCase()),
      );
    if (looksLikeIngredientList) return `Combo ${index + 1}`;
  }

  return name;
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
    ...(food._source === 'crea' ? { foodSource: 'CREA' } : {}),
    ...(food._source === 'usda' ? { foodSource: 'USDA' } : {}),
  };
}

function formatSearchResultForDraft(food) {
  const row = food?.row || {};
  const desc = String(food?.desc || food?.name || row.desc || row.name || 'Alimento').trim();
  const qta = 100;
  const k100 = Number(row.kcal ?? row.cal) || 0;
  const p100 = Number(row.prot) || 0;
  const c100 = Number(row.carb) || 0;
  const f100 = Number(row.fatTotal ?? row.fat) || 0;

  return {
    type: 'food',
    desc,
    name: desc,
    foodDbKey: food._source === 'personal' ? (food.key || food.id) : undefined,
    row,
    units: row.units,
    defaultUnit: row.defaultUnit,
    qta,
    weight: qta,
    unit: 'g',
    selectedUnit: 'g',
    multiplier: qta,
    qtyLabel: '100g',
    kcal: Math.round(k100),
    cal: Math.round(k100),
    prot: Math.round(p100 * 10) / 10,
    carb: Math.round(c100 * 10) / 10,
    fat: Math.round(f100 * 10) / 10,
    fatTotal: Math.round(f100 * 10) / 10,
    ...(row.customImage ? { customImage: row.customImage } : {}),
  };
}

function resolveInitialMealSlot(initialDraft, editingMealId) {
  if (Array.isArray(initialDraft) && initialDraft.length > 0) {
    const mt = initialDraft[0]?.mealType;
    if (mt) return String(mt).split('_')[0];
  }
  if (editingMealId) return String(editingMealId).split('_')[0];
  return 'pranzo';
}

function FastMealLoggerContent({
  fullHistory,
  onClose,
  onSave,
  personalDb,
  creaDb,
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
  const [mealTime, setMealTime] = useState(() =>
    resolveInitialMealTime(
      initialMealTime,
      initialDraft,
      initialMealSlot || resolveInitialMealSlot(initialDraft, editingMealId),
    ),
  );
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSaveRecipeOpen, setIsSaveRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
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
  const {
    draftFoods,
    draftTotals,
    addFoodToDraft,
    addRecipeGroupToDraft,
    removeFoodFromDraft,
    updateFoodAmount,
    updateRecipeGroupWeight,
    updateRecipeGroupChildAmount,
    updateFoodInDraft,
    clearDraft,
    loadInitialDraft,
  } = useMealComposer();

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

    if (food._source !== 'personal' && typeof onAcquireExternalFood === 'function') {
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

  const handleRecipeSelection = (recipe) => {
    if (!recipe) return;
    const recipeKey = String(recipe.key ?? recipe.id ?? '').trim();
    const dbEntry = recipeKey && personalDb?.[recipeKey] ? personalDb[recipeKey] : null;
    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : Array.isArray(dbEntry?.ingredients)
        ? dbEntry.ingredients
        : [];
    if (ingredients.length === 0) return;

    const payload = buildRecipeGroupFromCombo({
      id: recipeKey || recipe.id,
      name: String(recipe.desc || recipe.name || dbEntry?.desc || 'Ricetta').trim(),
      ingredients,
      customImage: recipe.row?.customImage || dbEntry?.customImage || null,
    });
    if (!payload) return;

    addOrIncrementRecipeGroup(payload);
    setIsSearchModalOpen(false);
    notifyItemAdded(payload.name);
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

  const predictiveCombos = usePredictiveMealCombos(fullHistory, selectedSlot, 5);
  const predictiveBlocks = usePredictiveFoodBlocks(fullHistory, selectedSlot, QUICK_FOODS_LIMIT);
  const quickFoods = useMemo(
    () =>
      [...predictiveBlocks]
        .sort(
          (a, b) =>
            new Date(b.lastUsed || b.timestamp || 0) - new Date(a.lastUsed || a.timestamp || 0),
        )
        .slice(0, QUICK_FOODS_LIMIT),
    [predictiveBlocks],
  );

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

  const addOrIncrementRecipeGroup = (groupPayload) => {
    const existing = findRecipeGroupInDraft(draftFoods, {
      id: groupPayload.recipeGroupId,
      foodDbKey: groupPayload.foodDbKey,
    });

    if (!existing) {
      addRecipeGroupToDraft(groupPayload);
      return false;
    }

    const nextWeight = roundToOneDecimal(
      (Number(existing.weight ?? existing.qta) || 0) + (Number(existing.baseTotalWeight) || 0),
    );
    updateRecipeGroupWeight(existing.id, nextWeight);
    return true;
  };

  const removeOneRecipeGroupUnit = (combo) => {
    const existing = findRecipeGroupInDraft(draftFoods, combo);
    if (!existing) return;

    const nextWeight = roundToOneDecimal(
      (Number(existing.weight ?? existing.qta) || 0) - (Number(existing.baseTotalWeight) || 0),
    );

    if (nextWeight <= 0) {
      removeFoodFromDraft(existing.id);
      return;
    }

    updateRecipeGroupWeight(existing.id, nextWeight);
  };

  const addOrIncrementDraftFood = (payload, unitWeight) => {
    const existing = findDraftItemForFood(draftFoods, payload);
    if (!existing) {
      addFoodToDraft(payload);
      return false;
    }
    incrementDraftItemByUnit(existing, unitWeight);
    return true;
  };

  const draftMealKcal = Math.round(Number(draftTotals?.kcal) || 0);
  const checkoutMealTitle = formatCheckoutMealTitle(selectedSlot);
  const miniCartMealLabel = formatMiniCartMealLabel(selectedSlot);

  const handleConfirm = () => {
    if (draftFoods.length === 0) return;
    onSave?.(
      flattenDraftFoodsForSave(draftFoods),
      selectedSlot,
      editingMealId ?? undefined,
      mealTime,
    );
    clearDraft();
  };

  const handleOpenScanner = () => {
    setScannerError('');
    openScanner();
  };

  const handleAddPredictiveBlock = (tile) => {
    if (!tile) return;

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
      };
    }

    const unitWeight = getFoodUnitWeight(payload);
    addOrIncrementDraftFood(payload, unitWeight);
    notifyItemAdded(String(displayTile?.label || displayTile?.desc || 'Alimento').trim());
  };

  const openEditModalForCatalog = (source) => {
    setDeepEditFood(null);
    const mergedSource = source?._source
      ? source
      : mergeCatalogDisplay(source, personalDb, catalogServingOverrides);
    const editItem = buildCatalogDeepEditItem(mergedSource, personalDb);
    if (editItem) setEditingCatalogFood(editItem);
  };

  const handleOpenDraftDeepEdit = (item) => {
    setEditingCatalogFood(null);
    setDeepEditFood(item);
  };

  const handleAddComboToDraft = (combo, comboTitle) => {
    const payload = buildRecipeGroupFromCombo(combo);
    if (!payload) return;
    addOrIncrementRecipeGroup(payload);
    notifyItemAdded(comboTitle || payload.name || 'Combo aggiunta');
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
        <div className="space-y-8 px-0.5">
          <div>
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(true)}
              className="flex w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-cyan-500/50 bg-slate-900/80 px-4 py-4 text-left text-sm text-slate-100 shadow-lg shadow-cyan-950/20 transition-colors hover:border-cyan-400/70 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <span className="shrink-0 text-xl" aria-hidden>
                🔍
              </span>
              <span className="min-w-0 flex-1 truncate text-base font-medium">
                Cerca nuovo alimento nel database...
              </span>
            </button>
            <p className="mt-2 text-center text-xs text-slate-600">
              DB personale · CREA · USDA
            </p>
          </div>

          <div className="min-w-0">
            <h2 className="mb-1 truncate text-sm font-semibold text-slate-200">Alimenti Rapidi</h2>
            <p className="mb-3 text-xs text-slate-500">
              Più recenti per slot · {quickFoods.length}{' '}
              {quickFoods.length === 1 ? 'blocco' : 'blocchi'}
            </p>

            {quickFoods.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                Nessun alimento frequente per questo slot
              </p>
            ) : (
              <div className="grid auto-cols-[90px] grid-flow-col grid-rows-2 gap-3 overflow-x-auto pb-4 pt-2 scrollbar-hide snap-x snap-mandatory">
                {quickFoods.map((tile) => {
                  const displayTile = mergeCatalogDisplay(tile, personalDb, catalogServingOverrides);
                  const tileVisual = resolveFoodVisual(displayTile, personalDb);
                  const defaultUnitWeight = getFoodUnitWeight(displayTile);
                  const defaultUnitKcal = getDefaultUnitKcal(displayTile);
                  const qty = getDraftQtyForFood(draftFoods, displayTile, defaultUnitWeight);
                  const { displayWeight, displayKcal } = getTileDisplayStats(
                    qty,
                    defaultUnitWeight,
                    defaultUnitKcal,
                  );
                  return (
                    <div
                      key={tile.key}
                      className="relative w-[90px] shrink-0 snap-start overflow-visible"
                    >
                      {qty > 0 ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeOneUnitFromDraft(displayTile, defaultUnitWeight);
                          }}
                          aria-label={`Rimuovi una porzione di ${displayTile.desc || displayTile.label}`}
                          className="absolute -left-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform active:scale-90"
                        >
                          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                      ) : null}
                      {qty > 0 ? <QtyBadge qty={qty} className="z-20" /> : null}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleAddPredictiveBlock(tile)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleAddPredictiveBlock(tile);
                          }
                        }}
                        className="relative flex min-h-[120px] w-[90px] cursor-pointer flex-col overflow-visible rounded-xl border border-slate-700/50 bg-slate-800/40 p-0 transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                      >
                        <div className="relative flex h-[55%] w-full items-center justify-center rounded-t-xl bg-slate-800/60">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModalForCatalog(tile);
                            }}
                            aria-label={`Modifica ${displayTile.desc || displayTile.label}`}
                            className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-slate-900/90 transition-colors hover:bg-slate-800"
                          >
                            <Settings className="h-3 w-3 text-slate-400" />
                          </button>
                          {tileVisual.customImage ? (
                            <img
                              src={tileVisual.customImage}
                              alt={tileVisual.name}
                              className="h-full w-full rounded-t-xl object-cover"
                            />
                          ) : (
                            <span className="text-3xl" aria-hidden>
                              {tileVisual.customEmoji || getFoodEmoji(tileVisual.name)}
                            </span>
                          )}
                        </div>

                        <div className="flex w-full flex-1 items-center justify-center px-1 py-1.5">
                          <span className="line-clamp-2 w-full break-words text-center text-[11px] font-semibold leading-tight text-slate-200">
                            {displayTile.label || displayTile.desc}
                          </span>
                        </div>

                        <div className="flex h-6 w-full items-center justify-between rounded-b-xl border-t border-slate-800 bg-slate-900/80 px-2">
                          <span className="font-mono text-[10px] font-medium tabular-nums text-slate-400 transition-all duration-200">
                            {displayWeight}g
                          </span>
                          <span className="font-mono text-[10px] font-bold tabular-nums text-cyan-400 transition-all duration-200">
                            {displayKcal}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="mb-1 truncate text-sm font-semibold text-slate-200">Pasti Frequenti</h2>
            <p className="mb-4 text-xs text-slate-500">
              One-tap assoluto · {predictiveCombos.length}{' '}
              {predictiveCombos.length === 1 ? 'combo' : 'combo'}
            </p>

            {predictiveCombos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                Nessun pasto completo frequente per questo slot
              </p>
            ) : (
              <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {predictiveCombos.map((combo, comboIndex) => {
                  const comboTitle = resolveComboCardTitle(combo, comboIndex);
                  const previewGroup = buildRecipeGroupFromCombo(combo);
                  const qty = getRecipeGroupQty(draftFoods, combo);
                  const unitWeight = previewGroup?.baseTotalWeight ?? 100;
                  const perPortionKcal = Math.round(
                    Number(previewGroup?.kcal ?? combo.totalKcal) || 0,
                  );
                  const { displayWeight, displayKcal } = getTileDisplayStats(
                    qty,
                    unitWeight,
                    perPortionKcal,
                  );
                  return (
                  <div
                    key={combo.id}
                    className="relative w-[300px] shrink-0 snap-start overflow-visible"
                  >
                    {qty > 0 ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeOneRecipeGroupUnit(combo);
                        }}
                        aria-label={`Rimuovi una porzione di ${comboTitle}`}
                        className="absolute -left-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform active:scale-90"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
                      </button>
                    ) : null}
                    {qty > 0 ? <QtyBadge qty={qty} className="z-20" /> : null}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleAddComboToDraft(combo, comboTitle)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleAddComboToDraft(combo, comboTitle);
                        }
                      }}
                      className="flex w-full cursor-pointer flex-col rounded-2xl border border-slate-700 bg-slate-800/80 p-3.5 transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                    >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-100"
                        title={combo.name}
                      >
                        {comboTitle}
                      </p>
                      <span className="shrink-0 text-xs font-bold text-cyan-400">
                        {qty > 0 ? displayKcal : combo.totalKcal} kcal
                      </span>
                    </div>

                    <ul className="my-3 space-y-1.5">
                      {combo.items.slice(0, 4).map((item) => (
                        <li
                          key={`${combo.id}-${item.desc}-${item.qta}`}
                          className="truncate text-sm leading-relaxed text-slate-300"
                          title={formatComboIngredientLine(item)}
                        >
                          • {formatComboIngredientLine(item)}
                        </li>
                      ))}
                      {combo.items.length > 4 ? (
                        <li className="text-xs italic leading-relaxed text-slate-500">
                          + altri {combo.items.length - 4} ingredienti
                        </li>
                      ) : null}
                    </ul>

                    {combo.count != null ? (
                      <p className="mb-2 text-xs text-slate-500">Usato ×{combo.count}</p>
                    ) : null}

                    {qty > 0 ? (
                      <p className="mb-2 text-[10px] font-medium text-slate-400">
                        Nel piatto: {displayWeight}g · {displayKcal} kcal
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAddComboToDraft(combo, comboTitle);
                      }}
                      aria-label={`Aggiungi ${comboTitle} al piatto`}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600/20 px-3 py-2.5 text-xs font-semibold text-cyan-400 transition-colors hover:bg-cyan-600/35 active:scale-[0.98]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {qty > 0 ? `Aggiungi ancora (×${qty})` : 'Aggiungi al Piatto'}
                    </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
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
              {draftFoods.map((food) =>
                isRecipeGroup(food) ? (
                  <RecipeGroupRow
                    key={food.id}
                    group={food}
                    personalDb={personalDb}
                    onUpdateGroupWeight={updateRecipeGroupWeight}
                    onUpdateChildAmount={updateRecipeGroupChildAmount}
                    onRemove={removeFoodFromDraft}
                  />
                ) : (
                  <DraftCartSmartRow
                    key={food.id}
                    item={food}
                    personalDb={personalDb}
                    onUpdateAmount={updateFoodAmount}
                    onRemove={removeFoodFromDraft}
                    onDeepEdit={handleOpenDraftDeepEdit}
                  />
                ),
              )}
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
        <div className="absolute inset-x-0 bottom-0 z-30 shrink-0 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className={`flex w-full items-center justify-between rounded-2xl border border-cyan-500/50 bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-3.5 text-left shadow-lg shadow-cyan-950/40 transition-all duration-300 hover:from-cyan-500 hover:to-cyan-400 active:scale-[0.98] ${
              cartPulse ? 'scale-[1.02] ring-2 ring-cyan-300/60' : ''
            }`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <ShoppingBag className="mr-2 h-5 w-5 shrink-0 text-slate-950" aria-hidden />
              <span className="truncate text-sm font-semibold text-slate-950">
                {miniCartMealLabel} ({draftFoods.length}) · {draftMealKcal} kcal
              </span>
            </span>
          </button>
        </div>
      ) : null}

      <UniversalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        personalDb={personalDb}
        creaDb={creaDb}
        onSelectFood={handleFoodSelection}
        onEditCatalogFood={openEditModalForCatalog}
        onRemoveOneFromDraft={removeOneUnitFromDraft}
        onSelectRecipe={handleRecipeSelection}
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
    </div>
  );
}

export default function FastMealLogger({
  fullHistory,
  onClose,
  onSave,
  personalDb,
  creaDb,
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
  const { foodDb: loadedCreaDb } = useFoodDb();
  const resolvedCreaDb = creaDb ?? loadedCreaDb;

  return (
    <div
      className="fixed inset-0 z-[100040] flex h-[100dvh] max-w-full flex-col overflow-hidden bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Log rapido pasti"
    >
      <MealComposerProvider initialMealType="pranzo" initialMealTime={13.5}>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        <FastMealLoggerContent
          fullHistory={fullHistory}
          onClose={onClose}
          onSave={onSave}
          personalDb={personalDb}
          creaDb={resolvedCreaDb}
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
