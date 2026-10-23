/**
 * Costruisce il view-model prodotto Focus per un periodo (Ieri / Settimana / Mese).
 * Pipeline: demo history → dossier/bench → prosa fallback → chart series.
 */

import {
  buildFocusDossierFromInMemoryHistory,
  runFocusEditorialBench,
} from '../lab/runFocusEditorialBench.js';
import { generateFocusWrittenEdition } from '../editorial/writing/generateFocusWrittenEdition.js';
import {
  buildFocusDemoProfilePack,
  buildFocusDemoTrackerHistory,
} from './buildFocusDemoTrackerHistory.js';
import { buildFocusProductChartSeries } from './buildFocusProductChartSeries.js';
import {
  FOCUS_PRODUCT_DEMO_BANNER,
  resolveFocusProductPeriod,
} from './focusProductPeriods.js';
import { mapWrittenEditionToCoachSections } from './mapWrittenEditionToCoachSections.js';

let cachedDemoHistory = null;

function getDemoHistory() {
  if (!cachedDemoHistory) {
    cachedDemoHistory = buildFocusDemoTrackerHistory({
      anchorDate: '2026-10-19',
      historyDays: 70,
    });
  }
  return cachedDemoHistory;
}

/**
 * Titolo hero per periodo — non riusa il masthead editoriale (spesso lead ripetuto).
 * @param {object} period
 * @param {object} dates
 */
function buildPeriodHeadline(period, dates) {
  const label = period?.label || 'Focus';
  if (period?.id === 'settimana' && dates?.weekWindow?.fromDate && dates?.weekWindow?.toDate) {
    return {
      title: `Focus · ${label}`,
      subtitle: `Settimana completata ${dates.weekWindow.fromDate} → ${dates.weekWindow.toDate}`,
    };
  }
  if (period?.id === 'mese' && dates?.monthWindow?.fromDate && dates?.monthWindow?.toDate) {
    return {
      title: `Focus · ${label}`,
      subtitle: `Mese completato ${dates.monthWindow.fromDate} → ${dates.monthWindow.toDate}`,
    };
  }
  if (dates?.analysisDate) {
    return {
      title: `Focus · ${label}`,
      subtitle: `Giorno di riferimento ${dates.analysisDate}`,
    };
  }
  return {
    title: `Focus · ${label}`,
    subtitle: period?.description || 'Edizione dimostrativa',
  };
}

/**
 * @param {string} periodId
 * @returns {Promise<object>}
 */
export async function buildFocusProductEdition(periodId) {
  const { period, preset } = resolveFocusProductPeriod(periodId);
  const fullHistory = getDemoHistory();
  const profilePack = buildFocusDemoProfilePack();

  const dossierInput = {
    fullHistory,
    fullHistoryLoadState: 'ready',
    publicationDate: preset.publicationDate,
    historyDays: 45,
    forceSimulation: true,
    presetHint: preset.id,
    userProfile: profilePack.userProfile,
    userTargets: profilePack.userTargets,
    bodyMetrics: profilePack.bodyMetrics,
  };

  const built = buildFocusDossierFromInMemoryHistory(dossierInput);
  const bench = runFocusEditorialBench({
    ...dossierInput,
    mode: 'first',
  });

  if (!bench?.ok) {
    return {
      ok: false,
      demo: true,
      demoBanner: FOCUS_PRODUCT_DEMO_BANNER,
      period,
      preset: { id: preset.id, label: preset.label, publicationDate: preset.publicationDate },
      error: {
        code: bench?.error?.code || 'bench_failed',
        message: bench?.error?.message
          || 'Impossibile costruire l’edizione Focus dai dati dimostrativi.',
      },
      coachView: null,
      charts: null,
      headline: buildPeriodHeadline(period, null),
      diagnostics: bench?.diagnostics || null,
    };
  }

  const selection = bench.selectionForWriting;
  if (!selection) {
    return {
      ok: false,
      demo: true,
      demoBanner: FOCUS_PRODUCT_DEMO_BANNER,
      period,
      preset: { id: preset.id, label: preset.label, publicationDate: preset.publicationDate },
      error: {
        code: 'selection_missing',
        message: 'Selezione editoriale assente: nessuna prosa da mostrare.',
      },
      coachView: null,
      charts: null,
      headline: buildPeriodHeadline(period, bench.dates),
      diagnostics: bench.diagnostics || null,
    };
  }

  let writing;
  try {
    writing = await generateFocusWrittenEdition({
      selection,
      memory: null,
      locale: 'it-IT',
      geminiProvider: null,
    });
  } catch (err) {
    return {
      ok: false,
      demo: true,
      demoBanner: FOCUS_PRODUCT_DEMO_BANNER,
      period,
      preset: { id: preset.id, label: preset.label, publicationDate: preset.publicationDate },
      error: {
        code: 'writing_failed',
        message: err?.message || 'Generazione prosa fallita.',
      },
      coachView: null,
      charts: null,
      headline: buildPeriodHeadline(period, bench.dates),
      diagnostics: bench.diagnostics || null,
    };
  }

  const coachView = mapWrittenEditionToCoachSections({
    written: writing.written,
    selection,
  });

  const dates = {
    analysisDate: bench.dates?.analysisDate || selection.analysisDate,
    publicationDate: bench.dates?.publicationDate || selection.publicationDate,
    editionKind: bench.dates?.editionKind || selection.editionKind,
    weekWindow: bench.dates?.weekWindow || null,
    monthWindow: bench.dates?.monthWindow || null,
  };

  const charts = buildFocusProductChartSeries({
    periodId: period.id,
    dossier: built.ok ? built.dossier : null,
    fullHistory,
    dates,
  });

  const hasAnyItem = ['bene', 'attenzione', 'migliora']
    .some((key) => (coachView.sections[key]?.items || []).length > 0)
    || Boolean(coachView.coachAdvice);

  return {
    ok: true,
    demo: true,
    demoBanner: FOCUS_PRODUCT_DEMO_BANNER,
    period,
    preset: {
      id: preset.id,
      label: preset.label,
      publicationDate: preset.publicationDate,
    },
    dates,
    headline: buildPeriodHeadline(period, dates),
    proseSource: writing.proseSource,
    usedFallback: writing.usedFallback !== false,
    empty: !hasAnyItem,
    coachView,
    charts,
    diagnostics: {
      verificationStatus: bench.diagnostics?.verificationStatus || null,
      editionKind: bench.dates?.editionKind || null,
      centerpieceStatus: bench.centerpiece?.status || null,
      dossierOk: Boolean(built.ok),
    },
  };
}
