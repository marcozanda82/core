/**
 * Banco di prova redazione Focus (P6.3-V2 + P6.5 edizioni).
 * Solo memoria già caricata — zero Firebase / Gemini / publish.
 */

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { previousEqualLengthWindow } from '../edition/aggregateEditionWindows.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import {
  FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
  FOCUS_EDITION_BENCH_PRESETS,
  FOCUS_EDITION_KIND,
  resolveEditionWindows,
} from '../edition/editionCalendar.js';
import { FOCUS_VERIFICATION_STATUS } from '../edition/editionVerification.js';
import {
  SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
} from '../editorial/composeSleepRoutineEditorial.js';
import { MONTH_CENTERPIECE_TOPIC_ID } from '../editorial/composeMonthCenterpiece.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from '../editorial/composeWeekCenterpiece.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
  SLEEP_ROUTINE_EDITORIAL_FAMILY,
} from '../editorial/focusEditorialMemory.js';
import { rankFocusCandidates } from '../editorial/rankFocusCandidates.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import {
  addCalendarDays,
  assertPublicationFollowsAnalysis,
  isIsoDateString,
} from '../normalize/focusDateUtils.js';
import {
  resolveFocusBodyWeight,
  resolveFocusTargetsFromProfile,
} from '../server/reader/resolveFocusProfileData.js';
import { getTrackerDayNode } from './buildFocusLabDossier.js';

export const FOCUS_EDITORIAL_BENCH_SCHEMA = 'kentu.focusEditorialBench.v1';

/** Date di prova iniziali richieste da P6.3-V2. */
export const FOCUS_EDITORIAL_BENCH_DEFAULT_DATES = Object.freeze({
  analysisDate: '2026-10-18',
  publicationDate: '2026-10-19',
});

export {
  FOCUS_EDITION_BENCH_AS_OF_DEFAULT,
  FOCUS_EDITION_BENCH_PRESETS,
  FOCUS_EDITION_KIND,
  FOCUS_VERIFICATION_STATUS,
};

/**
 * @param {object} editionWindows
 * @param {number} baseHistoryDays
 */
function resolveBenchHistoryFrom(editionWindows, baseHistoryDays) {
  const analysisDate = editionWindows.analysisDate;
  let historyFrom = addCalendarDays(analysisDate, -(baseHistoryDays - 1));
  const consider = (win) => {
    if (!win?.fromDate) return;
    if (win.fromDate < historyFrom) historyFrom = win.fromDate;
    const prev = previousEqualLengthWindow(win);
    if (prev?.fromDate && prev.fromDate < historyFrom) historyFrom = prev.fromDate;
  };
  consider(editionWindows.week);
  consider(editionWindows.month);
  // Cap banco: max 90 giorni indietro senza letture Firebase aggiuntive
  const floor = addCalendarDays(analysisDate, -89);
  if (historyFrom < floor) historyFrom = floor;
  return historyFrom;
}

/**
 * @param {object|null|undefined} fullHistory
 * @param {string} fromDate
 * @param {string} toDate
 */
