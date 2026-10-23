#!/usr/bin/env node
/**
 * CLI admin Focus — UNA edizione, solo emulator (I4-H).
 *
 * Requisiti env:
 *   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
 *   FOCUS_ADMIN_TOKEN=<secret ≥16 char>
 *   FOCUS_ADMIN_ALLOWED_UIDS=<uid>          # allowlist (comma-ok)
 *   FOCUS_ADMIN_EXPECTED_PROJECT=demo-kentu-focus
 *
 * Uso:
 *   node scripts/focusAdminGenerateEdition.mjs --uid UID --date YYYY-MM-DD
 *
 * Opzionale: --horizon d7|d30|d90
 * Regen: --regen richiede anche FOCUS_ADMIN_ALLOW_REGEN=1
 *
 * Non deploy. Non DB reale. Non Gemini live.
 * Output sanitizzato (niente UID completi / headline / dossier / token).
 *
 * P6.11a: `--pilot` / FOCUS_PILOT_ENABLE abortiscono (path pilota non attivato).
 * Validazione offline profilo: scripts/focusAdminValidatePilotConfig.mjs
 */

import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
  getFocusEmulatorProjectId,
} from '../src/features/kentuFocus/server/emulator/createEmulatorAdmin.js';
import {
  runFocusAdminEdition,
  sanitizeFocusAdminCliResult,
} from '../src/features/kentuFocus/server/admin/runFocusAdminEdition.js';

function parseArgs(argv) {
  const out = {
    uid: null,
    date: null,
    regen: false,
    horizon: 'd30',
    mode: 'emulator',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uid') out.uid = argv[++i];
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--regen') out.regen = true;
    else if (a === '--horizon') out.horizon = argv[++i];
    else if (a === '--mode') out.mode = String(argv[++i] || '').trim();
    else if (a === '--pilot') out.mode = 'pilot';
  }
  return out;
}

async function main() {
  // P6.11a: percorso pilota predisposto ma NON attivabile da flag/env
  const argsEarly = parseArgs(process.argv);
  if (
    argsEarly.mode === 'pilot'
    || process.env.FOCUS_PILOT_ENABLE === '1'
    || process.env.FOCUS_PILOT_RUN === '1'
  ) {
    console.error('FOCUS_ADMIN_ABORT reason=pilot_runtime_not_activated_in_p611a');
    process.exit(2);
  }

  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    console.error('FOCUS_ADMIN_ABORT reason=emulator_required');
    process.exit(2);
  }
  if (!process.env.FOCUS_ADMIN_TOKEN) {
    console.error('FOCUS_ADMIN_ABORT reason=admin_token_not_configured');
    process.exit(2);
  }
  if (!process.env.FOCUS_ADMIN_ALLOWED_UIDS) {
    console.error('FOCUS_ADMIN_ABORT reason=admin_uid_allowlist_not_configured');
    process.exit(2);
  }
  if (!process.env.FOCUS_ADMIN_EXPECTED_PROJECT) {
    console.error('FOCUS_ADMIN_ABORT reason=admin_expected_project_not_configured');
    process.exit(2);
  }

  const args = argsEarly;
  if (!args.uid || !args.date) {
    console.error('FOCUS_ADMIN_ABORT reason=usage --uid UID --date YYYY-MM-DD');
    process.exit(2);
  }

  if (args.regen && process.env.FOCUS_ADMIN_ALLOW_REGEN !== '1') {
    console.error('FOCUS_ADMIN_ABORT reason=admin_regen_not_enabled');
    process.exit(2);
  }

  const { db, projectId } = createEmulatorAdminApp();
  const expectedProject = process.env.FOCUS_ADMIN_EXPECTED_PROJECT;
  // Doppia verifica: app project vs env vs helper
  if (projectId !== expectedProject || getFocusEmulatorProjectId() !== expectedProject) {
    console.error('FOCUS_ADMIN_ABORT reason=admin_project_mismatch');
    await deleteEmulatorAdminApp();
    process.exit(2);
  }

  try {
    const result = await runFocusAdminEdition({
      uid: args.uid,
      publicationDate: args.date,
      adminToken: process.env.FOCUS_ADMIN_TOKEN,
      projectId,
      expectedProjectId: expectedProject,
      db,
      explicitRegen: args.regen,
      horizon: args.horizon,
      // Deterministico: nessun provider Gemini
      geminiProvider: null,
    });
    const safe = sanitizeFocusAdminCliResult(result, { uid: args.uid, projectId });
    console.log(JSON.stringify(safe, null, 2));
    // Exit 0 solo se pipeline ok E verifiche operatore essenziali soddisfatte
    const safeSuccess = Boolean(result.ok) && Boolean(safe.operatorSafe);
    process.exit(safeSuccess ? 0 : 1);
  } finally {
    await deleteEmulatorAdminApp();
  }
}

main().catch((err) => {
  console.error('FOCUS_ADMIN_ABORT reason=unhandled');
  // Niente stack con path potenzialmente sensibili in stdout strutturato
  if (process.env.FOCUS_ADMIN_DEBUG === '1') {
    console.error(String(err?.message || err));
  }
  process.exit(1);
});
