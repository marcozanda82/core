import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { extractFocusSignals } from '../editorial/extractFocusSignals.js';
import { createEmptyEditorialMemory } from '../editorial/focusEditorialMemory.js';
import { applyEditorialMemoryAfterPublish } from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { MemoryFocusPersistence } from '../server/persist/MemoryFocusPersistence.js';
import { runFocusEditionPipeline } from '../server/pipeline/runFocusEditionPipeline.js';
import { MemoryTrackerReader } from '../server/reader/AdminRtdbTrackerReader.js';
import { resolveFocusHistoryDays } from '../server/reader/focusHistoryHorizon.js';
import {
  resolveFocusBodyWeight,
  resolveFocusTargetsFromProfile,
} from '../server/reader/resolveFocusProfileData.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullTrackerDayMap,
  buildNoSleepTrackerMap,
} from '../server/__tests__/fixtures/i4eTrackerFixtures.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const PROFILE_WITH_TARGETS = {
  profile: {
    weight: 82,
    targetCalories: 2400,
    proteinTarget: 150,
    nutritionGoal: 'maintain',
  },
  targets: {
    kcal: 2200,
    prot: 140,
    carb: 200,
    fatTotal: 70,
    targetHistory: [
      {
        effectiveDate: '2026-10-01',
        targets: { kcal: 2100, prot: 145 },
        source: 'test',
      },
    ],
  },
};

const BODY_METRICS = {
  m1: { date: '2026-10-10', weight: 79.2, timestamp: 1 },
  m2: { date: '2026-10-15', weight: 78.4, timestamp: 2 },
  m0: { date: '2026-10-20', weight: 77.0, timestamp: 3 }, // after analysis → ignored
};

test('I4-F/G resolve targets: storia datata; override profilo non applicato', () => {
  const r = resolveFocusTargetsFromProfile(PROFILE_WITH_TARGETS, ANALYSIS_DATE);
  // I4-G: history 2100/145 — non profile 2400/150
  assert.equal(r.targets.kcal, 2100);
  assert.equal(r.targets.proteinG, 145);
  assert.ok(r.provenance.conflict?.some((c) => c.includes('undated_profile')));

  const absent = resolveFocusTargetsFromProfile(null, ANALYSIS_DATE);
  assert.equal(absent.targets, null);

  const zero = resolveFocusTargetsFromProfile({
    targets: { kcal: 0, prot: 0, targetHistory: [] },
  }, ANALYSIS_DATE);
  assert.equal(zero.targets, null);
});

test('I4-F/G resolve body: metrics; profile non attribuito al giorno', () => {
  const r = resolveFocusBodyWeight(BODY_METRICS, PROFILE_WITH_TARGETS.profile, ANALYSIS_DATE);
  assert.equal(r.bodyWeightKg, 78.4);
  assert.equal(r.bodyMeasuredOn, '2026-10-15');
  assert.equal(r.source, 'body_metrics');
  assert.equal(r.conflict, 'body_metrics_vs_profile.weight');

  const noBody = resolveFocusBodyWeight(null, { weight: 75 }, ANALYSIS_DATE);
  assert.equal(noBody.bodyWeightKg, null);
  assert.equal(noBody.profileWeightKg, 75);
  assert.equal(noBody.attribution, 'profile_weight_not_attributed_to_day');

  const zero = resolveFocusBodyWeight({ x: { date: ANALYSIS_DATE, weight: 0 } }, null, ANALYSIS_DATE);
  assert.equal(zero.bodyWeightKg, null);
});

test('I4-F horizon policy bounded', () => {
  assert.equal(resolveFocusHistoryDays({ horizon: 'd7' }).historyDays, 14);
  assert.equal(resolveFocusHistoryDays({}).historyDays, 60);
  assert.equal(resolveFocusHistoryDays({ needD90: true }).historyDays, 90);
  assert.equal(resolveFocusHistoryDays({ historyDays: 12 }).historyDays, 12);
});

