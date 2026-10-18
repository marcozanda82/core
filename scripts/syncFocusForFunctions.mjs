#!/usr/bin/env node
/**
 * Packaging riproducibile Focus → functions/_shared (I4-C).
 * Sorgente unica: src/. Nessuna nuova dipendenza. Non collega predeploy/deploy.
 *
 * Uso: node scripts/syncFocusForFunctions.mjs
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_FOCUS = path.join(ROOT, 'src', 'features', 'kentuFocus');
const SRC_UTILS = path.join(ROOT, 'src', 'utils');
const OUT_ROOT = path.join(ROOT, 'functions', '_shared');
const OUT_FOCUS = path.join(OUT_ROOT, 'kentuFocus');
const OUT_UTILS = path.join(OUT_ROOT, 'utils');

const UTILS_FILES = [
  'computeTotaliCore.js',
  'mealDraftStatus.js',
  'draftParser.js',
];

const EXCLUDE_DIR_NAMES = new Set([
  '__tests__',
  'node_modules',
  'proposed',
  'docs',
  'emulator',
]);

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function shouldSkipDir(name) {
  return EXCLUDE_DIR_NAMES.has(name);
}

/**
 * Copia ricorsiva con eventuale riscrittura import utils.
 * Da src/features/kentuFocus/normalize → ../../../utils
 * A functions/_shared/kentuFocus/normalize → ../../utils
 */
function rewriteSource(content, relativePosix) {
  let out = content;
  // Solo i file sotto kentuFocus che puntano a src/utils
  if (relativePosix.includes('kentuFocus/')) {
    out = out.replaceAll(
      "from '../../../utils/",
      "from '../../utils/",
    );
    out = out.replaceAll(
      'from "../../../utils/',
      'from "../../utils/',
    );
  }
  // Escludi test-only imports se presenti
  return out;
}

