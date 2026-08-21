import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { estimateStandardMacrosPer100g } from '../../../utils/getFoodIcon.js';

const CONFIDENCE_UI = {
  high: {
    emoji: '🟢',
    label: 'Match sicuro',
    hint: 'Ingredienti e profilo quasi identici',
    border: 'border-emerald-500/45',
    bg: 'bg-emerald-950/35',
    text: 'text-emerald-200',
  },
  medium: {
    emoji: '🟡',
    label: 'Simile',
    hint: 'Generico per uno specifico (o viceversa)',
    border: 'border-amber-500/45',
    bg: 'bg-amber-950/30',
    text: 'text-amber-200',
  },
  low: {
    emoji: '🔴',
    label: 'Bassa confidenza',
    hint: 'Usare con cautela',
    border: 'border-rose-500/40',
    bg: 'bg-rose-950/30',
    text: 'text-rose-200',
  },
};

const SOURCE_BADGE_UI = {
  personal: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
  kentu: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200',
  kentu_it: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200',
  usda: 'border-violet-500/45 bg-violet-500/15 text-violet-200',
  global: 'border-violet-500/45 bg-violet-500/15 text-violet-200',
  master: 'border-violet-500/45 bg-violet-500/15 text-violet-200',
  off: 'border-orange-500/45 bg-orange-500/15 text-orange-200',
  custom: 'border-cyan-500/45 bg-cyan-500/15 text-cyan-200',
};

function formatSourceBadge(match) {
  if (match?.sourceBadge) return String(match.sourceBadge);
  const source = String(match?.source || '').toLowerCase();
  if (source === 'personal') return '[Personale]';
  if (source === 'kentu' || source === 'kentu_it') return '[CREA]';
  if (source === 'usda' || source === 'global' || source === 'master') return '[USDA]';
  if (source === 'off') return '[OFF]';
  return '';
}

/**
 * Bottom sheet: disambiguazione / arricchimento alimento.
 */
