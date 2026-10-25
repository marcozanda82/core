/**
 * P1Q — Evidenze su rapporto v3 GIÀ SALVATO (recupero storico, no Gemini).
 * Fixture fedele a strutture persistite: stringhe, oggetti Gemini, mappa RTDB, vuoti.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  stashFocusDiaryForUser,
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  normalizeFocusEditorialAnalysis,
  resolveFocusEvidenceRefs,
  coerceEvidenceRefArray,
  loadFocusAiAnalysisFromStore,
  createMemoryFocusAiAnalysisStore,
  buildFocusAiAnalysisRecord,
  buildFocusSavedEvidenceHarnessAnalysis,
  buildFocusSavedEvidenceHarnessAnalysisFirebaseMap,
  FOCUS_SAVED_EVIDENCE_HARNESS_REVISION_ID,
  FOCUS_SAVED_EVIDENCE_HARNESS_GENERATED_AT,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';

const DAY = '2026-10-24';
const PUB = '2026-10-25';
const UID = 'uid-p1q';
const REV = FOCUS_SAVED_EVIDENCE_HARNESS_REVISION_ID;

function sessionMese() {
  /** @type {Record<string, object>} */
  const fullHistory = {};
  // Più giorni con cibo/forza/sonno → habitCompass.evaluations popolato (mese).
  const days = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(`${DAY}T12:00:00`);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push(iso);
  }
  const muscleRotation = [
    ['Petto', 'Tricipiti'],
    ['Dorso', 'Bicipiti'],
    ['Gambe', 'Glutei'],
    ['Spalle', 'Abs'],
    ['Avambracci', 'Petto'],
    ['Dorso', 'Gambe'],
  ];
  days.forEach((iso, i) => {
    const muscles = muscleRotation[i % muscleRotation.length];
    fullHistory[`trackerStorico_${iso}`] = {
      data: iso,
      log: [
        {
          type: 'food', id: `f_${i}`, name: i % 2 ? 'Riso' : 'Pollo',
          mealType: 'pranzo', mealTime: 13,
          grams: 150, kcal: 280, prot: 25, carb: 30, fat: 8,
        },
        {
          type: 'workout', id: `w_${i}`, name: 'Pesi', workoutType: 'pesi',
          duration: 45, time: 9, muscles,
        },
        ...(i < 10 ? [{ type: 'sleep', id: `s_${i}`, hours: 6.5 + (i % 3) * 0.4, wakeTime: 7, bedtime: 23 }] : []),
      ],
    };
  });
  stashFocusDiaryForUser(UID, {
    fullHistory,
    analysisDate: DAY,
    publicationDate: PUB,
    userTargets: { kcal: 2456, prot: 140 },
  });
  return resolveFocusPageSession({ uid: UID, periodId: 'mese' });
}