export function countTrackerNodesInRange(fullHistory, fromDate, toDate) {
  let present = 0;
  let missing = 0;
  if (!isIsoDateString(fromDate) || !isIsoDateString(toDate) || fromDate > toDate) {
    return { present: 0, missing: 0, calendarDays: 0 };
  }
  let cursor = fromDate;
  let calendarDays = 0;
  while (cursor <= toDate) {
    calendarDays += 1;
    if (getTrackerDayNode(fullHistory, cursor)) present += 1;
    else missing += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return { present, missing, calendarDays };
}

/**
 * Costruisce FocusDossier dalla sola RAM (fullHistory già bootstrap).
 * @param {{
 *   fullHistory: object|null|undefined,
 *   fullHistoryLoadState: string,
 *   analysisDate?: string,
 *   publicationDate?: string,
 *   historyDays?: number,
 *   asOfDate?: string,
 *   presetHint?: string,
 *   forceSimulation?: boolean,
 *   userProfile?: object|null,
 *   userTargets?: object|null,
 *   bodyMetrics?: object|null,
 * }} input
 */
export function buildFocusDossierFromInMemoryHistory(input) {
  const loadState = String(input.fullHistoryLoadState || '').trim();
  if (loadState !== 'ready') {
    return {
      ok: false,
      code: 'history_not_ready',
      message: 'Prova redazione disponibile solo con fullHistoryLoadState === ready. '
        + 'La cache parziale (~15 giorni) non è uno storico d30 completo.',
      dossier: null,
      diagnostics: { loadState },
    };
  }

  const publicationDate = input.publicationDate
    || FOCUS_EDITORIAL_BENCH_DEFAULT_DATES.publicationDate;
  if (!isIsoDateString(publicationDate)) {
    return {
      ok: false,
      code: 'invalid_dates',
      message: 'publicationDate deve essere YYYY-MM-DD',
      dossier: null,
      diagnostics: {},
    };
  }
  const editionWindows = resolveEditionWindows(publicationDate);
  if (!editionWindows.ok) {
    return {
      ok: false,
      code: 'edition_windows_invalid',
      message: editionWindows.reason || 'finestre edizione non valide',
      dossier: null,
      diagnostics: {},
    };
  }
  const analysisDate = input.analysisDate || editionWindows.analysisDate;
  if (!isIsoDateString(analysisDate)) {
    return {
      ok: false,
      code: 'invalid_dates',
      message: 'analysisDate deve essere YYYY-MM-DD',
      dossier: null,
      diagnostics: {},
    };
  }
  const relation = assertPublicationFollowsAnalysis(analysisDate, publicationDate);
  if (!relation.ok) {
    return {
      ok: false,
      code: relation.reason,
      message: `Date edizione non valide: ${relation.reason}`,
      dossier: null,
      diagnostics: { expected: relation.expected },
    };
  }

  const fullHistory = input.fullHistory;
  if (!fullHistory || typeof fullHistory !== 'object') {
    return {
      ok: false,
      code: 'fullHistory_missing',
      message: 'fullHistory assente in memoria.',
      dossier: null,
      diagnostics: {},
    };
  }

  const baseHistoryDays = Math.max(7, Math.min(60, Number(input.historyDays) || 30));
  const historyFrom = resolveBenchHistoryFrom(editionWindows, baseHistoryDays);
  const historyDays = Math.max(
    1,
    Math.round(
      (new Date(`${analysisDate}T12:00:00`) - new Date(`${historyFrom}T12:00:00`))
        / 86400000,
    ) + 1,
  );
  const nodeCoverage = countTrackerNodesInRange(
    fullHistory,
    historyFrom,
    publicationDate,
  );

  const profileTargetsRoot = {
    profile: input.userProfile || null,
    targets: input.userTargets || null,
  };
  const targetsPack = resolveFocusTargetsFromProfile(profileTargetsRoot, analysisDate);
  const weightPack = resolveFocusBodyWeight(
    input.bodyMetrics,
    input.userProfile || null,
    analysisDate,
  );

  /** @type {string[]} */
  const fieldsMissing = [];
  if (targetsPack.targets?.kcal == null && targetsPack.targets?.proteinG == null) {
    fieldsMissing.push('targets.kcal_or_proteinG');
  }
  if (weightPack.bodyWeightKg == null) {
    fieldsMissing.push('body.weightKg');
  }

  const analysisDayNode = getTrackerDayNode(fullHistory, analysisDate);
  const publicationDayNode = getTrackerDayNode(fullHistory, publicationDate);
  if (!analysisDayNode) fieldsMissing.push(`trackerStorico_${analysisDate}`);
  if (!publicationDayNode) fieldsMissing.push(`trackerStorico_${publicationDate}`);

  /** @type {object[]} */
  const historyDayBriefs = [];
  let cursor = historyFrom;
  while (cursor <= analysisDate) {
    const sleepStorageDate = addCalendarDays(cursor, 1);
    historyDayBriefs.push(
      buildDayBrief({
        date: cursor,
        dayNode: getTrackerDayNode(fullHistory, cursor),
        sleepNode: getTrackerDayNode(fullHistory, sleepStorageDate),
        sleepStorageDate,
        bodyWeightKg: cursor === analysisDate ? weightPack.bodyWeightKg : null,
      }),
    );
    cursor = addCalendarDays(cursor, 1);
  }

  const dossier = buildFocusDossier({
    analysisDate,
    publicationDate,
    analysisDayNode,
    publicationDayNode,
    targets: targetsPack.targets || undefined,
    targetMeta: {
      referenceDate: targetsPack.provenance?.referenceDate || null,
      proteinSource: targetsPack.provenance?.proteinSource || null,
      kcalSource: targetsPack.provenance?.kcalSource || null,
    },
    bodyWeightKg: weightPack.bodyWeightKg,
    bodyMeasuredOn: weightPack.bodyMeasuredOn,
    historyDayBriefs,
    generatedAt: new Date().toISOString(),
  });

  const asOfDate = isIsoDateString(input.asOfDate)
    ? input.asOfDate
    : FOCUS_EDITION_BENCH_AS_OF_DEFAULT;

  attachEditionPerspective(dossier, historyDayBriefs, {
    seriesFrom: historyFrom,
    seriesTo: analysisDate,
    asOfDate,
    presetHint: input.presetHint || null,
    forceSimulation: Boolean(input.forceSimulation),
  });

  const sleepRoutine = dossier.sleepRoutine || null;
  const sleepRoutinePresent = Boolean(
    sleepRoutine
    && sleepRoutine.aggregate
    && Array.isArray(sleepRoutine.nights)
    && sleepRoutine.nights.length > 0,
  );
  if (!sleepRoutinePresent) {
    fieldsMissing.push('sleepRoutine');
  }

  const edition = dossier.edition || null;
  const weekEval = edition?.evaluable?.weekCenterpiece;
  const monthEval = edition?.evaluable?.monthCenterpiece;
  const specialNeedsCenterpiece = edition?.editionKind
    && edition.editionKind !== FOCUS_EDITION_KIND.daily;
  const centerpieceUnevaluable = Boolean(
    specialNeedsCenterpiece
    && (
      (edition.editionKind === FOCUS_EDITION_KIND.sunday_plus && !weekEval)
      || (edition.editionKind === FOCUS_EDITION_KIND.month_plus && !monthEval)
      || (edition.editionKind === FOCUS_EDITION_KIND.sunday_month_plus
        && !monthEval && !weekEval)
    ),
  );

  return {
    ok: true,
    code: null,
    message: null,
    dossier,
    diagnostics: {
      loadState,
      analysisDate,
      publicationDate,
      editionKind: edition?.editionKind || FOCUS_EDITION_KIND.daily,
      asOfDate,
      verificationStatus: edition?.verificationStatus || null,
      historyDays,
      historyFrom,
      nodeCoverage,
      fieldsMissing,
      editionWindows: {
        week: editionWindows.week,
        month: editionWindows.month,
      },
      editionCoverage: {
        week: edition?.week?.aggregate?.coverage || null,
        month: edition?.month?.aggregate?.coverage || null,
        weekComparison: edition?.week?.comparison || null,
        monthComparison: edition?.month?.comparison || null,
        evaluable: edition?.evaluable || null,
        notes: edition?.notes || [],
      },
      centerpieceUnevaluable,
      futureHistoryLoadHints: editionWindows.futureHistoryLoadHints,
      sleepRoutinePresent,
      sleepRoutineNights: sleepRoutine?.nights?.length ?? 0,
      sleepRoutineLogged: sleepRoutine?.aggregate?.coverage?.nightsLogged ?? 0,
      ordinaryNights: sleepRoutine?.aggregate?.coverage?.ordinaryNightsLogged ?? null,
      unusualNights: sleepRoutine?.aggregate?.anomalies?.unusualNights ?? null,
      anomalySample: (sleepRoutine?.nights || [])
        .filter((n) => n.timingClass && n.timingClass !== 'ordinary')
        .slice(0, 5)
        .map((n) => ({
          nightEndedOn: n.nightEndedOn,
          timingClass: n.timingClass,
          wakeTime: n.wakeTime?.value ?? null,
          bedtime: n.bedtime?.value ?? null,
          hours: n.hours?.value ?? null,
          bedtimeProvenance: n.bedtime?.provenance ?? null,
        })),
      targetsProvenance: targetsPack.provenance || null,
      bodyProvenance: {
        provenance: weightPack.provenance,
        measuredOn: weightPack.bodyMeasuredOn,
        source: weightPack.source,
      },
      rtdbReads: 0,
      firebaseWrites: 0,
      gemini: false,
    },
  };
}

/**
 * @param {object} newsItem
 */
function slimNews(newsItem) {
  if (!newsItem) return null;
  return {
    id: newsItem.id,
    topicId: newsItem.topicId,
    role: newsItem.role,
    domain: newsItem.domain,
    tone: newsItem.tone,
    claimType: newsItem.claimType,
    score: newsItem.score,
    evidenceQuality: newsItem.evidenceQuality,
    novelty: newsItem.novelty,
    reliability: newsItem.reliability ?? null,
    editorialFamily: newsItem.editorialFamily ?? null,
    editorialScale: newsItem.editorialScale ?? null,
    evidenceFingerprint: newsItem.evidenceFingerprint ?? null,
    memberTopicIds: newsItem.memberTopicIds ?? null,
    observedPeriod: newsItem.observedPeriod ?? null,
    seed: {
      headline: newsItem.headlineSeed || null,
      summary: newsItem.summarySeed || null,
    },
    limitations: newsItem.limitations || [],
    doNotClaim: newsItem.doNotClaim || [],
    coverage: newsItem.coverage ?? null,
    metrics: Array.isArray(newsItem.metrics)
      ? newsItem.metrics.map((m) => ({
        path: m.path,
        value: m.value,
        unit: m.unit,
        provenance: m.provenance,
      }))
      : [],
  };
}

/**
 * @param {object[]} ranked
 * @param {object} selection
 */
function buildCandidateRows(ranked, selection) {
  const selectedById = new Map();
  const pushSel = (item, position) => {
    if (!item) return;
    selectedById.set(item.id?.replace(/^news_/, 'sig_') || item.topicId, {
      position,
      item,
    });
    // also key by news id without prefix variants
    if (item.id) selectedById.set(item.id, { position, item });
  };
  pushSel(selection.lead, 'apertura');
  pushSel(selection.centerpiece, 'articolo_centrale');
  for (const g of selection.goodNews || []) pushSel(g, 'buona_notizia');
  for (const f of selection.features || []) pushSel(f, 'approfondimento');
  for (const cont of selection.continuity || []) pushSel(cont, 'continuita');
  for (const c of selection.concerns || []) pushSel(c, 'attenzione');
  if (selection.coach) {
    selectedById.set(selection.coach.templateId || 'coach', {
      position: 'consiglio',
      item: selection.coach,
    });
  }

  const omittedById = new Map(
    (selection.omitted || []).map((o) => [o.candidateId, o.reason]),
  );

  return (Array.isArray(ranked) ? ranked : []).map((c, index) => {
    const newsId = `news_${String(c.id || '').replace(/^sig_/, '')}`;
    const sel = selectedById.get(c.id) || selectedById.get(newsId);
    const omitReason = omittedById.get(c.id)
      || omittedById.get(newsId)
      || c.omitReason
      || null;
    // Mai «selected» e «excluded» insieme: se è in omitted e non in edition, resta excluded.
    const outcome = sel
      ? 'selected'
      : (omitReason ? 'excluded' : 'not_placed');
    return {
      rank: index + 1,
      id: c.id,
      topicId: c.topicId,
      domain: c.domain,
      typology: c.typology || null,
      storyClass: c.storyClass || null,
      score: c.score,
      evidenceQuality: c.evidenceQuality,
      novelty: c.novelty,
      reliability: c.reliability ?? null,
      publishable: c.publishable !== false && !c.omitReason,
      editorialFamily: c.editorialFamily ?? null,
      memberTopicIds: c.memberTopicIds ?? null,
      conflictsWithTopicIds: c.conflictsWithTopicIds ?? null,
      outcome,
      position: sel?.position || null,
      excludeReason: sel ? null : omitReason,
      seed: {
        headline: c.headlineSeed || null,
        summary: c.summarySeed || null,
      },
      metrics: Array.isArray(c.metrics)
        ? c.metrics.map((m) => ({
          path: m.path,
          value: m.value,
          unit: m.unit,
          provenance: m.provenance,
        }))
        : [],
      coverage: c.coverage ?? null,
      observedPeriod: c.observedPeriod ?? null,
      evidenceFingerprint: c.evidenceFingerprint ?? null,
    };
  });
}

/**
 * @param {object[]} candidates
 * @param {object} selection
 */
function describeSleepWeeklyRhythm(candidates, selection) {
  const cand = (candidates || []).find((c) => c.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID);
  if (!cand) {
    return {
      status: 'not_generated',
      reason: 'compose_returned_null_or_insufficient_signals',
      position: null,
      fingerprint: null,
    };
  }
  const allNews = [
    selection.lead,
    ...(selection.goodNews || []),
    ...(selection.features || []),
    ...(selection.continuity || []),
    ...(selection.concerns || []),
  ].filter(Boolean);
  const placed = allNews.find((n) => n.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID);
  if (placed) {
    return {
      status: 'selected',
      reason: null,
      position: placed.role === 'lead'
        ? 'apertura'
        : placed.role === 'good'
          ? 'buona_notizia'
          : placed.role === 'feature'
            ? 'approfondimento'
            : placed.role,
      fingerprint: placed.evidenceFingerprint || cand.evidenceFingerprint || null,
      score: placed.score ?? cand.score,
      memberTopicIds: placed.memberTopicIds || cand.memberTopicIds || [],
    };
  }
  const omit = (selection.omitted || []).find(
    (o) => o.candidateId === cand.id || String(o.candidateId).includes('sleep_weekly'),
  );
  return {
    status: 'excluded',
    reason: omit?.reason || cand.omitReason || 'not_selected_after_ranking',
    position: null,
    fingerprint: cand.evidenceFingerprint || null,
    score: cand.score,
    memberTopicIds: cand.memberTopicIds || [],
  };
}

/**
 * Prima selezione (memoria vuota) o seconda (anti-ripetizione in RAM).
 * @param {{
 *   fullHistory: object|null|undefined,
 *   fullHistoryLoadState: string,
 *   analysisDate?: string,
 *   publicationDate?: string,
 *   historyDays?: number,
 *   userProfile?: object|null,
 *   userTargets?: object|null,
 *   bodyMetrics?: object|null,
 *   mode?: 'first'|'second_anti_repeat',
 *   priorBenchReport?: object|null,
 * }} input
 */
export function runFocusEditorialBench(input) {
  const mode = input.mode === 'second_anti_repeat' ? 'second_anti_repeat' : 'first';
  const built = buildFocusDossierFromInMemoryHistory(input);
  if (!built.ok) {
    return {
      schema: FOCUS_EDITORIAL_BENCH_SCHEMA,
      ok: false,
      mode,
      error: { code: built.code, message: built.message },
      diagnostics: built.diagnostics,
      dataOrigin: 'real_in_memory_fullHistory',
      rtdbReads: 0,
      firebaseWrites: 0,
      gemini: false,
      publish: false,
      texts: { kind: 'none', note: 'Nessun seed: dossier non costruito.' },
    };
  }

  const { dossier, diagnostics } = built;
  const publicationDate = diagnostics.publicationDate;

  /** @type {object|null} */
  let memory = createEmptyEditorialMemory();
  let memorySimulation = {
    kind: 'empty',
    counterfactual: false,
    note: 'Memoria editoriale vuota (nessuna pubblicazione precedente finta).',
  };

  if (mode === 'second_anti_repeat') {
    const prior = input.priorBenchReport;
    const priorCenter = prior?.centerpiece?.item || prior?.edition?.centerpiece || null;
    const priorSleep = prior?.sleepWeeklyRhythm || null;

    if (priorCenter?.topicId && priorCenter?.evidenceFingerprint) {
      memory = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
        publicationDate,
        revision: 1,
        selection: {
          lead: null,
          centerpiece: {
            topicId: priorCenter.topicId,
            editorialScale: priorCenter.editorialScale
              || (priorCenter.topicId === MONTH_CENTERPIECE_TOPIC_ID
                ? 'month_transformation'
                : 'week_interpretation'),
            evidenceFingerprint: priorCenter.evidenceFingerprint,
          },
          goodNews: [],
          features: [],
          concerns: [],
          coach: null,
        },
        updatedAt: new Date().toISOString(),
      });
      memorySimulation = {
        kind: 'simulated_prior_centerpiece',
        counterfactual: false,
        note: `Memoria in-RAM: pubblicazione del centerpiece ${priorCenter.topicId} `
          + `il ${publicationDate} (stessi dati; prova anti-ripetizione di scala).`,
        publishedTopicId: priorCenter.topicId,
        evidenceFingerprint: priorCenter.evidenceFingerprint,
        simulatedPublishDate: publicationDate,
      };
    } else {
      const sleepCand = prior?.candidates?.find(
        (c) => c.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
      );
      const fingerprint = priorSleep?.fingerprint
        || sleepCand?.evidenceFingerprint
        || null;
      const wasSelected = priorSleep?.status === 'selected';
      const wasGenerated = priorSleep?.status === 'selected'
        || priorSleep?.status === 'excluded'
        || Boolean(sleepCand);

      if (!fingerprint && !wasGenerated) {
        memorySimulation = {
          kind: 'counterfactual_unavailable',
          counterfactual: true,
          note: 'Nella prima prova sleep_weekly_rhythm non è stato generato: '
            + 'impossibile simulare fingerprint reale. Memoria resta vuota.',
        };
      } else {
        const fp = fingerprint || 'unavailable';
        memory = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
          publicationDate,
          revision: 1,
          selection: {
            lead: null,
            goodNews: [],
            features: [{
              topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
              editorialFamily: SLEEP_ROUTINE_EDITORIAL_FAMILY,
              evidenceFingerprint: fp,
            }],
            concerns: [],
            coach: null,
          },
          updatedAt: new Date().toISOString(),
        });
        memorySimulation = {
          kind: wasSelected ? 'simulated_prior_publish' : 'counterfactual_prior_publish',
          counterfactual: !wasSelected,
          note: wasSelected
            ? 'Memoria in-RAM: pubblicazione riuscita di sleep_weekly_rhythm il '
              + `${publicationDate} (stessi dati; non è un’edizione del giorno dopo).`
            : 'CONTROFATTUALE: sleep_weekly_rhythm non era in edizione nella prima prova; '
              + 'si simula comunque la sua pubblicazione per testare l’anti-ripetizione.',
          publishedTopicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
          editorialFamily: SLEEP_ROUTINE_EDITORIAL_FAMILY,
          evidenceFingerprint: fp,
          simulatedPublishDate: publicationDate,
        };
      }
    }
  }

  const rawSignals = extractFocusSignals(dossier, memory);
  const ranked = rankFocusCandidates(rawSignals, { memory, publicationDate });
  const selection = selectFocusEditorial({ dossier, memory });
  const candidates = buildCandidateRows(ranked, selection);
  const sleepWeeklyRhythm = describeSleepWeeklyRhythm(ranked, selection);
  const centerpieceTopic = selection.centerpiece?.topicId || null;

  return {
    schema: FOCUS_EDITORIAL_BENCH_SCHEMA,
    ok: true,
    mode,
    dataOrigin: 'real_in_memory_fullHistory',
    selectionKind: 'deterministic_editorial_pipeline',
    memorySimulation,
    dates: {
      analysisDate: diagnostics.analysisDate,
      publicationDate: diagnostics.publicationDate,
      lastCompletedNightExpected: diagnostics.publicationDate,
      editionKind: diagnostics.editionKind,
      weekWindow: diagnostics.editionWindows?.week || null,
      monthWindow: diagnostics.editionWindows?.month || null,
    },
    diagnostics: {
      ...diagnostics,
      note: 'Zero letture/scritture Firebase in questo banco. Cache 15g non usata come d30. '
        + 'Edizioni week/month: copertura = storico RAM; confronti assenti se finestre incomplete.',
    },
    sleepWeeklyRhythm,
    centerpiece: {
      topicId: centerpieceTopic,
      status: selection.centerpiece
        ? 'selected'
        : (diagnostics.centerpieceUnevaluable ? 'unevaluable' : 'not_selected'),
      omitReason: (!selection.centerpiece
        && (selection.omitted || []).find((o) => String(o.candidateId || '').includes('week_habits')
          || String(o.candidateId || '').includes('month_habits'))?.reason)
        || null,
      item: slimNews(selection.centerpiece),
      weekEligible: dossier.edition?.evaluable?.weekCenterpiece ?? false,
      monthEligible: dossier.edition?.evaluable?.monthCenterpiece ?? false,
    },
    edition: {
      editionKind: selection.editionKind || diagnostics.editionKind,
      asOfDate: diagnostics.asOfDate,
      verificationStatus: diagnostics.verificationStatus,
      openingMode: selection.openingMode,
      lead: slimNews(selection.lead),
      centerpiece: slimNews(selection.centerpiece),
      overlapResolution: selection.overlapResolution || null,
      goodNews: (selection.goodNews || []).map(slimNews),
      features: (selection.features || []).map(slimNews),
      continuity: (selection.continuity || []).map(slimNews),
      concerns: (selection.concerns || []).map(slimNews),
      coach: selection.coach
        ? {
          position: 'consiglio',
          templateId: selection.coach.templateId,
          editionScale: selection.coach.editionScale || 'episode',
          seed: { text: selection.coach.textSeed || null },
          note: 'Seed consiglio — non articolo Gemini.',
        }
        : null,
      coachAbsentReason: selection.coach
        ? null
        : (diagnostics.editionKind !== FOCUS_EDITION_KIND.daily
          ? 'no_founded_coach_for_edition_scale'
          : 'no_coach_selected'),
      omitted: selection.omitted || [],
      editorialNotes: selection.editorialNotes || [],
    },
    /** Selection completa per anteprima scrittura (P6.6) — non è prosa Gemini. */
    selectionForWriting: selection,
    candidates,
    texts: {
      kind: 'seed_only',
      note: 'Solo seed editoriali (headlineSeed/summarySeed). Nessun articolo generato / nessun Gemini.',
    },
    rtdbReads: 0,
    firebaseWrites: 0,
    gemini: false,
    publish: false,
    memoryPersisted: false,
  };
}