function copyTree(srcDir, destDir, relBase = '') {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const srcPath = path.join(srcDir, ent.name);
    const destPath = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      copyTree(srcPath, destPath, path.posix.join(relBase, ent.name));
      continue;
    }
    if (!ent.name.endsWith('.js') && !ent.name.endsWith('.json') && !ent.name.endsWith('.md')) {
      continue;
    }
    // skip test files at any level
    if (ent.name.includes('.test.')) continue;
    const relPosix = path.posix.join('kentuFocus', relBase, ent.name);
    const raw = fs.readFileSync(srcPath, 'utf8');
    const rewritten = rewriteSource(raw, relPosix);
    ensureDir(path.dirname(destPath));
    fs.writeFileSync(destPath, rewritten, 'utf8');
  }
}

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function listJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) listJsFiles(p, acc);
    else if (ent.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

function verifyNoOutboundImports(focusRoot) {
  const files = listJsFiles(focusRoot);
  const bad = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(OUT_ROOT, file);
    // Import che escono da functions/ (es. ../../../../src)
    if (text.includes("from '../../../../") || text.includes('from "../../../../../')) {
      bad.push(`${rel}: outbound relative`);
    }
    if (/from ['"]react(?:\/|['"])/.test(text) || /require\(['"]react['"]\)/.test(text)) {
      bad.push(`${rel}: react`);
    }
    if (/from ['"][^'"]*coreEngine/.test(text) || /from ['"][^'"]*SalaComandi/.test(text)) {
      bad.push(`${rel}: app UI/engine import`);
    }
    // firebase client (non admin) — i moduli Focus puri non devono importarlo
    if (/from ['"]firebase\//.test(text) || /from ['"]firebase['"]/.test(text)) {
      bad.push(`${rel}: firebase client`);
    }
  }
  return bad;
}

function verifyRequiredModules() {
  const required = [
    'kentuFocus/build/buildFocusDossier.js',
    'kentuFocus/editorial/selectFocusEditorial.js',
    'kentuFocus/server/publish/publishFocusEdition.js',
    'kentuFocus/server/persist/AdminRtdbFocusPersistence.js',
    'kentuFocus/server/persist/MemoryFocusPersistence.js',
    'kentuFocus/server/contracts/focusPersistence.v1.js',
    'kentuFocus/server/pipeline/runFocusEditionPipeline.js',
    'kentuFocus/server/admin/runFocusAdminEdition.js',
    'kentuFocus/server/reader/resolveFocusProfileData.js',
    'utils/computeTotaliCore.js',
    'utils/mealDraftStatus.js',
    'utils/draftParser.js',
  ];
  const missing = required.filter((r) => !fs.existsSync(path.join(OUT_ROOT, r)));
  return missing;
}

function writeManifest(files) {
  const hashes = {};
  for (const f of files.sort()) {
    const rel = path.relative(OUT_ROOT, f).split(path.sep).join('/');
    hashes[rel] = hashFile(f);
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceFocus: 'src/features/kentuFocus',
    sourceUtils: UTILS_FILES.map((f) => `src/utils/${f}`),
    fileCount: files.length,
    hashes,
  };
  fs.writeFileSync(
    path.join(OUT_ROOT, 'MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(OUT_ROOT, 'README.md'),
    [
      '# functions/_shared — generato da scripts/syncFocusForFunctions.mjs',
      '',
      'NON modificare a mano. Rigenerare con:',
      '',
      '```',
      'node scripts/syncFocusForFunctions.mjs',
      '```',
      '',
      'Sorgente unica: `src/features/kentuFocus` + utils puri.',
      '',
    ].join('\n'),
    'utf8',
  );
}

function main() {
  if (!fs.existsSync(SRC_FOCUS)) {
    console.error('Sorgente Focus mancante:', SRC_FOCUS);
    process.exit(1);
  }

  rmrf(OUT_ROOT);
  ensureDir(OUT_FOCUS);
  ensureDir(OUT_UTILS);

  copyTree(SRC_FOCUS, OUT_FOCUS);

  for (const name of UTILS_FILES) {
    const src = path.join(SRC_UTILS, name);
    if (!fs.existsSync(src)) {
      console.error('Utils mancante:', src);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(OUT_UTILS, name));
  }

  // Scope ESM del pacchetto shared (non altera functions/package.json CJS)
  fs.writeFileSync(
    path.join(OUT_ROOT, 'package.json'),
    `${JSON.stringify({ name: 'kentu-focus-shared', private: true, type: 'module' }, null, 2)}\n`,
    'utf8',
  );

  // Entry ESM per Functions (nessuna callable pubblica)
  const entry = [
    '/** Entry ESM Focus per runtime Functions (packaged). */',
    "export { publishFocusEdition, repairFocusMemoryAfterPublish } from './kentuFocus/server/publish/publishFocusEdition.js';",
    "export { AdminRtdbFocusPersistence } from './kentuFocus/server/persist/AdminRtdbFocusPersistence.js';",
    "export { MemoryFocusPersistence } from './kentuFocus/server/persist/MemoryFocusPersistence.js';",
    "export { FOCUS_PERSISTENCE_ATOMICITY_NOTES } from './kentuFocus/server/persist/FocusPersistencePort.js';",
    "export { runFocusEditionPipeline } from './kentuFocus/server/pipeline/runFocusEditionPipeline.js';",
    "export { AdminRtdbTrackerReader, MemoryTrackerReader } from './kentuFocus/server/reader/AdminRtdbTrackerReader.js';",
    "export { buildDossierInputFromTracker } from './kentuFocus/server/reader/buildDossierInputFromTracker.js';",
    "export { resolveFocusHistoryDays, FOCUS_HISTORY_HORIZON_DAYS } from './kentuFocus/server/reader/focusHistoryHorizon.js';",
    "export { resolveFocusTargetsFromProfile, resolveFocusBodyWeight } from './kentuFocus/server/reader/resolveFocusProfileData.js';",
    "export {",
    '  runFocusAdminEdition,',
    '  assertFocusAdminRuntime,',
    '  assertFocusAdminAuthorization,',
    '  assertFocusAdminUidAllowlist,',
    '  assertFocusAdminProjectIdentity,',
    '  sanitizeFocusAdminCliResult,',
    '  maskFocusAdminUid,',
    "} from './kentuFocus/server/admin/runFocusAdminEdition.js';",
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_ROOT, 'focusEntry.mjs'), entry, 'utf8');

  // Bridge CJS: dynamic import dell’entry ESM
  const cjsBridge = [
    "'use strict';",
    '/** Bridge CJS → ESM Focus packaged. Non espone callable HTTPS. */',
    'function loadFocus() {',
    "  return import('./focusEntry.mjs');",
    '}',
    'module.exports = { loadFocus };',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_ROOT, 'focusBridge.cjs'), cjsBridge, 'utf8');

  const files = listJsFiles(OUT_ROOT);
  const missing = verifyRequiredModules();
  if (missing.length) {
    console.error('Moduli richiesti mancanti nel pacchetto:', missing);
    process.exit(1);
  }
  const bad = verifyNoOutboundImports(OUT_FOCUS);
  if (bad.length) {
    console.error('Import non ammessi nel pacchetto:', bad);
    process.exit(1);
  }

  writeManifest(files);
  console.log(`OK syncFocusForFunctions: ${files.length} js → functions/_shared`);
}

main();
