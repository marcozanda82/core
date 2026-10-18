#!/usr/bin/env node
/**
 * Preparazione pacchetto Functions Focus (I4-G) — nessun deploy.
 *
 * 1. syncFocusForFunctions
 * 2. verifyGeminiHttpParity
 * 3. smokeFocusPackage (se Node disponibile)
 *
 * Uso: node scripts/prepareFocusFunctionsPackage.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

function run(relScript) {
  const script = path.join(root, relScript);
  const r = spawnSync(node, [script], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`failed: ${relScript} exit=${r.status}`);
  }
}

function assertNoForbiddenImports() {
  const shared = path.join(root, 'functions', '_shared', 'kentuFocus');
  const bad = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '__tests__' || ent.name === 'docs' || ent.name === 'proposed') continue;
        walk(p);
        continue;
      }
      if (!ent.name.endsWith('.js')) continue;
      const t = fs.readFileSync(p, 'utf8');
      // Solo import reali — i commenti possono citare coreEngine/SalaComandi come non-dipendenza
      if (
        /from ['"]react(?:\/|['"])/.test(t)
        || /from ['"][^'"]*coreEngine/.test(t)
        || /require\(['"][^'"]*coreEngine/.test(t)
        || /from ['"][^'"]*SalaComandi/.test(t)
        || /require\(['"][^'"]*SalaComandi/.test(t)
      ) {
        bad.push(path.relative(root, p));
      }
      if (/from ['"]firebase\//.test(t) || /from ['"]firebase['"]/.test(t)) {
        bad.push(`${path.relative(root, p)}:firebase-client`);
      }
    }
  }
  walk(shared);
  if (bad.length) throw new Error(`forbidden imports: ${bad.join(', ')}`);
}

function assertCallGeminiIntact() {
  const index = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
  if (!index.includes('exports.callGemini')) {
    throw new Error('callGemini export missing');
  }
  if (index.includes('runFocusAdminEdition') || index.includes('publishFocusEdition')) {
    throw new Error('functions/index.js must not wire Focus entry in I4-G');
  }
}

console.log('FOCUS_PACKAGE_PREPARE start');
run('scripts/syncFocusForFunctions.mjs');
run('scripts/verifyGeminiHttpParity.mjs');
assertNoForbiddenImports();
assertCallGeminiIntact();
run('functions/smokeFocusPackage.cjs');
console.log('FOCUS_PACKAGE_PREPARE_OK');
