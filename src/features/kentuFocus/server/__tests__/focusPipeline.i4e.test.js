/**
 * I4-E — pipeline end-to-end su Firebase Emulator (auth + database).
 * Nessun DB reale. Nessuna callable. Nessun Gemini live.
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../../editorial/selectFocusEditorial.js';
import { buildFocusDossier } from '../../build/buildFocusDossier.js';
import { buildFallbackWrittenEdition } from '../../editorial/writing/buildFallbackWrittenEdition.js';
import { FOCUS_WRITTEN_SCHEMA_VERSION } from '../../editorial/writing/focusWrittenEdition.v1.js';
import { FakeGeminiProvider } from '../gemini/focusGeminiAdapter.js';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import {
  emulatorRestGet,
  loadFocusLocalRules,
} from '../emulator/loadFocusRules.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { runFocusEditionPipeline } from '../pipeline/runFocusEditionPipeline.js';
import { AdminRtdbTrackerReader } from '../reader/AdminRtdbTrackerReader.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildAmbiguousSleepTrackerMap,
  buildDedupSleepTrackerMap,
  buildDiscontinuousHistoryMap,
  buildDstBoundaryMap,
  buildFullTrackerDayMap,
  buildNoSleepTrackerMap,
  buildSparseTrackerMap,
  buildYearBoundaryMap,
  clearUserFocusAndTracker,
  seedTrackerMap,
} from './fixtures/i4eTrackerFixtures.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);

/** @type {import('firebase-admin/database').Database | null} */
let db = null;

before(async () => {
  if (!EMULATOR) return;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules();
});

after(async () => {
  if (!db) return;
  await db.ref('kentu_focus').set(null);
  await db.ref('users').set(null);
  await deleteEmulatorAdminApp();
});

test('I4-E.1 giornata completa + sonno → pubblicazione + report', { skip: !EMULATOR }, async () => {
  const uid = 'i4e_full';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 20 }));

  const out = await runFocusEditionPipeline({
    uid,
    db,
    publicationDate: PUBLICATION_DATE,
    historyDays: 20,
    targets: { kcal: 2300, proteinG: 150 },
    bodyWeightKg: 78.4,
    bodyMeasuredOn: '2026-10-15',
    ownerId: 'w1',
    nowIso: '2026-10-17T08:00:00.000Z',
  });

  assert.equal(out.ok, true, out.error);
  assert.equal(out.analysisDate, ANALYSIS_DATE);
  assert.ok(out.report.reads.dailyRecords > 0);
  assert.ok(out.report.reads.approxBytes > 0);
  assert.ok(out.report.editorial.selectedArticles >= 1);
  assert.equal(out.report.prose.source, 'fallback');
  assert.equal(out.report.publish.revision, 1);
  assert.ok(!JSON.stringify(out.report).includes(uid));

  const persistence = new AdminRtdbFocusPersistence(db);
  const pub = await persistence.getPublishedEdition(uid, PUBLICATION_DATE);
  assert.equal(pub.meta?.currentRevision, 1);
  assert.ok(pub.revision?.lead || (pub.revision?.goodNews || []).length >= 0);

  const mem = await persistence.getEditorialMemory(uid);
  assert.ok(mem?.lastAppliedEdition?.startsWith(PUBLICATION_DATE));

  console.log('I4E_REPORT_FULL', JSON.stringify(out.report));
});

test('I4-E.2 sonno assente / ambiguo → no publish', { skip: !EMULATOR }, async () => {
  const uidA = 'i4e_nosleep';
  await clearUserFocusAndTracker(db, uidA);
  await seedTrackerMap(db, uidA, buildNoSleepTrackerMap());
  const a = await runFocusEditionPipeline({
    uid: uidA, db, publicationDate: PUBLICATION_DATE, historyDays: 7,
  });
  assert.equal(a.error, 'sleep_required');
  assert.equal(
    (await new AdminRtdbFocusPersistence(db).getPublishedEdition(uidA, PUBLICATION_DATE)).meta,
    null,
  );

  const uidB = 'i4e_amb';
  await clearUserFocusAndTracker(db, uidB);
  await seedTrackerMap(db, uidB, buildAmbiguousSleepTrackerMap());
  const b = await runFocusEditionPipeline({
    uid: uidB, db, publicationDate: PUBLICATION_DATE, historyDays: 7,
  });
  assert.equal(b.error, 'sleep_ambiguous');
});

