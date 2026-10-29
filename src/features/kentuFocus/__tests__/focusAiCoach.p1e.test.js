/**
 * Kentu Focus — coach AI (dossier + validazione + mock askAI).
 * Nessuna chiamata Gemini reale.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  buildFocusAiCoachDossier,
  canBuildFocusAiCoachDossier,
  buildFocusAiCoachSystemInstruction,
  buildFocusAiCoachUserPrompt,
  validateFocusAiCoachResponse,
  requestFocusAiCoachAnalysis,
  previewFocusAiCoachPayload,
  focusAiCoachCacheKey,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
  createMemoryFocusAiAnalysisStore,
  resolveFocusPageSession,
  stashFocusDiaryForUser,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

function buildHistory() {
  return {
    [`trackerStorico_${DAY}`]: {
      data: DAY,
      mealTimes: { pranzo: 13, cena: 20 },
      log: [
        {
          type: 'food',
          id: 'f1',
          mealType: 'pranzo',
          mealTime: 13,
          name: 'Yogurt greco',
          grams: 150,
          kcal: 140,
          prot: 12,
          carb: 14,
          fat: 3,
          omega3: 0.3,
          dbProvidedNutrientKeys: ['omega3'],
        },
        {
          type: 'workout',
          id: 'w1',
          name: 'Camminata',
          durationMin: 30,
        },
      ],
      manualNodes: [],
    },
    [`trackerStorico_${PUB}`]: {
      data: PUB,
      log: [{
        type: 'sleep',
        id: 's1',
        hours: 7.5,
        wakeTime: 7,
        bedtime: 23.5,
        quality: 4,
        deepMin: 60,
        remMin: 60,
      }],
    },
  };
}

function realSession(periodId = 'ieri') {
  const fullHistory = buildHistory();
  return resolveFocusPageSession({
    uid: 'uid_test',
    periodId,
    handoff: {
      uid: 'uid_test',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    },
  });
}

const VALID_AI_JSON = JSON.stringify({
  summary: {
    headline: 'Giorno equilibrato e leggibile',
    wentWell: [{ text: 'Yogurt a pranzo e camminata registrati', area: 'energia', eventRefs: [] }],
    toImprove: [{ text: 'Mantieni continuità di registrazione', area: 'ritmo', eventRefs: [] }],
    todayAction: {
      text: 'Registra pasti, movimento e sonno nella stessa giornata.',
      toImproveIndex: 0,
      eventRefs: [],
      area: 'ritmo',
    },
  },
  headline: 'Giorno equilibrato e leggibile',
  lead: 'Introito vicino al target con 140 kcal sul diario e 30 minuti di camminata.',
  sections: [
    { id: 'nutrition', title: 'Alimentazione', body: 'Yogurt greco compare a pranzo con un profilo proteico leggibile.' },
    { id: 'exercise', title: 'Movimento', body: 'Hai una camminata registrata; minuti e tipo restano distinti.' },
    { id: 'sleep', title: 'Sonno', body: 'La notte conclusa al risveglio risulta documentata con 7,5 ore.' },
  ],
  recommendedAction: 'Registra pasti, movimento e sonno nella stessa giornata.',
  verifyNext: 'Osserva se la registrazione resta costante per una settimana.',
  primaryPillarId: 'balanced',
  claimLayers: {
    recordedFacts: ['Camminata e yogurt registrati'],
    generalKnowledge: [],
    foundedInferences: [],
    hypothesesToTest: [],
  },
  quantitativeProposal: null,
});

describe('Focus AI coach P1e', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('demo / sessione non reale: non inviabile', async () => {
    const demo = resolveFocusPageSession({
      uid: 'uid_demo',
      periodId: 'ieri',
      handoff: null,
    });
    assert.equal(demo.mode, FOCUS_PAGE_MODE.demo_preview);
    assert.equal(canBuildFocusAiCoachDossier(demo).ok, false);

    const result = await requestFocusAiCoachAnalysis({
      session: demo,
      askAiFn: async () => {
        throw new Error('NON deve essere chiamato');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked');
    assert.match(result.userMessage, /diario reale|dimostrativa/i);
  });

  it('dossier reale: date, pasti, workout, sonno; nessun score nel prompt', () => {
    const session = realSession('ieri');
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);
    assert.equal(built.binding.uid, 'uid_test');
    assert.equal(built.binding.periodId, 'ieri');
    assert.equal(built.binding.analysisDate, DAY);
    assert.equal(built.dossier.nutrition.meals.length >= 1, true);
    assert.ok(built.dossier.nutrition.meals.some((m) => m.items.some((i) => i.name === 'Yogurt greco')));
    assert.ok(built.dossier.exercise.workouts.length >= 1);
    assert.equal(built.dossier.sleep.day.available, true);
    assert.equal(built.dossier.policy.noHealthScore, true);

    const systemText = buildFocusAiCoachSystemInstruction();
    const userText = buildFocusAiCoachUserPrompt(built.dossier);
    assert.match(systemText, /NON riepilogare il diario/i);
    assert.match(systemText, /score 0–100|score/i);
    assert.match(systemText, /infiammazione clinica|glicemia/i);
    assert.match(systemText, /headline|rapporto/i);
    assert.ok(built.dossier.schema === 'kentu.focusAiCoachDossier.v2'
      || built.dossier.compassSignals != null);
    assert.ok(built.dossier.kentuEngines);
    assert.match(userText, /FOCUS_INPUT_DATA/);
    assert.equal(/Score 90/i.test(userText), false);
    assert.equal(/### 🔬 Stato Infiammatorio/i.test(userText), false);

    // Payload esempio senza UID (per consegna)
    const preview = previewFocusAiCoachPayload(session);
    assert.equal(preview.ok, true);
    const sample = {
      periodId: preview.dossier.periodId,
      analysisDate: preview.dossier.analysisDate,
      pillars: preview.dossier.pillars,
      mealNames: preview.dossier.nutrition.meals.flatMap((m) => m.items.map((i) => i.name)),
      workouts: preview.dossier.exercise.workouts.map((w) => w.label),
      sleepHours: preview.dossier.sleep.day?.hours ?? null,
    };
    // eslint-disable-next-line no-console
    console.log('PAYLOAD_ESEMPIO_AI_COACH:', JSON.stringify(sample));
    // eslint-disable-next-line no-console
    console.log('PROMPT_SYSTEM_HEAD:', systemText.slice(0, 180));
  });

  it('Ieri / Settimana / Mese: versioni dati distinte, nessun mix', () => {
    const ieri = buildFocusAiCoachDossier(realSession('ieri'));
    const week = buildFocusAiCoachDossier(realSession('settimana'));
    const month = buildFocusAiCoachDossier(realSession('mese'));
    assert.equal(ieri.ok && week.ok && month.ok, true);
    assert.notEqual(ieri.dataVersion, week.dataVersion);
    assert.notEqual(week.dataVersion, month.dataVersion);
    assert.equal(ieri.binding.periodId, 'ieri');
    assert.equal(week.binding.periodId, 'settimana');
    assert.equal(month.binding.periodId, 'mese');
    assert.equal(week.dossier.nutrition.meals.length, 0);
    assert.ok(week.dossier.nutrition.trend);
    assert.equal(week.dossier.exercise.seriesRecorded != null, true);
  });

  it('UID isolato nel binding', () => {
    const fullHistory = buildHistory();
    stashFocusDiaryForUser('alice', {
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const alice = resolveFocusPageSession({
      uid: 'alice',
      periodId: 'ieri',
      handoff: {
        uid: 'alice', fullHistory, analysisDate: DAY, publicationDate: PUB,
      },
    });
    const bob = resolveFocusPageSession({
      uid: 'bob',
      periodId: 'ieri',
      handoff: {
        uid: 'alice', fullHistory, analysisDate: DAY, publicationDate: PUB,
      },
    });
    assert.equal(alice.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(bob.mode, FOCUS_PAGE_MODE.demo_preview);
    assert.equal(buildFocusAiCoachDossier(alice).binding.uid, 'alice');
    assert.equal(canBuildFocusAiCoachDossier(bob).ok, false);
  });

  it('validazione: ok su JSON valido; rifiuta score e claim clinici', () => {
    const ok = validateFocusAiCoachResponse(VALID_AI_JSON);
    assert.equal(ok.ok, true);
    assert.equal(ok.analysis.primaryPillarId, 'balanced');

    const withScore = validateFocusAiCoachResponse(JSON.stringify({
      ...JSON.parse(VALID_AI_JSON),
      dailyScore: 90,
    }));
    assert.equal(withScore.ok, false);

    const clinical = validateFocusAiCoachResponse(JSON.stringify({
      ...JSON.parse(VALID_AI_JSON),
      lead: 'Ottimo stato infiammatorio e stabilità insulinica con 140 kcal.',
    }));
    assert.equal(clinical.ok, false);
    assert.equal(clinical.reason, 'banned_clinical_or_score_claim');
  });

  it('request con mock: nessuna rete; cache evita duplicati; inflight condiviso', async () => {
    const session = realSession('ieri');
    let calls = 0;
    const askAiFn = async () => {
      calls += 1;
      return VALID_AI_JSON;
    };

    const a = await requestFocusAiCoachAnalysis({ session, askAiFn });
    assert.equal(a.ok, true);
    assert.equal(a.status, 'ready');
    assert.equal(calls, 1);

    const b = await requestFocusAiCoachAnalysis({ session, askAiFn });
    assert.equal(b.ok, true);
    assert.equal(b.status, 'cached');
    assert.equal(calls, 1);

    const built = buildFocusAiCoachDossier(session);
    const key = focusAiCoachCacheKey(built.binding);
    assert.match(key, /^uid_test\|ieri\|/);

    // Validazione fallita → non cache-a testo cattivo (store fresco, no persist hit)
    __resetFocusAiCoachMemoryForTests();
    const bad = await requestFocusAiCoachAnalysis({
      session,
      persistence: createMemoryFocusAiAnalysisStore(),
      force: true,
      askAiFn: async () => JSON.stringify({
        integratedComment: 'Score 90 e citochine ridotte.',
        pillarObservations: { nutrition: 'x', exercise: 'y', sleep: 'z' },
        focusAspects: [],
        practicalAction: 'niente',
        primaryPillarId: 'nutrition',
      }),
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 'validation_failed');
    assert.match(bad.userMessage, /riprovare|rapporto/i);
  });

  it('HealthAnalyzer / Focus Metabolico non importati da questo modulo', async () => {
    const fs = await import('node:fs');
    const path = new URL('../product/requestFocusAiCoachAnalysis.js', import.meta.url);
    const src = fs.readFileSync(path, 'utf8');
    assert.equal(/HealthAnalyzerEngine|health_reports|clinicalInsightCoach/i.test(src), false);
    assert.match(src, /createAskAiFocusGeminiProvider/);
  });
});
