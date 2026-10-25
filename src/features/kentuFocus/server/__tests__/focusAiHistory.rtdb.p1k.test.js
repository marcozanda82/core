/**
 * P1K — Storico Focus AI su RTDB Emulator (due client, isolamento UID, rules).
 * Di default carica ESATTAMENTE database.rules.json (rules di deploy, senza nested AI).
 * FOCUS_AI_RULES=local → database.rules.focus.local.json (validate rafforzate).
 * Nessuna Gemini, nessun deploy, nessuna scrittura produzione.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after, beforeEach } from 'node:test';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
  getFocusEmulatorHost,
  getFocusEmulatorProjectId,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import {
  loadFocusLocalRules,
  emulatorRestGet,
  emulatorRestPut,
} from '../emulator/loadFocusRules.js';
import { createEmulatorAuthedFocusAiStore } from '../emulator/createEmulatorClientFocusAiStore.js';
import {
  buildFocusAiAnalysisRecord,
  FOCUS_AI_ANALYSIS_RETENTION_DAYS,
  focusAiAnalysisBasePath,
  focusAiAnalysisIndexPath,
  createFirebaseFocusAiAnalysisStore,
  listFocusAiAnalysisHistory,
  loadFocusAiAnalysisFromStore,
  requestFocusAiCoachAnalysis,
  __resetFocusAiCoachMemoryForTests,
  stashFocusDiaryForUser,
  resolveFocusPageSession,
  __resetFocusDiaryHandoffForTests,
  FOCUS_PAGE_MODE,
} from '../../product/index.js';

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../../');
/** Rules di deploy (default di questa verifica). */
const DEPLOY_RULES = path.join(ROOT, 'database.rules.json');
const LOCAL_AI_RULES = path.join(ROOT, 'database.rules.focus.local.json');
const USE_LOCAL_AI_RULES = String(process.env.FOCUS_AI_RULES || '').toLowerCase() === 'local';
const RULES_UNDER_TEST = USE_LOCAL_AI_RULES ? LOCAL_AI_RULES : DEPLOY_RULES;
const USING_DEPLOY_RULES = !USE_LOCAL_AI_RULES;
const UID_A = 'focus_ai_uid_a';
const UID_B = 'focus_ai_uid_b';
const DAY = '2026-10-23';
const PUB = '2026-10-24';

const SAMPLE_ANALYSIS = {
  schema: 'kentu.focusAiCoachAnalysis.v2',
  theEmergingPicture: 'Quadro interpretativo di test emulator.',
  nutrition: 'Scelte alimentari coerenti col supporto all’allenamento.',
  exercise: 'Sessione di forza contestualizzata.',
  sleep: 'Durata documentata senza inferenze cliniche.',
  importantConnections: ['Ipotesi timing pasti–allenamento'],
  theChoiceIWouldMake: 'Sposta una porzione di carboidrati già registrati più vicino all’allenamento.',
  whatToWatchNext: 'Osserva energia in sessione per 7 giorni.',
  primaryPillarId: 'nutrition',
  integratedComment: 'Quadro interpretativo di test emulator.',
  pillarObservations: {
    nutrition: 'Scelte alimentari coerenti col supporto all’allenamento.',
    exercise: 'Sessione di forza contestualizzata.',
    sleep: 'Durata documentata senza inferenze cliniche.',
  },
  focusAspects: ['Ipotesi timing pasti–allenamento'],
  practicalAction: 'Sposta una porzione di carboidrati già registrati più vicino all’allenamento.',
};

function sampleRecord(uid, periodId = 'ieri', overrides = {}) {
  const binding = {
    uid,
    periodId,
    analysisDate: DAY,
    publicationDate: PUB,
    dataVersion: overrides.dataVersion || 'dv_test_1',
    windowKey: DAY,
  };
  const dossier = {
    schema: 'kentu.focusAiCoachDossier.v2',
    windowLabel: `Giorno ${DAY}`,
    compassSignals: { available: true },
    nutrition: { meals: [{ items: [{ name: 'Riso' }] }] },
    exercise: { workouts: [{ label: 'Pesi' }] },
  };
  const record = buildFocusAiAnalysisRecord(binding, SAMPLE_ANALYSIS, dossier, overrides.revisionSeq || 1);
  if (overrides.generatedAt != null) record.generatedAt = overrides.generatedAt;
  if (overrides.notDemo != null) record.notDemo = overrides.notDemo;
  if (overrides.source != null) record.source = overrides.source;
  return record;
}