test('I4-E.3 dedup sonno + sparse + storico discontinuo', { skip: !EMULATOR }, async () => {
  const uid = 'i4e_dedup';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildDedupSleepTrackerMap());
  const out = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, historyDays: 7,
    targets: { kcal: 2300, proteinG: 150 },
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.sleepGate.status, 'selected');

  const uid2 = 'i4e_disc';
  await clearUserFocusAndTracker(db, uid2);
  await seedTrackerMap(db, uid2, buildDiscontinuousHistoryMap());
  const disc = await runFocusEditionPipeline({
    uid: uid2, db, publicationDate: PUBLICATION_DATE, historyDays: 30,
  });
  assert.equal(disc.ok, true, disc.error);
  assert.ok(disc.report.reads.missingDays > 5);
});

test('I4-E.4 confronto storico valido vs non comparabile', { skip: !EMULATOR }, async () => {
  const uidOk = 'i4e_hist_ok';
  await clearUserFocusAndTracker(db, uidOk);
  await seedTrackerMap(db, uidOk, buildFullTrackerDayMap({ historyDays: 30 }));
  const ok = await runFocusEditionPipeline({
    uid: uidOk, db, publicationDate: PUBLICATION_DATE, historyDays: 30,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
  });
  assert.equal(ok.ok, true, ok.error);
  const d7 = ok.dossierInput.historyDayBriefs.filter((b) => b.hasFood).length;
  assert.ok(d7 >= 7);

  const uidThin = 'i4e_hist_thin';
  await clearUserFocusAndTracker(db, uidThin);
  await seedTrackerMap(db, uidThin, buildDiscontinuousHistoryMap());
  const thin = await runFocusEditionPipeline({
    uid: uidThin, db, publicationDate: PUBLICATION_DATE, historyDays: 30,
  });
  assert.equal(thin.ok, true, thin.error);
  const dossier = buildFocusDossier({ uid: 'x', ...thin.dossierInput });
  assert.ok(
    dossier.history?.d7?.coverage?.nutrition?.trendComparable === false
    || dossier.meta?.flags?.historyThin30 === true
    || dossier.history?.d7?.coverage?.nutrition?.sufficiency !== 'ok',
  );
});

