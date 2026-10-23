/**
 * P6.11c/e — Ingresso percorso pilota: binding immutabile + guard path + wiring chiuso.
 *
 * P6.11e:
 * - Vietati override di persistence / reader / db grezzo.
 * - Adapter costruiti solo dal database protetto.
 * - Mock solo via ingresso test dedicato (Symbol), inutilizzabile come API reale.
 *
 * NON attiva Firebase reale. createPilotAdminApp resta bloccato.
 *
 * Limite: protezioni applicative. Non sostituiscono IAM / rules RTDB vs Admin.
 */

import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { AdminRtdbTrackerReader } from '../reader/AdminRtdbTrackerReader.js';
import {
  assertFocusPilotExecutionBound,
  buildFocusPilotBoundInput,
} from './assertFocusPilotExecutionBound.js';
import { createPilotGuardedAdminDatabase } from './createPilotGuardedAdminDatabase.js';
import {
  assertFocusPilotConnectionAllowed,
  FOCUS_PILOT_CONNECTION_BLOCKED,
} from './focusPilotConfig.v1.js';
import {
  createFocusPilotContext,
  createFocusPilotContextFromInput,
} from './focusPilotContext.js';
import {
  assertFocusAdminRuntime,
  runFocusAdminEdition,
  sanitizeFocusAdminCliResult,
} from './runFocusAdminEdition.js';

export const FOCUS_PILOT_RUNTIME_INACTIVE = 'pilot_runtime_not_activated_in_p611c';

/**
 * Ingresso test-only per mock RTDB. Non è un campo stringa API pubblica:
 * i caller di produzione non possono “accidentalmente” passare un db grezzo
 * tramite `offlineDb` / `db` / adapter pre-costruiti.
 */
export const FOCUS_PILOT_TEST_HARNESS = Symbol.for(
  'kentu.focus.pilot.testHarness.v1',
);

/**
 * Risolve pilotContext senza rileggere env mutabili dopo la creazione.
 * @param {{
 *   pilotContext?: object|null,
 *   pilotConfig?: object|null,
 *   pilotConfigInput?: object|null,
 * }} input
 */
export function resolveFocusPilotContext(input = {}) {
  if (input.pilotContext) {
    if (input.pilotContext.kind !== 'FocusPilotContext') {
      return { ok: false, error: 'pilot_context_kind_invalid' };
    }
    return { ok: true, context: input.pilotContext };
  }
  if (input.pilotConfig) {
    return createFocusPilotContext(input.pilotConfig);
  }
  if (input.pilotConfigInput) {
    return createFocusPilotContextFromInput(input.pilotConfigInput);
  }
  return { ok: false, error: 'pilot_context_required' };
}

/**
 * Rifiuta injection di adapter / db grezzo sul percorso pilota.
 * @param {object} input
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertFocusPilotWiringClosed(input = {}) {
  if (input.persistence != null) {
    return { ok: false, error: 'pilot_persistence_override_forbidden' };
  }
  if (input.reader != null) {
    return { ok: false, error: 'pilot_reader_override_forbidden' };
  }
  if (input.db != null) {
    return { ok: false, error: 'pilot_raw_db_override_forbidden' };
  }
  // offlineDb non è più accettato sulla superficie pubblica (solo harness test)
  if (input.offlineDb != null) {
    return { ok: false, error: 'pilot_offline_db_override_forbidden' };
  }
  return { ok: true };
}

/**
 * Estrae mock solo dall'ingresso test dedicato.
 * @param {object} input
 * @returns {{ ok: true, mockDb: object|null } | { ok: false, error: string }}
 */
function resolvePilotTestMockDb(input) {
  const harness = input?.[FOCUS_PILOT_TEST_HARNESS];
  if (harness == null) {
    return { ok: true, mockDb: null };
  }
  if (typeof harness !== 'object' || Array.isArray(harness)) {
    return { ok: false, error: 'pilot_test_harness_invalid' };
  }
  // Solo la chiave documentata; nessun altro canale
  const keys = Object.keys(harness);
  if (keys.length !== 1 || keys[0] !== 'mockDb') {
    return { ok: false, error: 'pilot_test_harness_invalid' };
  }
  const mockDb = harness.mockDb;
  if (!mockDb || typeof mockDb.ref !== 'function') {
    return { ok: false, error: 'pilot_test_mock_db_invalid' };
  }
  return { ok: true, mockDb };
}

/**
 * @param {{
 *   pilotContext?: object,
 *   pilotConfig?: object,
 *   pilotConfigInput?: object,
 *   uid?: string,
 *   publicationDate?: string,
 *   explicitRegen?: boolean,
 *   geminiProvider?: unknown,
 *   allowedUids?: string|string[]|null,
 *   projectId?: string|null,
 *   expectedProjectId?: string|null,
 *   databaseURL?: string|null,
 *   adminToken?: string,
 *   horizon?: string,
 *   historyDays?: number,
 *   ownerId?: string,
 *   nowIso?: string,
 *   locale?: string,
 *   rateLimitState?: object,
 * }} input
 *
 * Mock: solo `input[FOCUS_PILOT_TEST_HARNESS] = { mockDb }` (test dedicati).
 * Vietati: persistence, reader, db, offlineDb.
 */
