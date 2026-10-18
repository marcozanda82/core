import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSimulationMode } from '../contexts/SimulationModeContext';
import {
  buildFocusLabDossier,
  summarizeFocusLabDossier,
} from '../features/kentuFocus/lab/buildFocusLabDossier.js';
import {
  resolveFocusLabEditionDates,
  resolveFocusLabHistoryGate,
} from '../features/kentuFocus/lab/focusLabHistoryGate.js';
import { isIsoDateString } from '../features/kentuFocus/normalize/focusDateUtils.js';

async function writeClipboard(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function historyStateLabel(state) {
  switch (state) {
    case 'ready': return 'Storico caricato (giorni vuoti = senza registrazioni)';
    case 'loading': return 'Storico ancora in caricamento';
    case 'idle': return 'Storico non avviato';
    case 'error': return 'Caricamento storico fallito';
    default: return 'Copertura storico sconosciuta';
  }
}

/**
 * Bottone «Esporta dossier Kentu Focus» — solo Modalità Simulazione (UI gate).
 * Non tocca handleCoreOsClick / contatore clic logo.
 */
export default function SimulationFocusDossierExportButton({
  fullHistory = null,
  fullHistoryLoadState = 'unknown',
  bodyMetricsHistory = null,
  userTargets = null,
  userProfile = null,
  currentTrackerDate = null,
  simulatedLog = null,
} = {}) {
  const isSimulationMode = useSimulationMode();
  const [open, setOpen] = useState(false);
  const [dataOrigin, setDataOrigin] = useState('real');
  const [tier, setTier] = useState('essential');
  const [includePersonalNotes, setIncludePersonalNotes] = useState(false);
  const [includeSensitiveFields, setIncludeSensitiveFields] = useState(false);
  const [allowPartialHistory, setAllowPartialHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!isSimulationMode) {
      setOpen(false);
      setCopied(false);
    }
  }, [isSimulationMode]);

  const referenceDate = useMemo(() => {
    const d = String(currentTrackerDate || '').slice(0, 10);
    return isIsoDateString(d) ? d : null;
  }, [currentTrackerDate]);

  const editionDates = useMemo(() => {
    if (!referenceDate) return null;
    try {
      return resolveFocusLabEditionDates({
        editionMode: dataOrigin === 'simulated' ? 'simulated_scenario' : 'focus_standard',
        referenceDate,
        simulatedAnalysisDate: dataOrigin === 'simulated' ? referenceDate : undefined,
      });
    } catch {
      return null;
    }
  }, [referenceDate, dataOrigin]);

  const historyGate = useMemo(
    () => resolveFocusLabHistoryGate({
      historyLoadState: fullHistoryLoadState,
      allowPartialHistory,
      requestedHistoryDays: 60,
    }),
    [fullHistoryLoadState, allowPartialHistory],
  );

  const { dossier, buildError } = useMemo(() => {
    if (!open || !editionDates) {
      return { dossier: null, buildError: null };
    }
    if (!historyGate.canExport) {
      return {
        dossier: null,
        buildError: historyStateLabel(historyGate.historyLoadState)
          + '. Attendi il caricamento oppure abilita «export parziale esplicito».',
      };
    }
    try {
      return {
        dossier: buildFocusLabDossier({
          editionMode: editionDates.editionMode,
          referenceDate: editionDates.referenceDate,
          analysisDate: editionDates.analysisDate,
          publicationDate: editionDates.publicationDate,
          dataOrigin,
          fullHistory,
          bodyMetrics: bodyMetricsHistory,
          profileTargets: {
            profile: userProfile || null,
            targets: userTargets || null,
          },
          userProfile,
          exportTier: tier,
          consent: {
            includePersonalNotes,
            includeSensitiveFields,
          },
          simulatedLog: dataOrigin === 'simulated' ? simulatedLog : null,
          historyLoadState: fullHistoryLoadState,
          allowPartialHistory,
          simulationUiActive: Boolean(isSimulationMode),
          historyDays: 60,
        }),
        buildError: null,
      };
    } catch (err) {
      return { dossier: null, buildError: err?.message || String(err) };
    }
  }, [
    open,
    editionDates,
    historyGate,
    dataOrigin,
    fullHistory,
    bodyMetricsHistory,
    userTargets,
    userProfile,
    tier,
    includePersonalNotes,
    includeSensitiveFields,
    simulatedLog,
    fullHistoryLoadState,
    allowPartialHistory,
    isSimulationMode,
  ]);

  const summary = useMemo(
    () => (dossier ? summarizeFocusLabDossier(dossier) : null),
    [dossier],
  );

  const previewText = useMemo(
    () => (dossier ? JSON.stringify(dossier, null, 2) : ''),
    [dossier],
  );

  const handleCopy = useCallback(async () => {
    if (!dossier) return;
    try {
      await writeClipboard(previewText);
      setCopied(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.warn('[SimulationFocusDossierExportButton] copy failed', err);
    }
  }, [dossier, previewText]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setCopied(false);
  }, []);

  if (!isSimulationMode || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={(event) => {
          event?.stopPropagation?.();
          event?.preventDefault?.();
          setOpen(true);
          setDataOrigin('real');
          setTier('essential');
          setIncludePersonalNotes(false);
          setIncludeSensitiveFields(false);
          setAllowPartialHistory(false);
          setCopied(false);
        }}
        aria-label="Esporta dossier Kentu Focus"
        title="Esporta dossier Kentu Focus"
        className="fixed right-3 z-[100060] rounded bg-gray-800 px-2 py-2 text-[10px] font-medium leading-tight text-amber-200/90 active:scale-95"
        style={{ top: 'max(9.75rem, calc(env(safe-area-inset-top, 0px) + 9.25rem))' }}
      >
        Focus
        <br />
        JSON
      </button>

      {open
        ? (
          <div
            className="fixed inset-0 z-[100070] flex items-end justify-center bg-black/55 p-3 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label="Esporta dossier Kentu Focus"
            onClick={handleClose}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold tracking-wide text-amber-100">
                  Esporta dossier Kentu Focus
                </h2>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Laboratorio locale · sola memoria · nessuna pubblicazione
                </p>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs">
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Origine dati
                  </legend>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="focus-lab-origin"
                      checked={dataOrigin === 'real'}
                      onChange={() => setDataOrigin('real')}
                    />
                    <span>
                      <span className="font-medium text-zinc-100">Diario reale</span>
                      <span className="mt-0.5 block text-zinc-400">
                        Default. Usa fullHistory; non applica simulatedLog.
                        Edizione Focus: pubblicazione = data riferimento, analisi = giorno prima.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="focus-lab-origin"
                      checked={dataOrigin === 'simulated'}
                      onChange={() => setDataOrigin('simulated')}
                    />
                    <span>
                      <span className="font-medium text-zinc-100">Scenario simulato</span>
                      <span className="mt-0.5 block text-zinc-400">
                        Opzionale. Analizza il log simulato puro (nessun merge silenzioso).
                        Dichiarato esplicitamente nel JSON.
                      </span>
                    </span>
                  </label>
                </fieldset>

                {editionDates ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-300">
                    <div>analysisDate: {editionDates.analysisDate}</div>
                    <div>publicationDate: {editionDates.publicationDate}</div>
                    <div>ruolo giorno: {editionDates.analyzedDayRole}</div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-300">
                  <div className="font-medium text-zinc-200">Storico</div>
                  <div>{historyStateLabel(historyGate.historyLoadState)}</div>
                  {!historyGate.d30CompleteAllowed ? (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-amber-200/90">
                      <input
                        type="checkbox"
                        checked={allowPartialHistory}
                        onChange={(e) => setAllowPartialHistory(e.target.checked)}
                      />
                      <span>
                        Consento export esplicitamente parziale (max ~10 giorni).
                        Non verrà presentato come d30 completo.
                      </span>
                    </label>
                  ) : (
                    <div className="mt-1 text-zinc-400">d30 completo consentito.</div>
                  )}
                </div>

                <fieldset className="space-y-2">
                  <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Tipo dossier
                  </legend>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="focus-lab-tier"
                      checked={tier === 'essential'}
                      onChange={() => {
                        setTier('essential');
                        setIncludePersonalNotes(false);
                        setIncludeSensitiveFields(false);
                      }}
                    />
                    <span>
                      <span className="font-medium text-zinc-100">Essenziale</span>
                      <span className="mt-0.5 block text-zinc-400">
                        Metriche tipizzate; note e nomi/etichette testuali redatti.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="focus-lab-tier"
                      checked={tier === 'deep'}
                      onChange={() => setTier('deep')}
                    />
                    <span>
                      <span className="font-medium text-zinc-100">Approfondito</span>
                      <span className="mt-0.5 block text-zinc-400">
                        Nomi e note solo con consenso esplicito.
                      </span>
                    </span>
                  </label>
                </fieldset>

                {tier === 'deep' ? (
                  <fieldset className="space-y-2 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
                    <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-amber-200/80">
                      Consenso dati sensibili
                    </legend>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={includeSensitiveFields}
                        onChange={(e) => setIncludeSensitiveFields(e.target.checked)}
                      />
                      <span>Includi nomi pasti / etichette allenamenti (testo libero).</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={includePersonalNotes}
                        onChange={(e) => setIncludePersonalNotes(e.target.checked)}
                      />
                      <span>Includi note personali contestuali.</span>
                    </label>
                    {!(includeSensitiveFields && includePersonalNotes) ? (
                      <p className="text-[11px] text-amber-300/90">
                        Note richiedono entrambe le caselle. I nomi richiedono almeno
                        «testo libero».
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}

                {buildError ? (
                  <p className="rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-red-200">
                    {buildError}
                  </p>
                ) : null}

                {summary ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                      Riepilogo dati inclusi
                    </p>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-300">
                      <li>Origine: {summary.dataOrigin}</li>
                      <li>Scope: {summary.exportScope}</li>
                      <li>Analisi: {summary.analysisDate || '—'}</li>
                      <li>Pubblicazione: {summary.publicationDate || '—'}</li>
                      <li className="col-span-2">Ruolo: {summary.analyzedDayRole || '—'}</li>
                      <li>Pasti: {summary.mealsLogged} ({summary.foodItems} voci)</li>
                      <li>Allenamenti giorno: {summary.workoutsLogged}</li>
                      <li>Sonno: {summary.sleepAvailable ? 'disponibile' : 'mancante'}</li>
                      <li>d30 completo: {summary.d30Complete ? 'sì' : 'no'}</li>
                      <li>d10 cibo: {summary.d10DaysWithFood}</li>
                      <li>d30 workout: {summary.d30WorkoutEvents}</li>
                      <li>Giorni con nodo: {summary.presentDays}</li>
                      <li>Giorni senza nodo: {summary.missingDays}</li>
                      <li className="col-span-2">
                        Note: {summary.notesIncluded ? 'sì' : 'no'} · Nomi: {summary.freeTextLabelsIncluded ? 'sì' : 'redatti'}
                      </li>
                      <li className="col-span-2">
                        Simulato nel JSON: {summary.containsSimulatedData ? 'sì' : 'no'}
                      </li>
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Anteprima JSON
                  </p>
                  <pre className="max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-black/50 p-2 text-[10px] leading-snug text-zinc-300">
                    {previewText || '—'}
                  </pre>
                </div>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Chiudi senza esportare
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!dossier}
                  className="rounded-lg bg-amber-700/90 px-3 py-2 text-xs font-medium text-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copied ? 'Copiato' : 'Copia JSON'}
                </button>
              </footer>
            </div>
          </div>
        )
        : null}
    </>,
    document.body,
  );
}