test('I4-E.5 due edizioni consecutive + memoria; pubblicazione ripetuta', { skip: !EMULATOR }, async () => {
  const uid = 'i4e_mem';
  await clearUserFocusAndTracker(db, uid);
  const pub1 = '2026-10-16';
  const an1 = '2026-10-15';
  const map1 = buildFullTrackerDayMap({
    analysisDate: an1, publicationDate: pub1, historyDays: 14,
  });
  await seedTrackerMap(db, uid, map1);
  const e1 = await runFocusEditionPipeline({
    uid, db, publicationDate: pub1, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78,
    nowIso: '2026-10-16T08:00:00.000Z',
  });
  assert.equal(e1.ok, true, e1.error);

  const pub2 = PUBLICATION_DATE;
  const map2 = buildFullTrackerDayMap({ historyDays: 14 });
  await seedTrackerMap(db, uid, map2);
  const e2 = await runFocusEditionPipeline({
    uid, db, publicationDate: pub2, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
    nowIso: '2026-10-17T08:00:00.000Z',
  });
  assert.equal(e2.ok, true, e2.error);
  const mem = await new AdminRtdbFocusPersistence(db).getEditorialMemory(uid);
  assert.ok(mem.lastAppliedEdition.includes(pub2));
  assert.ok((mem.recentLeads || []).length >= 1 || (mem.recentTopics || []).length >= 0);

  const replay = await runFocusEditionPipeline({
    uid, db, publicationDate: pub2, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.publishResult.idempotentReplay, true);
});

test('I4-E.6 Gemini sim + worker concorrenti + crash recovery', { skip: !EMULATOR }, async () => {
  const uid = 'i4e_gem';
  await clearUserFocusAndTracker(db, uid);
  const map = buildFullTrackerDayMap({ historyDays: 14 });
  await seedTrackerMap(db, uid, map);

  const reader = new AdminRtdbTrackerReader(db);
  const built = await (await import('../reader/buildDossierInputFromTracker.js'))
    .buildDossierInputFromTracker({
      uid, reader, publicationDate: PUBLICATION_DATE, historyDays: 14,
      targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
    });
  const selection = selectFocusEditorial({
    dossier: buildFocusDossier({ uid, ...built.dossierInput }),
    memory: createEmptyEditorialMemory(),
  });
  const validAi = {
    ...buildFallbackWrittenEdition({ selection }),
    schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
    kind: 'FocusWrittenEdition',
  };

  const gemOk = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
    geminiProvider: new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(validAi) }],
    }),
  });
  assert.equal(gemOk.ok, true, gemOk.error);
  assert.equal(gemOk.report.prose.source, 'validated_ai');

  // invalid → fallback su altra data
  const uid2 = 'i4e_gem_bad';
  await clearUserFocusAndTracker(db, uid2);
  await seedTrackerMap(db, uid2, map);
  const gemBad = await runFocusEditionPipeline({
    uid: uid2, db, publicationDate: PUBLICATION_DATE, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
    geminiProvider: new FakeGeminiProvider({
      responses: [{ text: 'not-json' }],
    }),
  });
  assert.equal(gemBad.report.prose.source, 'fallback');

  // concorrenza
  const uid3 = 'i4e_conc';
  await clearUserFocusAndTracker(db, uid3);
  await seedTrackerMap(db, uid3, map);
  const [c1, c2] = await Promise.all([
    runFocusEditionPipeline({
      uid: uid3, db, publicationDate: PUBLICATION_DATE, historyDays: 14,
      targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4, ownerId: 'wa',
    }),
    runFocusEditionPipeline({
      uid: uid3, db, publicationDate: PUBLICATION_DATE, historyDays: 14,
      targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4, ownerId: 'wb',
    }),
  ]);
  const oks = [c1, c2].filter((r) => r.ok);
  assert.equal(oks.length, 1, JSON.stringify({ c1: c1.error, c2: c2.error }));

  // crash: job interrupted → ripresa
  const uid4 = 'i4e_crash';
  await clearUserFocusAndTracker(db, uid4);
  await seedTrackerMap(db, uid4, map);
  const persistence = new AdminRtdbFocusPersistence(db);
  await persistence.claimJob(uid4, PUBLICATION_DATE, {
    ownerId: 'dead',
    analysisDate: ANALYSIS_DATE,
    inputFingerprint: 'x',
  });
  await persistence.markJobInterrupted(uid4, PUBLICATION_DATE);
  const recovered = await runFocusEditionPipeline({
    uid: uid4, db, publicationDate: PUBLICATION_DATE, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
    ownerId: 'rescuer',
    allowStealInterrupted: true,
  });
  assert.equal(recovered.ok, true, recovered.error);
});

