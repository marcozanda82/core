import React, { useEffect, useState } from 'react';
import { Minus, Plus, Search, ScanBarcode, Settings, X } from 'lucide-react';
import useUniversalSearchEngine, { SEARCH_SOURCE_BADGE } from '../hooks/useUniversalSearchEngine';
import FoodThumbnail from './FoodThumbnail';
import QtyBadge from './QtyBadge';
import { resolveFoodVisual } from '../utils/foodIconUtils';
import {
  getDefaultUnitKcal,
  getDraftQtyForFood,
  getFoodUnitWeight,
  getTileDisplayStats,
} from '../utils/draftFoodMatchUtils';
import { buildRecipeDraftPayloadFromSearchResult } from '../utils/recipePayloadUtils';

const SEARCH_UNIT_WEIGHT = 100;

const EMPTY_MANUAL_FORM = {
  name: '',
  kcal: '',
  prot: '',
  carb: '',
  fat: '',
};

function resolveKcalPer100(result) {
  const row = result?.row || {};
  const kcal = Number(row.kcal ?? row.cal ?? result.kcal ?? result.cal);
  return Number.isFinite(kcal) ? Math.round(kcal) : null;
}

function resolveMacrosPer100(result) {
  const row = result?.row || {};
  const round = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
  };
  return {
    kcal: resolveKcalPer100(result),
    prot: round(row.prot),
    carb: round(row.carb),
    fat: round(row.fatTotal ?? row.fat),
  };
}

