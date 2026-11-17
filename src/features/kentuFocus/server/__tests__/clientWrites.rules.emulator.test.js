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
      },
      expect: 'allow',
    },
    {
      id: 'tracker_data.dayTargetSnapshot_child',
      path: `users/${UID}/tracker_data/trackerStorico_${DATE}/dayTargetSnapshot`,
      payload: dayTargetSnapshot,
      expect: 'allow',
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
  ];
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
