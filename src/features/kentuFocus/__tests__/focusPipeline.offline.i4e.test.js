import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryFocusPersistence } from '../server/persist/MemoryFocusPersistence.js';
import { runFocusEditionPipeline } from '../server/pipeline/runFocusEditionPipeline.js';
import { MemoryTrackerReader } from '../server/reader/AdminRtdbTrackerReader.js';
import { listRequiredTrackerDates } from '../server/reader/buildDossierInputFromTracker.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildAmbiguousSleepTrackerMap,
  buildDiscontinuousHistoryMap,
  buildFullTrackerDayMap,
  buildNoSleepTrackerMap,
  buildSparseTrackerMap,
} from '../server/__tests__/fixtures/i4eTrackerFixtures.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';
import { buildFallbackWrittenEdition } from '../editorial/writing/buildFallbackWrittenEdition.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { createEmptyEditorialMemory } from '../editorial/focusEditorialMemory.js';
import { FOCUS_WRITTEN_SCHEMA_VERSION } from '../editorial/writing/focusWrittenEdition.v1.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

test('I4-E offline: letture limitate e no invenzione giorni mancanti', async () => {
  const map = buildDiscontinuousHistoryMap();
  const reader = new MemoryTrackerReader(map, { maxHistoryDays: 30 });
  const persistence = new MemoryFocusPersistence();
  const out = await runFocusEditionPipeline({
    uid: 'offline_sparse',
    publicationDate: PUBLICATION_DATE,
    reader,
    persistence,
    historyDays: 30,
    targets: { kcal: 2200, proteinG: 140 },
  });
  assert.equal(out.ok, true, out.error);
  // historyDays 30 + publication + profile_targets + body_metrics
  assert.ok(out.report.reads.dailyRecords <= 40);
  assert.ok(out.report.reads.missingDays > 0);
  const briefs = out.dossierInput.historyDayBriefs;
  assert.equal(briefs.length, 30);
  const emptyish = briefs.filter((b) => !b.hasFood && !b.sleepAvailable);
  assert.ok(emptyish.length > 0);
});

test('I4-E offline: sonno assente / ambiguo bloccano; regen e bypass non aprono il gate', async () => {
  const noSleep = await runFocusEditionPipeline({
    uid: 'o_nosleep',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildNoSleepTrackerMap()),
    persistence: new MemoryFocusPersistence(),
  });
  assert.equal(noSleep.ok, false);
  assert.equal(noSleep.error, 'sleep_required');

  const amb = await runFocusEditionPipeline({
    uid: 'o_amb',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildAmbiguousSleepTrackerMap()),
    persistence: new MemoryFocusPersistence(),
  });
  assert.equal(amb.ok, false);
  assert.equal(amb.error, 'sleep_ambiguous');

  // explicitRegen NON bypassa il sonno
  const regenBlocked = await runFocusEditionPipeline({
    uid: 'o_regen_blocked',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildNoSleepTrackerMap()),
    persistence: new MemoryFocusPersistence(),
    explicitRegen: true,
    allowPublishWithoutSleep: true,
  });
  assert.equal(regenBlocked.ok, false);
  assert.equal(regenBlocked.error, 'sleep_required');
  assert.ok(regenBlocked.report.notes.includes('explicit_regen_does_not_bypass_sleep'));

  // Flag bypass client → ignorato; requireSleep:false solo hook test
  const bypassIgnored = await runFocusEditionPipeline({
    uid: 'o_bypass_ignored',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildNoSleepTrackerMap()),
    persistence: new MemoryFocusPersistence(),
    adminAllowPublishWithoutSleep: true,
    allowPublishWithoutSleep: true,
  });
  assert.equal(bypassIgnored.ok, false);
  assert.ok(bypassIgnored.report.notes.includes('ignored_client_sleep_bypass_flag'));

  const testHook = await runFocusEditionPipeline({
    uid: 'o_test_hook',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildNoSleepTrackerMap()),
    persistence: new MemoryFocusPersistence(),
    requireSleep: false,
  });
  assert.equal(testHook.ok, true, testHook.error);
  assert.ok(testHook.report.notes.includes('sleep_gate_disabled_requireSleep_false'));
});

test('I4-E offline: full day + Gemini sim valido / invalido → fallback', async () => {
  const map = buildFullTrackerDayMap({ historyDays: 20 });
  const { buildDossierInputFromTracker } = await import(
    '../server/reader/buildDossierInputFromTracker.js'
  );
  const built = await buildDossierInputFromTracker({
    uid: 'g',
    reader: new MemoryTrackerReader(map),
    publicationDate: PUBLICATION_DATE,
    historyDays: 20,
    targets: { kcal: 2300, proteinG: 150 },
    bodyWeightKg: 78.4,
  });
  const selection = selectFocusEditorial({
    dossier: buildFocusDossier({ uid: 'g', ...built.dossierInput }),
    memory: createEmptyEditorialMemory(),
  });
  const fallback = buildFallbackWrittenEdition({ selection });
  const validAi = {
    ...fallback,
    schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
    kind: 'FocusWrittenEdition',
  };

  const ok = await runFocusEditionPipeline({
    uid: 'o_gem_ok',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(map),
    persistence: new MemoryFocusPersistence(),
    historyDays: 20,
    targets: { kcal: 2300, proteinG: 150 },
    bodyWeightKg: 78.4,
    geminiProvider: new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(validAi) }],
    }),
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.report.prose.source, 'validated_ai');
  assert.equal(ok.report.prose.usedFallback, false);

  const bad = await runFocusEditionPipeline({
    uid: 'o_gem_bad',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(map),
    persistence: new MemoryFocusPersistence(),
    historyDays: 20,
    targets: { kcal: 2300, proteinG: 150 },
    bodyWeightKg: 78.4,
    geminiProvider: new FakeGeminiProvider({
      responses: [{ text: '{"articles":[' }],
    }),
  });
  assert.equal(bad.ok, true, bad.error);
  assert.equal(bad.report.prose.source, 'fallback');
  assert.equal(bad.report.prose.usedFallback, true);
});

test('I4-E offline: date richieste rispettano max history; DST/year list ok', () => {
  const dates = listRequiredTrackerDates(ANALYSIS_DATE, PUBLICATION_DATE, 90);
  assert.ok(dates.includes(ANALYSIS_DATE));
  assert.ok(dates.includes(PUBLICATION_DATE));
  assert.ok(dates.length <= 91);
  assert.equal(addCalendarDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addCalendarDays('2026-03-28', 1), '2026-03-29');
});

test('I4-E offline: giornata scarsa con sonno pubblica fallback', async () => {
  const out = await runFocusEditionPipeline({
    uid: 'o_sparse',
    publicationDate: PUBLICATION_DATE,
    reader: new MemoryTrackerReader(buildSparseTrackerMap()),
    persistence: new MemoryFocusPersistence(),
    historyDays: 7,
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.report.prose.source, 'fallback');
  assert.ok(out.report.reads.dailyRecords <= 10);
});
