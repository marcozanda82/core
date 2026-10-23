#!/usr/bin/env node
/**
 * P6.11a — Validazione OFFLINE del profilo pilota Focus.
 *
 * Non connette Firebase. Non pubblica. Non inizializza Admin SDK.
 * Uso (valori fittizi):
 *   set FOCUS_PILOT_EXPECTED_PROJECT=my-prod-project
 *   set FOCUS_PILOT_EXPECTED_DATABASE_URL=https://my-prod-project-default-rtdb.europe-west1.firebasedatabase.app
 *   set FOCUS_PILOT_UID=pilot_user_fixture_01
 *   set FOCUS_PILOT_PUBLICATION_DATE=2026-10-17
 *   set FOCUS_ADMIN_TOKEN=fictional-token-16c
 *   node scripts/focusAdminValidatePilotConfig.mjs
 *
 * Output sanitizzato + connectionGate sempre bloccato.
 */

import {
  createPilotAdminApp,
} from '../src/features/kentuFocus/server/admin/createPilotAdminApp.js';
import {
  assertFocusPilotConnectionAllowed,
  parseFocusPilotConfigFromEnv,
  sanitizeFocusPilotConfigResult,
} from '../src/features/kentuFocus/server/admin/focusPilotConfig.v1.js';
import { assertFocusAdminRuntime } from '../src/features/kentuFocus/server/admin/runFocusAdminEdition.js';

function main() {
  const validated = parseFocusPilotConfigFromEnv(process.env);
  const safe = sanitizeFocusPilotConfigResult(validated);

  // Prova esplicita: anche con tutti i flag, connessione e runtime prod restano chiusi
  const connection = assertFocusPilotConnectionAllowed();
  const attempted = createPilotAdminApp({
    expectedProjectId: process.env.FOCUS_PILOT_EXPECTED_PROJECT,
    expectedDatabaseUrl: process.env.FOCUS_PILOT_EXPECTED_DATABASE_URL,
    enableFlag: process.env.FOCUS_PILOT_ENABLE,
  });
  const adminRuntime = assertFocusAdminRuntime();

  const out = {
    ...safe,
    probes: {
      pilotConnection: connection,
      createPilotAdminApp: {
        ok: attempted.ok,
        error: attempted.error,
        activated: attempted.activated,
      },
      assertFocusAdminRuntime: {
        ok: adminRuntime.ok,
        error: adminRuntime.error || null,
        emulator: adminRuntime.emulator,
      },
    },
  };

  console.log(JSON.stringify(out, null, 2));

  // Exit 0 solo se il *profilo* è valido; la connessione resta comunque non attivata.
  // Non significa "pronto a pubblicare in produzione".
  process.exit(validated.ok ? 0 : 1);
}

main();
