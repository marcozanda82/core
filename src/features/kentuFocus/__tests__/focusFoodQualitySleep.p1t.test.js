/**
 * FASE B — qualità alimentare + sonno sul fixture diario reale 2026-10-27.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  buildRealSleepNightBrief,
  resolveFoodItemClassification,
  buildFocusFoodQualityBlock,
  requestFocusAiCoachAnalysis,
  markFocusAiAnalysisFreshness,
  createMemoryFocusAiAnalysisStore,
  FOOD_QUALITY_PROVENANCE,
  OFF_CATALOG_STATUS,
  FOCUS_OFF_WAIT_TIMEOUT_MS,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';
import {
  FOCUS_REAL_ANALYSIS_DATE as DAY,
  FOCUS_REAL_PUBLICATION_DATE as PUB,
  FOCUS_REAL_OCT27_CATALOGS as CATALOGS,
  loadFocusDiaryRealOct27,
} from './fixtures/focusDiaryRealOct27.js';

function realSession(uid = 'uid_p1t_real') {
  const fx = loadFocusDiaryRealOct27();
  return resolveFocusPageSession({
    uid,
    periodId: 'ieri',
    handoff: {
      uid,
      fullHistory: fx.fullHistory,
      analysisDate: fx.analysisDate,
      publicationDate: fx.publicationDate,
      userTargets: fx.userTargets,
    },
  });
}

describe('Focus food quality + sleep P1t (fixture reale 2026-10-27)', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('fixture: Duchessa a pranzo ~14:55, sonno 6,5h, niente insalata', () => {
    const fx = loadFocusDiaryRealOct27();
    assert.equal(fx.analysisDate, DAY);
    assert.equal(fx.publicationDate, PUB);
    const node = fx.fullHistory[`trackerStorico_${DAY}`];
    assert.ok(node);
    const pranzoHour = Object.entries(node.mealTimes || {})
      .find(([k]) => /^pranzo/i.test(k))?.[1];
    assert.ok(Number(pranzoHour) >= 14.9 && Number(pranzoHour) < 15.1);

    const session = realSession();
    const built = buildFocusAiCoachDossier(session, { foodCatalogs: CATALOGS });
    assert.equal(built.ok, true);
    const meals = built.dossier.nutrition.meals || [];
    const items = meals.flatMap((m) => (m.items || []).map((it) => ({
      ...it,
      mealLabel: m.mealLabel,
      clockHour: m.clockHour,
    })));
    const duchessa = items.find((it) => /duchessa/i.test(it.name || ''));
    assert.ok(duchessa, 'Duchessa presente');
    assert.match(String(duchessa.mealLabel || ''), /pranzo/i);
    assert.ok(Number(duchessa.clockHour) >= 14.9 && Number(duchessa.clockHour) < 15.1);
    assert.equal(items.some((it) => /insalat/i.test(it.name || '')), false);

    assert.equal(built.dossier.sleep.day.hours, 6.5);
    assert.equal(built.dossier.sleep.day.stagesSuppressed, true);
  });

  it('brief sonno: 6,5h, fasi 60/60 soppresse', () => {
    const fx = loadFocusDiaryRealOct27();
    const brief = buildRealSleepNightBrief(fx.fullHistory, DAY, PUB);
    assert.equal(brief.sleepAvailable, true);
    assert.equal(brief.hours, 6.5);
    assert.equal(brief.deepMin, null);
    assert.equal(brief.remMin, null);
    assert.equal(brief.stagesSuppressed, true);
  });

  it('Duchessa NOVA 4 da catalogo OFF (non CREA)', () => {
    const item = {
      name: 'Torta gelato Duchessa',
      foodDbKey: 'food_1793113115547_Torta_gelato_Duchessa',
      kcal: 357,
    };
    const classified = resolveFoodItemClassification(item, CATALOGS, {
      status: OFF_CATALOG_STATUS.ready,
    });
    assert.equal(classified.novaGroup, 4);
    assert.equal(classified.provenance, FOOD_QUALITY_PROVENANCE.documented);
    assert.match(String(classified.source || ''), /catalog:off|off/i);

    const session = realSession('uid_p1t_nova');
    const built = buildFocusAiCoachDossier(session, { foodCatalogs: CATALOGS });
    const nova4 = built.dossier.nutrition.foodQuality.day.nova4Items || [];
    const duchessa = nova4.find((x) => /duchessa/i.test(x.name));
    assert.ok(duchessa);
    assert.equal(duchessa.novaGroup, 4);
    assert.match(String(duchessa.source || ''), /off/i);
    assert.equal(duchessa.critiqueWorthy, true);
  });

  it('NOVA 4: Duchessa critiqueWorthy; fondente 85% da 20 g no', async () => {
    const { assessNova4CritiqueProfile } = await import('../product/assessNova4CritiqueProfile.js');
    const duchessa = assessNova4CritiqueProfile({
      name: 'Torta gelato Duchessa',
      grams: 120,
      catalogRow: CATALOGS.offDb.food_1793113115547_Torta_gelato_Duchessa,
    });
    assert.equal(duchessa.critiqueWorthy, true);

    const fondente = assessNova4CritiqueProfile({
      name: 'Excellence 85% Cioccolato Rich Dark',
      grams: 20,
      catalogRow: CATALOGS.offDb['excellence 85% cioccolato rich dark'],
    });
    assert.equal(fondente.critiqueWorthy, false);
    assert.equal(fondente.favorableDarkChocolate, true);

    const session = realSession('uid_critique');
    const built = buildFocusAiCoachDossier(session, { foodCatalogs: CATALOGS });
    const nova4 = built.dossier.nutrition.foodQuality.day.nova4Items || [];
    assert.ok(nova4.some((x) => /duchessa/i.test(x.name) && x.critiqueWorthy === true));
  });

  it('name_pattern: torta/succo esclusi; pane integrale name_pattern o catalogo', () => {
    const history = {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        log: [
          { type: 'food', id: 't1', mealType: 'spuntino', name: 'Torta alla frutta', grams: 100, kcal: 280 },
          { type: 'food', id: 't2', mealType: 'colazione', name: 'Succo di frutta', grams: 200, kcal: 90 },
          { type: 'food', id: 't3', mealType: 'colazione', name: 'Pane integrale con semi', grams: 60, kcal: 150 },
        ],
        manualNodes: [],
      },
    };
    const fq = buildFocusFoodQualityBlock({
      fullHistory: history,
      analysisDate: DAY,
      catalogs: { personalDb: {}, kentuItDb: {}, globalDb: {}, offDb: {}, offReady: true },
    });
    assert.equal((fq.day.plantFoods || []).some((p) => /torta|succo/i.test(p.name)), false);
    const grain = (fq.day.wholeGrainFoods || []).find((p) => /pane integrale/i.test(p.name));
    assert.ok(grain);
    assert.equal(grain.provenance, FOOD_QUALITY_PROVENANCE.name_pattern);
  });

  it('OFF not_ready + timeout: partial e stale', async () => {
    assert.equal(FOCUS_OFF_WAIT_TIMEOUT_MS, 8000);
    const fx = loadFocusDiaryRealOct27();
    const session = realSession('uid_p1t_off');
    const catalogsNotReady = {
      personalDb: {},
      kentuItDb: {},
      globalDb: {},
      offDb: {},
      offReady: false,
    };
    // Assicura almeno una key solo-OFF nel giorno
    const dayKey = `trackerStorico_${DAY}`;
    const hist = structuredClone(fx.fullHistory);
    hist[dayKey] = {
      ...hist[dayKey],
      log: [
        ...(hist[dayKey].log || []),
        {
          type: 'food',
          id: 'off_only_test',
          mealType: 'spuntino',
          name: 'Snack solo OFF',
          foodDbKey: 'only_in_off_xyz',
          grams: 40,
          kcal: 180,
        },
      ],
    };
    const session2 = resolveFocusPageSession({
      uid: 'uid_p1t_off',
      periodId: 'ieri',
      handoff: {
        uid: 'uid_p1t_off',
        fullHistory: hist,
        analysisDate: DAY,
        publicationDate: PUB,
        userTargets: fx.userTargets,
      },
    });

    const store = createMemoryFocusAiAnalysisStore();
    const summaryJson = JSON.stringify({
      summary: {
        headline: 'Giorno con catalogo incompleto',
        wentWell: [{ text: 'Pesce a cena con grassi buoni', area: 'qualita', eventRefs: [] }],
        toImprove: [{ text: 'Sonno sotto le 7 ore', area: 'sonno', eventRefs: [] }],
        todayAction: 'Stasera punta a un sonno più lungo anticipando la cena.',
      },
      headline: 'Giorno con catalogo incompleto',
      lead: 'Con catalogo incompleto alcuni alimenti restano da classificare; il sonno sotto le 7 ore resta registrato.',
      sections: [
        { id: 's1', title: 'Cosa osservare', body: 'Rigenera quando il catalogo esterno è pronto.' },
      ],
      recommendedAction: 'Stasera punta a un sonno più lungo anticipando la cena, senza altri cambiamenti drastici.',
      verifyNext: 'Osserva ora cena e ore di sonno per una settimana.',
      primaryPillarId: 'balanced',
      limits: ['Catalogo alimentare incompleto al momento della generazione.', 'Nessuna attività registrata.'],
      evidenceRefs: ['nutrition.foodQuality'],
      claimLayers: {
        recordedFacts: ['Sonno sotto le 7 ore'],
        generalKnowledge: [],
        foundedInferences: [],
        hypothesesToTest: [],
      },
      quantitativeProposal: null,
    });

    const result = await requestFocusAiCoachAnalysis({
      session: session2,
      foodCatalogs: catalogsNotReady,
      offWaitTimeoutMs: 0,
      waitOffFn: async () => ({ offReady: false }),
      peekOffFn: () => ({ offReady: false, offDb: {}, kentuItDb: {}, globalDb: {} }),
      persistence: store,
      force: true,
      askAiFn: async () => summaryJson,
    });

    assert.equal(result.ok, true, result.reason || result.userMessage);
    assert.equal(result.binding.foodQualityCompleteness, 'partial');
    assert.equal(result.binding.definitive, false);
    const marked = markFocusAiAnalysisFreshness(result.record, result.binding.dataVersion);
    assert.equal(marked.diaryStale, true);
  });

  it('segnali: sonno sotto 7h; nessuna attività → limits tip', () => {
    const built = buildFocusAiCoachDossier(realSession('uid_sig'), { foodCatalogs: CATALOGS });
    assert.ok((built.dossier.deterministicSignals.activeIds || []).includes('sleep_under_7h'));
    assert.equal((built.dossier.exercise.workouts || []).length, 0);
  });

  it('fixture reale: bedtime derived da wake−hours; meal_within_3h attivo', () => {
    const built = buildFocusAiCoachDossier(realSession('uid_bed'), { foodCatalogs: CATALOGS });
    assert.equal(built.dossier.sleep.day.bedtime, 0);
    assert.equal(built.dossier.sleep.day.bedtimeProvenance, 'derived');
    assert.ok(
      (built.dossier.sleep.day.metrics || []).some((m) => /addormentamento/i.test(m)),
    );
    const sig = (built.dossier.deterministicSignals.signals || [])
      .find((s) => s.id === 'meal_within_3h_of_bedtime');
    assert.ok(sig);
    assert.equal(sig.active, true);
    assert.equal(sig.bedtimeProvenance, 'derived');
    assert.match(sig.detail || '', /circa/i);
    assert.ok(
      (built.dossier.deterministicSignals.activeIds || []).includes('meal_within_3h_of_bedtime'),
    );
  });

  it('senza hours: bedtime missing; meal_within_3h inattivo', () => {
    const fx = loadFocusDiaryRealOct27();
    const pub = fx.publicationDate;
    const nodeKey = `trackerStorico_${pub}`;
    const hist = structuredClone(fx.fullHistory);
    const node = hist[nodeKey];
    assert.ok(node);
    const log = Array.isArray(node.log) ? node.log : Object.values(node.log || {});
    const sleep = log.find((e) => e && e.type === 'sleep');
    assert.ok(sleep);
    delete sleep.hours;
    delete sleep.duration;
    delete sleep.sleepHours;
    sleep.bedtime = 0;
    sleep.wakeTime = 6.5;

    const session = resolveFocusPageSession({
      uid: 'uid_bed_missing',
      periodId: 'ieri',
      handoff: {
        uid: 'uid_bed_missing',
        fullHistory: hist,
        analysisDate: fx.analysisDate,
        publicationDate: fx.publicationDate,
        userTargets: fx.userTargets,
      },
    });
    const built = buildFocusAiCoachDossier(session, { foodCatalogs: CATALOGS });
    assert.equal(built.dossier.sleep.day.bedtimeProvenance, 'missing');
    assert.equal(built.dossier.sleep.day.bedtime, null);
    const sig = (built.dossier.deterministicSignals.signals || [])
      .find((s) => s.id === 'meal_within_3h_of_bedtime');
    assert.equal(sig?.active, false);
    assert.equal(sig?.inactiveReason, 'bedtime_missing');
  });
});
