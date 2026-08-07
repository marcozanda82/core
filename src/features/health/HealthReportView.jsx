import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildWhatsAppShareUrl,
  fetchMergedHealthReportRows,
  formatHealthReportForWhatsApp,
  labelContesto,
  labelMomento,
} from './utils/healthReportData.js';

/**
 * Report medico diabete — tabella riassuntiva Firestore + share WhatsApp.
 */
export default function HealthReportView({
  uid = null,
  patientName = '',
  onClose = null,
  embedded = false,
} = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      setRows([]);
      setError('Utente non autenticato.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await fetchMergedHealthReportRows(safeUid);
      setRows(next);
    } catch (err) {
      console.error('[HealthReportView] fetch failed', err);
      setError(
        err?.message
          || 'Impossibile caricare il diario salute. Verifica Firestore e riprova.',
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const whatsappText = useMemo(
    () => formatHealthReportForWhatsApp(rows, { patientName }),
    [rows, patientName],
  );

  const handleShareWhatsApp = useCallback(() => {
    setSharing(true);
    try {
      const url = buildWhatsAppShareUrl(whatsappText);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[HealthReportView] WhatsApp share failed', err);
      setError('Condivisione WhatsApp non riuscita. Riprova.');
    } finally {
      window.setTimeout(() => setSharing(false), 400);
    }
  }, [whatsappText]);

  const shellClass = embedded
    ? 'flex h-full min-h-0 flex-col'
    : 'fixed inset-0 z-[100030] flex flex-col bg-zinc-950/95';

  return (
    <div className={shellClass} role="dialog" aria-label="Report medico diabete">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90">
            Diario salute
          </p>
          <h2 className="m-0 truncate text-base font-semibold text-zinc-100">
            Report medico
            {patientName ? (
              <span className="ml-2 font-normal text-zinc-400">· {patientName}</span>
            ) : null}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] font-medium text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
          >
            Aggiorna
          </button>
          <button
            type="button"
            onClick={handleShareWhatsApp}
            disabled={loading || sharing || rows.length === 0}
            className="rounded-lg border border-emerald-700/60 bg-emerald-900/50 px-3 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-800/60 disabled:opacity-40"
          >
            Condividi su WhatsApp
          </button>
          {typeof onClose === 'function' ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] font-medium text-zinc-300 transition hover:border-rose-500/50 hover:text-rose-200"
            >
              Chiudi
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div
          className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-amber-900/20 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
          style={{
            background: 'linear-gradient(180deg, #f7f1e3 0%, #f3ead7 100%)',
            color: '#1c1917',
          }}
        >
          <div className="border-b border-amber-900/15 px-4 py-3 sm:px-5">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70">
              Quaderno ordinato
            </p>
            <p className="m-0 mt-1 text-[13px] text-stone-600">
              Glicemie, pasti ed eccezioni terapia in ordine cronologico.
            </p>
          </div>

          {loading ? (
            <p className="m-0 px-5 py-10 text-center text-sm text-stone-500" role="status">
              Caricamento diario…
            </p>
          ) : null}

          {!loading && error ? (
            <div className="px-5 py-6 text-center">
              <p className="m-0 text-sm text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg border border-stone-400 bg-white/70 px-3 py-2 text-[12px] font-medium text-stone-700"
              >
                Riprova
              </button>
            </div>
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <p className="m-0 px-5 py-10 text-center text-sm text-stone-500">
              Nessuna registrazione ancora. Usa la chat per salvare glicemie, pasti o eccezioni terapia.
            </p>
          ) : null}

          {!loading && !error && rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-amber-900/20 bg-amber-100/50 text-[11px] uppercase tracking-wide text-stone-600">
                    <th className="px-3 py-3 font-semibold sm:px-4">Data e ora</th>
                    <th className="px-3 py-3 font-semibold sm:px-4">Momento</th>
                    <th className="px-3 py-3 font-semibold sm:px-4">Alimenti consumati</th>
                    <th className="px-3 py-3 font-semibold sm:px-4">Glicemia</th>
                    <th className="px-3 py-3 font-semibold sm:px-4">Note terapia / eccezioni</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const contesto = labelContesto(row.contestoGlicemia);
                    const isEcc = row.kind === 'eccezione' || row.hasEccezione;
                    return (
                      <tr
                        key={row.id}
                        className={[
                          'border-b border-amber-900/10 align-top',
                          isEcc ? 'bg-rose-50/80' : 'bg-transparent',
                        ].join(' ')}
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-stone-800 sm:px-4">
                          <div>{row.dateLabel}</div>
                          <div className="text-[12px] font-normal text-stone-500">{row.timeLabel}</div>
                        </td>
                        <td className="px-3 py-3 text-stone-700 sm:px-4">
                          {isEcc ? '—' : labelMomento(row.momento)}
                        </td>
                        <td className="max-w-[220px] px-3 py-3 text-stone-700 sm:px-4">
                          {isEcc ? '—' : (row.alimenti?.trim() || '—')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-stone-800 sm:px-4">
                          {row.glicemia != null ? (
                            <>
                              <span className="font-semibold tabular-nums">{row.glicemia}</span>
                              <span className="text-stone-500"> mg/dL</span>
                              {contesto ? (
                                <div className="text-[11px] font-medium text-teal-800/80">{contesto}</div>
                              ) : null}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          {isEcc || row.notaTerapia ? (
                            <span className="inline-flex flex-col gap-0.5">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                                Variazione terapia
                              </span>
                              <span className="text-stone-800">{row.notaTerapia || '—'}</span>
                            </span>
                          ) : (
                            <span className="text-stone-400">Routine</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
