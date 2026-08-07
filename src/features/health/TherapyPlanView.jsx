import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  THERAPY_MOMENTI,
  createTherapyItemId,
  fetchTherapyPlan,
  normalizeTherapyPlanItem,
  saveTherapyPlan,
} from './utils/therapyPlanStore.js';

function emptyDraft() {
  return {
    id: createTherapyItemId(),
    nome: '',
    dosaggio: '',
    momenti: ['colazione'],
    note: '',
    attivo: true,
  };
}

/**
 * Configurazione piano farmaci di base (terapia_base) — stile card KentuOS.
 */
export default function TherapyPlanView({
  uid = null,
  patientName = '',
  onClose = null,
} = {}) {
  const [farmaci, setFarmaci] = useState([]);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

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
      setFarmaci(plan.farmaci || []);
    } catch (err) {
      console.error('[TherapyPlanView] load failed', err);
      setError(err?.message || 'Impossibile caricare il piano terapeutico.');
      setFarmaci([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleName = useMemo(
    () => String(patientName || '').trim(),
    [patientName],
  );

  const persistList = useCallback(async (nextList, okMessage) => {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      setError('Utente non autenticato.');
      return false;
    }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const saved = await saveTherapyPlan(safeUid, nextList);
      setFarmaci(saved.farmaci || []);
      setStatus(okMessage || 'Piano salvato.');
      return true;
    } catch (err) {
      console.error('[TherapyPlanView] save failed', err);
      setError(err?.message || 'Salvataggio non riuscito.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [uid]);

  const resetDraft = useCallback(() => {
    setDraft(emptyDraft());
    setEditingId(null);
  }, []);

  const toggleMomento = useCallback((momento) => {
    setDraft((prev) => {
      const current = Array.isArray(prev.momenti) ? prev.momenti : [];
      const has = current.includes(momento);
      const momenti = has
        ? current.filter((m) => m !== momento)
        : [...current, momento];
      return { ...prev, momenti };
    });
  }, []);

  const startEdit = useCallback((item) => {
    const normalized = normalizeTherapyPlanItem(item);
    if (!normalized) return;
    setEditingId(normalized.id);
    setDraft({ ...normalized });
    setStatus('');
  }, []);

  const handleSubmitDraft = useCallback(async () => {
    const normalized = normalizeTherapyPlanItem(draft);
    if (!normalized) {
      setError('Inserisci almeno il nome del farmaco.');
      return;
    }
    if (!normalized.momenti.length) {
      setError('Seleziona almeno un momento della giornata.');
      return;
    }
    const next = editingId
      ? farmaci.map((f) => (f.id === editingId ? normalized : f))
      : [...farmaci, normalized];
    const ok = await persistList(
      next,
      editingId ? 'Farmaco aggiornato.' : 'Farmaco aggiunto al piano.',
    );
    if (ok) resetDraft();
  }, [draft, editingId, farmaci, persistList, resetDraft]);

  const handleRemove = useCallback(async (id) => {
    const next = farmaci.filter((f) => f.id !== id);
    const ok = await persistList(next, 'Farmaco rimosso dal piano.');
    if (ok && editingId === id) resetDraft();
  }, [editingId, farmaci, persistList, resetDraft]);

  const handleToggleActive = useCallback(async (id) => {
    const next = farmaci.map((f) => (
      f.id === id ? { ...f, attivo: f.attivo === false } : f
    ));
    await persistList(next, 'Stato farmaco aggiornato.');
  }, [farmaci, persistList]);

  return (
    <div className="fixed inset-0 z-[100030] flex flex-col bg-zinc-950/95" role="dialog" aria-label="Pianificazione terapeutica">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/90">
            Terapia base
          </p>
          <h2 className="m-0 truncate text-base font-semibold text-zinc-100">
            Pianificazione terapeutica
            {titleName ? (
              <span className="ml-2 font-normal text-zinc-400">· {titleName}</span>
            ) : null}
          </h2>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] font-medium text-zinc-200 transition hover:border-zinc-500 disabled:opacity-50"
          >
            Aggiorna
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
        <div className="mx-auto grid max-w-3xl gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg">
            <h3 className="m-0 text-sm font-semibold text-cyan-300">
              {editingId ? 'Modifica farmaco' : 'Aggiungi farmaco'}
            </h3>
            <p className="mt-1 text-[12px] text-zinc-400">
              Definisci nome, dosaggio e momenti. In chat Kentu userà questo piano per riconoscere salti e ritardi.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] text-zinc-300 sm:col-span-2">
                Nome farmaco
                <input
                  type="text"
                  value={draft.nome}
                  onChange={(e) => setDraft((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="es. Metformina"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-cyan-500/60"
                />
              </label>
              <label className="block text-[12px] text-zinc-300 sm:col-span-2">
                Dosaggio
                <input
                  type="text"
                  value={draft.dosaggio}
                  onChange={(e) => setDraft((p) => ({ ...p, dosaggio: e.target.value }))}
                  placeholder="es. 500 mg"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-cyan-500/60"
                />
              </label>
              <div className="sm:col-span-2">
                <p className="m-0 mb-2 text-[12px] text-zinc-300">Momenti della giornata</p>
                <div className="flex flex-wrap gap-2">
                  {THERAPY_MOMENTI.map((m) => {
                    const active = (draft.momenti || []).includes(m.value);
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => toggleMomento(m.value)}
                        className={[
                          'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
                          active
                            ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-200'
                            : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500',
                        ].join(' ')}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block text-[12px] text-zinc-300 sm:col-span-2">
                Note (opzionale)
                <input
                  type="text"
                  value={draft.note || ''}
                  onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
                  placeholder="es. durante il pasto"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-cyan-500/60"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmitDraft()}
                className="rounded-lg bg-cyan-600/90 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
              >
                {editingId ? 'Salva modifica' : 'Aggiungi al piano'}
              </button>
              {editingId ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={resetDraft}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-[12px] font-medium text-zinc-300"
                >
                  Annulla modifica
                </button>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-semibold text-zinc-100">Piano attuale</h3>
              <span className="text-[11px] text-zinc-500">{farmaci.length} farmaci</span>
            </div>

            {loading ? (
              <p className="m-0 text-sm text-zinc-500" role="status">Caricamento piano…</p>
            ) : null}

            {!loading && farmaci.length === 0 ? (
              <p className="m-0 text-sm text-zinc-500">
                Nessun farmaco ancora. Aggiungi la terapia di base: in chat potrai dire “ho saltato la metformina”.
              </p>
            ) : null}

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
                        ? 'border-zinc-800 bg-zinc-950/40 opacity-60'
                        : 'border-zinc-700/80 bg-zinc-950/70',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
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
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => startEdit(f)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-cyan-500/50"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleToggleActive(f.id)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-amber-500/50"
                        >
                          {inactive ? 'Riattiva' : 'Pausa'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleRemove(f.id)}
                          className="rounded-md border border-rose-900/50 px-2 py-1 text-[11px] text-rose-300 hover:border-rose-500/50"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {error ? (
            <p className="m-0 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-[12px] text-rose-200" role="alert">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="m-0 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-[12px] text-emerald-200" role="status">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
