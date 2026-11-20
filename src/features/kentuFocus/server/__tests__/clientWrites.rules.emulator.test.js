/**
 * Catalogo scritture client vs database.rules.json (produzione).
 * Ogni path che l'app scrive con payload reale deve essere accettato;
 * i deny intenzionali (mcp_tokens) sono espliciti.
 * CI: fallisce se un allow viene rifiutato o un deny intenzionale passa.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../emulator/createEmulatorAdmin.js';
import { createEmulatorIdToken } from '../emulator/createEmulatorAuthToken.js';
import {
  emulatorRestPatch,
  emulatorRestPut,
  loadFocusLocalRules,
} from '../emulator/loadFocusRules.js';
import { buildDayTargetSnapshot } from '../../../mealEngine/resolveDayTargetKcal.js';
import { encodeDayScoreForRtdb } from '../../score/dayScoreRecord.js';
import { encodeSafetyForRtdb } from '../../safety/safetyRecord.js';
import { encodeMovementCheckin } from '../../score/movementCheckin.js';
import { encodeScoreFeedback } from '../../score/scoreFeedback.js';
import { buildDayStatusRecord } from '../../../dayStatus/dayStatusRecord.js';

const UID = 'client_writes_rules_user';
const DATE = '2026-11-10';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

/** @type {import('firebase-admin/database').Database | null} */
let db = null;
/** @type {string|null} */
let token = null;

/**
 * @typedef {{ id: string, path: string, payload: unknown, expect: 'allow'|'deny' }} WriteCase
 */

