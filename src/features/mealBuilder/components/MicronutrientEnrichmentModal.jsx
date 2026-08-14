import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

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

/**
 * Bottom sheet: scegli profilo USDA per arricchire micro di un prodotto OFF.
 *
 * @param {{
 *   isOpen: boolean,
 *   productName?: string,
 *   isLoading?: boolean,
 *   error?: string,
 *   matches?: Array<{
 *     fdcId: string,
 *     name: string,
 *     confidence: 'high'|'medium'|'low',
 *     reason: string,
 *     row?: object,
 *   }>,
 *   onSelectMatch: (match: object) => void,
 *   onSkip: () => void,
 *   onClose?: () => void,
 *   onScanBarcode?: () => void,
 *   onUseLabelPhoto?: () => void,
 *   cameraBusy?: boolean,
 *   variant?: 'barcode' | 'chat',
 * }} props
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
  cameraBusy = false,
  variant = 'barcode',
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onSkip?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onSkip]);

  if (!isOpen || typeof document === 'undefined') return null;

  const titleName = String(productName || 'Prodotto scansionato').trim();
  const isChatMode = variant === 'chat';
  const modalTitle = isChatMode ? 'Nuovo alimento da chat' : 'Arricchimento micronutrienti';
  const introText = isChatMode
    ? (
      <>
        Non conosco{' '}
        <span className="font-medium text-slate-200">{titleName}</span>
        . Scegli un alimento simile dal Kentu DB (CREA / italiano) per stimarne i valori:
      </>
    )
    : (
      <>
        Stai salvando{' '}
        <span className="font-medium text-slate-200">{titleName}</span>
        . Scegli un profilo Kentu DB per arricchire vitamine e minerali:
      </>
    );
  const skipLabel = isChatMode
    ? 'Continua senza profilo Kentu DB'
    : 'Salta — Usa solo l\'etichetta (Senza micronutrienti)';
  const emptyText = isChatMode
    ? 'Nessun match Kentu DB affidabile. Usa lo scanner o la foto etichetta per registrare l\'alimento.'
    : 'Nessun match Kentu DB affidabile. Puoi salvare solo l\'etichetta.';
  const showCameraActions = isChatMode
    && (typeof onScanBarcode === 'function' || typeof onUseLabelPhoto === 'function');
  const actionsDisabled = isLoading || cameraBusy;

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
        className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-600/80 bg-[#0b1220] shadow-2xl sm:rounded-2xl"
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
              <p className="text-sm">Cerco nel Kentu DB i profili più compatibili…</p>
            </div>
          ) : null}

          {!isLoading && error ? (
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-sm text-amber-200">
              {error}
            </p>
          ) : null}

          {!isLoading && !error && matches.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {emptyText}
            </p>
          ) : null}

          {!isLoading && matches.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {matches.map((match) => {
                const ui = CONFIDENCE_UI[match.confidence] || CONFIDENCE_UI.low;
                return (
                  <li key={match.fdcId}>
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
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className={`text-xs font-bold uppercase tracking-wide ${ui.text}`}>
                              {ui.label}
                            </span>
                            <span className="text-[11px] text-slate-500">{ui.hint}</span>
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
          ) : null}
        </div>

        <div className="border-t border-slate-700/80 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {showCameraActions ? (
            <div className="mb-2.5 flex flex-col gap-2">
              <p className="m-0 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Aggiungi al tuo database
              </p>
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