export default function MicronutrientEnrichmentModal({
  isOpen,
  productName = 'Prodotto scansionato',
  isLoading = false,
  error = '',
  matches = [],
  onSelectMatch,
  onSkip,
  onClose,
  onScanBarcode = null,
  onUseLabelPhoto = null,
  onManualSearch = null,
  onCreateCustom = null,
  cameraBusy = false,
  variant = 'barcode',
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    kcal: '',
    prot: '',
    carb: '',
    fat: '',
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onSkip?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onSkip]);

  const titleName = String(productName || 'Prodotto scansionato').trim();
  const estimatedDefaults = useMemo(
    () => estimateStandardMacrosPer100g(titleName),
    [titleName],
  );
  const isDisambiguation = variant === 'disambiguation' || variant === 'mcdrive';
  const isChatMode = variant === 'chat' || isDisambiguation;
  const isMcdriveMode = variant === 'mcdrive' || variant === 'disambiguation';

  const modalTitle = isDisambiguation
    ? 'Scegli l\'alimento esatto'
    : isChatMode
      ? 'Nuovo alimento da chat'
      : 'Arricchimento micronutrienti';

  const introText = isDisambiguation
    ? (
      <>
        Termine estratto:{' '}
        <span className="font-semibold text-amber-200">«{titleName}»</span>
        . Seleziona la corrispondenza corretta, cerca nel database, oppure crea l&apos;alimento al volo.
      </>
    )
    : isChatMode
      ? (
        <>
          Non conosco{' '}
          <span className="font-medium text-slate-200">{titleName}</span>
          . Scegli un alimento simile dal database, cerca manualmente, oppure crea al volo:
        </>
      )
      : (
        <>
          Stai salvando{' '}
          <span className="font-medium text-slate-200">{titleName}</span>
          . Scegli un profilo Kentu DB per arricchire vitamine e minerali:
        </>
      );

  const skipLabel = isMcdriveMode
    ? 'Tralascia'
    : isChatMode
      ? 'Continua senza profilo'
      : 'Salta — Usa solo l\'etichetta (Senza micronutrienti)';
  const emptyText = isDisambiguation
    ? 'Nessuna corrispondenza affidabile. Cerca nel database o crea l\'alimento al volo.'
    : isChatMode
      ? 'Nessun match affidabile. Usa scanner, foto etichetta o ricerca manuale.'
      : 'Nessun match Kentu DB affidabile. Puoi salvare solo l\'etichetta.';
  const showFallbackActions = isChatMode
    && (
      typeof onScanBarcode === 'function'
      || typeof onUseLabelPhoto === 'function'
      || typeof onManualSearch === 'function'
      || typeof onCreateCustom === 'function'
    );
  const actionsDisabled = isLoading || cameraBusy;

  const topMatches = useMemo(
    () => (Array.isArray(matches) ? matches.filter(Boolean).slice(0, 4) : []),
    [matches],
  );

  if (!isOpen || typeof document === 'undefined') return null;

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    if (typeof onCreateCustom !== 'function') return;
    onCreateCustom({
      name: String(manualForm.name || titleName).trim() || titleName,
      kcal: Number(manualForm.kcal) || 0,
      prot: Number(manualForm.prot) || 0,
      carb: Number(manualForm.carb) || 0,
      fat: Number(manualForm.fat) || 0,
    });
  };

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100020] flex items-end justify-center bg-black/65 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSkip?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="micro-enrich-title"
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-600/80 bg-[#0b1220] shadow-2xl sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-700/80 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600 sm:hidden" aria-hidden />
            <h2 id="micro-enrich-title" className="text-base font-semibold text-slate-100">
              {modalTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-snug text-slate-400">
              {introText}
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => onSkip?.()}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" aria-hidden />
              <p className="text-sm">Cerco in Personale, CREA, USDA e Open Food Facts…</p>
            </div>
          ) : null}

          {!isLoading && error ? (
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-sm text-amber-200">
              {error}
            </p>
          ) : null}

          {!isLoading ? (
            <section className="mb-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Corrispondenze trovate
              </h3>
              {topMatches.length === 0 ? (
                <p className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">
                  {emptyText}
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {topMatches.map((match, index) => {
                    const ui = CONFIDENCE_UI[match.confidence] || CONFIDENCE_UI.low;
                    const badge = formatSourceBadge(match);
                    const sourceKey = String(match.source || '').toLowerCase();
                    const badgeClass = SOURCE_BADGE_UI[sourceKey] || SOURCE_BADGE_UI.kentu;
                    const scorePct = Number.isFinite(Number(match.confidenceScore))
                      ? Math.round(Number(match.confidenceScore) * 100)
                      : null;
                    const matchKey = String(match.fdcId || match.id || match.name || index);
                    return (
                      <li key={matchKey}>
                        <button
                          type="button"
                          onClick={() => onSelectMatch?.(match)}
                          className={`w-full rounded-xl border px-3.5 py-3 text-left transition hover:brightness-110 active:scale-[0.99] ${ui.border} ${ui.bg}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="text-lg leading-none" aria-hidden>
                              {ui.emoji}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                {badge ? (
                                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeClass}`}>
                                    {badge}
                                  </span>
                                ) : null}
                                <span className={`text-xs font-bold uppercase tracking-wide ${ui.text}`}>
                                  {ui.label}
                                  {scorePct != null ? ` · ${scorePct}%` : ''}
                                </span>
                              </div>
                              <p className="mt-1 text-sm font-medium leading-snug text-slate-100">
                                {match.name}
                              </p>
                              {match.reason ? (
                                <p className="mt-1 text-xs leading-snug text-slate-400">
                                  {match.reason}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {!isLoading && typeof onCreateCustom === 'function' ? (
            <section className="mb-2">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Crea alimento al volo
              </h3>
              {!showCreateForm ? (
                <button
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => {
                    setManualForm({
                      name: titleName,
                      kcal: String(Math.round(estimatedDefaults.kcal) || ''),
                      prot: String(estimatedDefaults.prot ?? ''),
                      carb: String(estimatedDefaults.carb ?? ''),
                      fat: String(estimatedDefaults.fat ?? ''),
                    });
                    setShowCreateForm(true);
                  }}
                  className="w-full rounded-xl border border-dashed border-cyan-500/40 bg-cyan-950/20 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-950/35 disabled:opacity-50"
                >
                  ➕ Inserisci / stima i macro
                </button>
              ) : (
                <form onSubmit={handleCreateSubmit} className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3">
                  <p className="m-0 text-[11px] text-slate-400">Valori nutrizionali per 100 g</p>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-300">Nome</span>
                    <input
                      type="text"
                      value={manualForm.name}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      ['kcal', 'Kcal'],
                      ['prot', 'Proteine'],
                      ['carb', 'Carboidrati'],
                      ['fat', 'Grassi'],
                    ].map(([key, label]) => (
                      <label key={key} className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={manualForm[key]}
                          onChange={(e) => setManualForm((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 rounded-xl border border-slate-600/70 bg-slate-900/80 py-2.5 text-sm font-medium text-slate-300"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-xl border border-cyan-500/50 bg-cyan-600/80 py-2.5 text-sm font-semibold text-white"
                    >
                      Usa questo alimento
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}
        </div>

        <div className="border-t border-slate-700/80 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {showFallbackActions ? (
            <div className="mb-2.5 flex flex-col gap-2">
              <p className="m-0 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Cerca nel database
              </p>
              {typeof onManualSearch === 'function' ? (
                <button
                  type="button"
                  onClick={() => onManualSearch()}
                  disabled={actionsDisabled}
                  className="w-full rounded-xl border border-violet-500/45 bg-violet-950/40 py-3.5 text-sm font-semibold text-violet-100 transition hover:border-violet-400/70 hover:bg-violet-900/45 disabled:opacity-50"
                >
                  🔍 Ricerca manuale nell&apos;archivio
                </button>
              ) : null}
              {typeof onScanBarcode === 'function' ? (
                <button
                  type="button"
                  onClick={() => onScanBarcode()}
                  disabled={actionsDisabled}
                  className="w-full rounded-xl border border-cyan-500/45 bg-cyan-950/45 py-3.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/70 hover:bg-cyan-900/50 disabled:opacity-50"
                >
                  {cameraBusy ? 'Apertura fotocamera…' : '📷 Scansione Codice a Barre'}
                </button>
              ) : null}
              {typeof onUseLabelPhoto === 'function' ? (
                <button
                  type="button"
                  onClick={() => onUseLabelPhoto()}
                  disabled={actionsDisabled}
                  className="w-full rounded-xl border border-cyan-500/45 bg-cyan-950/45 py-3.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/70 hover:bg-cyan-900/50 disabled:opacity-50"
                >
                  {cameraBusy ? 'Elaborazione…' : '🏷️ Foto Etichetta'}
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => onSkip?.()}
            disabled={actionsDisabled}
            className="w-full rounded-xl border border-slate-600/70 bg-slate-900/80 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {skipLabel}
          </button>
          {!isChatMode && typeof onClose === 'function' ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full py-2 text-xs text-slate-500 hover:text-slate-300"
            >
              Annulla scansione
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
