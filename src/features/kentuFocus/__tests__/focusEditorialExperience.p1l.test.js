/**
 * Focus editoriale P1L — layout/schema/motori (mock, nessuna Gemini reale).
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
  normalizeFocusEditorialAnalysis,
  buildFocusKentuDeepLinks,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

function append(history, date, items) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, log: [] };
  history[key].log.push(...items);
}

function richHistory() {
  const h = {};
  append(h, DAY, [
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
  ]);
  append(h, PUB, [{ type: 'sleep', id: 's1', hours: 8, wakeTime: 7, bedtime: 23 }]);
  return h;
}

function sessionFor(periodId = 'ieri') {
  stashFocusDiaryForUser('uid-ed', {
    fullHistory: richHistory(),
    analysisDate: DAY,
    publicationDate: PUB,
    userTargets: { kcal: 2200, prot: 140 },
  });
  return resolveFocusPageSession({ uid: 'uid-ed', periodId });
}

const MOCK_V3 = JSON.stringify({
  headline: 'I carboidrati lontani dai pesi lasciano un buco di supporto',
  lead: 'La giornata non è «tanti pasti e un allenamento»: emerge un supporto proteico serale dopo la forza, con i carboidrati concentrati a pranzo. La Bussola va letta come condotta rispetto al target, non come volontà di cut.',
  sections: [
    {
      id: 'timing',
      title: 'Timing e supporto all’allenamento',
      body: 'Avvicinare il riso già registrato all’orario di forza è un’ipotesi pratica, non una misura individuale di deficit energetico.',
    },
    {
      id: 'sleep',
      title: 'Recupero notturno',
      body: 'Otto ore al risveglio D+1 sono coerenti con un recupero plausibile; senza qualità soggettiva non invento fasi del sonno.',
    },
  ],
  keyInsight: 'Ipotesi: distribuzione C/P sbilanciata rispetto all’orario di forza — da verificare, non causalità.',
  recommendedAction: 'Se ripeti lo schema, valuta uno spuntino con «Riso» già nel diario prima dei pesi, lasciando il salmone a pranzo.',
  expectedChange: 'Cambia il timing dei carboidrati; le calorie giornaliere restano sostanzialmente invariate se non aggiungi grammi netti.',
  verifyNext: 'Nelle prossime 1–2 sessioni nota energia in sala senza inventare digiuni.',
  evidenceRefs: ['kentuEngines.bussola', 'kentuEngines.muscleStimulus', 'nutrition.meals'],
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

const MOCK_V2_LEGACY = JSON.stringify({
  theEmergingPicture: 'Quadro equilibrato con una scelta concreta sul timing dei pasti rispetto all’allenamento.',
  nutrition: 'Il salmone a pranzo offre proteine e grassi utili; i carboidrati meritano attenzione intorno alla forza.',
  exercise: 'Sessione di forza contestualizzabile ai pasti, non un verdetto di ipertrofia settimanale.',
  sleep: 'Notte documentata senza forzature sulla qualità.',
  importantConnections: ['Timing pasti–allenamento da osservare'],
  theChoiceIWouldMake: 'Avvicina una porzione di riso all’allenamento.',
  whatToWatchNext: 'Osserva energia in sessione.',
  primaryPillarId: 'balanced',
});

describe('Focus editorial experience P1L', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
  });

  it('Ieri: dossier con kentuEngines + deepLinks', () => {
    const session = sessionFor('ieri');
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);
    assert.ok(built.dossier.kentuEngines);
    assert.ok(built.dossier.kentuEngines.energyPilot);
    assert.ok(built.dossier.kentuEngines.bussola);
    assert.ok(built.dossier.kentuEngines.muscleStimulus);
    assert.ok(built.dossier.kentuEngines.cardio);
    assert.ok(built.dossier.kentuEngines.deepLinks.bussola.to.includes('/centro-analisi'));
    assert.ok(built.dossier.kentuEngines.cardio.metricDefinitions?.length >= 1);
    // eslint-disable-next-line no-console
    console.log('\n===== P1L_IERI_ENGINES =====\n', JSON.stringify({
      energy: {
        target: built.dossier.kentuEngines.energyPilot.declaredTargetKcal,
        intake: built.dossier.kentuEngines.energyPilot.intakeKcalUsable,
        observed: built.dossier.kentuEngines.energyPilot.observedEnergy?.energyDirection,
      },
      cardio: built.dossier.kentuEngines.cardio,
      deepLinks: built.dossier.kentuEngines.deepLinks,
    }, null, 2));
  });

  it('Settimana e Mese: dossier ok, orizzonti diversi', () => {
    const week = buildFocusAiCoachDossier(sessionFor('settimana'));
    const month = buildFocusAiCoachDossier(sessionFor('mese'));
    assert.equal(week.ok && month.ok, true);
    assert.match(week.dossier.horizonBrief, /SETTIMANA/i);
    assert.match(month.dossier.horizonBrief, /MESE/i);
    assert.notEqual(week.dataVersion, month.dataVersion);
  });

  it('validazione v3 + normalize editorial; compat v2 salvata', () => {
    const dossier = buildFocusAiCoachDossier(sessionFor('ieri')).dossier;
    const v3 = validateFocusAiCoachResponse(MOCK_V3, { dossier });
    assert.equal(v3.ok, true);
    assert.equal(v3.analysis.schema, 'kentu.focusAiCoachAnalysis.v3');
    assert.ok(v3.analysis.headline);
    assert.ok(v3.analysis.sections.length >= 1);
    assert.match(v3.analysis.expectedChange, /calorie|invariat/i);

    const view = normalizeFocusEditorialAnalysis(v3.analysis);
    assert.equal(view.legacyCompat, false);
    assert.equal(view.headline, v3.analysis.headline);

    const v2 = validateFocusAiCoachResponse(MOCK_V2_LEGACY, { dossier });
    assert.equal(v2.ok, true);
    const legacyView = normalizeFocusEditorialAnalysis(v2.analysis);
    assert.equal(legacyView.legacyCompat, true);
    assert.ok(legacyView.sections.length >= 1);
    assert.ok(legacyView.lead);

    // eslint-disable-next-line no-console
    console.log('\n===== P1L_MOCK_V3_RENDER =====\n', JSON.stringify({
      label: 'SIMULAZIONE — non output Gemini reale',
      headline: view.headline,
      lead: view.lead,
      chapters: view.sections.map((s) => s.title),
      action: view.recommendedAction,
      expectedChange: view.expectedChange,
    }, null, 2));
  });

  it('deep-link reali (route esistenti)', () => {
    const links = buildFocusKentuDeepLinks({ analysisDate: DAY, periodId: 'ieri' });
    assert.equal(links.pilotaEnergetico.to, '/centro-analisi?area=calibrazione_target');
    assert.equal(links.bussola.to, '/centro-analisi?area=strumentazione&room=bussola');
    assert.equal(links.stimoloMuscolare.to, '/');
    assert.ok(links.cardio.to.startsWith('/centro-analisi'));
  });

  it('prompt editoriale: niente obbligo di tre pilastri fissi', () => {
    const preview = previewFocusAiCoachPayload(sessionFor('ieri'));
    assert.equal(preview.ok, true);
    assert.match(preview.systemText, /headline|rapporto/i);
    assert.match(preview.userText, /"headline"/);
    assert.match(preview.userText, /kentuEngines/);
    assert.match(preview.userText, /expectedChange/);
  });

  it('proposizione quantitativa: food nel diario verificata', () => {
    const dossier = buildFocusAiCoachDossier(sessionFor('ieri')).dossier;
    const ok = validateFocusAiCoachResponse(MOCK_V3, { dossier });
    assert.equal(ok.analysis.quantitativeProposal?.foodName, 'Riso');
    assert.equal(ok.analysis.proposalVerification?.mode, 'verified');
  });
});
