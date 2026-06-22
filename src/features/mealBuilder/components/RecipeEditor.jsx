import React, { useMemo, useState } from 'react';
import { Check, Clipboard, Plus, Trash2, X } from 'lucide-react';
import { computeMacrosFromIngredients } from '../utils/recipePayloadUtils';
import {
  normalizeIngredient,
  scaleIngredientMacros,
} from '../utils/recipeIngredientUtils';

export default function RecipeEditor({
  recipeKey,
  recipeEntry,
  onSave,
  onClose,
}) {
  const [name, setName] = useState(() => String(recipeEntry?.desc ?? recipeEntry?.name ?? '').trim());
  const [ingredients, setIngredients] = useState(() =>
    (Array.isArray(recipeEntry?.ingredients) ? recipeEntry.ingredients : []).map(normalizeIngredient),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const per100 = useMemo(() => computeMacrosFromIngredients(ingredients), [ingredients]);

  const handleWeightChange = (index, raw) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? scaleIngredientMacros(ing, next) : ing)),
    );
  };

  const handleRemove = (index) => {
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
      await onSave(
        {
          desc: trimmedName,
          kcal: per100.kcal,
          prot: per100.prot,
          carb: per100.carb,
          fatTotal: per100.fatTotal,
          ingredients: ingredients.map(({ id, ...ing }) => ing),
        },
        recipeKey,
      );
      onClose?.();
    } catch {
      setError('Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyJson = async () => {
    const currentRecipe = {
      ...(recipeEntry || {}),
      recipeKey: recipeKey ?? recipeEntry?.recipeKey ?? null,
      desc: name.trim(),
      name: name.trim(),
      kcal: per100.kcal,
      prot: per100.prot,
      carb: per100.carb,
      fatTotal: per100.fatTotal,
      totalWeight: per100.totalWeight,
      ingredients: ingredients.map(({ id, ...ing }) => ing),
    };
    const jsonString = JSON.stringify(currentRecipe, null, 2);
    await navigator.clipboard.writeText(jsonString);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[100060] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Modifica ricetta"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-[#050a12] text-slate-100 sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold">Modifica ricetta</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Nome ricetta</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </label>

          <div className="mb-4 rounded-xl border border-violet-500/25 bg-violet-950/20 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/80">
              Macro per 100g (blocco ricetta)
            </p>
            <p className="mt-1 text-sm text-slate-200">
              {per100.kcal} kcal · P{per100.prot} · C{per100.carb} · F{per100.fatTotal}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Porzione base: {per100.totalWeight}g
            </p>
          </div>

          <p className="mb-2 text-xs font-medium text-slate-400">Ingredienti</p>
          <ul className="space-y-2">
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
                  aria-label={`Peso ${ing.desc}`}
                  className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-200 outline-none focus:border-violet-500"
                />
                <span className="text-xs text-slate-500">g</span>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  aria-label={`Rimuovi ${ing.desc}`}
                  className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {ingredients.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
              Nessun ingrediente. La ricetta deve contenere almeno un ingrediente.
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-800 px-4 py-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isSaving || ingredients.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Plus className="h-4 w-4" />
              {isSaving ? 'Salvataggio...' : 'Salva ricetta'}
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/40 px-2 py-1 text-[10px] font-mono text-slate-500 transition-colors hover:text-cyan-400"
            >
              {copiedJson ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Clipboard className="h-3 w-3" />
              )}
              {copiedJson ? 'JSON Copiato!' : 'Copia JSON'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
