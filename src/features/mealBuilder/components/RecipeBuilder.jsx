import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import useUniversalSearchEngine, { SEARCH_SOURCE_BADGE } from '../hooks/useUniversalSearchEngine';
import FoodThumbnail from './FoodThumbnail';
import ImageSelectionSheet from './ImageSelectionSheet';
import AmountStepper from './AmountStepper';
import { computeMacrosFromIngredients } from '../utils/recipePayloadUtils';
import {
  buildIngredientFromSearchResult,
  scaleIngredientMacros,
} from '../utils/recipeIngredientUtils';
import { resolveFoodVisual } from '../utils/foodIconUtils';
import { triggerSelectionHaptic } from '../utils/hapticFeedback';

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

export default function RecipeBuilder({
  personalDb,
  masterDb = null,
  onSave,
  onClose,
  onAcquireExternalFood,
}) {
  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [customImage, setCustomImage] = useState(null);
  const [customEmoji, setCustomEmoji] = useState(null);
  const [isImageSheetOpen, setIsImageSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const { query, setQuery, results, isSearchingExternal } = useUniversalSearchEngine(
    personalDb,
    masterDb,
  );

  const per100 = useMemo(() => computeMacrosFromIngredients(ingredients), [ingredients]);
  const displayName = name.trim() || 'Nuova ricetta';
  const hasCustomIcon = Boolean(customImage || customEmoji);

  const handleAddIngredient = async (result) => {
    if (!result) return;

    if (result._source !== 'personal' && typeof onAcquireExternalFood === 'function') {
      const row = result.row || {};
      try {
        await onAcquireExternalFood({
          desc: String(result.desc || result.name || row.desc || '').trim(),
          kcal: Number(row.kcal ?? row.cal) || 0,
          prot: Number(row.prot) || 0,
          carb: Number(row.carb) || 0,
          fatTotal: Number(row.fatTotal ?? row.fat) || 0,
          ...(result._source === 'master' ? { foodSource: 'KENTU' } : {}),
        });
      } catch {
        /* acquisizione silenziosa */
      }
    }

    triggerSelectionHaptic(15);
    setIngredients((prev) => [...prev, buildIngredientFromSearchResult(result)]);
    setQuery('');
  };

  const handleWeightChange = (index, nextWeight) => {
    const next = Number(nextWeight);
    if (!Number.isFinite(next) || next < 0) return;
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? scaleIngredientMacros(ing, next) : ing)),
    );
  };

  const handleRemoveIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Inserisci un nome per la ricetta.');
      return;
    }
    if (ingredients.length === 0) {
      setError('Aggiungi almeno un ingrediente.');
      return;
    }
    if (typeof onSave !== 'function') {
      setError('Salvataggio non disponibile.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave({
        desc: trimmedName,
        kcal: per100.kcal,
        prot: per100.prot,
        carb: per100.carb,
        fatTotal: per100.fatTotal,
        ingredients: ingredients.map(({ id, ...ing }) => ing),
        ...(customImage ? { customImage } : {}),
        ...(customEmoji ? { customEmoji } : {}),
      });
      onClose?.();
    } catch {
      setError('Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[100060] flex flex-col bg-[#050a12]/98 text-slate-100 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label="Crea nuova ricetta"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-slate-800/80 px-4 pb-4 pt-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight text-slate-50">Crea nuova ricetta</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 text-slate-400 transition-all hover:border-slate-500 hover:text-white active:scale-95"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setIsImageSheetOpen(true)}
                className="shrink-0 rounded-xl ring-offset-2 ring-offset-[#050a12] transition-transform hover:scale-105 active:scale-95"
                aria-label="Scegli foto o emoji"
              >
                <FoodThumbnail
                  name={displayName}
                  customImage={customImage}
                  customEmoji={customEmoji}
                  sizeClassName="h-14 w-14"
                  emojiClassName="text-2xl"
                  className="rounded-xl ring-1 ring-white/[0.08] shadow-sm"
                />
              </button>
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nome ricetta
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Es. Pasta al pesto"
                    className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsImageSheetOpen(true)}
                  className="mt-2 text-xs font-medium text-violet-300 transition-colors hover:text-violet-200"
                >
                  {hasCustomIcon ? 'Cambia foto o emoji' : 'Aggiungi foto o emoji'}
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="relative mb-4">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca ingrediente (DB personale, Kentu DB)..."
                className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/80 py-3.5 pl-11 pr-4 text-sm text-slate-100 shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/15"
              />
            </div>

            {query.trim() ? (
              <div className="mb-5">
                {isSearchingExternal ? (
                  <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-violet-400" />
                    Ricerca Kentu DB...
                  </p>
                ) : null}
                {results.length === 0 && !isSearchingExternal ? (
                  <p className="rounded-2xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                    Nessun ingrediente trovato
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {results.map((result) => {
                      const visual = resolveFoodVisual(result, personalDb);
                      const resultName = result.desc || result.name || 'Alimento';
                      return (
                        <li key={`${result._source}-${result.id}`}>
                          <button
                            type="button"
                            onClick={() => handleAddIngredient(result)}
                            className="vetrina-tile-enter flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-slate-800/70 to-slate-900/90 p-2.5 text-left shadow-md shadow-black/20 transition-all hover:border-violet-500/25 active:scale-[0.99]"
                          >
                            <FoodThumbnail
                              visual={visual}
                              name={resultName}
                              sizeClassName="h-11 w-11"
                              className="rounded-xl ring-1 ring-white/[0.08]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold tracking-tight text-slate-50">
                                {resultName}
                              </p>
                              <div className="mt-1">
                                <SourceBadge source={result._source} />
                              </div>
                            </div>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
                              <Plus className="h-4 w-4" strokeWidth={2.5} />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Ingredienti ({ingredients.length})
            </p>
            {ingredients.length === 0 ? (
              <p className="mb-4 rounded-2xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                Cerca e aggiungi gli ingredienti della ricetta
              </p>
            ) : (
              <ul className="mb-4 space-y-2.5">
                {ingredients.map((ing, index) => {
                  const visual = resolveFoodVisual(
                    { desc: ing.desc, name: ing.desc, row: ing },
                    personalDb,
                  );
                  return (
                    <li
                      key={ing.id}
                      className="vetrina-cart-row-enter rounded-2xl border border-white/[0.06] bg-gradient-to-br from-slate-800/70 to-slate-900/90 p-3 shadow-md shadow-black/20"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <FoodThumbnail
                          visual={visual}
                          name={ing.desc}
                          sizeClassName="h-10 w-10"
                          className="rounded-xl ring-1 ring-white/[0.08]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold tracking-tight text-slate-50">
                            {ing.desc}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
                            <span className="text-violet-300/90">{ing.kcal} kcal</span>
                            {' · '}P{ing.prot} · C{ing.carb} · F{ing.fat}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(index)}
                          aria-label={`Rimuovi ${ing.desc}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-90"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 border-t border-slate-700/50 pt-3">
                        <AmountStepper
                          value={ing.weight}
                          onChange={(next) => handleWeightChange(index, next)}
                          step={10}
                          unitLabel="grammi"
                          size="sm"
                          className="justify-start"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="shrink-0 space-y-3 border-t border-slate-800/80 bg-slate-950/90 px-4 py-4">
            <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/40 to-slate-900/60 px-4 py-3 shadow-inner shadow-black/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/80">
                Totali ricetta
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Peso crudo{' '}
                    <span className="font-mono font-bold tabular-nums text-slate-200">
                      {per100.totalWeight}g
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">
                    P{per100.servingP} · C{per100.servingC} · F{per100.servingF}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl font-bold tabular-nums text-violet-300">
                    {per100.servingKcal}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70">
                    kcal totali
                  </p>
                </div>
              </div>
              <p className="mt-2 border-t border-violet-500/15 pt-2 font-mono text-[10px] tabular-nums text-slate-600">
                Per 100g salvati: {per100.kcal} kcal · P{per100.prot} · C{per100.carb} · F
                {per100.fatTotal}
              </p>
            </div>

            {error ? (
              <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-950/30 transition-all hover:bg-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSaving ? 'Salvataggio...' : 'Salva ricetta'}
            </button>
          </footer>
        </form>
      </div>

      <ImageSelectionSheet
        isOpen={isImageSheetOpen}
        onClose={() => setIsImageSheetOpen(false)}
        foodName={displayName}
        onSelectEmoji={(emoji) => {
          setCustomEmoji(emoji);
          setCustomImage(null);
        }}
        onSelectImage={(dataUrl) => {
          setCustomImage(dataUrl);
          setCustomEmoji(null);
        }}
      />
    </>
  );
}