test('I4-F pipeline: target presenti → protein signal; assenti → no protein news', async () => {
  const map = buildFullTrackerDayMap({ historyDays: 14 });
  const withT = await runFocusEditionPipeline({
    uid: 'f_t',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(map, {
      profileTargets: PROFILE_WITH_TARGETS,
      bodyMetrics: BODY_METRICS,
    }),
    persistence: new MemoryFocusPersistence(),
    horizon: 'd7',
  });
  assert.equal(withT.ok, true, withT.error);
  assert.equal(withT.dossierInput.targets.proteinG, 145);
  assert.equal(withT.dossierInput.bodyWeightKg, 78.4);
  const sigs = extractFocusSignals(buildFocusDossier({
    uid: 'x',
    ...withT.dossierInput,
  }));
  assert.ok(sigs.some((s) => s.id === 'sig_protein_near_target'));
  // Peso 2026-10-15 vs analysisDate: last_available → nessuna notizia “aggiornato”
  assert.ok(!sigs.some((s) => s.id === 'sig_body_weight_logged'));

  const noT = await runFocusEditionPipeline({
    uid: 'f_not',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(map, {
      profileTargets: null,
      bodyMetrics: null,
    }),
    persistence: new MemoryFocusPersistence(),
    horizon: 'd7',
  });
  assert.equal(noT.ok, true, noT.error);
  assert.equal(noT.dossierInput.targets, null);
  assert.equal(noT.dossierInput.bodyWeightKg, null);
  const sigs2 = extractFocusSignals(buildFocusDossier({
    uid: 'y',
    ...noT.dossierInput,
  }));
  assert.ok(!sigs2.some((s) => s.id === 'sig_protein_near_target'));
  assert.ok(!sigs2.some((s) => s.id === 'sig_body_weight_logged'));
});

test('I4-F regen senza admin non bypassa sonno', async () => {
  const out = await runFocusEditionPipeline({
    uid: 'f_sleep',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildNoSleepTrackerMap()),
    persistence: new MemoryFocusPersistence(),
    explicitRegen: true,
  });
  assert.equal(out.error, 'sleep_required');
});

test('I4-F peso zero non diventa metrica', () => {
  const d = buildFocusDossier({
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    analysisDayNode: { data: ANALYSIS_DATE, log: [] },
    publicationDayNode: {
      data: PUBLICATION_DATE,
      log: [{ type: 'sleep', id: 's', hours: 7, wakeTime: 7 }],
    },
    bodyWeightKg: 0,
  });
  assert.equal(d.day.body.weightKg.provenance, 'missing');
});

test('I4-F coach LOG_CONSISTENCY non ripetuto se recentCoach già lo ha', () => {
  let mem = createEmptyEditorialMemory();
  mem = applyEditorialMemoryAfterPublish(mem, {
    publicationDate: PUBLICATION_DATE,
    revision: 1,
    selection: {
      publicationDate: PUBLICATION_DATE,
      lead: null,
      goodNews: [],
      features: [],
      concerns: [],
      coach: {
        id: 'c',
        templateId: 'LOG_CONSISTENCY',
        textSeed: 'x',
        horizonDays: 5,
        followUp: { metricPaths: [] },
      },
    },
  });
  assert.equal(mem.recentCoach[0].templateId, 'LOG_CONSISTENCY');

  const nextPub = addCalendarDays(PUBLICATION_DATE, 1);
  const nextAnalysis = PUBLICATION_DATE;
  const sel = selectFocusEditorial({
    dossier: buildFocusDossier({
      analysisDate: nextAnalysis,
      publicationDate: nextPub,
      analysisDayNode: { data: nextAnalysis, log: [] },
      publicationDayNode: {
        data: nextPub,
        log: [{ type: 'sleep', id: 's', hours: 7, wakeTime: 7 }],
      },
    }),
    memory: mem,
  });
  assert.ok(!sel.coach || sel.coach.templateId !== 'LOG_CONSISTENCY');
});