describe('Focus evidence saved report P1Q', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('recupero store: oggetti/mappe → voci leggibili, niente righe vuote, conteggio corretto', () => {
    const session = sessionMese();
    const built = buildFocusAiCoachDossier(session);
    assert.equal(built.ok, true);

    const analysis = buildFocusSavedEvidenceHarnessAnalysis();
    const view = normalizeFocusEditorialAnalysis(analysis);
    assert.match(view.headline, /fisarmonica/i);

    const evals = built.dossier?.habitCompass?.evaluations || session?.habitCompass?.evaluations || [];
    assert.ok(evals.length >= 4, 'fixture mese deve esporre ≥4 evaluations');

    const items = resolveFocusEvidenceRefs(analysis.evidenceRefs, {
      dossier: built.dossier,
      session,
    });

    assert.ok(items.length >= 4, `expected >=4 got ${items.length}`);
    assert.ok(items.length <= 8);
    for (const ev of items) {
      assert.ok(/[\p{L}\p{N}]/u.test(ev.label), `empty label: ${JSON.stringify(ev)}`);
      assert.ok(!/habitCompass\.evaluations|citato nel rapporto|totally\.unknown/i.test(
        `${ev.label} ${ev.detail}`,
      ));
    }

    const habitItems = items.filter((e) => /Abitudine/i.test(e.label));
    assert.equal(habitItems.length, 2, 'evaluations[0] e [3] risolti; [99] escluso');
    assert.ok(habitItems.some((e) => e.label.includes(evals[0].pillarLabel)));
    assert.ok(habitItems.some((e) => e.label.includes(evals[3].pillarLabel)));

    const stimolo = items.find((e) => /Stimolo/i.test(e.label));
    assert.ok(stimolo);
    const freq = built.dossier?.kentuEngines?.muscleStimulus?.muscleGroupFrequency || [];
    assert.ok(freq.length > 4, 'dossier con >4 gruppi per verificare assenza di slice(0,4)');
    for (const g of freq) {
      const name = g.group || g.name;
      assert.ok(
        stimolo.detail.includes(String(name)),
        `gruppo ${name} deve comparire (lista non troncata): ${stimolo.detail}`,
      );
    }

    // Firebase map shape
    const mapAnalysis = buildFocusSavedEvidenceHarnessAnalysisFirebaseMap();
    assert.equal(coerceEvidenceRefArray(mapAnalysis.evidenceRefs).length, 5);
    const mapItems = resolveFocusEvidenceRefs(mapAnalysis.evidenceRefs, {
      dossier: built.dossier,
      session,
    });
    assert.equal(mapItems.length, 4, 'null entry excluded');
    assert.ok(mapItems.every((ev) => /[\p{L}\p{N}]/u.test(ev.label)));

    // eslint-disable-next-line no-console
    console.log('\n===== P1Q_SAVED_EVIDENCE_DISPLAY =====\n', JSON.stringify({
      objectShapeCount: items.length,
      objectShape: items.map((e) => ({ label: e.label, detail: e.detail })),
      habitEval0: evals[0] && { id: evals[0].id, pillarLabel: evals[0].pillarLabel },
      habitEval3: evals[3] && { id: evals[3].id, pillarLabel: evals[3].pillarLabel },
      muscleGroupsInDossier: freq.map((g) => g.group || g.name),
      mapShapeCount: mapItems.length,
      mapShape: mapItems.map((e) => ({ label: e.label, detail: e.detail })),
    }, null, 2));
  });

  it('loadFocusAiAnalysisFromStore → resolve senza rigenerare', async () => {
    const session = sessionMese();
    const built = buildFocusAiCoachDossier(session);
    const store = createMemoryFocusAiAnalysisStore();
    const analysis = buildFocusSavedEvidenceHarnessAnalysis();
    const record = {
      ...buildFocusAiAnalysisRecord(built.binding, analysis, built.dossier, 1),
      revisionId: REV,
      revisionSeq: 1,
      generatedAt: FOCUS_SAVED_EVIDENCE_HARNESS_GENERATED_AT,
      analysis,
    };
    await store.saveRevision({
      uid: UID,
      periodId: 'mese',
      windowKey: built.binding.windowKey || DAY,
      record,
    });

    const loaded = await loadFocusAiAnalysisFromStore({
      uid: UID,
      periodId: 'mese',
      windowKey: built.binding.windowKey || DAY,
      currentDataVersion: built.dataVersion,
      persistence: store,
    });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.record.revisionId, REV);
    assert.match(loaded.record.analysis.headline, /fisarmonica/i);

    const items = resolveFocusEvidenceRefs(loaded.record.analysis.evidenceRefs, {
      dossier: built.dossier,
      session,
    });
    assert.ok(items.length >= 4);
    assert.ok(items.every((ev) => String(ev.label || '').trim().length > 0));
    assert.ok(!items.some((ev) => /habitCompass\.evaluations\[|citato nel rapporto/i.test(
      `${ev.label} ${ev.detail}`,
    )));
    assert.ok(items.filter((e) => /Abitudine/i.test(e.label)).length === 2);
    // Nessuna perdita del rapporto
    assert.equal(loaded.record.analysis.headline, analysis.headline);
  });
});
