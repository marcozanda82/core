import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import useUniversalSearchEngine, { SEARCH_SOURCE_BADGE } from '../hooks/useUniversalSearchEngine';
import FoodThumbnail from './FoodThumbnail';
import ImageSelectionSheet from './ImageSelectionSheet';
import { computeMacrosFromIngredients } from '../utils/recipePayloadUtils';
import {
  buildIngredientFromSearchResult,
  scaleIngredientMacros,
} from '../utils/recipeIngredientUtils';
import { resolveFoodVisual } from '../utils/foodIconUtils';

function SourceBadge({ source }) {
  const config = SEARCH_SOURCE_BADGE[source] || {
    label: String(source || 'Altro'),
    className: 'border-slate-600 bg-slate-800 text-slate-300',
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export default function RecipeBuilder({
  personalDb,
  creaDb = null,
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
    creaDb,
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
          ...(result._source === 'crea' ? { foodSource: 'CREA' } : {}),
          ...(result._source === 'usda' ? { foodSource: 'USDA' } : {}),
        });
      } catch {
        /* acquisizione silenziosa */
      }
    }

    setIngredients((prev) => [...prev, buildIngredientFromSearchResult(result)]);
    setQuery('');
  };

  const handleWeightChange = (index, raw) => {
    const next = Number(raw);
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
        className="fixed inset-0 z-[100060] flex flex-col bg-[#050a12] text-slate-100"
        role="dialog"
        aria-modal="true"
        aria-label="Crea nuova ricetta"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-slate-800 px-4 pb-4 pt-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Crea nuova ricetta</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
              >
                Annulla
              </button>
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setIsImageSheetOpen(true)}
                className="shrink-0 rounded-xl ring-offset-2 ring-offset-[#050a12] transition-transform hover:scale-105"
                aria-label="Scegli foto o emoji"
              >
                <FoodThumbnail
                  name={displayName}
                  customImage={customImage}
                  customEmoji={customEmoji}
                  sizeClassName="h-14 w-14"
                  emojiClassName="text-2xl"
                />
              </button>
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-300">Nome ricetta</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Es. Pasta al pesto"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsImageSheetOpen(true)}
                  className="mt-2 text-xs text-violet-300 hover:text-violet-200"
                >
                  {hasCustomIcon ? 'Cambia foto o emoji' : 'Aggiungi foto o emoji'}
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="relative mb-4">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                🔍
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca ingrediente (DB, CREA, USDA)..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            {query.trim() ? (
              <div className="mb-5">
                {isSearchingExternal ? (
                  <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-violet-400" />
                    Ricerca CREA e USDA...
                  </p>
                ) : null}
                {results.length === 0 && !isSearchingExternal ? (
                  <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                    Nessun ingrediente trovato
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
                    {results.map((result) => {
                      const visual = resolveFoodVisual(result, personalDb);
                      const resultName = result.desc || result.name || 'Alimento';
                      return (
                        <li key={`${result._source}-${result.id}`}>
                          <button
                            type="button"
                            onClick={() => handleAddIngredient(result)}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-800/50"
                          >
                            <FoodThumbnail
                              name={resultName}
                              customImage={visual.customImage}
                              customEmoji={visual.customEmoji}
                              sizeClassName="h-10 w-10"
                              emojiClassName="text-lg"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-100">{resultName}</p>
                              <SourceBadge source={result._source} />
                            </div>
                            <Plus className="h-4 w-4 shrink-0 text-violet-400" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            <p className="mb-2 text-xs font-medium text-slate-400">
              Ingredienti ({ingredients.length})
            </p>
            {ingredients.length === 0 ? (
              <p className="mb-4 rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
                Cerca e aggiungi gli ingredienti della ricetta
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {ingredients.map((ing, index) => (
                  <li
                    key={ing.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">{ing.desc}</p>
                      <p className="text-[10px] text-slate-500">
                        {ing.kcal} kcal · P{ing.prot} · C{ing.carb} · F{ing.fat}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={ing.weight}
                      onChange={(event) => handleWeightChange(index, event.target.value)}
                      aria-label={`Grammi ${ing.desc}`}
                      className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-200 outline-none focus:border-violet-500"
                    />
                    <span className="text-xs text-slate-500">g</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(index)}
                      aria-label={`Rimuovi ${ing.desc}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-950/40 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="shrink-0 space-y-3 border-t border-slate-800 px-4 py-4">
            <div className="rounded-xl border border-violet-500/25 bg-violet-950/20 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/80">
                Totali ricetta
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Peso crudo: <span className="font-semibold">{per100.totalWeight}g</span>
                {' · '}
                {per100.servingKcal} kcal · P{per100.servingP} · C{per100.servingC} · F{per100.servingF}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Macro per 100g (salvati nel DB): {per100.kcal} kcal · P{per100.prot} · C{per100.carb} · F{per100.fatTotal}
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
              className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
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
