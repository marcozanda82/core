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
import {
  FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
  FOCUS_EDITION_BENCH_PRESETS,
  FOCUS_EDITORIAL_BENCH_DEFAULT_DATES,
  runFocusEditorialBench,
  summarizeFocusEditorialBench,
} from '../features/kentuFocus/lab/runFocusEditorialBench.js';
import { resolveEditionWindows } from '../features/kentuFocus/edition/editionCalendar.js';
import { isIsoDateString } from '../features/kentuFocus/normalize/focusDateUtils.js';
import {
  assessFocusGeminiPreviewEligibility,
  buildFocusGeminiReviewClipboardPayload,
  createAskAiFocusGeminiProvider,
  formatFocusWrittenEditionText,
  runFocusGeminiPreview,
} from '../features/kentuFocus/editorial/writing/index.js';
import { describeFocusGeminiBenchStatus } from '../features/kentuFocus/lab/focusGeminiBenchStatus.js';

const EDITORIAL_PRESET_OPTIONS = Object.values(FOCUS_EDITION_BENCH_PRESETS);

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

/** @param {{ title: string, summary: object, report: object }} props */
function EditorialBenchSummary({ title, summary, report }) {
  const selected = (report?.candidates || []).filter((c) => c.outcome === 'selected');
  const excluded = (report?.candidates || []).filter((c) => c.outcome === 'excluded');
  const sleep = report?.sleepWeeklyRhythm;
  const weekCov = summary.editionCoverage?.week;
  const monthCov = summary.editionCoverage?.month;
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] text-zinc-300">
      <div className="font-medium text-zinc-100">{title}</div>
      {!summary.ok ? (
        <div className="mt-1 text-red-300">{summary.error}</div>
      ) : (
        <>
          <ul className="mt-1 space-y-0.5 text-zinc-400">
            <li>
              edizione: {summary.editionKind || '—'} · verifica {summary.verificationStatus || '—'}
              {' · '}asOf {summary.asOfDate || '—'}
            </li>
            <li>
              pub {summary.publicationDate || '—'}
              {' · '}analisi {summary.analysisDate || '—'}
            </li>
            {summary.weekWindow ? (
              <li>
                settimana: {summary.weekWindow.fromDate}→{summary.weekWindow.toDate}
                {weekCov
                  ? ` · copertura ${weekCov.daysPresent}/${weekCov.calendarDays} (${weekCov.periodQuality})`
                  : ''}
              </li>
            ) : null}
            {summary.monthWindow ? (
              <li>
                mese: {summary.monthWindow.fromDate}→{summary.monthWindow.toDate}
                {monthCov
                  ? ` · copertura ${monthCov.daysPresent}/${monthCov.calendarDays} (${monthCov.periodQuality})`
                  : ''}
              </li>
            ) : null}
            <li>
              articolo centrale: {summary.centerpieceTopic || 'nessuno'}
              {summary.centerpieceStatus ? ` · ${summary.centerpieceStatus}` : ''}
              {summary.centerpieceOmitReason ? ` · ${summary.centerpieceOmitReason}` : ''}
              {summary.overlapResolution ? ` · overlap ${summary.overlapResolution}` : ''}
              {summary.centerpieceUnevaluable ? ' · dati insufficienti' : ''}
            </li>
            <li>
              sleepRoutine nel dossier: {summary.sleepRoutinePresent ? 'sì' : 'no'}
            </li>
            <li>
              sleep_weekly_rhythm: {summary.sleepWeeklyRhythm || '—'}
              {summary.sleepWeeklyPosition ? ` · ${summary.sleepWeeklyPosition}` : ''}
              {summary.sleepWeeklyReason ? ` · ${summary.sleepWeeklyReason}` : ''}
            </li>
            <li>
              memoria: {summary.memoryKind}
              {summary.counterfactual ? ' · CONTROFATTUALE' : ''}
            </li>
            <li>
              lead: {summary.leadTopic || 'nessuno'} · good {summary.goodCount}
              {' · '}feature {summary.featureCount}
              {' · '}continuità {summary.continuityCount ?? 0}
              {' · '}concern {summary.concernCount}
              {summary.hasCoach ? ' · coach' : ''}
            </li>
            <li>testi: {summary.textsKind} · rtdbReads: {summary.rtdbReads}</li>
          </ul>
          {sleep?.status === 'selected' || sleep?.status === 'excluded' || sleep?.status === 'not_generated' ? (
            <p className="mt-1 text-sky-200/90">
              Dettaglio ritmo sonno: {sleep.status}
              {sleep.fingerprint ? ` · fp ${String(sleep.fingerprint).slice(0, 40)}` : ''}
            </p>
          ) : null}
          {report?.memorySimulation?.note ? (
            <p className="mt-1 text-zinc-500">{report.memorySimulation.note}</p>
          ) : null}
          {selected.length > 0 ? (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Selezionati</div>
              <ul className="mt-0.5 space-y-0.5">
                {selected.map((c) => (
                  <li key={c.id}>
                    [{c.position}] {c.topicId} · score {c.score}
                    {c.seed?.headline ? ` — ${c.seed.headline}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {excluded.length > 0 ? (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Esclusi (prime voci)</div>
              <ul className="mt-0.5 space-y-0.5">
                {excluded.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    {c.topicId}: {c.excludeReason || '—'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
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
  const [copiedEditorial, setCopiedEditorial] = useState(false);
  const [editorialFirst, setEditorialFirst] = useState(null);
  const [editorialSecond, setEditorialSecond] = useState(null);
  const [editorialError, setEditorialError] = useState(null);
  const [editorialPresetId, setEditorialPresetId] = useState(
    FOCUS_EDITION_BENCH_PRESETS.daily_regression.id,
  );
  const [geminiPreview, setGeminiPreview] = useState(null);
  const [geminiPreviewError, setGeminiPreviewError] = useState(null);
  const [geminiPreviewLoading, setGeminiPreviewLoading] = useState(false);
  const [copiedGeminiText, setCopiedGeminiText] = useState(false);
  const [copiedGeminiJson, setCopiedGeminiJson] = useState(false);
  const timerRef = useRef(null);
  const geminiInFlightRef = useRef(false);
  const geminiAbortRef = useRef(null);

  const editorialPreset = useMemo(
    () => EDITORIAL_PRESET_OPTIONS.find((p) => p.id === editorialPresetId)
      || FOCUS_EDITION_BENCH_PRESETS.daily_regression,
    [editorialPresetId],
  );

  const editorialPresetWindows = useMemo(() => {
    try {
      return resolveEditionWindows(editorialPreset.publicationDate);
    } catch {
      return null;
    }
  }, [editorialPreset.publicationDate]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (geminiAbortRef.current) {
      geminiAbortRef.current.abort();
      geminiAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isSimulationMode) {
      setOpen(false);
      setCopied(false);
      setCopiedEditorial(false);
      setEditorialFirst(null);
      setEditorialSecond(null);
      setEditorialError(null);
      setGeminiPreview(null);
      setGeminiPreviewError(null);
      setGeminiPreviewLoading(false);
    }
  }, [isSimulationMode]);

  const editorialBenchReady = fullHistoryLoadState === 'ready';

  const clearGeminiPreview = useCallback(() => {
    if (geminiAbortRef.current) {
      geminiAbortRef.current.abort();
      geminiAbortRef.current = null;
    }
    geminiInFlightRef.current = false;
    setGeminiPreview(null);
    setGeminiPreviewError(null);
    setGeminiPreviewLoading(false);
    setCopiedGeminiText(false);
    setCopiedGeminiJson(false);
  }, []);

  const runEditorialFirst = useCallback(() => {
    setEditorialError(null);
    setEditorialSecond(null);
    clearGeminiPreview();
    try {
      const pub = editorialPreset.publicationDate
        || FOCUS_EDITORIAL_BENCH_DEFAULT_DATES.publicationDate;
      const windows = resolveEditionWindows(pub);
      const report = runFocusEditorialBench({
        fullHistory,
        fullHistoryLoadState,
        analysisDate: windows.analysisDate,
        publicationDate: pub,
        historyDays: 30,
        asOfDate: FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
        presetHint: editorialPreset.dataOriginHint,
        forceSimulation: Boolean(editorialPreset.forceSimulation),
        userProfile,
        userTargets,
        bodyMetrics: bodyMetricsHistory,
        mode: 'first',
      });
      setEditorialFirst(report);
      if (!report.ok) {
        setEditorialError(report.error?.message || 'Prova redazione non riuscita');
      }
    } catch (err) {
      setEditorialFirst(null);
      setEditorialError(err?.message || String(err));
    }
  }, [
    editorialPreset,
    fullHistory,
    fullHistoryLoadState,
    userProfile,
    userTargets,
    bodyMetricsHistory,
    clearGeminiPreview,
  ]);

  const runEditorialSecond = useCallback(() => {
    if (!editorialFirst?.ok) {
      setEditorialError('Esegui prima «Prova redazione» con esito ok.');
      return;
    }
    setEditorialError(null);
    try {
      const pub = editorialPreset.publicationDate
        || FOCUS_EDITORIAL_BENCH_DEFAULT_DATES.publicationDate;
      const windows = resolveEditionWindows(pub);
      const report = runFocusEditorialBench({
        fullHistory,
        fullHistoryLoadState,
        analysisDate: windows.analysisDate,
        publicationDate: pub,
        historyDays: 30,
        asOfDate: FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
        presetHint: editorialPreset.dataOriginHint,
        forceSimulation: Boolean(editorialPreset.forceSimulation),
        userProfile,
        userTargets,
        bodyMetrics: bodyMetricsHistory,
        mode: 'second_anti_repeat',
        priorBenchReport: editorialFirst,
      });
      setEditorialSecond(report);
      if (!report.ok) {
        setEditorialError(report.error?.message || 'Seconda selezione non riuscita');
      }
    } catch (err) {
      setEditorialSecond(null);
      setEditorialError(err?.message || String(err));
    }
  }, [
    editorialFirst,
    editorialPreset,
    fullHistory,
    fullHistoryLoadState,
    userProfile,
    userTargets,
    bodyMetricsHistory,
  ]);

  const editorialExportPayload = useMemo(() => {
    if (!editorialFirst && !editorialSecond) return null;
    return {
      schema: 'kentu.focusEditorialBenchExport.v1',
      exportedAt: new Date().toISOString(),
      note: 'Banco redazione locale · dati in RAM · selezione deterministica · seed only · nessuna persistenza memoria. '
        + 'Un preset futuro/fixture non è prova sul diario reale.',
      preset: {
        id: editorialPreset.id,
        label: editorialPreset.label,
        publicationDate: editorialPreset.publicationDate,
        dataOriginHint: editorialPreset.dataOriginHint,
      },
      firstSelection: editorialFirst,
      secondSelectionAntiRepeat: editorialSecond,
      privacy: {
        personalNotesExcluded: true,
        freeTextLabelsExcluded: true,
        consentNotRequestedForDeepFields: true,
      },
    };
  }, [editorialFirst, editorialSecond, editorialPreset]);

  const editorialSummaryFirst = useMemo(
    () => (editorialFirst ? summarizeFocusEditorialBench(editorialFirst) : null),
    [editorialFirst],
  );
  const editorialSummarySecond = useMemo(
    () => (editorialSecond ? summarizeFocusEditorialBench(editorialSecond) : null),
    [editorialSecond],
  );

  const geminiEligibility = useMemo(
    () => assessFocusGeminiPreviewEligibility({
      firstBenchReport: editorialFirst,
      preset: editorialPreset,
    }),
    [editorialFirst, editorialPreset],
  );

  const runGeminiPreview = useCallback(async () => {
    if (geminiInFlightRef.current) return;
    const gate = assessFocusGeminiPreviewEligibility({
      firstBenchReport: editorialFirst,
      preset: editorialPreset,
    });
    if (!gate.ok) {
      setGeminiPreviewError(gate.message || gate.reason);
      return;
    }
    geminiInFlightRef.current = true;
    setGeminiPreviewLoading(true);
    setGeminiPreviewError(null);
    setGeminiPreview(null);
    const abort = new AbortController();
    geminiAbortRef.current = abort;
    try {
      const provider = createAskAiFocusGeminiProvider({
        signal: abort.signal,
        timeoutMs: 45_000,
      });
      const result = await runFocusGeminiPreview({
        selection: gate.selection,
        geminiProvider: provider,
        preset: editorialPreset,
        firstBenchReport: editorialFirst,
      });
      if (abort.signal.aborted) return;
      setGeminiPreview(result);
      if (!result.ok) {
        setGeminiPreviewError(result.message || result.error || 'Anteprima Gemini non accettata');
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setGeminiPreview(null);
      setGeminiPreviewError(err?.message || String(err));
    } finally {
      if (geminiAbortRef.current === abort) geminiAbortRef.current = null;
      geminiInFlightRef.current = false;
      setGeminiPreviewLoading(false);
    }
  }, [editorialFirst, editorialPreset]);

  const handleCopyGeminiText = useCallback(async () => {
    const text = geminiPreview?.displayText
      || formatFocusWrittenEditionText(geminiPreview?.written);
    if (!text) return;
    try {
      await writeClipboard(text);
      setCopiedGeminiText(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopiedGeminiText(false), 2000);
    } catch (err) {
      setGeminiPreviewError(err?.message || 'Copia testo non riuscita');
    }
  }, [geminiPreview]);

  const geminiReviewClipboard = useMemo(
    () => buildFocusGeminiReviewClipboardPayload(geminiPreview),
    [geminiPreview],
  );

  const geminiBenchStatus = useMemo(
    () => describeFocusGeminiBenchStatus({
      editorialFirst,
      geminiEligibility,
      geminiPreview,
      geminiPreviewLoading,
      geminiPreviewError,
      hasReviewClipboard: Boolean(geminiReviewClipboard),
    }),
    [
      editorialFirst,
      geminiEligibility,
      geminiPreview,
      geminiPreviewLoading,
      geminiPreviewError,
      geminiReviewClipboard,
    ],
  );

  const handleCopyGeminiJson = useCallback(async () => {
    const payload = geminiReviewClipboard
      || buildFocusGeminiReviewClipboardPayload(geminiPreview);
    if (!payload) return;
    try {
      await writeClipboard(JSON.stringify(payload, null, 2));
      setCopiedGeminiJson(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopiedGeminiJson(false), 2000);
    } catch (err) {
      setGeminiPreviewError(err?.message || 'Copia JSON revisione Gemini non riuscita');
    }
  }, [geminiPreview, geminiReviewClipboard]);

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

  const handleCopyEditorial = useCallback(async () => {
    if (!editorialExportPayload) return;
    try {
      await writeClipboard(JSON.stringify(editorialExportPayload, null, 2));
      setCopiedEditorial(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopiedEditorial(false), 1600);
    } catch (err) {
      console.warn('[SimulationFocusDossierExportButton] editorial copy failed', err);
    }
  }, [editorialExportPayload]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setCopied(false);
    setCopiedEditorial(false);
    setEditorialFirst(null);
    setEditorialSecond(null);
    setEditorialError(null);
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
          setCopiedEditorial(false);
          setEditorialFirst(null);
          setEditorialSecond(null);
          setEditorialError(null);
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
                      <li>Chiavi micro: {summary.micronutrientKeys ?? 0}</li>
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

                <section className="space-y-2 rounded-lg border border-sky-900/50 bg-sky-950/20 p-3">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-sky-200/90">
                    Prova redazione
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Diario in RAM · zero Firebase RTDB Focus · selezione = seed deterministici.
                    Gemini solo su «Genera anteprima con Gemini» (1ª selezione storica; nessuna
                    pubblicazione; nessuna memoria persistita).
                  </p>
                  <label className="block text-[11px] text-zinc-300">
                    Tipo / data edizione
                    <select
                      value={editorialPresetId}
                      onChange={(e) => {
                        setEditorialPresetId(e.target.value);
                        setEditorialFirst(null);
                        setEditorialSecond(null);
                        setEditorialError(null);
                        clearGeminiPreview();
                      }}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100"
                    >
                      {EDITORIAL_PRESET_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                  {editorialPresetWindows?.ok ? (
                    <p className="text-[11px] text-zinc-500">
                      tipo {editorialPresetWindows.editionKind}
                      {' · '}analisi {editorialPresetWindows.analysisDate}
                      {' · '}pub {editorialPresetWindows.publicationDate}
                      {editorialPresetWindows.week
                        ? ` · settimana ${editorialPresetWindows.week.fromDate}→${editorialPresetWindows.week.toDate}`
                        : ''}
                      {editorialPresetWindows.month
                        ? ` · mese ${editorialPresetWindows.month.fromDate}→${editorialPresetWindows.month.toDate}`
                        : ''}
                      {' · '}hint: {editorialPreset.dataOriginHint}
                      {' · '}asOf {FOCUS_EDITION_BENCH_AS_OF_DEFAULT}
                      {editorialPreset.forceSimulation ? ' · SIMULAZIONE (non prova reale)' : ''}
                    </p>
                  ) : null}
                  {!editorialBenchReady ? (
                    <p className="text-[11px] text-amber-200/90">
                      Disponibile solo con storico ready (non con cache ~15 giorni).
                      Stato attuale: {historyStateLabel(fullHistoryLoadState)}.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!editorialBenchReady}
                      onClick={runEditorialFirst}
                      className="rounded-lg bg-sky-800/90 px-3 py-2 text-[11px] font-medium text-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prova redazione
                    </button>
                    <button
                      type="button"
                      disabled={!editorialFirst?.ok}
                      onClick={runEditorialSecond}
                      className="rounded-lg border border-sky-700/80 px-3 py-2 text-[11px] font-medium text-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Simula seconda selezione
                    </button>
                    <button
                      type="button"
                      disabled={!editorialExportPayload}
                      onClick={handleCopyEditorial}
                      className="rounded-lg border border-zinc-600 px-3 py-2 text-[11px] text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copiedEditorial ? 'JSON redazione copiato' : 'Copia JSON redazione'}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !geminiEligibility.ok
                        || geminiPreviewLoading
                        || !editorialBenchReady
                      }
                      onClick={runGeminiPreview}
                      title={
                        geminiEligibility.ok
                          ? 'Una sola chiamata Gemini sulla 1ª selezione'
                          : (geminiEligibility.message || 'Anteprima non disponibile')
                      }
                      className="rounded-lg bg-violet-800/90 px-3 py-2 text-[11px] font-medium text-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {geminiPreviewLoading
                        ? 'Generazione in corso…'
                        : 'Genera anteprima con Gemini'}
                    </button>
                  </div>
                  {editorialError ? (
                    <p className="rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200">
                      {editorialError}
                    </p>
                  ) : null}
                  {editorialSummaryFirst ? (
                    <EditorialBenchSummary
                      title="A · Selezione redazionale (seed, non Gemini)"
                      summary={editorialSummaryFirst}
                      report={editorialFirst}
                    />
                  ) : null}
                  {editorialSummarySecond ? (
                    <EditorialBenchSummary
                      title="2ª selezione (anti-ripetizione in RAM · non usata da Gemini)"
                      summary={editorialSummarySecond}
                      report={editorialSecond}
                    />
                  ) : null}

                  {/* Sempre visibile: stato generazione + C · Diagnostici (anche senza tentativo). */}
                  <div className="mt-2 space-y-2 rounded-lg border border-violet-900/50 bg-violet-950/20 p-3">
                    <h4 className="text-[11px] font-medium uppercase tracking-wide text-violet-200/90">
                      Anteprima Gemini (nessuna pubblicazione · solo RAM React)
                    </h4>
                    <p className="rounded border border-violet-800/60 bg-violet-950/40 px-2 py-1.5 text-[11px] text-violet-100">
                      <span className="font-medium">{geminiBenchStatus.label}</span>
                      <span className="mt-0.5 block text-violet-200/85">{geminiBenchStatus.detail}</span>
                    </p>
                    {geminiPreviewError ? (
                      <p className="rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200">
                        {geminiPreviewError}
                      </p>
                    ) : null}

                    {geminiBenchStatus.sessionHasGeminiResult ? (
                      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] text-zinc-300">
                        <div className="font-medium text-zinc-100">B · Edizione scritta</div>
                        {geminiPreview?.ok && geminiPreview.displayText ? (
                          <pre className="mt-1 max-h-72 whitespace-pre-wrap overflow-auto text-[10px] leading-snug text-zinc-200">
                            {geminiPreview.displayText}
                          </pre>
                        ) : (
                          <p className="mt-1 text-zinc-500">
                            Nessuna edizione Gemini accettata. I seed della sezione A restano la
                            selezione redazionale; non confonderli con articoli generati.
                          </p>
                        )}
                      </div>
                    ) : null}

                    <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] text-zinc-300">
                      <div className="font-medium text-zinc-100">C · Diagnostici generazione</div>
                      <ul className="mt-1 space-y-0.5 text-zinc-400">
                        <li>codice stato: {geminiBenchStatus.code}</li>
                        <li>stato pipeline: {geminiPreview?.status || (geminiPreviewLoading ? 'loading' : 'nessun_tentativo_in_sessione')}</li>
                        <li>modello: {geminiPreview?.model || '—'}</li>
                        <li>chiamate in sessione: {geminiPreview?.callCount ?? 0}</li>
                        <li>proseSource: {geminiPreview?.proseSource || '—'}</li>
                        <li>validazione: {geminiPreview
                          ? (geminiPreview.aiValidation?.ok ? 'ok' : 'fallita')
                          : 'n/d'}</li>
                        <li>
                          errori: {(geminiPreview?.aiValidation?.errors || []).slice(0, 12).join(', ')
                            || (geminiBenchStatus.sessionHasGeminiResult ? '—' : 'nessun risultato da validare')}
                        </li>
                        <li>
                          raw Gemini in sessione:{' '}
                          {geminiPreview?.rawAiOutput || geminiReviewClipboard?.rawAiAvailableInSession
                            ? 'sì (RAM) — copiabile con il pulsante sotto'
                            : 'no — persa con hot-reload / refresh / nuova «Prova redazione»'}
                        </li>
                        <li>
                          JSON revisione copiabile ora:{' '}
                          {geminiBenchStatus.canCopyReviewJson ? 'sì (anche se respinta)' : 'no'}
                        </li>
                        <li>
                          persistenza: Firebase write 0 · localStorage no · pubblicato no
                        </li>
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-zinc-800 pt-2">
                        <button
                          type="button"
                          disabled={!geminiBenchStatus.canCopyReviewJson}
                          onClick={handleCopyGeminiJson}
                          className="rounded-lg bg-violet-700/90 px-3 py-2 text-[11px] font-medium text-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {copiedGeminiJson
                            ? 'JSON revisione Gemini copiato'
                            : 'Copia JSON revisione Gemini'}
                        </button>
                        <button
                          type="button"
                          disabled={!geminiPreview?.displayText}
                          onClick={handleCopyGeminiText}
                          className="rounded-lg border border-violet-700/80 px-3 py-1.5 text-[11px] text-violet-100 disabled:opacity-40"
                        >
                          {copiedGeminiText ? 'Testo copiato' : 'Copia testo edizione'}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10px] text-violet-200/80">
                        «Copia JSON revisione Gemini» resta utilizzabile dopo un rifiuto, finché
                        lo stato React non viene azzerato. Non confondere con «Copia JSON redazione»
                        (seed) né con «Copia JSON» del dossier.
                      </p>
                    </div>
                  </div>
                </section>
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
