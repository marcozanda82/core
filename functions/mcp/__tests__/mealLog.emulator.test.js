/**
 * Emulatore: pasto Claude + pasto app nello stesso minuto → entrambi presenti.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../../../src/features/kentuFocus/server/emulator/createEmulatorAdmin.js';
import { loadFocusLocalRules } from '../../../src/features/kentuFocus/server/emulator/loadFocusRules.js';
import { mergeDayNodeWrite } from '../../../src/utils/dayNodeWriteCore.js';
import { saveDayNodeWithRevAdmin } from '../dayWriteAdmin.js';
import { validateMealLogInput, buildClaudeMealEntries, CLAUDE_MEAL_ORIGIN } from '../mealLog.js';

const UID = 'mcp_meal_log_emu_user';
const DATE = '2026-11-20';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** @type {import('firebase-admin/database').Database | null} */
let adminDb = null;

before(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    || '127.0.0.1:9000';
  const admin = createEmulatorAdminApp();
  adminDb = admin.db;
  await loadFocusLocalRules(path.join(ROOT, 'database.rules.json'));
  await adminDb.ref(`users/${UID}/tracker_data`).set(null);
});

after(async () => {
  await deleteEmulatorAdminApp();
});

test('validateMealLogInput: rifiuta senza foodDbKey/grams', () => {
  assert.throws(
    () => validateMealLogInput({
      date: DATE,
      slot: 'pranzo',
      time: '13:00',
      items: [{ name: 'pane', grams: 80 }],
      originalText: 'pane',
      idempotencyKey: 'pranzo-test-0001',
    }),
    (e) => e.code === 'invalid_input',
  );
});

test('emulator: Claude meal + app meal same minute both present', async () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const appMeal = {
    type: 'meal',
    mealId: 'pranzo_app_1',
    desc: 'Pranzo',
    items: [{
      id: 'app_item_1',
      type: 'food',
      name: 'Riso',
      desc: 'Riso',
      grams: 80,
      qta: 80,
      kcal: 100,
      cal: 100,
      prot: 2,
      carb: 22,
      fat: 0.3,
      foodDbKey: 'riso',
      mealType: 'pranzo_app_1',
      mealTime: 13,
      entrySource: 'ui',
    }],
  };

  // App write (simulata con stesso writer merge)
  await saveDayNodeWithRevAdmin(adminDb, UID, DATE, {
    data: DATE,
    log: [appMeal],
    mealTimes: { pranzo_app_1: 13 },
  }, { now });

  const foodCtx = {
    personalDb: {
      pasta: { name: 'Pasta', desc: 'Pasta', kcal: 350, prot: 12, carb: 70, fatTotal: 1.5, na: 5 },
    },
    catalogs: { kentuItDb: {}, globalDb: {}, offDb: {} },
  };
  const items = await buildClaudeMealEntries(
    [{ name: 'pasta', foodDbKey: 'pasta', grams: 90 }],
    foodCtx,
    { mealId: 'claude_pranzo_test01', slot: 'pranzo', mealTime: 13, now },
  );
  assert.ok(items.length >= 1);
  assert.equal(items[0].grams, 90);
  assert.equal(items[0].origin, CLAUDE_MEAL_ORIGIN);

  const claudeMeal = {
    type: 'meal',
    mealId: 'claude_pranzo_test01',
    desc: 'Pranzo',
    origin: CLAUDE_MEAL_ORIGIN,
    items,
  };

  const { rev } = await saveDayNodeWithRevAdmin(adminDb, UID, DATE, {
    data: DATE,
    log: [claudeMeal],
    mealTimes: { claude_pranzo_test01: 13 },
  }, { now: now + 1000 });

  assert.ok(rev >= 2);
  const snap = await adminDb.ref(`users/${UID}/tracker_data/trackerStorico_${DATE}`).get();
  const log = snap.val()?.log || [];
  const ids = log.map((row) => row.mealId);
  assert.ok(ids.includes('pranzo_app_1'), 'pasto app presente');
  assert.ok(ids.includes('claude_pranzo_test01'), 'pasto Claude presente');

  // Undo Claude via logDeleteIds: app resta
  await saveDayNodeWithRevAdmin(adminDb, UID, DATE, {
    log: [],
    logDeleteIds: ['claude_pranzo_test01'],
  }, { now: now + 2000 });
  const after = await adminDb.ref(`users/${UID}/tracker_data/trackerStorico_${DATE}`).get();
  const ids2 = (after.val()?.log || []).map((row) => row.mealId);
  assert.ok(ids2.includes('pranzo_app_1'));
  assert.ok(!ids2.includes('claude_pranzo_test01'));
});

test('mergeDayNodeWrite pure: due pasti non si sovrascrivono', () => {
  const a = { type: 'meal', mealId: 'a', items: [{ id: '1' }] };
  const b = { type: 'meal', mealId: 'b', items: [{ id: '2' }] };
  const first = mergeDayNodeWrite(null, { log: [a], data: DATE }, { uid: UID, now: 1 });
  const second = mergeDayNodeWrite(first.next, { log: [b] }, { expectedRev: 1, uid: UID, now: 2 });
  assert.equal(second.ok, true);
  assert.deepEqual(second.next.log.map((r) => r.mealId).sort(), ['a', 'b']);
});
