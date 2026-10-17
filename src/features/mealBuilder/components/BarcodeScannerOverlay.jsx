import React from 'react';

function notFoundCopy(barcode) {
  const ean = String(barcode || '').trim();
  if (ean) {
    return `Codice ${ean} non presente nel tuo DB né su Open Food Facts. Salvalo ora: la prossima scansione lo riconoscerà subito.`;
  }
  return 'Prodotto non trovato. Crealo ora per riconoscerlo alle scansioni successive.';
}

export default function BarcodeScannerOverlay({
  isOpen,
  onClose,
  videoRef,
  error,
  isResolving,
  notFound = null,
  /** @deprecated Usare onCreateQuickFood — tenuto per compat. */
  onInsertManually,
  onCreateQuickFood,
  onScanNutritionLabel,
  onRetryScan,
  labelScanAvailable = true,
}) {
  if (!isOpen) return null;

  const notFoundBarcode = String(notFound?.barcode || '').trim();
  const showNotFound = Boolean(notFound);

  const handleQuickCreate = () => {
    const code = notFoundBarcode;
    if (typeof onCreateQuickFood === 'function') {
      onCreateQuickFood(code);
      return;
    }
    onInsertManually?.(code);
  };

  return (
    <div
      className="fixed inset-0 z-[100060] flex flex-col bg-black/95 text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-label="Scanner barcode"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-4">
        <div>
          <h2 className="text-lg font-semibold">Scansiona barcode / QR</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            EAN, UPC o QR GS1 Digital Link — lookup locale poi Open Food Facts online
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          Chiudi
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6">
        {!showNotFound ? (
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="block max-h-[50vh] w-full object-cover"
            />
          </div>
        ) : null}

        {isResolving ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-cyan-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            Ricerca in corso...
          </p>
        ) : showNotFound ? (
          <div className="mt-2 w-full max-w-md space-y-3 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/90">
              Codice nuovo
            </p>
            {notFoundBarcode ? (
              <p className="font-mono text-lg font-semibold tracking-wide text-amber-50">
                {notFoundBarcode}
              </p>
            ) : null}
            <p className="text-sm leading-relaxed text-amber-100/90">
              {notFoundCopy(notFoundBarcode)}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {labelScanAvailable && typeof onScanNutritionLabel === 'function' ? (
                <button
                  type="button"
                  onClick={() => onScanNutritionLabel(notFoundBarcode)}
                  className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
                >
                  Scansiona Etichetta Nutrizionale
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleQuickCreate}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  labelScanAvailable && typeof onScanNutritionLabel === 'function'
                    ? 'border border-cyan-500/50 bg-slate-900/80 text-cyan-200 hover:border-cyan-400 hover:bg-slate-800'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                Crea Alimento Rapido
              </button>
              {typeof onRetryScan === 'function' ? (
                <button
                  type="button"
                  onClick={onRetryScan}
                  className="w-full rounded-xl border border-slate-600 px-4 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
                >
                  Riprova scansione
                </button>
              ) : null}
            </div>
          </div>
        ) : error ? (
          <p className="mt-4 max-w-md text-center text-sm text-red-300">{error}</p>
        ) : (
          <p className="mt-4 text-center text-xs text-slate-500">
            EAN-13 · EAN-8 · UPC-A · UPC-E · QR (GS1)
          </p>
        )}
      </div>
    </div>
  );
}
