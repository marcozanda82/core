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
import useBarcodeScanner from './hooks/useBarcodeScanner';
import useRecipeEngine from './hooks/useRecipeEngine';
import useFoodDb from '../../useFoodDb';
import { draftFoodsToRecipePayload } from './utils/recipeDraftUtils';

const MEAL_SLOTS = [
  { id: 'colazione', label: 'Colazione' },
  { id: 'snack', label: 'Snack' },
  { id: 'pranzo', label: 'Pranzo' },
  { id: 'cena', label: 'Cena' },
];

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
}) {
  const [selectedSlot, setSelectedSlot] = useState(
    () => initialMealSlot || resolveInitialMealSlot(initialDraft, editingMealId),
  );
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSaveRecipeOpen, setIsSaveRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [saveRecipeError, setSaveRecipeError] = useState('');
  const prefillAppliedRef = useRef(false);
  const {
    draftFoods,
    draftTotals,
    status,
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
  const predictiveBlocks = usePredictiveFoodBlocks(fullHistory, selectedSlot, 6);

  const handleConfirm = () => {
    if (draftFoods.length === 0) return;
    onSave?.(draftFoods, selectedSlot, editingMealId ?? undefined);
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

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-[#050a12] text-slate-100">
      <header className="border-b border-slate-800 px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400/80">
              KentuOS · Beta
            </p>
            <h1 className="mt-1 text-xl font-semibold">Log Rapido</h1>
            <p className="mt-1 text-sm text-slate-400">
              One-Tap · stato: <span className="text-slate-200">{status}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            Chiudi
          </button>
        </div>

        <div className="mt-4 flex rounded-xl border border-slate-700/80 bg-slate-900/60 p-1">
          {MEAL_SLOTS.map((slot) => {
            const isActive = selectedSlot === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSelectedSlot(slot.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
      </header>

      <div className="flex-1 overflow-y-auto">
        <section className="space-y-6 px-4 py-5">
          <div>
            <h2 className="mb-1 text-sm font-medium text-slate-300">Pasti Frequenti</h2>
            <p className="mb-3 text-xs text-slate-500">
              One-tap assoluto · {predictiveCombos.length}{' '}
              {predictiveCombos.length === 1 ? 'combo' : 'combo'}
            </p>

            {predictiveCombos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                Nessun pasto completo frequente per questo slot
              </p>
            ) : (
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
                {predictiveCombos.map((combo) => (
                  <button
                    key={combo.id}
                    type="button"
                    onClick={() => addComboToDraft(combo.items)}
                    className="w-[85%] max-w-[320px] shrink-0 snap-start rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 to-slate-900/90 px-4 py-4 text-left shadow-md transition-all hover:border-cyan-400/50 hover:shadow-lg active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <div className="flex items-start justify-between gap-2">
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
                    <ul className="mt-3 flex max-h-20 flex-wrap gap-1.5 overflow-hidden">
                      {combo.items.map((item) => (
                        <li
                          key={`${combo.id}-${item.desc}`}
                          className="rounded-full border border-slate-700/80 bg-slate-950/50 px-2 py-0.5 text-[11px] text-slate-300"
                        >
                          {formatComboItemPreview(item)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-slate-400">
                      Tap · {combo.items.length} alimenti
                      {combo.count != null ? ` · ×${combo.count}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-1 text-sm font-medium text-slate-300">Alimenti Rapidi</h2>
            <p className="mb-3 text-xs text-slate-500">
              Singoli ingredienti · {predictiveBlocks.length}{' '}
              {predictiveBlocks.length === 1 ? 'blocco' : 'blocchi'}
            </p>

            {predictiveBlocks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                Nessun alimento frequente per questo slot
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {predictiveBlocks.map((tile) => (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => handleAddPredictiveBlock(tile)}
                    className="flex min-h-[5.5rem] flex-col items-start justify-center rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-left shadow-sm transition-all hover:border-cyan-500/40 hover:bg-slate-800/90 hover:shadow-md active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <span className="text-sm font-semibold leading-snug text-slate-100">
                      {tile.label}
                    </span>
                    <span className="mt-1 text-xs text-slate-400">
                      {tile.kcal} kcal · ×{tile.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-800/80 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsSearchModalOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-700/90 bg-slate-900/40 px-4 py-3.5 text-left text-sm text-slate-400 shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-900/70 hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
        >
          <span className="text-base" aria-hidden>
            🔍
          </span>
          <span>Cerca nuovo alimento nel database...</span>
        </button>
        <p className="mt-2 text-center text-xs text-slate-600">
          DB personale · CREA · USDA
        </p>
      </div>

      <section className="shrink-0 border-t border-slate-800 bg-slate-950/60 px-4 py-5">
        <LiveMacroHud
          mealTargets={mealTargets}
          mealConsumed={mealConsumed}
          draftTotals={draftTotals}
        />

        <div className="mb-3 flex items-center justify-between">
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
          <ul className="mb-4 max-h-52 space-y-2 overflow-y-auto">
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
}) {
  const { foodDb: loadedCreaDb } = useFoodDb();
  const resolvedCreaDb = creaDb ?? loadedCreaDb;

  return (
    <div
      className="fixed inset-0 z-[100040] flex items-stretch justify-center bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Log rapido pasti"
    >
      <MealComposerProvider initialMealType="pranzo" initialMealTime={13.5}>
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
        />
      </MealComposerProvider>
    </div>
  );
}
