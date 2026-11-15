/**
 * Lock / circuit breaker su RTDB emulator (mock askAI: nessuna Gemini).
 * Richiede FIREBASE_DATABASE_EMULATOR_HOST (come p1k).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after, beforeEach } from 'node:test';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
  getFocusEmulatorHost,
} from '../emulator/createEmulatorAdmin.js';
import { loadFocusLocalRules, emulatorRestGet, emulatorRestPut } from '../emulator/loadFocusRules.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import {
  createMemoryFocusAiLockStore,
  forceCircuitDecision,
  morningLockDecision,
} from '../../product/focusAiLocks.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MAX_FOCUS_AI_COACH_PER_DAY,
  QUOTA_FOCUS_IT,
  quotaDecision,
  consumeGeminiQuota,
  quotaPath,
  quotaDayKey,
} = require('../../../../../functions/lib/geminiQuota.js');

const EMULATOR = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../../');
const RULES = path.join(ROOT, 'database.rules.focus.local.json');
const QUOTA_UID = 'quota_uid_a';
const QUOTA_UID_B = 'quota_uid_b';

describe('focus AI locks + quota (emulator / mock)', { skip: !EMULATOR }, () => {
  /** @type {import('firebase-admin/database').Database} */
  let db;
  /** @type {string} */
  let tokenA;
  /** @type {string} */
  let tokenB;

  before(async () => {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = getFocusEmulatorHost();
    const adminApp = createEmulatorAdminApp();
    db = adminApp.db;
    await loadFocusLocalRules(RULES);
    tokenA = await createEmulatorIdToken(QUOTA_UID);
    tokenB = await createEmulatorIdToken(QUOTA_UID_B);
  });

  after(async () => {
    await deleteEmulatorAdminApp();
  });

  beforeEach(async () => {
    await db.ref('users/lock_uid_a/focus_ai_locks').set(null);
    await db.ref(`ai_call_quota/${QUOTA_UID}`).set(null);
    await db.ref(`ai_call_quota/${QUOTA_UID_B}`).set(null);
  });

  it('transaction mattino: secondo claim fallisce', async () => {
    const pathLock = 'users/lock_uid_a/focus_ai_locks/ieri';
    const first = await db.ref(pathLock).transaction((cur) => {
      if (morningLockDecision(cur, 'dv1', '2026-11-15') !== 'run') return;
      return {
        dataVersion: 'dv1',
        status: 'running',
        on: '2026-11-15',
        updatedAt: Date.now(),
      };
    });
    assert.equal(first.committed, true);

    const second = await db.ref(pathLock).transaction((cur) => {
      if (morningLockDecision(cur, 'dv1', '2026-11-15') !== 'run') return;
      return {
        dataVersion: 'dv1',
        status: 'running',
        on: '2026-11-15',
        updatedAt: Date.now(),
      };
    });
    assert.equal(second.committed, false);
  });

  it('transaction force: circuit breaker entro un’ora', async () => {
    const pathLock = 'users/lock_uid_a/focus_ai_locks/ieri';
    const t0 = Date.now();
    const first = await db.ref(pathLock).transaction((cur) => {
      if (forceCircuitDecision(cur, 'dv1', t0) === 'block') return;
      return {
        ...(cur && typeof cur === 'object' ? cur : {}),
        force: { dataVersion: 'dv1', at: t0 },
        updatedAt: t0,
      };
    });
    assert.equal(first.committed, true);

    const second = await db.ref(pathLock).transaction((cur) => {
      if (forceCircuitDecision(cur, 'dv1', t0 + 1000) === 'block') return;
      return {
        ...(cur && typeof cur === 'object' ? cur : {}),
        force: { dataVersion: 'dv1', at: t0 + 1000 },
        updatedAt: t0 + 1000,
      };
    });
    assert.equal(second.committed, false);
  });

  it('ai_call_quota: Admin scrive; client non può scrivere né cancellare; owner può leggere', async () => {
    const day = quotaDayKey();
    const path = quotaPath(QUOTA_UID, day);
    const seed = {
      total: 3,
      byTag: { focus_ai_coach: 2, chat_structured: 1 },
      updatedAt: Date.now(),
    };

    // Solo Admin SDK (come callGemini → consumeGeminiQuota).
    await db.ref(path).set(seed);
    const adminSnap = await db.ref(path).get();
    assert.equal(adminSnap.exists(), true);
    assert.equal(adminSnap.val().total, 3);

    const ownerRead = await emulatorRestGet(path, { idToken: tokenA });
    assert.equal(ownerRead.denied, false, `owner read: ${ownerRead.raw}`);
    assert.equal(ownerRead.body?.total, 3);

    const otherRead = await emulatorRestGet(path, { idToken: tokenB });
    assert.equal(otherRead.denied, true, `B non legge quota di A: ${otherRead.raw}`);

    const anonRead = await emulatorRestGet(path, {});
    assert.equal(anonRead.denied, true, `anonimo negato in lettura: ${anonRead.raw}`);

    const clientWrite = await emulatorRestPut(
      path,
      { total: 0, byTag: {}, updatedAt: Date.now() },
      { idToken: tokenA },
    );
    assert.equal(clientWrite.denied, true, `client write deve essere rifiutato: ${clientWrite.raw}`);

    const clientDelete = await emulatorRestPut(path, null, { idToken: tokenA });
    assert.equal(clientDelete.denied, true, `client delete deve essere rifiutato: ${clientDelete.raw}`);

    const after = await db.ref(path).get();
    assert.equal(after.exists(), true);
    assert.equal(after.val().total, 3, 'Admin seed resta invariato dopo tentativi client');
  });
});

describe('focus AI locks + quota mock (sempre, no Gemini)', () => {
  it('memory store e quotaDecision senza chiamate reali', async () => {
    const store = createMemoryFocusAiLockStore();
    const claim = await store.claimMorning({
      uid: 'm1',
      periodId: 'settimana',
      dataVersion: 'x',
      today: '2026-11-15',
    });
    assert.equal(claim.ok, true);
    const again = await store.claimMorning({
      uid: 'm1',
      periodId: 'settimana',
      dataVersion: 'x',
      today: '2026-11-15',
    });
    assert.equal(again.ok, false);

    const focusCap = quotaDecision(
      { total: 6, byTag: { focus_ai_coach: MAX_FOCUS_AI_COACH_PER_DAY } },
      'focus_ai_coach',
    );
    assert.equal(focusCap.ok, false);
    assert.equal(focusCap.message, QUOTA_FOCUS_IT);
  });

  it('consumeGeminiQuota con mock db (nessuna Gemini)', async () => {
    const data = {};
    const db = {
      ref(path) {
        return {
          async transaction(updateFn) {
            const current = data[path] ?? null;
            const next = updateFn(current);
            if (next === undefined) {
              return { committed: false, snapshot: { val: () => current } };
            }
            data[path] = next;
            return { committed: true, snapshot: { val: () => next } };
          },
        };
      },
    };
    for (let i = 0; i < MAX_FOCUS_AI_COACH_PER_DAY; i += 1) {
      const r = await consumeGeminiQuota({ db, uid: 'emu-q', callTag: 'focus_ai_coach' });
      assert.equal(r.ok, true);
    }
    const blocked = await consumeGeminiQuota({ db, uid: 'emu-q', callTag: 'focus_ai_coach' });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.message, QUOTA_FOCUS_IT);
  });
});
