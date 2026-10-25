/**
 * P1N — Rigenera analisi: force bypassa cache/RTDB, nuova revisione, provider chiamato 1 volta.
 * Nessun mockEditorial / focusHarness: percorso requestFocusAiCoachAnalysis come dal click UI.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  stashFocusDiaryForUser,
  resolveFocusPageSession,
  requestFocusAiCoachAnalysis,
  loadFocusAiAnalysisFromStore,
  createMemoryFocusAiAnalysisStore,
  buildFocusAiAnalysisRecord,
  buildFocusAiCoachDossier,
  normalizeFocusEditorialAnalysis,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const UID = 'uid-p1n-regen';
const DAY = '2026-10-24';
const PUB = '2026-10-25';
const OLD_REV = 'r1_mvntdfxu';

function richHistory() {
  return {
    [`trackerStorico_${DAY}`]: {
      data: DAY,
      log: [
        {
          type: 'food', id: 'a', name: 'Salmone', mealType: 'pranzo', mealTime: 13,
          grams: 150, kcal: 280, prot: 35, carb: 0, fat: 14,
        },
        {
          type: 'food', id: 'b', name: 'Riso', mealType: 'pranzo', mealTime: 13,
          grams: 180, kcal: 230, prot: 5, carb: 50, fat: 1,
        },
        {
          type: 'workout', id: 'w1', name: 'Pesi · Petto', workoutType: 'pesi',
          duration: 50, time: 17.5, muscles: ['Petto'],
        },
      ],
    },
    [`trackerStorico_${PUB}`]: {
      data: PUB,
      log: [{ type: 'sleep', id: 's1', hours: 8, wakeTime: 7, bedtime: 23 }],
    },
  };
}

function sessionIeri() {
  stashFocusDiaryForUser(UID, {
    fullHistory: richHistory(),
    analysisDate: DAY,
    publicationDate: PUB,
    userTargets: { kcal: 2200, prot: 140 },
  });
  return resolveFocusPageSession({ uid: UID, periodId: 'ieri' });
}

/** Analisi formato precedente (v2) — come rapporto già salvato in UI. */
const LEGACY_V2_ANALYSIS = {
  schema: 'kentu.focusAiCoachAnalysis.v2',
  theEmergingPicture:
    'Quadro equilibrato con una scelta concreta sul timing dei pasti rispetto all’allenamento del 24 ottobre.',
  nutrition: 'Il salmone a pranzo offre proteine utili; i carboidrati meritano attenzione intorno alla forza.',
  exercise: 'Sessione di forza contestualizzabile ai pasti.',
  sleep: 'Notte documentata senza forzature sulla qualità.',
  importantConnections: ['Timing pasti–allenamento da osservare'],
  theChoiceIWouldMake: 'Avvicina una porzione di riso all’allenamento.',
  whatToWatchNext: 'Osserva energia in sessione.',
  primaryPillarId: 'balanced',
};

const NEW_V3_JSON = JSON.stringify({
  headline: 'Nuova lettura: il riso resta lontano dalla forza',
  lead: 'Rigenerazione editoriale: emerge uno scarto di timing tra carboidrati a pranzo e pesi serali, da verificare senza inventare un cut.',
  sections: [
    {
      id: 'timing',
      title: 'Timing e supporto',
      body: 'Avvicinare il riso già registrato all’orario di forza è un’ipotesi pratica, non una carenza individuale.',
    },
    {
      id: 'energia',
      title: 'Pilota e Bussola',
      body: 'Un giorno sotto il target non definisce la traiettoria; conta la persistenza fuori banda.',
    },
  ],
  keyInsight: 'Ipotesi: distribuzione C/P rispetto all’orario di forza — da verificare.',
  recommendedAction: 'Sposta una porzione di Riso già nel diario verso uno spuntino pre-pesi.',
  expectedChange: 'Cambia il timing; le calorie giornaliere restano simili se non aggiungi grammi netti.',
  verifyNext: 'Nelle prossime 1–2 sessioni nota energia in sala.',
  evidenceRefs: ['kentuEngines.bussola', 'kentuEngines.muscleStimulus'],
  limits: ['Una sola giornata non prova una tendenza settimanale.'],
  primaryPillarId: 'nutrition',
  quantitativeProposal: {
    foodName: 'Riso',
    grams: 180,
    fromMeal: 'pranzo',
    toTiming: 'spuntino pre-allenamento',
    rationale: 'Avvicinare C all’allenamento',
    dailyKcalUnchanged: true,
  },
});

