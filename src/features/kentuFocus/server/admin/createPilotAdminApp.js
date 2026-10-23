/**
 * P6.11a — Adapter Admin SDK pilota: interfaccia predisposta, NON attiva.
 *
 * Non importa firebase-admin. Non chiama initializeApp. Non apre socket.
 * Qualsiasi tentativo di "attivazione" via env/flag fallisce con lo stesso errore.
 *
 * P6.11c/e: pilotContext + path guard + wiring chiuso (niente persistence/reader/db
 * grezzi dall'invocante; nessun `_inner`). createPilotAdminApp resta non attivo.
 *
 * Prima di un pilota reale servirà (autorizzazione separata):
 * - sblocco runtime esplicito in codice (non solo env);
 * - init Admin confrontato col pilotContext già validato;
 * - wrap immediato in createPilotGuardedAdminDatabase; adapter solo dal guarded;
 * - report P6.10a obbligatorio post-publish.
 *
 * Limite: il guard path non sostituisce IAM del service account; Admin SDK
 * bypassa le rules RTDB.
 */

import {
  assertFocusPilotConnectionAllowed,
  FOCUS_PILOT_CONNECTION_BLOCKED,
} from './focusPilotConfig.v1.js';

/**
 * @param {{
 *   expectedProjectId?: string,
 *   expectedDatabaseUrl?: string,
 *   // intenzionalmente ignorati in P6.11a:
 *   enableFlag?: string,
 *   credentialsPath?: string,
 * }} [_input]
 * @returns {{
 *   ok: false,
 *   error: string,
 *   db: null,
 *   app: null,
 *   projectId: null,
 *   databaseURL: null,
 *   activated: false,
 * }}
 */
export function createPilotAdminApp(_input = {}) {
  const gate = assertFocusPilotConnectionAllowed();
  return {
    ok: false,
    error: gate.error || FOCUS_PILOT_CONNECTION_BLOCKED,
    db: null,
    app: null,
    projectId: null,
    databaseURL: null,
    activated: false,
  };
}

/**
 * Simmetrico a deleteEmulatorAdminApp — no-op sicuro.
 */
export async function deletePilotAdminApp() {
  return { ok: true, deleted: false, reason: FOCUS_PILOT_CONNECTION_BLOCKED };
}
