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
import LiveMacroHud from './components/LiveMacroHud';
import { Clock } from 'lucide-react';
import useBarcodeScanner from './hooks/useBarcodeScanner';
import useRecipeEngine from './hooks/useRecipeEngine';
import useFoodDb from '../../useFoodDb';
import { draftFoodsToRecipePayload } from './utils/recipeDraftUtils';
import { decimalToTimeStr } from '../../coreEngine';

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

function formatComboItemPreview(item) {
  if (item.qtyLabel) return `${item.desc} · ${item.qtyLabel}`;
  if (item.unit === 'g' && item.qta) return `${item.desc} · ${item.qta}g`;
  if (item.qta) return `${item.desc} · ${item.qta}`;
  return item.desc;
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
  const prefillAppliedRef = useRef(false);
  const mealTimeInputRef = useRef(null);
  const {
    draftFoods,
    draftTotals,
    addFoodToDraft,
    addFoodsToDraft,
    addComboToDraft,
    removeFoodFromDraft,
    updateFoodAmount,
    clearDraft,
    loadInitialDraft,
  } = useMealComposer();

  const { getRecipeAsDraft } = useRecipeEngine(personalDb);

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

    addFoodToDraft(formatSearchResultForDraft(food));
    setIsSearchModalOpen(false);
  };

  const handleRecipeSelection = (recipe) => {
    if (!recipe) return;
    const items = getRecipeAsDraft(recipe.key ?? recipe.id);
    if (!items.length) return;
    addFoodsToDraft(items);
    setIsSearchModalOpen(false);
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
  const predictiveBlocks = usePredictiveFoodBlocks(fullHistory, selectedSlot, 12);
  const quickFoods = useMemo(
    () =>
      [...predictiveBlocks]
        .sort(
          (a, b) =>
            new Date(b.lastUsed || b.timestamp || 0) - new Date(a.lastUsed || a.timestamp || 0),
        )
        .slice(0, 12),
    [predictiveBlocks],
  );

  const handleConfirm = () => {
    if (draftFoods.length === 0) return;
    onSave?.(draftFoods, selectedSlot, editingMealId ?? undefined, mealTime);
    clearDraft();
  };

  const handleOpenScanner = () => {
    setScannerError('');
    openScanner();
  };

  const handleAddPredictiveBlock = (tile) => {
    if (!tile) return;

    let payload = tile;
    const dbKey = tile.foodDbKey;
    if (dbKey && personalDb && typeof personalDb === 'object' && personalDb[dbKey]) {
      const row = personalDb[dbKey];
      payload = {
        ...tile,
        row,
        units: row.units,
        defaultUnit: row.defaultUnit,
      };
    }

    addFoodToDraft(payload);
  };

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden bg-[#050a12] text-slate-100">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <header className="flex min-w-0 items-center justify-between px-4 pb-2 pt-3">
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

        <div className="space-y-3 px-4 pb-3">
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
              htmlFor="fast-logger-meal-time"
              onClick={openNativeTimePicker}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 transition-colors hover:border-cyan-500/40 hover:bg-slate-800/90 active:scale-[0.98]"
            >
              <Clock
                className="h-4 w-4 shrink-0 text-cyan-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                ref={mealTimeInputRef}
                id="fast-logger-meal-time"
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

        <LiveMacroHud
          mealTargets={mealTargets}
          mealConsumed={mealConsumed}
          draftTotals={draftTotals}
          className="sticky top-0 z-40 mx-4 bg-[#050a12] shadow-md"
        />

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-cyan-500/40 bg-slate-900/70 px-4 py-4 text-left text-sm text-slate-200 shadow-md transition-colors hover:border-cyan-400/60 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <span className="shrink-0 text-lg" aria-hidden>
              🔍
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              Cerca nuovo alimento nel database...
            </span>
          </button>
          <p className="mt-2 text-center text-xs text-slate-600">
            DB personale · CREA · USDA
          </p>
        </div>

        <section className="space-y-6 px-4 pb-5">
          <div className="min-w-0">
            <h2 className="mb-1 truncate text-sm font-medium text-slate-300">Pasti Frequenti</h2>
            <p className="mb-3 text-xs text-slate-500">
              One-tap assoluto · {predictiveCombos.length}{' '}
              {predictiveCombos.length === 1 ? 'combo' : 'combo'}
            </p>

            {predictiveCombos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                Nessun pasto completo frequente per questo slot
              </p>
            ) : (
              <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {predictiveCombos.map((combo) => (
                  <button
                    key={combo.id}
                    type="button"
                    onClick={() => addComboToDraft(combo.items)}
                    className="w-[85%] max-w-[320px] min-w-0 shrink-0 snap-start rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 to-slate-900/90 px-4 py-4 text-left shadow-md transition-all hover:border-cyan-400/50 hover:shadow-lg active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90">
                          Pasto completo
                        </p>
                        <p className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-slate-100">
                          {combo.name}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-cyan-500/15 px-2 py-1 text-xs font-semibold text-cyan-300">
                        {combo.totalKcal} kcal
                      </span>
                    </div>
                    <ul className="mt-3 flex max-h-20 min-w-0 flex-wrap gap-1.5 overflow-hidden">
                      {combo.items.map((item) => (
                        <li
                          key={`${combo.id}-${item.desc}`}
                          className="max-w-full truncate rounded-full border border-slate-700/80 bg-slate-950/50 px-2 py-0.5 text-[11px] text-slate-300"
                          title={formatComboItemPreview(item)}
                        >
                          {formatComboItemPreview(item)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 truncate text-xs text-slate-400">
                      Tap · {combo.items.length} alimenti
                      {combo.count != null ? ` · ×${combo.count}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="mb-1 truncate text-sm font-medium text-slate-300">Alimenti Rapidi</h2>
            <p className="mb-3 text-xs text-slate-500">
              Più recenti per slot · {quickFoods.length}{' '}
              {quickFoods.length === 1 ? 'blocco' : 'blocchi'}
            </p>

            {quickFoods.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                Nessun alimento frequente per questo slot
              </p>
            ) : (
              <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {quickFoods.map((tile) => (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => handleAddPredictiveBlock(tile)}
                    className="flex h-[5.5rem] w-24 shrink-0 flex-col items-start justify-center rounded-2xl border border-slate-700/80 bg-slate-900/80 px-3 py-3 text-left shadow-sm transition-all hover:border-cyan-500/40 hover:bg-slate-800/90 hover:shadow-md active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <span className="line-clamp-2 w-full text-xs font-semibold leading-snug text-slate-100">
                      {tile.label}
                    </span>
                    <span className="mt-1 truncate text-[10px] text-slate-400">
                      {tile.kcal} kcal · ×{tile.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="shrink-0 border-t border-slate-700 bg-slate-900 p-4">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-300">Bozza pasto</h2>
          <div className="flex items-center gap-2">
            {draftFoods.length > 0 ? (
              <button
                type="button"
                onClick={handleOpenSaveRecipe}
                className="rounded-lg border border-violet-500/30 px-2.5 py-1 text-xs font-medium text-violet-300 transition-colors hover:border-violet-400/50 hover:bg-violet-950/30"
              >
                Salva come ricetta
              </button>
            ) : null}
            <span className="text-xs text-slate-500">
              {draftFoods.length} {draftFoods.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>

        {draftFoods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
            Tappa una piastrella per iniziare
          </p>
        ) : (
          <ul className="mb-4 max-h-52 min-w-0 space-y-2 overflow-y-auto overflow-x-hidden">
            {draftFoods.map((food) => (
              <DraftCartSmartRow
                key={food.id}
                item={food}
                onUpdateAmount={updateFoodAmount}
                onRemove={removeFoodFromDraft}
              />
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={draftFoods.length === 0}
          className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          CONFERMA
        </button>
      </section>

      <UniversalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        personalDb={personalDb}
        creaDb={creaDb}
        onSelectFood={handleFoodSelection}
        onSelectRecipe={handleRecipeSelection}
        onOpenScanner={handleOpenScanner}
        onSaveManualFood={onAcquireExternalFood}
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