describe('Focus regenerate force P1N', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('precondizione r1 legacy + click Rigenera (force:true) → provider 1×, r2, headline nuova; senza force resta r1', async () => {
    const session = sessionIeri();
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);

    const store = createMemoryFocusAiAnalysisStore();
    const oldRecord = {
      ...buildFocusAiAnalysisRecord(built.binding, LEGACY_V2_ANALYSIS, built.dossier, 1),
      revisionId: OLD_REV,
      revisionSeq: 1,
      generatedAt: Date.parse('2026-10-25T13:38:40.000Z'),
    };
    const seeded = await store.saveRevision({
      uid: UID,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || DAY,
      record: oldRecord,
    });
    assert.equal(seeded.ok, true);
    assert.equal(seeded.revisionId, OLD_REV);

    // Simula pagina: senza force (auto-load) ripropone cache → stesso comportamento bug
    let providerCalls = 0;
    const askAiFn = async () => {
      providerCalls += 1;
      return NEW_V3_JSON;
    };

    const cachedHit = await requestFocusAiCoachAnalysis({
      session,
      persistence: store,
      askAiFn,
      force: false,
    });
    assert.equal(cachedHit.ok, true);
    assert.equal(cachedHit.fromCache, true);
    assert.equal(providerCalls, 0, 'senza force il provider NON deve essere chiamato');
    assert.equal(cachedHit.record?.revisionId, OLD_REV);

    // Click «Rigenera analisi» come in KentuFocusPage: force: true
    __resetFocusAiCoachMemoryForTests();
    const regen = await requestFocusAiCoachAnalysis({
      session,
      persistence: store,
      askAiFn,
      force: true,
    });

    assert.equal(regen.ok, true, regen.userMessage || regen.reason);
    assert.equal(regen.fromCache, false);
    assert.equal(providerCalls, 1, 'provider mock invocato ESATTAMENTE una volta');
    assert.ok(regen.record?.revisionId);
    assert.notEqual(regen.record.revisionId, OLD_REV);
    assert.match(regen.record.revisionId, /^r2_/);
    assert.equal(regen.record.revisionSeq, 2);
    assert.ok(Number(regen.record.generatedAt) > Number(oldRecord.generatedAt));
    assert.equal(regen.analysis.schema, 'kentu.focusAiCoachAnalysis.v3');
    assert.match(regen.analysis.headline, /Nuova lettura/i);

    const view = normalizeFocusEditorialAnalysis(regen.analysis);
    assert.equal(view.legacyCompat, false);
    assert.match(view.headline, /Nuova lettura/i);

    // r1 ancora in store
    const r1 = await store.readRevision({
      uid: UID,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || DAY,
      revisionId: OLD_REV,
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.record.revisionId, OLD_REV);
    assert.equal(r1.record.analysis.schema, 'kentu.focusAiCoachAnalysis.v2');

    // refresh: current = r2, nessuna nuova chiamata
    __resetFocusAiCoachMemoryForTests();
    const callsBeforeRefresh = providerCalls;
    const refreshed = await requestFocusAiCoachAnalysis({
      session,
      persistence: store,
      askAiFn,
      force: false,
    });
    assert.equal(providerCalls, callsBeforeRefresh, 'refresh non richiama il provider');
    assert.equal(refreshed.fromCache || refreshed.fromPersistence, true);
    assert.equal(refreshed.record?.revisionId, regen.record.revisionId);
    assert.match(refreshed.analysis.headline, /Nuova lettura/i);

    const current = await loadFocusAiAnalysisFromStore({
      uid: UID,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || DAY,
      currentDataVersion: built.dataVersion,
      persistence: store,
    });
    assert.equal(current.record.revisionId, regen.record.revisionId);
  });

  it('force + provider errore: r1 preservata nello store, risultato non ok (UI non dichiara successo)', async () => {
    const session = sessionIeri();
    const built = buildFocusAiCoachDossier(session);
    const store = createMemoryFocusAiAnalysisStore();
    const oldRecord = {
      ...buildFocusAiAnalysisRecord(built.binding, LEGACY_V2_ANALYSIS, built.dossier, 1),
      revisionId: OLD_REV,
      revisionSeq: 1,
      generatedAt: Date.parse('2026-10-25T13:38:40.000Z'),
    };
    await store.saveRevision({
      uid: UID,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || DAY,
      record: oldRecord,
    });

    let providerCalls = 0;
    const askAiFn = async () => {
      providerCalls += 1;
      throw new Error('simulated_provider_down');
    };

    const failed = await requestFocusAiCoachAnalysis({
      session,
      persistence: store,
      askAiFn,
      force: true,
    });
    assert.equal(failed.ok, false);
    assert.equal(providerCalls, 1);
    assert.equal(failed.analysis, null);
    assert.match(failed.userMessage || '', /non ha risposto|non disponibile|Riprova/i);

    const still = await loadFocusAiAnalysisFromStore({
      uid: UID,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || DAY,
      persistence: store,
    });
    assert.equal(still.ok, true);
    assert.equal(still.record.revisionId, OLD_REV);
  });

  it('doppio click condiviso: un solo provider call per lo stesso inflight', async () => {
    const session = sessionIeri();
    const store = createMemoryFocusAiAnalysisStore();
    let providerCalls = 0;
    let release;
    const gate = new Promise((r) => { release = r; });
    const askAiFn = async () => {
      providerCalls += 1;
      await gate;
      return NEW_V3_JSON;
    };

    const p1 = requestFocusAiCoachAnalysis({
      session, persistence: store, askAiFn, force: true,
    });
    const p2 = requestFocusAiCoachAnalysis({
      session, persistence: store, askAiFn, force: true,
    });
    release();
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(providerCalls, 1);
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.record?.revisionId, b.record?.revisionId);
  });
});
