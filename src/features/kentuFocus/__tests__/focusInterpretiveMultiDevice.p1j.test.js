/**
 * Focus 2.0 — dossier interpretativo + persistenza multidispositivo (mock Gemini).
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  stashFocusDiaryForUser,
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  previewFocusAiCoachPayload,
  validateFocusAiCoachResponse,
  requestFocusAiCoachAnalysis,
  loadFocusAiAnalysisFromStore,
  listFocusAiAnalysisHistory,
  createMemoryFocusAiAnalysisStore,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

function food(id, name, extra = {}) {
  return {
    type: 'food', id, name, mealType: 'pranzo', mealTime: 13,
    grams: 150, kcal: 200, prot: 15, carb: 20, fat: 5, ...extra,
  };
}

function append(history, date, items) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, log: [] };
  history[key].log.push(...items);
}

function sleep(history, day, hours = 7.5, bed = 23) {
  append(history, addCalendarDays(day, 1), [{
    type: 'sleep', id: `s_${day}`, hours, wakeTime: 7, bedtime: bed,
  }]);
}

function richDayHistory() {
  const h = {};
  append(h, DAY, [
    food('a', 'Salmone', {
      mealType: 'pranzo', mealTime: 13, kcal: 280, prot: 35, carb: 0, fat: 14,
      omega3: 1.8, dbProvidedNutrientKeys: ['omega3'],
    }),
    food('b', 'Riso', { mealType: 'pranzo', mealTime: 13, kcal: 230, prot: 5, carb: 50, fat: 1 }),
    food('c', 'Insalata', { mealType: 'cena', mealTime: 21.5, kcal: 60, carb: 8 }),
    food('d', 'Petto di pollo', {
      mealType: 'cena', mealTime: 21.5, kcal: 330, prot: 60, carb: 0, fat: 8,
    }),
    {
      type: 'workout', id: 'w1', name: 'Pesi · Petto', workoutType: 'pesi',
      duration: 50, time: 17.5, muscles: ['Petto'],
    },
    { type: 'stimulant', id: 'caf1', name: 'Caffè' },
  ]);
  sleep(h, DAY, 8, 23);
  return h;
}

function weekDeficitProteinHistory() {
  const h = {};
  for (let i = 6; i >= 0; i -= 1) {
    const d = addCalendarDays(DAY, -i);
    append(h, d, [
      food(`f${i}`, 'Pane', { kcal: 180, prot: 6, carb: 35 }),
      food(`p${i}`, 'Yogurt', { kcal: 120, prot: 10, carb: 12 }),
      {
        type: 'workout', id: `w${i}`, name: 'Pesi · Gambe', workoutType: 'pesi',
        duration: 55, time: 18, muscles: i % 2 ? ['Gambe'] : ['Petto'],
      },
    ]);
    sleep(h, d, 7, 23.2);
  }
  return h;
}

function weekLateCaffeineSleepHistory() {
  const h = {};
  const sleepH = [5.5, 8, 4.8, 9, 5.2, 7.5, 4.5];
  for (let i = 6; i >= 0; i -= 1) {
    const d = addCalendarDays(DAY, -i);
    append(h, d, [
      food(`c${i}`, 'Pasta', { mealType: 'cena', mealTime: 22, kcal: 450, carb: 70, prot: 15 }),
      { type: 'stimulant', id: `caf${i}`, name: 'Caffè sera' },
      food(`a${i}`, 'Insalata', { mealType: 'pranzo', mealTime: 13, kcal: 80 }),
    ]);
    sleep(h, d, sleepH[i], i % 2 ? 1.5 : 23);
  }
  return h;
}

const MOCK_INTERPRETIVE = JSON.stringify({
  summary: {
    headline: 'Proteine serali e gap pre-forza',
    wentWell: [
      {
        text: 'Salmone a pranzo e 8 ore di sonno documentate.',
        area: 'qualita',
        eventRefs: [],
      },
    ],
    toImprove: [
      {
        text: 'Carboidrati lontani dall’orario di forza: da avvicinare.',
        area: 'energia',
        eventRefs: [],
      },
    ],
    todayAction: 'Avvicina una porzione di riso già in diario allo spuntino pre-forza.',
  },
  headline: 'Proteine serali e gap pre-forza',
  lead: 'Introito e target da Bussola: il margine chiaro è il timing dei carboidrati rispetto ai 50 minuti di forza.',
  sections: [
    {
      id: 'nutrition',
      title: 'Alimentazione',
      body: 'Il salmone documentato porta omega-3 osservabili; la distribuzione dei carboidrati merita attenzione intorno all’allenamento.',
    },
    {
      id: 'exercise',
      title: 'Movimento',
      body: 'La sessione di forza è contestualizzabile ai pasti e al sonno della stessa giornata.',
    },
    {
      id: 'sleep',
      title: 'Sonno',
      body: 'Otto ore al risveglio D+1 sono coerenti con un recupero plausibile.',
    },
  ],
  keyInsight: 'Ipotesi: carboidrati lontani dall’orario di forza riducono il supporto percepito in sessione.',
  recommendedAction:
    'Se ripeti uno schema simile, valuta di avvicinare una porzione di «Riso» già registrata a uno spuntino pre-allenamento, lasciando il pollo a cena.',
  verifyNext:
    'Nelle prossime 1–2 sessioni di forza, nota energia e sazietà serale senza aggiungere digiuni inventati.',
  claimLayers: {
    recordedFacts: ['Salmone e riso a pranzo', 'Pesi petto 50 min', 'Sonno 8 h'],
    generalKnowledge: ['Carboidrati vicini all’allenamento possono supportare la prestazione'],
    foundedInferences: ['Distribuzione C/P della giornata è sbilanciata rispetto all’orario di forza'],
    hypothesesToTest: ['Uno spuntino con riso pre-workout migliora la sensazione in sessione'],
  },
  primaryPillarId: 'nutrition',
  quantitativeProposal: {
    foodName: 'Riso',
    grams: 180,
    fromMeal: 'cena',
    toTiming: 'spuntino pre-allenamento',
    rationale: 'Avvicinare carboidrati documentati all’allenamento',
  },
});

function sessionFor(uid, history, periodId = 'ieri', targets = { kcal: 2200, prot: 140 }) {
  stashFocusDiaryForUser(uid, {
    fullHistory: history,
    analysisDate: DAY,
    publicationDate: PUB,
    userTargets: targets,
  });
  return resolveFocusPageSession({ uid, periodId });
}

describe('Focus interpretive + multi-device P1j', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('A: giornata ricca → dossier dettagliato (non solo card numbers)', () => {
    const session = sessionFor('uid-A', richDayHistory(), 'ieri');
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);
    assert.equal(built.dossier.schema, 'kentu.focusAiCoachDossier.v2');
    assert.ok((built.dossier.nutrition.meals || []).length >= 2);
    const itemNames = built.dossier.nutrition.meals.flatMap((m) => m.items.map((i) => i.name));
    assert.ok(itemNames.includes('Salmone'));
    assert.ok(itemNames.includes('Riso'));
    assert.ok(built.dossier.exercise.workouts.some((w) => w.kind === 'strength'));
    assert.equal(built.dossier.sleep.day.hours, 8);
    assert.ok(built.dossier.compassSignals);
    assert.ok(built.dossier.mandate?.doNotRestateCardNumbers);
    assert.ok(built.dossier.nutrition.stimuli);
    // eslint-disable-next-line no-console
    console.log('\n===== TEST_A_DOSSIER_SNIPPET =====\n', JSON.stringify({
      schema: built.dossier.schema,
      horizonBrief: built.dossier.horizonBrief,
      meals: built.dossier.nutrition.meals.map((m) => ({
        meal: m.mealLabel, clock: m.clockLabel,
        items: m.items.map((i) => `${i.name} ${i.grams}g`),
      })),
      workouts: built.dossier.exercise.workouts,
      sleep: built.dossier.sleep.day,
      compass: built.dossier.compassSignals,
      micros: built.dossier.nutrition.usableMicros,
      stimuli: built.dossier.nutrition.stimuli,
    }, null, 2));
  });

  it('B: settimana forza + target basso → dossier con obiettivo vs traiettoria', () => {
    const session = sessionFor('uid-B', weekDeficitProteinHistory(), 'settimana', {
      kcal: 2200, prot: 160,
    });
    const preview = previewFocusAiCoachPayload(session);
    assert.equal(preview.ok, true);
    assert.match(preview.systemText, /obiettivo DICHIARATO|condotta OSSERVATA/i);
    assert.match(preview.userText, /compassSignals|FALLIMENTO/i);
    const c = preview.dossier.compassSignals;
    assert.ok(c.declaredGoal);
    assert.equal(c.declaredGoal.kcalTargetDeclared, 2200);
    assert.ok(c.limits?.some((l) => /TDEE/i.test(l)));
    assert.ok(preview.dossier.exercise.workouts.length >= 5);
    // eslint-disable-next-line no-console
    console.log('\n===== TEST_B_COMPASS_AND_PROMPT =====\n', JSON.stringify({
      declaredGoal: c.declaredGoal,
      observedTrajectory: c.observedTrajectory,
      signalStrength: c.signalStrength,
      promptExcerpt: preview.systemText.slice(0, 400),
    }, null, 2));
  });

  it('C: pasti tardi + caffeina + sonno variabile', () => {
    const session = sessionFor('uid-C', weekLateCaffeineSleepHistory(), 'settimana');
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);
    assert.ok(built.dossier.nutrition.stimuli.stimulantEventsTotal >= 1);
    assert.ok((built.dossier.sleep.seriesRecorded || []).length >= 4);
    const hours = built.dossier.sleep.seriesRecorded.map((s) => s.hours);
    assert.ok(Math.max(...hours) - Math.min(...hours) > 1.5);
    // eslint-disable-next-line no-console
    console.log('\n===== TEST_C_TEMPORAL =====\n', JSON.stringify({
      stimuli: built.dossier.nutrition.stimuli,
      sleepSeries: built.dossier.sleep.seriesRecorded,
      habitSleep: built.dossier.habitCompass?.evaluations?.find((e) => e.id === 'sleep_regularity'),
    }, null, 2));
  });

  it('D: validazione mock interpretativa + rifiuto riassunto numerico', () => {
    const session = sessionFor('uid-D', richDayHistory(), 'ieri');
    const built = buildFocusAiCoachDossier(session);
    const ok = validateFocusAiCoachResponse(MOCK_INTERPRETIVE, { dossier: built.dossier });
    assert.equal(ok.ok, true);
    assert.equal(ok.analysis.schema, 'kentu.focusAiCoachAnalysis.v4');
    assert.match(ok.analysis.lead, /gap|Bussola|carboidrati|50/i);
    assert.equal(ok.analysis.quantitativeProposal?.foodName, 'Riso');
    assert.equal(Object.prototype.hasOwnProperty.call(ok.analysis, 'theEmergingPicture'), false);

    const bad = validateFocusAiCoachResponse(JSON.stringify({
      summary: {
        headline: 'Riassunto numerico',
        wentWell: [{ text: 'Ok energia', area: 'energia', eventRefs: [] }],
        toImprove: [{ text: 'Niente da migliorare', area: 'ritmo', eventRefs: [] }],
        todayAction: 'Continua così senza altri cambiamenti.',
      },
      headline: 'Riassunto numerico',
      lead: 'Hai registrato quattro pasti, 3196 kcal, 50 minuti di pesi e otto ore di sonno.',
      sections: [{ id: 'nutrition', title: 'Alimentazione', body: 'Hai mangiato.' }],
      recommendedAction: 'Continua così.',
      verifyNext: 'Osserva.',
      primaryPillarId: 'balanced',
      claimLayers: {
        recordedFacts: [],
        generalKnowledge: [],
        foundedInferences: [],
        hypothesesToTest: [],
      },
      quantitativeProposal: null,
    }));
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'editorial_restate_only');

    // eslint-disable-next-line no-console
    console.log('\n===== TEST_D_MOCK_ANALYSIS =====\n', JSON.stringify({
      label: 'SIMULAZIONE — non output Gemini reale',
      analysis: ok.analysis,
    }, null, 2));
  });

  it('E: generazione client A → recupero client B senza nuova chiamata Gemini', async () => {
    const sharedStore = createMemoryFocusAiAnalysisStore();
    const session = sessionFor('uid-E', richDayHistory(), 'ieri');
    let geminiCalls = 0;
    const askAiFn = async () => {
      geminiCalls += 1;
      return MOCK_INTERPRETIVE;
    };

    const fromA = await requestFocusAiCoachAnalysis({
      session,
      askAiFn,
      persistence: sharedStore,
      force: true,
    });
    assert.equal(fromA.ok, true);
    assert.equal(geminiCalls, 1);
    assert.ok(fromA.record?.revisionId);

    __resetFocusAiCoachMemoryForTests(); // svuota RAM locale client B

    const fromB = await requestFocusAiCoachAnalysis({
      session,
      askAiFn,
      persistence: sharedStore,
      force: false,
    });
    assert.equal(fromB.ok, true);
    assert.equal(fromB.fromPersistence || fromB.fromCache, true);
    assert.equal(geminiCalls, 1, 'nessuna nuova chiamata Gemini su client B');
    assert.equal(fromB.analysis.lead, fromA.analysis.lead);

    const loaded = await loadFocusAiAnalysisFromStore({
      uid: 'uid-E',
      periodId: 'ieri',
      windowKey: DAY,
      currentDataVersion: fromA.binding.dataVersion,
      persistence: sharedStore,
    });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.record.uid, 'uid-E');

    // eslint-disable-next-line no-console
    console.log('\n===== TEST_E_MULTIDEVICE =====\n', JSON.stringify({
      geminiCalls,
      revisionId: fromA.record.revisionId,
      sameLead: fromB.analysis.lead === fromA.analysis.lead,
      persistenceKind: fromB.persistenceKind,
    }, null, 2));
  });

  it('F: cronologia periodi + revisioni + scadenze', async () => {
    const store = createMemoryFocusAiAnalysisStore();
    const session = sessionFor('uid-F', richDayHistory(), 'ieri');
    const askAiFn = async () => MOCK_INTERPRETIVE;

    const r1 = await requestFocusAiCoachAnalysis({
      session, askAiFn, persistence: store, force: true,
    });
    const r2 = await requestFocusAiCoachAnalysis({
      session, askAiFn, persistence: store, force: true,
    });
    assert.ok(r2.record.revisionSeq > r1.record.revisionSeq);

    const weekSession = sessionFor('uid-F', weekDeficitProteinHistory(), 'settimana');
    await requestFocusAiCoachAnalysis({
      session: weekSession, askAiFn, persistence: store, force: true,
    });

    const all = await listFocusAiAnalysisHistory({ uid: 'uid-F', persistence: store });
    assert.ok(all.rows.length >= 2);
    assert.ok(all.rows.some((x) => x.periodId === 'ieri'));
    assert.ok(all.rows.some((x) => x.periodId === 'settimana'));

    // eslint-disable-next-line no-console
    console.log('\n===== TEST_F_HISTORY =====\n', JSON.stringify({
      revisions: { r1: r1.record.revisionId, r2: r2.record.revisionId, seq: [r1.record.revisionSeq, r2.record.revisionSeq] },
      index: all.rows,
      retention: { ieri: 30, settimana: 90, mese: 365 },
    }, null, 2));
  });

  it('G: isolamento UID + demo + stale diary', async () => {
    const store = createMemoryFocusAiAnalysisStore();
    const sessionE = sessionFor('uid-G1', richDayHistory(), 'ieri');
    const askAiFn = async () => MOCK_INTERPRETIVE;
    await requestFocusAiCoachAnalysis({ session: sessionE, askAiFn, persistence: store, force: true });

    const other = await loadFocusAiAnalysisFromStore({
      uid: 'uid-G2',
      periodId: 'ieri',
      windowKey: DAY,
      persistence: store,
    });
    assert.equal(other.ok, false);

    const demo = resolveFocusPageSession({ uid: 'uid-demo-no-handoff', periodId: 'ieri' });
    assert.notEqual(demo.mode, FOCUS_PAGE_MODE.real_diary);
    const blocked = await requestFocusAiCoachAnalysis({ session: demo, askAiFn, persistence: store });
    assert.equal(blocked.status, 'blocked');

    // Stale: cambia diario → dataVersion diversa
    const built1 = buildFocusAiCoachDossier(sessionE);
    append(sessionE.fullHistory, DAY, [food('extra', 'Banana', { kcal: 90, carb: 22 })]);
    const sessionE2 = resolveFocusPageSession({ uid: 'uid-G1', periodId: 'ieri' });
    const built2 = buildFocusAiCoachDossier(sessionE2);
    assert.notEqual(built1.dataVersion, built2.dataVersion);
    const stale = await loadFocusAiAnalysisFromStore({
      uid: 'uid-G1',
      periodId: 'ieri',
      windowKey: DAY,
      currentDataVersion: built2.dataVersion,
      persistence: store,
    });
    assert.equal(stale.ok, true);
    assert.equal(stale.record.diaryStale, true);

    // eslint-disable-next-line no-console
    console.log('\n===== TEST_G_ISOLATION =====\n', JSON.stringify({
      otherUid: other.reason,
      demoBlocked: blocked.reason,
      stale: stale.record.freshnessNote,
    }, null, 2));
  });

  it('PROMPT adottato (estratto)', () => {
    const session = sessionFor('uid-P', richDayHistory(), 'ieri');
    const preview = previewFocusAiCoachPayload(session);
    // eslint-disable-next-line no-console
    console.log('\n===== PROMPT_SYSTEM =====\n', preview.systemText);
    // eslint-disable-next-line no-console
    console.log('\n===== PROMPT_USER_HEAD =====\n', preview.userText.slice(0, 900));
    assert.match(preview.systemText, /NON riepilogare il diario/i);
  });
});
