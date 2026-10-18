'use strict';
/**
 * Smoke packaging Focus (CJS → ESM) — nessun deploy, nessuna callable.
 * Uso (dopo sync): node smokeFocusPackage.cjs
 */

const path = require('path');
const fs = require('fs');

async function main() {
  const shared = path.join(__dirname, '_shared');
  const manifestPath = path.join(shared, 'MANIFEST.json');
  const bridgePath = path.join(shared, 'focusBridge.cjs');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(bridgePath)) {
    console.error('Pacchetto _shared assente. Esegui: node scripts/syncFocusForFunctions.mjs');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log('manifest.fileCount=', manifest.fileCount);

  const { loadFocus } = require('./_shared/focusBridge.cjs');
  const focus = await loadFocus();

  if (typeof focus.publishFocusEdition !== 'function') {
    throw new Error('publishFocusEdition missing');
  }
  if (typeof focus.AdminRtdbFocusPersistence !== 'function') {
    throw new Error('AdminRtdbFocusPersistence missing');
  }
  if (typeof focus.MemoryFocusPersistence !== 'function') {
    throw new Error('MemoryFocusPersistence missing');
  }
  if (typeof focus.runFocusEditionPipeline !== 'function') {
    throw new Error('runFocusEditionPipeline missing');
  }
  if (typeof focus.AdminRtdbTrackerReader !== 'function') {
    throw new Error('AdminRtdbTrackerReader missing');
  }
  if (typeof focus.runFocusAdminEdition !== 'function') {
    throw new Error('runFocusAdminEdition missing');
  }
  if (typeof focus.resolveFocusTargetsFromProfile !== 'function') {
    throw new Error('resolveFocusTargetsFromProfile missing');
  }

  // Smoke orchestratore in-memory (no RTDB)
  const persistence = new focus.MemoryFocusPersistence();
  const result = await focus.publishFocusEdition({
    uid: 'smoke_uid',
    persistence,
    dossierInput: {
      analysisDate: '2026-10-16',
      publicationDate: '2026-10-17',
      analysisDayNode: { data: '2026-10-16', log: [], manualNodes: [] },
      publicationDayNode: { data: '2026-10-17', log: [] },
      targets: null,
      bodyWeightKg: null,
      historyDayBriefs: [],
    },
    ownerId: 'smoke_worker',
    nowIso: '2026-10-17T08:00:00.000Z',
  });

  if (!result.ok) {
    throw new Error(`smoke publish failed: ${result.error}`);
  }

  // Verifica callGemini export invariato in index.js
  const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  if (!indexSrc.includes('exports.callGemini') && !indexSrc.includes('callGemini')) {
    throw new Error('callGemini non trovato in functions/index.js');
  }
  if (indexSrc.includes('_shared/kentuFocus') || indexSrc.includes('publishFocusEdition')) {
    throw new Error('functions/index.js non deve importare Focus in I4-C');
  }

  console.log('SMOKE_OK', {
    node: process.version,
    revision: result.revision,
    technicalOnly: result.revisionDoc?.technicalOnly,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