export async function runFocusPilotEdition(input = {}) {
  const resolved = resolveFocusPilotContext(input);
  if (!resolved.ok || !resolved.context) {
    return {
      ok: false,
      error: resolved.error || 'pilot_context_required',
      report: null,
      publishResult: null,
      pilotContextBound: false,
    };
  }
  const pilotContext = resolved.context;

  // 1) Binding prima di qualsiasi I/O / wiring db
  const bound = assertFocusPilotExecutionBound(pilotContext, {
    mode: 'pilot',
    uid: input.uid ?? pilotContext.pilotUid,
    publicationDate: input.publicationDate ?? pilotContext.publicationDate,
    explicitRegen: input.explicitRegen === true,
    geminiProvider: input.geminiProvider,
    allowedUids: input.allowedUids,
    projectId: input.projectId,
    expectedProjectId: input.expectedProjectId,
    databaseURL: input.databaseURL,
  });
  if (!bound.ok) {
    return {
      ok: false,
      error: bound.error,
      report: null,
      publishResult: null,
      pilotContextBound: false,
    };
  }

  // 2) Wiring chiuso: niente adapter / db grezzo dall'invocante
  const wiring = assertFocusPilotWiringClosed(input);
  if (!wiring.ok) {
    return {
      ok: false,
      error: wiring.error,
      report: null,
      publishResult: null,
      pilotContextBound: true,
    };
  }

  if (process.env.FOCUS_ADMIN_ALLOW_REGEN === '1' && input.explicitRegen === true) {
    return {
      ok: false,
      error: 'pilot_regen_forbidden',
      report: null,
      publishResult: null,
      pilotContextBound: true,
    };
  }

  const forced = buildFocusPilotBoundInput(pilotContext, {
    adminToken: input.adminToken,
    horizon: input.horizon,
    historyDays: input.historyDays,
    ownerId: input.ownerId,
    nowIso: input.nowIso,
    locale: input.locale,
    rateLimitState: input.rateLimitState,
  });

  const connectionGate = assertFocusPilotConnectionAllowed();
  if (connectionGate.ok) {
    return {
      ok: false,
      error: 'pilot_connection_unexpectedly_open',
      report: null,
      publishResult: null,
      pilotContextBound: true,
    };
  }

  const mockGate = resolvePilotTestMockDb(input);
  if (!mockGate.ok) {
    return {
      ok: false,
      error: mockGate.error,
      report: null,
      publishResult: null,
      pilotContextBound: true,
      activated: false,
    };
  }

  // Percorso reale: nessun mock → runtime inattivo (createPilotAdminApp resta stub)
  if (!mockGate.mockDb) {
    return {
      ok: false,
      error: FOCUS_PILOT_RUNTIME_INACTIVE,
      connectionError: connectionGate.error || FOCUS_PILOT_CONNECTION_BLOCKED,
      report: null,
      publishResult: null,
      pilotContextBound: true,
      activated: false,
    };
  }

  // Anche con mock test, produzione / non-emulator resta bloccata
  const runtime = assertFocusAdminRuntime();
  if (!runtime.ok) {
    return {
      ok: false,
      error: runtime.error,
      report: null,
      publishResult: null,
      pilotContextBound: true,
      activated: false,
    };
  }

  // Guard creato una sola volta; nessun re-bind da input.db / offlineDb
  const sourceDb = mockGate.mockDb;
  const guardedDb = createPilotGuardedAdminDatabase(pilotContext, sourceDb);

  // Adapter SOLO dal database protetto — mai dall'invocante
  const persistence = new AdminRtdbFocusPersistence(guardedDb);
  const reader = new AdminRtdbTrackerReader(guardedDb);

  const result = await runFocusAdminEdition({
    ...forced,
    uid: pilotContext.pilotUid,
    publicationDate: pilotContext.publicationDate,
    explicitRegen: false,
    geminiProvider: null,
    allowedUids: pilotContext.pilotUid,
    projectId: pilotContext.expectedProjectId,
    expectedProjectId: pilotContext.expectedProjectId,
    db: guardedDb,
    persistence,
    reader,
    adminToken: input.adminToken,
  });

  return {
    ...result,
    pilotContextBound: true,
    activated: false,
    guarded: true,
    wiringClosed: true,
  };
}

/**
 * Helper test: esegue il pilota con mock RTDB dedicato (Symbol harness).
 * Non usare in percorsi di produzione / CLI reale.
 *
 * @param {object} input — stessi campi di runFocusPilotEdition (senza db/adapters)
 * @param {object} mockDb — createMockAdminRtdb() o equivalente
 */
export async function runFocusPilotEditionWithTestMock(input, mockDb) {
  return runFocusPilotEdition({
    ...input,
    [FOCUS_PILOT_TEST_HARNESS]: { mockDb },
  });
}

/**
 * Sanitizza output CLI pilota (nessun UID completo / path sensibili).
 */
export function sanitizeFocusPilotCliResult(result, ctx = {}) {
  const base = sanitizeFocusAdminCliResult(result, ctx);
  return {
    ...base,
    pilotContextBound: Boolean(result?.pilotContextBound),
    activated: false,
    guarded: Boolean(result?.guarded),
    wiringClosed: Boolean(result?.wiringClosed),
    mode: 'pilot',
  };
}
