import React, { useEffect, useMemo, useState } from 'react';
import useUniversalSearchEngine from '../hooks/useUniversalSearchEngine';
import useRecipeEngine from '../hooks/useRecipeEngine';

const SOURCE_BADGE = {
  personal: {
    label: 'Personale',
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
  crea: {
    label: 'CREA',
    className: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  },
  usda: {
    label: 'USDA',
    className: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  },
  recipe: {
    label: 'Ricetta',
    className: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
  },
};

const SEARCH_TABS = [
  { id: 'foods', label: 'Alimenti' },
  { id: 'recipes', label: 'Ricette' },
];

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

function SourceBadge({ source }) {
  const config = SOURCE_BADGE[source] || {
    label: String(source || 'Altro'),
    className: 'border-slate-600 bg-slate-800 text-slate-300',
  };

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export default function UniversalSearchModal({
  isOpen,
  onClose,
  onSelectFood,
  onSelectRecipe,
  onOpenScanner,
  onSaveManualFood,
  personalDb,
  creaDb = null,
  scannerError = '',
  isScannerResolving = false,
}) {
  const { query, setQuery, results, isSearchingExternal } = useUniversalSearchEngine(
    personalDb,
    creaDb,
  );
  const { recipes } = useRecipeEngine(personalDb);
  const [activeTab, setActiveTab] = useState('foods');
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualError, setManualError] = useState('');

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((recipe) => recipe.name.toLowerCase().includes(q));
  }, [recipes, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveTab('foods');
      setIsManualEntryOpen(false);
      setManualForm(EMPTY_MANUAL_FORM);
      setManualError('');
      setIsSavingManual(false);
    }
  }, [isOpen, setQuery]);

  if (!isOpen) return null;

  const isFoodsTab = activeTab === 'foods';

  const handleSelect = (result) => {
    onSelectFood?.(result);
  };

  const handleSelectRecipe = (recipe) => {
    onSelectRecipe?.(recipe);
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

  const searchPlaceholder = isFoodsTab
    ? 'Nome alimento o barcode...'
    : 'Cerca ricetta salvata...';

  return (
    <div
      className="fixed inset-0 z-[100050] flex flex-col bg-[#050a12] text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-label="Ricerca alimenti universale"
    >
      <header className="shrink-0 border-b border-slate-800 px-4 pb-4 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {isFoodsTab ? 'Cerca alimento' : 'Ricette salvate'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            Annulla
          </button>
        </div>

        <div className="mb-3 flex rounded-xl border border-slate-700/80 bg-slate-900/60 p-1">
          {SEARCH_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsManualEntryOpen(false);
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? tab.id === 'recipes'
                      ? 'bg-violet-500 text-slate-950'
                      : 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              🔍
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus={!isManualEntryOpen}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          {isFoodsTab ? (
            <button
              type="button"
              onClick={() => onOpenScanner?.()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 text-sm font-bold tracking-widest text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-white"
              aria-label="Scansiona barcode"
              title="Scanner barcode"
            >
              |||
            </button>
          ) : null}
        </div>

        {isFoodsTab && !isManualEntryOpen ? (
          <button
            type="button"
            onClick={() => setIsManualEntryOpen(true)}
            className="mt-3 w-full rounded-xl border border-dashed border-cyan-500/30 bg-cyan-950/20 px-4 py-2.5 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-950/40"
          >
            ➕ Crea alimento manuale
          </button>
        ) : null}

        {isFoodsTab && scannerError ? (
          <p className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {scannerError}
          </p>
        ) : null}

        {isFoodsTab && isScannerResolving ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-cyan-300">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            Ricerca prodotto dal barcode...
          </p>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isFoodsTab && isManualEntryOpen ? (
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
                  step="1"
                  value={manualForm.kcal}
                  onChange={handleManualFieldChange('kcal')}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Proteine (g)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.prot}
                  onChange={handleManualFieldChange('prot')}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Carboidrati (g)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.carb}
                  onChange={handleManualFieldChange('carb')}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">Grassi (g)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualForm.fat}
                  onChange={handleManualFieldChange('fat')}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
            </div>

            {manualError ? (
              <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {manualError}
              </p>
            ) : null}

            <div className="flex gap-2 pt-1">
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
        ) : isFoodsTab && query.trim().length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-10 text-center text-sm text-slate-500">
            Digita per cercare nel database personale, CREA e USDA
          </p>
        ) : isFoodsTab && results.length === 0 && !isSearchingExternal ? (
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
        ) : isFoodsTab ? (
          <ul className="space-y-2">
            {results.map((result) => {
              const kcal = resolveKcalPer100(result);
              return (
                <li key={`${result._source}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(result)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-900"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {result.desc || result.name || 'Alimento'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {kcal != null ? `${kcal} kcal / 100g` : 'Kcal non disponibili'}
                      </p>
                    </div>
                    <SourceBadge source={result._source} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : filteredRecipes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-10 text-center text-sm text-slate-500">
            {query.trim()
              ? `Nessuna ricetta per "${query.trim()}"`
              : 'Nessuna ricetta salvata. Componi un pasto e usa "Salva come ricetta".'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredRecipes.map((recipe) => (
              <li key={recipe.key}>
                <button
                  type="button"
                  onClick={() => handleSelectRecipe(recipe)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:border-violet-400/40 hover:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{recipe.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {recipe.kcal} kcal · {recipe.ingredientCount}{' '}
                      {recipe.ingredientCount === 1 ? 'ingrediente' : 'ingredienti'}
                    </p>
                  </div>
                  <SourceBadge source="recipe" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {isFoodsTab && isSearchingExternal ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            Ricerca estesa in corso...
          </p>
        ) : null}
      </div>
    </div>
  );
}