/** @returns {WriteCase[]} */
function catalog() {
  const dayTargetSnapshot = buildDayTargetSnapshot({
    base: 2456,
    burnRaw: 400,
    burnCounted: 200,
    kcalSource: 'estimated',
    autopilot: 40,
    strategy: 0,
    compensation: -50,
    total: 2646,
    rulesVersion: 'dtr-1',
  });

  const kds5Score = encodeDayScoreForRtdb({
    version: 'kds-5',
    reliability: 'high',
    dataVersion: 'fnv1a-client-writes',
    score: 0.72,
    cylinders: {
      alimentazione: {
        status: 'on_track',
        keyFact: '2400 kcal',
        signals: ['late_first_meal'],
        value: 0.85,
      },
      sonno: { status: 'on_track', keyFact: '7 h', signals: [], value: 1 },
      movimento: {
        status: 'halfway',
        keyFact: 'batteria 60% · senza cardio si scarica di circa il 20% al giorno',
        signals: ['movement_battery'],
        value: 0.6,
      },
      forza: { status: 'on_track', keyFact: 'parte alta', signals: [], value: 1 },
    },
  });

  const kds4Score = encodeDayScoreForRtdb({
    version: 'kds-4',
    reliability: 'high',
    dataVersion: 'fnv1a-client-writes-k4',
    score: 0.72,
    cylinders: {
      alimentazione: {
        status: 'on_track',
        keyFact: '2400 kcal',
        signals: ['late_first_meal'],
        value: 0.85,
      },
      sonno: { status: 'on_track', keyFact: '7 h', signals: [], value: 1 },
      movimento: { status: 'halfway', keyFact: 'oggi 20 min', signals: [], value: 0.6 },
      forza: { status: 'on_track', keyFact: 'parte alta', signals: [], value: 1 },
    },
  });

  const kds3Score = encodeDayScoreForRtdb({
    version: 'kds-3',
    reliability: 'high',
    dataVersion: 'fnv1a-kds3',
    score: 0.7,
    cylinders: {
      alimentazione: { status: 'halfway', keyFact: 'x', signals: [], value: 0.6 },
      sonno: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
      movimento: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
      forza: { status: 'inactive', keyFact: 'Forza · non attiva', signals: [], value: null },
    },
  });

  return [
    {
      id: 'tracker_data.day_node',
      path: `users/${UID}/tracker_data/trackerStorico_${DATE}`,
      payload: {
        data: DATE,
        log: [{ type: 'food', id: 'f1', name: 'mela', kcal: 80, mealType: 'colazione' }],
        mealTimes: { colazione: 8 },
        autopilotCorrection: 40,
        dayTargetSnapshot,
        rev: 1,
        revBy: UID,
        revAt: Date.now(),
      },
      expect: 'allow',
    },
    {
      id: 'tracker_data.day_node_without_rev',
      path: `users/${UID}/tracker_data/trackerStorico_2026-11-05`,
      payload: {
        data: '2026-11-05',
        log: [],
        mealTimes: {},
      },
      expect: 'deny',
    },
    {
      id: 'tracker_data.sleep_quality_notes',
      path: `users/${UID}/tracker_data/trackerStorico_2026-11-07`,
      payload: {
        data: '2026-11-07',
        log: [
          {
            type: 'sleep',
            id: 'sleep_rt_1',
            hours: 7,
            wakeTime: 7,
            sleepStart: 0,
            bedtime: 0,
            quality: 2,
            notes: 'risveglio per sete',
            deepMin: 60,
            remMin: 60,
          },
        ],
        mealTimes: {},
        rev: 1,
        revBy: UID,
        revAt: Date.now(),
      },
      expect: 'allow',
    },
    {
      id: 'tracker_data.dayTargetSnapshot_child',
      path: `users/${UID}/tracker_data/trackerStorico_${DATE}/dayTargetSnapshot`,
      payload: dayTargetSnapshot,
      // Senza incrementare rev sul nodo giorno: le regole rifiutano.
      expect: 'deny',
    },
    {
      id: 'tracker_data.food_db',
      path: `users/${UID}/tracker_data/trackerFoodDatabase/custom_mela`,
      payload: { name: 'Mela', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 },
      expect: 'allow',
    },
    {
      id: 'day_status.confirmed',
      path: `users/${UID}/day_status/${DATE}`,
      payload: buildDayStatusRecord({
        confirmed: true,
        confirmedAt: Date.now(),
        approximate: false,
        paused: false,
      }),
      expect: 'allow',
    },
    {
      id: 'focus_day_scores.kds-5',
      path: `users/${UID}/focus_day_scores/${DATE}`,
      payload: kds5Score,
      expect: 'allow',
    },
    {
      id: 'focus_day_scores.kds-4',
      path: `users/${UID}/focus_day_scores/2026-11-08`,
      payload: kds4Score,
      expect: 'allow',
    },
    {
      id: 'focus_day_scores.kds-3',
      path: `users/${UID}/focus_day_scores/2026-11-09`,
      payload: kds3Score,
      expect: 'allow',
    },
    {
      id: 'safety_status.sfv-3',
      path: `users/${UID}/safety_status/${DATE}`,
      payload: encodeSafetyForRtdb({
        version: 'sfv-3',
        level: 'none',
        signals: [],
      }),
      expect: 'allow',
    },
    {
      id: 'movement_checkin',
      path: `users/${UID}/movement_checkin/2026-11-09`,
      payload: encodeMovementCheckin({ walked: 'mezzora', answeredAt: Date.now() }),
      expect: 'allow',
    },
    {
      id: 'score_feedback.kds-5',
      path: `users/${UID}/score_feedback/${DATE}`,
      payload: encodeScoreFeedback({
        answer: 'yes',
        scoreVersion: 'kds-5',
        score: 0.72,
        cylinders: {
          alimentazione: { status: 'on_track', keyFact: 'x', signals: [], value: 0.85 },
          sonno: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
          movimento: { status: 'halfway', keyFact: 'x', signals: [], value: 0.6 },
          forza: { status: 'on_track', keyFact: 'x', signals: [], value: 1 },
          cardio: { status: 'no_data', keyFact: '', signals: [], value: null },
        },
        answeredAt: Date.now(),
      }),
      expect: 'allow',
    },
    {
      id: 'focus_ai_locks.ieri',
      path: `users/${UID}/focus_ai_locks/ieri`,
      payload: {
        status: 'running',
        dataVersion: 'fnv1a-lock',
        on: DATE,
        updatedAt: Date.now(),
      },
      expect: 'allow',
    },
    {
      id: 'kentu_focus_ai.revision',
      path: `users/${UID}/kentu_focus_ai/ieri/${DATE}/revisions/rev1`,
      payload: {
        revisionId: 'rev1',
        periodId: 'ieri',
        windowKey: DATE,
        dataVersion: 'fnv1a-ai',
        generatedAt: Date.now(),
        report: { headline: 'ok' },
      },
      expect: 'allow',
    },
    {
      id: 'kentu_focus_ai.current',
      path: `users/${UID}/kentu_focus_ai/ieri/${DATE}/current`,
      payload: {
        revisionId: 'rev1',
        dataVersion: 'fnv1a-ai',
        generatedAt: Date.now(),
        periodId: 'ieri',
        windowKey: DATE,
      },
      expect: 'allow',
    },
    {
      id: 'kentu_focus_ai_index',
      path: `users/${UID}/kentu_focus_ai_index/ieri_${DATE}`,
      payload: {
        periodId: 'ieri',
        windowKey: DATE,
        revisionId: 'rev1',
        dataVersion: 'fnv1a-ai',
        generatedAt: Date.now(),
      },
      expect: 'allow',
    },
    {
      id: 'baseline.v1',
      path: `users/${UID}/baseline/v1`,
      payload: {
        version: 3,
        scoreVersion: 'kds-5',
        from: '2026-10-27',
        to: '2026-11-09',
        meanKcal: 2400,
        movementBatteryMean: 0.42,
        movementBatteryMin: 0.17,
        dismissed: false,
      },
      expect: 'allow',
    },
    {
      id: 'ui_preferences.focusTheme',
      path: `users/${UID}/ui_preferences/focusTheme`,
      payload: 'dark',
      expect: 'allow',
    },
    {
      id: 'cylinders.forza.enabled',
      path: `users/${UID}/cylinders/forza/enabled`,
      payload: true,
      expect: 'allow',
    },
    {
      id: 'cylinders.forza.weeklyGoalDays',
      path: `users/${UID}/cylinders/forza/weeklyGoalDays`,
      payload: 3,
      expect: 'allow',
    },
    {
      id: 'profile_targets.profile_patch',
      path: `users/${UID}/profile_targets/profile`,
      payload: { age: 40, weight: 78, height: 180, gender: 'M' },
      expect: 'allow',
    },
    {
      id: 'logs.system_errors',
      path: 'logs/system_errors/pushClientWrites1',
      payload: {
        timestamp: { '.sv': 'timestamp' },
        uid: UID,
        error: 'RTDB PERMISSION_DENIED',
        context: 'RTDB write',
        code: 'PERMISSION_DENIED',
        details: JSON.stringify({ path: 'users/x/focus_day_scores/y', version: 'kds-4' }),
        route: '/focus',
      },
      expect: 'allow',
    },
    {
      id: 'mcp_tokens.client_denied',
      path: `users/${UID}/mcp_tokens/tok1`,
      payload: { token: 'x' },
      expect: 'deny',
    },
    {
      id: 'external_drafts.client_create_denied',
      path: `users/${UID}/external_drafts/meals/cd_client_00000001`,
      payload: externalDraftSeed('cd_client_00000001'),
      expect: 'deny',
    },
    {
      id: 'external_drafts.client_create_status_only_denied',
      path: `users/${UID}/external_drafts/meals/cd_client_00000002/status`,
      payload: 'consumed',
      expect: 'deny',
    },
    {
      id: 'external_drafts.status_consumed',
      path: `users/${UID}/external_drafts/meals/${SEED_CONSUME}/status`,
      payload: 'consumed',
      expect: 'allow',
    },
    {
      id: 'external_drafts.consumedAt',
      path: `users/${UID}/external_drafts/meals/${SEED_CONSUME}/consumedAt`,
      payload: Date.now(),
      expect: 'allow',
    },
    {
      id: 'external_drafts.status_back_to_pending_denied',
      path: `users/${UID}/external_drafts/meals/${SEED_CONSUME}/status`,
      payload: 'pending',
      expect: 'deny',
    },
    {
      id: 'external_drafts.status_deleted',
      path: `users/${UID}/external_drafts/meals/${SEED_DELETE}/status`,
      payload: 'deleted',
      expect: 'allow',
    },
    {
      id: 'external_drafts.status_other_value_denied',
      path: `users/${UID}/external_drafts/meals/${SEED_OTHER}/status`,
      payload: 'validated',
      expect: 'deny',
    },
    {
      id: 'external_drafts.items_edit_denied',
      path: `users/${UID}/external_drafts/meals/${SEED_OTHER}/items/0/foodName`,
      payload: 'pizza',
      expect: 'deny',
    },
    {
      id: 'external_drafts.whole_overwrite_denied',
      path: `users/${UID}/external_drafts/meals/${SEED_OTHER}`,
      payload: { ...externalDraftSeed(SEED_OTHER), status: 'consumed' },
      expect: 'deny',
    },
    {
      id: 'external_drafts.origin_edit_denied',
      path: `users/${UID}/external_drafts/meals/${SEED_OTHER}/origin`,
      payload: 'kentu',
      expect: 'deny',
    },
    {
      id: 'external_drafts.other_kind_denied',
      path: `users/${UID}/external_drafts/sleep/cd_sleep_00000001`,
      payload: { status: 'pending' },
      expect: 'deny',
    },
    {
      id: 'mcp_audit.client_denied',
      path: `users/${UID}/mcp_audit/a1`,
      payload: { tool: 'kentu_create_meal_draft', result: 'created', at: Date.now() },
      expect: 'deny',
    },
    {
      id: 'mcp_write_quota.client_denied',
      path: `mcp_write_quota/${UID}`,
      payload: { hourCount: 0, dayCount: 0 },
      expect: 'deny',
    },
    {
      id: 'mcp_draft_idem.client_denied',
      path: `mcp_draft_idem/${UID}/h1`,
      payload: { draftId: 'cd_x_00000000' },
      expect: 'deny',
    },
  ];
}

