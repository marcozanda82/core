import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchTherapyPlan,
  THERAPY_MOMENTI,
} from '../health/utils/therapyPlanStore.js';
import { GLASS_SURFACE_CLASS } from './glassStyles';

/**
 * Piano terapeutico in sola lettura — stessa sorgente di TherapyPlanView (Firestore terapia_base).
 * TherapyPlanView non espone modalità embedded/readOnly; questo pannello evita scritture accidental.
 */
export default function TherapyPlanReadOnlyPanel({
  uid = null,
  patientName = '',
} = {}) {
  const [farmaci, setFarmaci] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      setFarmaci([]);
      setError('Utente non autenticato.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const plan = await fetchTherapyPlan(safeUid);
      setFarmaci(Array.isArray(plan?.farmaci) ? plan.farmaci : []);
    } catch (err) {
      console.error('[centroAnalisi/clinica] therapy plan load failed', err);
      setError(err?.message || 'Impossibile caricare il piano terapeutico.');
      setFarmaci([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleName = String(patientName || '').trim();

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl px-4 py-4 ${GLASS_SURFACE_CLASS}`}
      aria-label="Piano terapeutico di base"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Terapia base
          </p>
          <h3 className="mt-1 text-sm font-semibold text-zinc-100">
            Pianificazione terapeutica
            {titleName ? (
              <span className="ml-2 font-normal text-zinc-400">· {titleName}</span>
            ) : null}
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            Visualizzazione in sola lettura — modifica da Sala Comandi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:border-white/25 disabled:opacity-50"
        >
          Aggiorna
        </button>
      </div>

      {loading ? (
        <p className="m-0 text-sm text-zinc-500" role="status">Caricamento piano…</p>
      ) : null}

      {!loading && error ? (
        <p className="m-0 text-sm text-rose-300" role="alert">{error}</p>
      ) : null}

      {!loading && !error && farmaci.length === 0 ? (
        <p className="m-0 text-sm text-zinc-500">
          Nessun farmaco configurato nel piano di base.
        </p>
      ) : null}

      {!loading && !error && farmaci.length > 0 ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {farmaci.map((f) => {
            const inactive = f.attivo === false;
            const momentiLabels = (f.momenti || [])
              .map((v) => THERAPY_MOMENTI.find((m) => m.value === v)?.label || v)
              .join(' · ');
            return (
              <li
                key={f.id}
                className={[
                  'rounded-xl border px-3 py-3',
                  inactive
                    ? 'border-white/5 bg-black/20 opacity-60'
                    : 'border-white/10 bg-white/[0.03]',
                ].join(' ')}
              >
                <p className="m-0 text-[14px] font-semibold text-zinc-100">
                  {f.nome}
                  {f.dosaggio ? (
                    <span className="ml-2 font-normal text-cyan-300/90">{f.dosaggio}</span>
                  ) : null}
                </p>
                <p className="m-0 mt-1 text-[12px] text-zinc-400">
                  {momentiLabels || 'Momenti non impostati'}
                </p>
                {f.note ? (
                  <p className="m-0 mt-1 text-[11px] text-zinc-500">{f.note}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
