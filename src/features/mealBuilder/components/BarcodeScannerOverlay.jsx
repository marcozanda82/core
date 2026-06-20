import React from 'react';

export default function BarcodeScannerOverlay({
  isOpen,
  onClose,
  videoRef,
  error,
  isResolving,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100060] flex flex-col bg-black/95 text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-label="Scanner barcode"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-4">
        <div>
          <h2 className="text-lg font-semibold">Scansiona barcode</h2>
          <p className="mt-0.5 text-xs text-slate-400">Inquadra il codice a barre del prodotto</p>
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
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="block max-h-[50vh] w-full object-cover"
          />
        </div>

        {isResolving ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-cyan-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            Ricerca prodotto...
          </p>
        ) : (
          <p className="mt-4 text-center text-xs text-slate-500">
            EAN-13 · EAN-8 · UPC-A · UPC-E
          </p>
        )}
      </div>
    </div>
  );
}