const SEED_CONSUME = 'cd_seed_00000001';
const SEED_DELETE = 'cd_seed_00000002';
const SEED_OTHER = 'cd_seed_00000003';
const SEED_PATCH = 'cd_seed_00000004';

/** Bozza come la scrive il server MCP (Admin). */
function externalDraftSeed(id) {
  return {
    id,
    schemaVersion: 1,
    origin: 'claude',
    source: 'claude',
    date: DATE,
    slotHint: 'pranzo',
    timeHHmm: '13:00',
    items: [{ id: `${id}_i0`, foodName: 'pasta integrale', grams: 80, status: 'pending' }],
    rawText: 'pasta integrale 80 g',
    tokenId: 't_seed',
    idempotencyKeyHash: 'seed',
    createdAt: Date.now(),
    status: 'pending',
  };
}

before(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    || '127.0.0.1:9000';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  const app = createEmulatorAdminApp();
  db = app.db;
  await loadFocusLocalRules(path.join(ROOT, 'database.rules.json'));
  token = await createEmulatorIdToken(UID);
  await db.ref(`users/${UID}`).set(null);
  await db.ref('logs/system_errors').set(null);
  for (const id of [SEED_CONSUME, SEED_DELETE, SEED_OTHER, SEED_PATCH]) {
    await db.ref(`users/${UID}/external_drafts/meals/${id}`).set(externalDraftSeed(id));
  }
});