/**
 * @param {object} report
 */
export function summarizeFocusEditorialBench(report) {
  if (!report?.ok) {
    return {
      ok: false,
      error: report?.error?.message || 'errore',
      mode: report?.mode || null,
    };
  }
  return {
    ok: true,
    mode: report.mode,
    analysisDate: report.dates?.analysisDate,
    publicationDate: report.dates?.publicationDate,
    editionKind: report.dates?.editionKind || report.edition?.editionKind || null,
    asOfDate: report.diagnostics?.asOfDate || report.edition?.asOfDate || null,
    verificationStatus: report.diagnostics?.verificationStatus
      || report.edition?.verificationStatus
      || null,
    weekWindow: report.dates?.weekWindow || null,
    monthWindow: report.dates?.monthWindow || null,
    centerpieceTopic: report.centerpiece?.topicId || null,
    centerpieceStatus: report.centerpiece?.status || null,
    centerpieceOmitReason: report.centerpiece?.omitReason || null,
    overlapResolution: report.edition?.overlapResolution || null,
    editionCoverage: report.diagnostics?.editionCoverage || null,
    centerpieceUnevaluable: Boolean(report.diagnostics?.centerpieceUnevaluable),
    sleepRoutinePresent: report.diagnostics?.sleepRoutinePresent,
    sleepWeeklyRhythm: report.sleepWeeklyRhythm?.status,
    sleepWeeklyPosition: report.sleepWeeklyRhythm?.position,
    sleepWeeklyReason: report.sleepWeeklyRhythm?.reason,
    memoryKind: report.memorySimulation?.kind,
    counterfactual: Boolean(report.memorySimulation?.counterfactual),
    leadTopic: report.edition?.lead?.topicId || null,
    goodCount: report.edition?.goodNews?.length ?? 0,
    featureCount: report.edition?.features?.length ?? 0,
    continuityCount: report.edition?.continuity?.length ?? 0,
    concernCount: report.edition?.concerns?.length ?? 0,
    hasCoach: Boolean(report.edition?.coach),
    candidateCount: report.candidates?.length ?? 0,
    textsKind: report.texts?.kind,
    rtdbReads: report.rtdbReads,
  };
}

/** @deprecated alias — preferire WEEK/MONTH topic constants dai composer */
export const CENTERPIECE_TOPICS = Object.freeze({
  week: WEEK_CENTERPIECE_TOPIC_ID,
  month: MONTH_CENTERPIECE_TOPIC_ID,
});