test('I4-E.7 client legge solo edizione pubblicata; archivio; year/DST', { skip: !EMULATOR }, async () => {
  const uid = 'i4e_client';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildFullTrackerDayMap({ historyDays: 14 }));
  const out = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 }, bodyWeightKg: 78.4,
  });
  assert.equal(out.ok, true, out.error);

  // revisione preparatoria non puntata
  await db.ref(`kentu_focus/${uid}/editions/${PUBLICATION_DATE}/rev/9`).set({
    schemaVersion: '1.0.0',
    kind: 'FocusEditionRevision',
    revision: 9,
    headlineSeed: 'prep',
  });

  const token = await createEmulatorIdToken(uid);
  const auth = { idToken: token };
  const meta = await emulatorRestGet(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}/meta`,
    auth,
  );
  assert.equal(meta.denied, false, meta.raw);
  assert.ok(meta.body?.currentRevision === 1);
  const rev1 = await emulatorRestGet(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}/rev/1`,
    auth,
  );
  assert.equal(rev1.denied, false, rev1.raw);
  const rev9 = await emulatorRestGet(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}/rev/9`,
    auth,
  );
  assert.equal(rev9.denied, true, rev9.raw);

  const job = await emulatorRestGet(`kentu_focus/${uid}/jobs/${PUBLICATION_DATE}`, auth);
  assert.equal(job.denied, true, job.raw);
  const mem = await emulatorRestGet(`kentu_focus/${uid}/editorial_memory`, auth);
  assert.equal(mem.denied, true, mem.raw);
  const dossier = await emulatorRestGet(
    `kentu_focus/${uid}/dossiers/${ANALYSIS_DATE}`,
    auth,
  );
  assert.equal(dossier.denied, true, dossier.raw);

  const put = await (await import('../emulator/loadFocusRules.js')).emulatorRestPut(
    `kentu_focus/${uid}/editions/${PUBLICATION_DATE}/meta`,
    { hack: true },
    auth,
  );
  assert.equal(put.denied, true, put.raw);

  const archive = await emulatorRestGet(`kentu_focus/${uid}/archive_index`, auth);
  assert.equal(archive.denied, false, archive.raw);
  const archiveBytes = Buffer.byteLength(JSON.stringify(archive.body || {}), 'utf8');
  assert.ok(archiveBytes < 50_000);
  // Indice: niente body articoli
  const archStr = JSON.stringify(archive.body || {});
  assert.ok(!/"body"\s*:/.test(archStr) || !archStr.includes('"articles"'));

  // year + DST
  const yb = buildYearBoundaryMap();
  const uidY = 'i4e_year';
  await clearUserFocusAndTracker(db, uidY);
  await seedTrackerMap(db, uidY, yb.map);
  const y = await runFocusEditionPipeline({
    uid: uidY, db, publicationDate: yb.publicationDate, historyDays: 10,
    targets: { kcal: 2300, proteinG: 150 },
  });
  assert.equal(y.ok, true, y.error);
  assert.equal(y.analysisDate, yb.analysisDate);

  const dst = buildDstBoundaryMap();
  const uidD = 'i4e_dst';
  await clearUserFocusAndTracker(db, uidD);
  await seedTrackerMap(db, uidD, dst.map);
  const d = await runFocusEditionPipeline({
    uid: uidD, db, publicationDate: dst.publicationDate, historyDays: 14,
    targets: { kcal: 2300, proteinG: 150 },
  });
  assert.equal(d.ok, true, d.error);
  assert.equal(addCalendarDays(dst.analysisDate, 1), dst.publicationDate);
});

test('I4-E.8 tre edizioni pubblicate (fixture) — contenuto reale emulator', { skip: !EMULATOR }, async () => {
  const cases = [
    {
      label: 'positiva',
      uid: 'i4e_ed_pos',
      map: buildFullTrackerDayMap({ historyDays: 20 }),
      targets: { kcal: 2300, proteinG: 150 },
      bodyWeightKg: 78.4,
      gemini: null,
    },
    {
      label: 'scarsa',
      uid: 'i4e_ed_sparse',
      map: buildSparseTrackerMap(),
      targets: null,
      bodyWeightKg: null,
      gemini: null,
    },
    {
      label: 'gemini_sim',
      uid: 'i4e_ed_sim',
      map: buildFullTrackerDayMap({ historyDays: 14 }),
      targets: { kcal: 2300, proteinG: 150 },
      bodyWeightKg: 78.4,
      gemini: 'valid',
    },
  ];

  const editions = [];
  for (const c of cases) {
    await clearUserFocusAndTracker(db, c.uid);
    await seedTrackerMap(db, c.uid, c.map);

    let geminiProvider = null;
    if (c.gemini === 'valid') {
      const reader = new AdminRtdbTrackerReader(db);
      const built = await (await import('../reader/buildDossierInputFromTracker.js'))
        .buildDossierInputFromTracker({
          uid: c.uid, reader, publicationDate: PUBLICATION_DATE, historyDays: 14,
          targets: c.targets, bodyWeightKg: c.bodyWeightKg,
        });
      const selection = selectFocusEditorial({
        dossier: buildFocusDossier({ uid: c.uid, ...built.dossierInput }),
        memory: createEmptyEditorialMemory(),
      });
      geminiProvider = new FakeGeminiProvider({
        responses: [{
          text: JSON.stringify({
            ...buildFallbackWrittenEdition({ selection }),
            schemaVersion: FOCUS_WRITTEN_SCHEMA_VERSION,
            kind: 'FocusWrittenEdition',
          }),
        }],
      });
    }

    const out = await runFocusEditionPipeline({
      uid: c.uid,
      db,
      publicationDate: PUBLICATION_DATE,
      historyDays: c.label === 'scarsa' ? 7 : 20,
      targets: c.targets,
      bodyWeightKg: c.bodyWeightKg,
      geminiProvider,
    });
    assert.equal(out.ok, true, `${c.label}: ${out.error}`);

    const pub = await new AdminRtdbFocusPersistence(db)
      .getPublishedEdition(c.uid, PUBLICATION_DATE);
    const rev = pub.revision;
    editions.push({
      label: c.label,
      proseSource: rev?.aiBriefRef?.proseSource || out.report.prose.source,
      usedFallback: rev?.aiBriefRef?.usedFallback,
      note: c.gemini === 'valid'
        ? 'Gemini SIMULATO (FakeGemini) — non live'
        : 'fallback deterministico — non Gemini live',
      publicationDate: PUBLICATION_DATE,
      analysisDate: ANALYSIS_DATE,
      teaser: pub.meta?.teaser || pub.meta?.headline,
      headline: pub.meta?.headline,
      lead: rev?.lead ? { title: rev.lead.title, body: rev.lead.body } : null,
      articles: [
        ...(rev?.goodNews || []).map((a) => ({ role: 'good', title: a.title, body: a.body })),
        ...(rev?.features || []).map((a) => ({ role: 'feature', title: a.title, body: a.body })),
        ...(rev?.concerns || []).map((a) => ({ role: 'concern', title: a.title, body: a.body })),
      ],
      coach: rev?.coach ? { title: rev.coach.title, body: rev.coach.body } : null,
      evidenceSample: (rev?.lead?.metricsCited || rev?.goodNews?.[0]?.metricsCited || []).slice(0, 3),
      report: out.report,
    });
  }

  console.log('I4E_THREE_EDITIONS', JSON.stringify(editions, null, 2));
  assert.equal(editions.length, 3);
  assert.ok(editions.some((e) => e.proseSource === 'fallback'));
  assert.ok(editions.some((e) => e.proseSource === 'validated_ai'));
});

test('I4-E.9 regen e flag bypass NON aprono il gate sonno', { skip: !EMULATOR }, async () => {
  const uid = 'i4e_regen';
  await clearUserFocusAndTracker(db, uid);
  await seedTrackerMap(db, uid, buildNoSleepTrackerMap());
  const blocked = await runFocusEditionPipeline({
    uid, db, publicationDate: PUBLICATION_DATE, historyDays: 7,
    explicitRegen: true,
    allowPublishWithoutSleep: true,
    adminAllowPublishWithoutSleep: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'sleep_required');
  assert.ok(blocked.report.notes.includes('ignored_client_sleep_bypass_flag'));
});