after(async () => {
  await deleteEmulatorAdminApp();
});

test('catalogo scritture client: ogni allow passa, ogni deny intenzionale fallisce', async () => {
  assert.ok(token);
  const failures = [];
  for (const item of catalog()) {
    const res = await emulatorRestPut(item.path, item.payload, { idToken: token });
    const allowed = res.statusCode === 200 && !res.denied;
    if (item.expect === 'allow' && !allowed) {
      failures.push(`ALLOW atteso ma deny: ${item.id} → ${res.statusCode} ${res.raw}`);
    }
    if (item.expect === 'deny' && allowed) {
      failures.push(`DENY atteso ma allow: ${item.id}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('external_drafts: update client {status, consumedAt} accettato, poi contenuto invariato', async () => {
  assert.ok(token);
  assert.ok(db);
  const draftPath = `users/${UID}/external_drafts/meals/${SEED_PATCH}`;
  const before = (await db.ref(draftPath).get()).val();
  const sneaky = await emulatorRestPatch(draftPath, { status: 'consumed', rawText: 'modificato' }, { idToken: token });
  assert.equal(sneaky.denied, true, sneaky.raw);
  const res = await emulatorRestPatch(draftPath, { status: 'consumed', consumedAt: Date.now() }, { idToken: token });
  assert.equal(res.statusCode, 200, res.raw);
  assert.equal(res.denied, false, res.raw);
  const after = (await db.ref(draftPath).get()).val();
  assert.equal(after.status, 'consumed');
  assert.equal(typeof after.consumedAt, 'number');
  const { status: _s1, consumedAt: _c1, ...restAfter } = after;
  const { status: _s2, ...restBefore } = before;
  assert.deepEqual(restAfter, restBefore);
});

test('tracker_data sleep: round-trip quality + notes su RTDB', async () => {
  assert.ok(token);
  assert.ok(db);
  const sleepDate = '2026-11-06';
  const pathKey = `users/${UID}/tracker_data/trackerStorico_${sleepDate}`;
  const payload = {
    data: sleepDate,
    log: [
      {
        type: 'sleep',
        id: 'sleep_roundtrip',
        hours: 7.5,
        wakeTime: 7,
        sleepStart: 23.5,
        bedtime: 23.5,
        quality: 1,
        notes: 'tre risvegli per bagno',
        deepMin: 90,
        remMin: 80,
        hr: 52,
      },
    ],
    mealTimes: {},
    rev: 1,
    revBy: UID,
    revAt: Date.now(),
  };
  const res = await emulatorRestPut(pathKey, payload, { idToken: token });
  assert.equal(res.statusCode, 200, res.raw);
  assert.equal(res.denied, false, res.raw);
  const snap = await db.ref(pathKey).get();
  assert.equal(snap.exists(), true);
  const sleep = (snap.val()?.log || []).find((e) => e?.type === 'sleep');
  assert.ok(sleep);
  assert.equal(sleep.quality, 1);
  assert.equal(sleep.notes, 'tre risvegli per bagno');
  assert.equal(sleep.hours, 7.5);
});