function SourceBadge({ source }) {
  const config = SEARCH_SOURCE_BADGE[source] || {
    label: String(source || 'Altro'),
    className: 'border-slate-600 bg-slate-800 text-slate-300',
  };

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function resolveDraftMatchForResult(result, personalDb) {
  if (result._source === 'recipe') {
    const payload = buildRecipeDraftPayloadFromSearchResult(result, personalDb);
    if (payload) {
      return {
        matchFood: payload,
        unitWeight: getFoodUnitWeight(payload),
        defaultUnitKcal: getDefaultUnitKcal(payload),
      };
    }
  }

  const name = result.desc || result.name || 'Alimento';
  return {
    matchFood: {
      foodDbKey: result._source === 'personal' ? (result.key || result.id) : undefined,
      desc: name,
      name,
    },
    unitWeight: SEARCH_UNIT_WEIGHT,
    defaultUnitKcal: resolveKcalPer100(result) ?? 0,
  };
}

export default function UniversalSearchModal({
  isOpen,
  onClose,
  onSelectFood,
  onEditCatalogFood,
  onEditRecipe,
  onRemoveOneFromDraft,
  onOpenScanner,
  onSaveManualFood,
  personalDb,
  kentuItDb = null,
  globalDb = null,
  masterDb = null,
  draftFoods = [],
  scannerError = '',
  isScannerResolving = false,
}) {
  const { query, setQuery, results, isSearchingExternal } = useUniversalSearchEngine(
    personalDb,
    kentuItDb,
    globalDb ?? masterDb,
    { searchGlobal: true },
  );
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualError, setManualError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setIsManualEntryOpen(false);
      setManualForm(EMPTY_MANUAL_FORM);
      setManualError('');
      setIsSavingManual(false);
    }
  }, [isOpen, setQuery]);

  if (!isOpen) return null;

  const handleSelect = (result) => {
    onSelectFood?.(result);
  };

  const handleManualFieldChange = (field) => (event) => {
    setManualForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleManualCancel = () => {
    setIsManualEntryOpen(false);
    setManualForm(EMPTY_MANUAL_FORM);
    setManualError('');
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    const desc = manualForm.name.trim();
    if (!desc) {
      setManualError('Inserisci un nome per l\'alimento.');
      return;
    }

    const entry = {
      desc,
      kcal: Number(manualForm.kcal) || 0,
      prot: Number(manualForm.prot) || 0,
      carb: Number(manualForm.carb) || 0,
      fatTotal: Number(manualForm.fat) || 0,
    };

    setIsSavingManual(true);
    setManualError('');

    try {
      let key = `manual_${Date.now()}`;
      let row = { ...entry, desc };

      if (typeof onSaveManualFood === 'function') {
        const saved = await onSaveManualFood(entry);
        if (saved?.key) {
          key = saved.key;
          row = saved.row ?? row;
        }
      }

      onSelectFood?.({
        _source: 'personal',
        id: key,
        key,
        desc,
        name: desc,
        row: { ...row, desc },
      });
      setIsManualEntryOpen(false);
      setManualForm(EMPTY_MANUAL_FORM);
    } catch {
      setManualError('Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100050] flex flex-col bg-[#050a12]/98 text-slate-100 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Ricerca alimenti universale"
    >
      <header className="shrink-0 border-b border-slate-800/80 px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-50">Cerca alimento</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 text-slate-400 transition-all hover:border-slate-500 hover:text-white active:scale-95"
            aria-label="Chiudi ricerca"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus={!isManualEntryOpen}
              placeholder="Nome, ricetta o barcode..."
              className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/80 py-3.5 pl-11 pr-4 text-sm text-slate-100 shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenScanner?.()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/80 text-cyan-400 shadow-sm transition-all hover:border-cyan-500/40 hover:bg-slate-800 active:scale-95"
            aria-label="Scansiona barcode"
            title="Scanner barcode"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>
        </div>

        {!isManualEntryOpen ? (
          <button
            type="button"
            onClick={() => setIsManualEntryOpen(true)}
            className="mt-3 w-full rounded-xl border border-dashed border-cyan-500/30 bg-cyan-950/20 px-4 py-2.5 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-950/40"
          >
            ➕ Crea alimento manuale
          </button>
        ) : null}

        {scannerError ? (
          <p className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {scannerError}
          </p>
        ) : null}

        {isScannerResolving ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-cyan-300">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            Ricerca prodotto dal barcode...
          </p>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isManualEntryOpen ? (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <p className="text-xs text-slate-400">Valori nutrizionali per 100 g</p>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Nome</span>
              <input
                type="text"
                value={manualForm.name}
                onChange={handleManualFieldChange('name')}
                autoFocus
                placeholder="Es. Pollo arrosto"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Kcal</span>
                <input
                  type="number"
                  min="0"
                  value={manualForm.kcal}
                  onChange={handleManualFieldChange('kcal')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Proteine</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.prot}
                  onChange={handleManualFieldChange('prot')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Carboidrati</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.carb}
                  onChange={handleManualFieldChange('carb')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Grassi</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.fat}
                  onChange={handleManualFieldChange('fat')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
            </div>

            {manualError ? (
              <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {manualError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualCancel}
                disabled={isSavingManual}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSavingManual}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSavingManual ? 'Salvataggio...' : 'Salva e Aggiungi'}
              </button>
            </div>
          </form>
        ) : query.trim().length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-10 text-center text-sm text-slate-500">
            Digita per cercare alimenti, ricette salvate e Kentu DB
          </p>
        ) : results.length === 0 && !isSearchingExternal ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-10 text-center text-sm text-slate-500">
              Nessun risultato per &quot;{query.trim()}&quot;
            </p>
            <button
              type="button"
              onClick={() => {
                setIsManualEntryOpen(true);
                setManualForm((prev) => ({ ...prev, name: query.trim() }));
              }}
              className="w-full rounded-xl border border-dashed border-cyan-500/30 bg-cyan-950/20 px-4 py-3 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-950/40"
            >
              ➕ Crea &quot;{query.trim()}&quot; manualmente
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {results.map((result) => {
              const visual = resolveFoodVisual(result, personalDb);
              const macros = resolveMacrosPer100(result);
              const name = result.desc || result.name || 'Alimento';
              const isRecipe = result._source === 'recipe';
              const { matchFood, unitWeight, defaultUnitKcal } = resolveDraftMatchForResult(
                result,
                personalDb,
              );
              const qty = getDraftQtyForFood(draftFoods, matchFood, unitWeight);
              const { displayWeight, displayKcal } = getTileDisplayStats(
                qty,
                unitWeight,
                defaultUnitKcal,
              );

              return (
                <li key={`${result._source}-${result.id}`}>
                  <div className="vetrina-tile-enter flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-slate-800/60 to-slate-900/80 p-2.5 shadow-md shadow-black/20 transition-all hover:border-cyan-500/20">
                    <div className="relative shrink-0">
                      {qty > 0 ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveOneFromDraft?.(matchFood, unitWeight);
                          }}
                          aria-label={`Rimuovi una porzione di ${name}`}
                          className="absolute -left-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-transform active:scale-90"
                        >
                          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                      ) : null}
                      {qty > 0 ? <QtyBadge qty={qty} className="-right-1.5 -top-1.5" /> : null}
                      <div className="relative">
                        <FoodThumbnail
                          visual={visual}
                          name={visual.name}
                          sizeClassName="h-12 w-12"
                          className="rounded-xl ring-1 ring-white/[0.08]"
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isRecipe) {
                              onEditRecipe?.(result);
                            } else {
                              onEditCatalogFood?.(result);
                            }
                          }}
                          aria-label={isRecipe ? `Modifica ricetta ${name}` : `Modifica ${name}`}
                          className="absolute -bottom-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/95 transition-colors hover:bg-slate-800"
                        >
                          <Settings className="h-3 w-3 text-slate-400" />
                        </button>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-tight text-slate-50">{name}</p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-400">
                        {displayWeight}g · <span className="text-cyan-400/90">{displayKcal} kcal</span>
                        {isRecipe && macros.kcal != null ? ` · ${macros.kcal}/100g` : ''}
                      </p>
                      <div className="mt-1">
                        <SourceBadge source={result._source} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelect(result)}
                      aria-label={`Aggiungi ${name}`}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 ${
                        isRecipe
                          ? 'bg-violet-500/20 text-violet-300 shadow-sm hover:bg-violet-500/30'
                          : 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 hover:bg-cyan-400'
                      }`}
                    >
                      <Plus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!isManualEntryOpen && isSearchingExternal ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            Ricerca estesa in corso...
          </p>
        ) : null}
      </div>
    </div>
  );
}
