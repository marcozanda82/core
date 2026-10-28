/**
 * P1P — Evidenze risolte (niente righe vuote) + timeout Focus vs askAI default + supersede.
 * Nessuna Gemini reale. Il timeout non è “provato” con mock istantanei: si verifica solo la config.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  stashFocusDiaryForUser,
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  normalizeFocusEditorialAnalysis,
  resolveFocusEvidenceRefs,
  normalizeEvidenceRefId,
  resolveFocusAiCoachTimeoutMs,
  FOCUS_AI_COACH_TIMEOUT_MS,
  requestFocusAiCoachAnalysis,
  createMemoryFocusAiAnalysisStore,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';
/** Valore noto in aiService.js (ASK_AI_TIMEOUT_MS) — non importare aiService in Node (Firebase). */
const ASK_AI_DEFAULT_TIMEOUT_MS = 30_000;

const DAY = '2026-10-24';
const PUB = '2026-10-25';
const UID = 'uid-p1p';

function sessionRich() {
  stashFocusDiaryForUser(UID, {
    fullHistory: {
      [`trackerStorico_${DAY}`]: {
        data: DAY,
        log: [
          {
            type: 'food', id: 'a', name: 'Pane', mealType: 'cena', mealTime: 22,
            grams: 80, kcal: 210, prot: 7, carb: 40, fat: 2,
          },
          {
            type: 'workout', id: 'w1', name: 'Pesi', workoutType: 'pesi',
            duration: 50, time: 9, muscles: ['Petto'],
          },
        ],
      },
      [`trackerStorico_${PUB}`]: {
        data: PUB,
        log: [{ type: 'sleep', id: 's1', hours: 7.5, wakeTime: 7, bedtime: 23 }],
      },
    },
    analysisDate: DAY,
    publicationDate: PUB,
    userTargets: { kcal: 2456, prot: 140 },
  });
  return resolveFocusPageSession({ uid: UID, periodId: 'settimana' });
}

describe('Focus evidence + timeout P1P', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('timeout Focus > askAI default; mese > settimana ≥ ieri; sotto tetto CF 180s', () => {
    assert.ok(resolveFocusAiCoachTimeoutMs('ieri') > ASK_AI_DEFAULT_TIMEOUT_MS);
    assert.ok(resolveFocusAiCoachTimeoutMs('settimana') >= resolveFocusAiCoachTimeoutMs('ieri'));
    assert.ok(resolveFocusAiCoachTimeoutMs('mese') >= resolveFocusAiCoachTimeoutMs('settimana'));
    assert.ok(resolveFocusAiCoachTimeoutMs('mese') < 180_000);
    assert.equal(FOCUS_AI_COACH_TIMEOUT_MS.ieri, resolveFocusAiCoachTimeoutMs('ieri'));
    // Nota: questo non dimostra assenza di timeout su Gemini reale.
  });

  it('4 ref reali + 1 irrisolvibile vuoto → conteggio e testi leggibili', () => {
    const built = buildFocusAiCoachDossier(sessionRich());
    assert.equal(built.ok, true);
    const refs = [
      'kentuEngines.energyPilot',
      'kentuEngines.bussola',
      'kentuEngines.muscleStimulus',
      'kentuEngines.cardio',
      '', // vuoto
      '   ', // blank
      '\u200b', // zero-width
      { id: '' }, // oggetto vuoto
      'totally.unknown.ref.xyz',
    ];
    const items = resolveFocusEvidenceRefs(refs, { dossier: built.dossier, session: sessionRich() });
    assert.equal(items.length, 4, 'solo ref risolti; unknown escluso');
    assert.ok(items.every((ev) => String(ev.label || '').trim().length > 0));
    assert.ok(items.every((ev) => String(ev.detail || '').trim().length > 0));
    assert.ok(items.some((ev) => /Pilota|energetico/i.test(ev.label)));
    assert.ok(items.some((ev) => /Bussola/i.test(ev.label)));
    assert.ok(!items.some((ev) => /totally\.unknown|citato nel rapporto|habitCompass\.evaluations/i.test(
      `${ev.label} ${ev.detail}`,
    )));
    assert.ok(!items.some((ev) => !ev.label.trim()));

    const view = normalizeFocusEditorialAnalysis({
      schema: 'kentu.focusAiCoachAnalysis.v3',
      headline: 'Titolo ok',
      lead: 'Lead con contesto settimanale.',
      sections: [{ id: 'a', title: 'A', body: 'Corpo.' }],
      recommendedAction: 'Azione.',
      verifyNext: 'Verifica.',
      primaryPillarId: 'balanced',
      evidenceRefs: refs,
    });
    assert.ok(view.evidenceRefs.every((r) => normalizeEvidenceRefId(r)));
    assert.ok(!view.evidenceRefs.includes(''));
    assert.ok(view.evidenceRefs.length >= 4);

    // eslint-disable-next-line no-console
    console.log('\n===== P1P_EVIDENCE_RESOLVED =====\n', JSON.stringify({
      count: items.length,
      items: items.map((e) => ({ label: e.label, detail: e.detail, available: e.available })),
    }, null, 2));
  });

  it('richiesta più vecchia non sovrascrive revisione con clientRequestStartedAt più nuovo', async () => {
    const session = sessionRich();
    const store = createMemoryFocusAiAnalysisStore();
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);

    const newerStarted = Date.now() + 120_000;
    await store.saveRevision({
      uid: UID,
      periodId: 'settimana',
      windowKey: built.binding.windowKey || DAY,
      record: {
        uid: UID,
        periodId: 'settimana',
        analysisDate: DAY,
        publicationDate: PUB,
        windowKey: built.binding.windowKey || DAY,
        dataVersion: built.dataVersion,
        revisionId: 'r2_newer',
        revisionSeq: 2,
        generatedAt: Date.now(),
        clientRequestStartedAt: newerStarted,
        clientRequestId: 'fac_newer',
        source: 'kentu_focus_ai_coach',
        notDemo: true,
        notHealthReports: true,
        analysis: {
          schema: 'kentu.focusAiCoachAnalysis.v3',
          headline: 'Revisione già più nuova',
          lead: 'Deve restare current.',
          sections: [{ id: 'a', title: 'A', body: 'Nuova.' }],
          recommendedAction: 'Tieni.',
          verifyNext: 'Ok.',
          primaryPillarId: 'balanced',
        },
      },
    });

    const late = await requestFocusAiCoachAnalysis({
      session,
      persistence: store,
      force: true,
      askAiFn: async () => JSON.stringify({
        headline: 'Risposta in ritardo da scartare',
        lead: 'Non deve diventare current.',
        sections: [{ id: 'a', title: 'A', body: 'Vecchia.' }],
        recommendedAction: 'No.',
        verifyNext: 'No.',
        primaryPillarId: 'balanced',
        evidenceRefs: ['kentuEngines.bussola'],
      }),
    });

    assert.equal(late.ok, true);
    assert.equal(late.reason, 'superseded_by_newer_request');
    assert.match(late.analysis.headline, /più nuova/i);

    const current = await store.readCurrent({
      uid: UID,
      periodId: 'settimana',
      windowKey: built.binding.windowKey || DAY,
    });
    assert.equal(current.record.revisionId, 'r2_newer');
    assert.match(current.record.analysis.headline, /più nuova/i);
  });
});