function richHistory() {
  return {
    [`trackerStorico_${DAY}`]: {
      data: DAY,
      log: [
        {
          type: 'food', id: 'f1', name: 'Riso', mealType: 'pranzo', mealTime: 13,
          grams: 150, kcal: 200, prot: 5, carb: 40, fat: 1,
        },
        {
          type: 'workout', id: 'w1', name: 'Pesi · Petto', workoutType: 'pesi',
          duration: 40, time: 17, muscles: ['Petto'],
        },
      ],
    },
    [`trackerStorico_${PUB}`]: {
      data: PUB,
      log: [{ type: 'sleep', id: 's1', hours: 7.5, wakeTime: 7, bedtime: 23.5 }],
    },
  };
}

/** @type {import('firebase-admin/database').Database} */
let db;
let tokenA;
let tokenB;

describe('Focus AI history RTDB emulator P1K', { skip: !EMULATOR }, () => {
  before(async () => {
    assert.match(getFocusEmulatorHost(), /^127\.0\.0\.1:/);
    assert.equal(getFocusEmulatorProjectId(), 'demo-kentu-focus');
    const adminApp = createEmulatorAdminApp();
    db = adminApp.db;
    // eslint-disable-next-line no-console
    console.log(`\n===== P1K_RULES_FILE =====\n${RULES_UNDER_TEST}\nusingDeployRules=${USING_DEPLOY_RULES}\n`);
    await loadFocusLocalRules(RULES_UNDER_TEST);
    tokenA = await createEmulatorIdToken(UID_A);
    tokenB = await createEmulatorIdToken(UID_B);
  });

  after(async () => {
    await deleteEmulatorAdminApp();
  });

  beforeEach(async () => {
    __resetFocusAiCoachMemoryForTests();
    __resetFocusDiaryHandoffForTests();
    await db.ref(`users/${UID_A}/kentu_focus_ai`).set(null);
    await db.ref(`users/${UID_A}/kentu_focus_ai_index`).set(null);
    await db.ref(`users/${UID_B}/kentu_focus_ai`).set(null);
    await db.ref(`users/${UID_B}/kentu_focus_ai_index`).set(null);
  });

  it('A→B stesso UID: client A salva, client B recupera senza Gemini', async () => {
    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `devA-${Date.now()}`);
    const clientB = await createEmulatorAuthedFocusAiStore(UID_A, `devB-${Date.now()}`);
    try {
      const record = sampleRecord(UID_A, 'ieri');
      const saved = await clientA.store.saveRevision({
        uid: UID_A,
        periodId: 'ieri',
        windowKey: DAY,
        record,
      });
      assert.equal(saved.ok, true, JSON.stringify(saved));

      // Nuova «sessione» B: sola lettura store, zero Gemini
      const loaded = await clientB.store.readCurrent({
        uid: UID_A,
        periodId: 'ieri',
        windowKey: DAY,
        currentDataVersion: 'dv_test_1',
      });
      assert.equal(loaded.ok, true, JSON.stringify(loaded));
      assert.equal(loaded.record.analysis.theEmergingPicture, SAMPLE_ANALYSIS.theEmergingPicture);
      assert.equal(loaded.record.diaryStale, false);
      assert.equal(loaded.record.uid, UID_A);

      const idx = await listFocusAiAnalysisHistory({
        uid: UID_A,
        persistence: clientB.store,
      });
      assert.ok(idx.rows.some((r) => r.periodId === 'ieri' && r.windowKey === DAY));
    } finally {
      await clientA.dispose();
      await clientB.dispose();
    }
  });

  it('UID diverso: negato in lettura e scrittura (rules + REST)', async () => {
    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `isoA-${Date.now()}`);
    try {
      const record = sampleRecord(UID_A, 'ieri');
      assert.equal((await clientA.store.saveRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, record,
      })).ok, true);

      const path = `${focusAiAnalysisBasePath(UID_A, 'ieri', DAY)}/current`;
      const crossRead = await emulatorRestGet(path, { idToken: tokenB });
      assert.equal(crossRead.denied, true, `B non deve leggere A: ${crossRead.raw}`);

      const crossWrite = await emulatorRestPut(
        `${focusAiAnalysisBasePath(UID_A, 'ieri', DAY)}/revisions/hack`,
        { ...record, revisionId: 'hack', uid: UID_A },
        { idToken: tokenB },
      );
      assert.equal(crossWrite.denied, true, `B non deve scrivere su A: ${crossWrite.raw}`);

      const anon = await emulatorRestGet(path, {});
      assert.equal(anon.denied, true, `anonimo negato: ${anon.raw}`);
    } finally {
      await clientA.dispose();
    }
  });

  it('demo / source invalidi: adapter rifiuta; rules nested solo se local', async () => {
    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `demo-${Date.now()}`);
    try {
      const demo = sampleRecord(UID_A, 'ieri', {});
      demo.notDemo = false;
      const blocked = await clientA.store.saveRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, record: demo,
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.reason, 'demo_forbidden');

      // Put diretto bypassando l’adapter: con database.rules.json (owner write)
      // le validate nested NON ci sono → owner può scrivere junk; con focus.local → denied.
      const bad = sampleRecord(UID_A, 'ieri');
      bad.notDemo = false;
      const put = await emulatorRestPut(
        `${focusAiAnalysisBasePath(UID_A, 'ieri', DAY)}/revisions/${bad.revisionId}`,
        bad,
        { idToken: tokenA },
      );
      if (USING_DEPLOY_RULES) {
        assert.equal(put.denied, false, `deploy rules: owner write consente anche notDemo=false: ${put.raw}`);
      } else {
        assert.equal(put.denied, true, `local AI rules devono rifiutare demo: ${put.raw}`);
      }
    } finally {
      await clientA.dispose();
    }
  });

  it('retention 30/90/365 e revisioni', async () => {
    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `ret-${Date.now()}`);
    try {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      const r1 = sampleRecord(UID_A, 'ieri', { revisionSeq: 1, generatedAt: now });
      assert.equal((await clientA.store.saveRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, record: r1,
      })).ok, true);

      const r2 = sampleRecord(UID_A, 'ieri', { revisionSeq: 2, generatedAt: now + 1000 });
      assert.equal((await clientA.store.saveRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, record: r2,
      })).ok, true);

      const cur = await clientA.store.readCurrent({
        uid: UID_A, periodId: 'ieri', windowKey: DAY,
      });
      assert.equal(cur.record.revisionSeq, 2);

      const oldRev = await clientA.store.readRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, revisionId: r1.revisionId,
      });
      assert.equal(oldRev.ok, true);
      assert.equal(oldRev.record.revisionSeq, 1);

      // Scaduta ieri (>30g): seed via admin, client vede expired
      const expired = sampleRecord(UID_A, 'ieri', {
        revisionSeq: 9,
        generatedAt: now - (FOCUS_AI_ANALYSIS_RETENTION_DAYS.ieri + 2) * dayMs,
      });
      await db.ref(`${focusAiAnalysisBasePath(UID_A, 'ieri', '2020-01-01')}/revisions/${expired.revisionId}`).set(expired);
      await db.ref(`${focusAiAnalysisBasePath(UID_A, 'ieri', '2020-01-01')}/current`).set({
        revisionId: expired.revisionId,
        dataVersion: expired.dataVersion,
        generatedAt: expired.generatedAt,
        periodId: 'ieri',
        windowKey: '2020-01-01',
      });
      const expiredRead = await clientA.store.readCurrent({
        uid: UID_A, periodId: 'ieri', windowKey: '2020-01-01',
      });
      assert.equal(expiredRead.ok, false);
      assert.equal(expiredRead.reason, 'expired');

      assert.equal(FOCUS_AI_ANALYSIS_RETENTION_DAYS.settimana, 90);
      assert.equal(FOCUS_AI_ANALYSIS_RETENTION_DAYS.mese, 365);

      const week = sampleRecord(UID_A, 'settimana', { revisionSeq: 1 });
      assert.equal((await clientA.store.saveRevision({
        uid: UID_A, periodId: 'settimana', windowKey: DAY, record: week,
      })).ok, true);
      const month = sampleRecord(UID_A, 'mese', { revisionSeq: 1 });
      assert.equal((await clientA.store.saveRevision({
        uid: UID_A, periodId: 'mese', windowKey: DAY, record: month,
      })).ok, true);

      const all = await clientA.store.listIndex({ uid: UID_A });
      assert.ok(all.rows.some((r) => r.periodId === 'ieri'));
      assert.ok(all.rows.some((r) => r.periodId === 'settimana'));
      assert.ok(all.rows.some((r) => r.periodId === 'mese'));
    } finally {
      await clientA.dispose();
    }
  });

  it('errore di rete gestito dall’adapter', async () => {
    const broken = createFirebaseFocusAiAnalysisStore({
      db: {},
      ref: () => {
        throw new Error('simulated_network_down');
      },
      set: async () => {},
      get: async () => {},
    });
    const record = sampleRecord(UID_A, 'ieri');
    const saved = await broken.saveRevision({
      uid: UID_A, periodId: 'ieri', windowKey: DAY, record,
    });
    assert.equal(saved.ok, false);
    assert.equal(saved.reason, 'network_error');

    const read = await broken.readCurrent({
      uid: UID_A, periodId: 'ieri', windowKey: DAY,
    });
    assert.equal(read.ok, false);
    assert.equal(read.reason, 'network_error');
  });

  it('senza handoff RAM: listIndex da store consente consultazione storico (path /kentu-focus)', async () => {
    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `handoff-${Date.now()}`);
    try {
      const record = sampleRecord(UID_A, 'ieri');
      await clientA.store.saveRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, record,
      });

      // Nessun stashFocusDiaryForUser → sessione demo, ma storico leggibile
      const session = resolveFocusPageSession({ uid: UID_A, periodId: 'ieri' });
      assert.notEqual(session.mode, FOCUS_PAGE_MODE.real_diary);

      const hist = await listFocusAiAnalysisHistory({
        uid: UID_A,
        persistence: clientA.store,
      });
      assert.ok(hist.rows.length >= 1);

      const loaded = await loadFocusAiAnalysisFromStore({
        uid: UID_A,
        periodId: 'ieri',
        windowKey: DAY,
        currentDataVersion: null,
        persistence: clientA.store,
      });
      assert.equal(loaded.ok, true);
      assert.equal(loaded.record.analysis.theEmergingPicture, SAMPLE_ANALYSIS.theEmergingPicture);
    } finally {
      await clientA.dispose();
    }
  });

  it('diario aggiornato: analisi precedente consultabile e diaryStale', async () => {
    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `stale-${Date.now()}`);
    try {
      const record = sampleRecord(UID_A, 'ieri', { dataVersion: 'dv_old' });
      await clientA.store.saveRevision({
        uid: UID_A, periodId: 'ieri', windowKey: DAY, record,
      });

      const loaded = await clientA.store.readCurrent({
        uid: UID_A,
        periodId: 'ieri',
        windowKey: DAY,
        currentDataVersion: 'dv_new_after_diary_edit',
      });
      assert.equal(loaded.ok, true);
      assert.equal(loaded.record.diaryStale, true);
      assert.match(loaded.record.freshnessNote, /versione precedente/i);
      assert.equal(loaded.record.analysis.theEmergingPicture, SAMPLE_ANALYSIS.theEmergingPicture);
    } finally {
      await clientA.dispose();
    }
  });

  it('requestFocusAiCoachAnalysis: persist RTDB + secondo client senza nuova Gemini', async () => {
    stashFocusDiaryForUser(UID_A, {
      fullHistory: richHistory(),
      analysisDate: DAY,
      publicationDate: PUB,
      userTargets: { kcal: 2200, prot: 140 },
    });
    const session = resolveFocusPageSession({ uid: UID_A, periodId: 'ieri' });
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);

    const clientA = await createEmulatorAuthedFocusAiStore(UID_A, `reqA-${Date.now()}`);
    const clientB = await createEmulatorAuthedFocusAiStore(UID_A, `reqB-${Date.now()}`);
    let geminiCalls = 0;
    const askAiFn = async () => {
      geminiCalls += 1;
      return JSON.stringify(SAMPLE_ANALYSIS);
    };

    try {
      const fromA = await requestFocusAiCoachAnalysis({
        session,
        askAiFn,
        persistence: clientA.store,
        force: true,
      });
      assert.equal(fromA.ok, true, JSON.stringify(fromA));
      assert.equal(geminiCalls, 1);
      assert.ok(fromA.record?.revisionId);

      __resetFocusAiCoachMemoryForTests();

      const fromB = await requestFocusAiCoachAnalysis({
        session,
        askAiFn,
        persistence: clientB.store,
        force: false,
      });
      assert.equal(fromB.ok, true);
      assert.equal(fromB.fromPersistence, true);
      assert.equal(geminiCalls, 1);
      assert.equal(
        fromB.analysis.theEmergingPicture,
        fromA.analysis.theEmergingPicture,
      );
    } finally {
      await clientA.dispose();
      await clientB.dispose();
    }
  });

  it('rules: periodo non ammesso — solo con validate local; deploy rules lo consentono', async () => {
    const badPeriodPath = `users/${UID_A}/kentu_focus_ai/anno/${DAY}/current`;
    const put = await emulatorRestPut(badPeriodPath, {
      revisionId: 'r1',
      dataVersion: 'x',
      generatedAt: Date.now(),
      periodId: 'anno',
      windowKey: DAY,
    }, { idToken: tokenA });
    if (USING_DEPLOY_RULES) {
      assert.equal(put.denied, false, `deploy rules: periodo junk ancora scrivibile da owner: ${put.raw}`);
    } else {
      assert.equal(put.denied, true, put.raw);
    }
  });

  it('percorsi RTDB + verdetto rules deploy vs validate', () => {
    assert.equal(
      focusAiAnalysisBasePath(UID_A, 'ieri', DAY),
      `users/${UID_A}/kentu_focus_ai/ieri/${DAY}`,
    );
    assert.equal(
      focusAiAnalysisIndexPath(UID_A),
      `users/${UID_A}/kentu_focus_ai_index`,
    );
    // eslint-disable-next-line no-console
    console.log('\n===== P1K_VERDICT =====\n', JSON.stringify({
      rulesFileLoaded: RULES_UNDER_TEST,
      usingDeployRules: USING_DEPLOY_RULES,
      featureEnabledByCurrentUsersOwnerRules: true,
      nestedValidatesRequiredToEnable: false,
      nestedValidatesPurpose: 'hardening_only',
      retention: {
        consultabilityDays: FOCUS_AI_ANALYSIS_RETENTION_DAYS,
        physicalDeletionImplemented: false,
        note: 'Client nasconde scadute (read/list); nessun delete RTDB automatico',
      },
      paths: {
        revision: `${focusAiAnalysisBasePath('{uid}', '{periodId}', '{windowKey}')}/revisions/{revisionId}`,
        current: `${focusAiAnalysisBasePath('{uid}', '{periodId}', '{windowKey}')}/current`,
        index: `${focusAiAnalysisIndexPath('{uid}')}/{periodId}_{windowKey}`,
      },
    }, null, 2));
  });
});

describe('Focus AI history P1K UI adapter (offline)', () => {
  it('KentuFocusPage usa createFirebaseFocusAiAnalysisStore quando db è presente', async () => {
    const fs = await import('node:fs');
    const pagePath = path.resolve(ROOT, 'src/pages/KentuFocusPage.jsx');
    const src = fs.readFileSync(pagePath, 'utf8');
    assert.match(src, /function resolveFocusAiPersistence/);
    assert.match(src, /createFirebaseFocusAiAnalysisStore\(\{\s*db,\s*ref,\s*set,\s*get\s*\}\)/);
    assert.match(src, /getDefaultMemoryFocusAiAnalysisStore/);
    // Memory solo in catch / assenza db — non è il percorso normale
    assert.match(src, /if \(db\) return createFirebaseFocusAiAnalysisStore/);
    // Storico senza handoff: listFocusAiAnalysisHistory con uid anche fuori real_diary
    assert.match(src, /Storico AI da RTDB anche senza handoff RAM/);
    assert.match(src, /listFocusAiAnalysisHistory\(\{\s*\n\s*uid,/);
  });
});

describe('Focus AI history P1K skip senza emulator', { skip: EMULATOR }, () => {
  it('skip', () => {
    assert.ok(true);
  });
});
