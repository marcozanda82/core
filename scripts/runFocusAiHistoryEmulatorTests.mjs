/**
 * Avvia Auth+RTDB emulator e i test P1K storico Focus AI.
 * Usa JDK ≥11 se disponibile (Android Studio JBR su Windows).
 * Nessun deploy, nessuna scrittura produzione.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium', 'jdk-21'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'jdk-21'),
    '/usr/lib/jvm/java-21-openjdk',
    '/usr/lib/jvm/java-17-openjdk',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

const javaHome = resolveJavaHome();
const env = { ...process.env };
const nodeDir = path.dirname(process.execPath);
const pathParts = [nodeDir];
if (javaHome) {
  env.JAVA_HOME = javaHome;
  pathParts.push(path.join(javaHome, 'bin'));
  // eslint-disable-next-line no-console
  console.log(`[p1k] JAVA_HOME=${javaHome}`);
} else {
  // eslint-disable-next-line no-console
  console.warn('[p1k] Nessun JDK≥11 trovato: firebase emulators potrebbe fallire.');
}
env.PATH = `${pathParts.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`;

const testCmd = 'node --test --test-concurrency=1 src/features/kentuFocus/server/__tests__/focusAiHistory.rtdb.p1k.test.js src/features/kentuFocus/server/__tests__/focusRulesDiff.p612.test.js';

const globalFirebaseJs = path.join(
  process.env.APPDATA || '',
  'npm',
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js',
);
const localFirebaseJs = path.join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const firebaseJs = fs.existsSync(localFirebaseJs)
  ? localFirebaseJs
  : (fs.existsSync(globalFirebaseJs) ? globalFirebaseJs : null);

if (!firebaseJs) {
  // eslint-disable-next-line no-console
  console.error('[p1k] firebase-tools non trovato (locale o globale).');
  process.exit(1);
}

const child = spawn(process.execPath, [
  firebaseJs,
  'emulators:exec',
  '--only',
  'auth,database',
  '--project',
  'demo-kentu-focus',
  testCmd,
], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code == null ? 1 : code);
});
